export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

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

  if (json !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }
  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
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
