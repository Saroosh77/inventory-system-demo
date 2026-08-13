"use client";

import { useCallback, useEffect, useState } from "react";

const responseCache = new Map<string, unknown>();

export function invalidateApiCache(prefix: string) {
  for (const key of responseCache.keys()) {
    if (key.startsWith(prefix)) responseCache.delete(key);
  }
}

export function useApiData<T>(url: string, headers?: HeadersInit) {
  const [result, setResult] = useState<{ url: string; data: T } | null>(null);
  const [failure, setFailure] = useState<{ url: string; message: string } | null>(null);
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => {
    responseCache.delete(url);
    setVersion((current) => current + 1);
  }, [url]);

  useEffect(() => {
    if (responseCache.has(url)) return;

    const controller = new AbortController();
    fetch(url, {
      headers,
      signal: controller.signal,
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        const body = await response.json();
        if (response.status === 401) window.location.assign("/login");
        if (!response.ok) throw new Error(body.error ?? "Unable to load data.");
        return body as T;
      })
      .then((body) => {
        responseCache.set(url, body);
        setFailure(null);
        setResult({ url, data: body });
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setFailure({ url, message: cause instanceof Error ? cause.message : "Unable to load data." });
      });
    return () => controller.abort();
  }, [headers, url, version]);

  const cached = responseCache.get(url) as T | undefined;
  const data = cached ?? (result?.url === url ? result.data : null);
  const error = failure?.url === url ? failure.message : null;
  return { data, loading: data === null && error === null, error, reload };
}
