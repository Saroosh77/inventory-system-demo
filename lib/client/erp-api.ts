"use client";

// Every mutation and single-record GET responds { data: T }; list endpoints
// respond { data: T[], pagination }; workspace/session endpoints are flat
// domain objects with no wrapper. There is no longer a { result: T } shape —
// erp-app.tsx's action dispatch and every panel read .data uniformly.
type ApiEnvelope<T> = {
  data?: T;
  error?: string;
  [key: string]: unknown;
};

export async function erpApi<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  if (init.body && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
    credentials: "same-origin",
  });

  if (response.status === 401 && typeof window !== "undefined") {
    window.location.assign("/login");
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? ((await response.json()) as ApiEnvelope<T>)
    : ({ error: await response.text() } as ApiEnvelope<T>);

  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}.`);
  }

  return payload as T;
}

export function queryString(
  values: Record<string, string | number | boolean | null | undefined>,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The operation failed.";
}
