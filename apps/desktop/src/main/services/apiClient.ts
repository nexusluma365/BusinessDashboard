const apiBaseUrl = process.env.NEXUS_LUMA_API_BASE_URL?.replace(/\/+$/, "");

export function hasRemoteApi() {
  return Boolean(apiBaseUrl);
}

export async function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "GET" });
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

async function apiRequest<T>(path: string, init: RequestInit): Promise<T> {
  if (!apiBaseUrl) throw new Error("NEXUS_LUMA_API_BASE_URL is not set.");
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `API request failed with status ${response.status}`);
  }
  return payload as T;
}
