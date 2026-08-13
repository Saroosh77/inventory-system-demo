"use client";

import { useCallback, useEffect, useState } from "react";
import { erpApi, errorMessage } from "./erp-api";

export function useErpData<T>(
  url: string,
  externalRefresh = 0,
) {
  const [result, setResult] = useState<{ key: string; data: T } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const key = `${url}:${externalRefresh}:${reloadVersion}`;

  const reload = useCallback(() => {
    setReloadVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void erpApi<T>(url, { signal: controller.signal })
      .then((data) => {
        setResult({ key, data });
        setFailure(null);
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setFailure({ key, message: errorMessage(cause) });
      });

    return () => controller.abort();
  }, [key, url]);

  const data = result?.key === key ? result.data : null;
  const error = failure?.key === key ? failure.message : null;
  const loading = data === null && error === null;
  return { data, error, loading, reload };
}
