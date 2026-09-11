const BASE = "/api";

export async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? "GET",
    headers: { "content-type": "application/json" },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);
  return data;
}
