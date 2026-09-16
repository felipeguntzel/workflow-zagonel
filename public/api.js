import { getUsuarioLogado } from "./auth.js";

const BASE = "/api";

export async function api(path, options = {}) {
  const usuario = getUsuarioLogado();
  const headers = { "content-type": "application/json" };
  if (usuario?.token) headers.Authorization = `Bearer ${usuario.token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);
  return data;
}
