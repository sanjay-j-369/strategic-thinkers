function resolvedApiUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (typeof window === "undefined") {
    return configured || "/backend-api";
  }

  if (!configured) {
    return "/backend-api";
  }

  const configuredIsRelative = configured.startsWith("/");
  const configuredIsLocal =
    configured.includes("localhost") || configured.includes("127.0.0.1");

  // In the browser, prefer the Next.js reverse proxy over direct localhost calls.
  if (configuredIsRelative || configuredIsLocal) {
    return "/backend-api";
  }

  return configured;
}

interface ApiFetchOptions extends RequestInit {
  json?: unknown;
  token?: string | null;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { json, token, headers, ...rest } = options;
  const requestHeaders = new Headers(headers);
  const apiBase = resolvedApiUrl();

  if (json !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }
  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${apiBase}${path}`, {
    ...rest,
    headers: requestHeaders,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "detail" in payload &&
      typeof payload.detail === "string"
        ? payload.detail
        : typeof payload === "string"
          ? payload
          : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload as T;
}
