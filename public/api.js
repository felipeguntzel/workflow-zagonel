import { getUsuarioLogado } from "./auth.js";

const BASE = "/api";

export async function api(path, options = {}) {
  const usuario = getUsuarioLogado();
  const headers = { "content-type": "application/json" };
  if (usuario?.token) headers.Authorization = `Bearer ${usuario.token}`;

  let rotaLimpa = String(path || "");
  if (rotaLimpa.startsWith("/api/")) {
    rotaLimpa = rotaLimpa.slice(4);
  } else if (rotaLimpa.startsWith("api/")) {
    rotaLimpa = rotaLimpa.slice(3);
  } else if (rotaLimpa === "/api" || rotaLimpa === "api") {
    rotaLimpa = "";
  }
  if (!rotaLimpa.startsWith("/") && rotaLimpa.length > 0) {
    rotaLimpa = "/" + rotaLimpa;
  }

  const corpo =
    options.body !== undefined
      ? typeof options.body === "string"
        ? options.body
        : JSON.stringify(options.body)
      : undefined;

  const res = await fetch(`${BASE}${rotaLimpa}`, {
    method: options.method ?? "GET",
    headers,
    body: corpo,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);
  if (data === null && res.status !== 204) {
    throw new Error("Resposta em formato inválido do servidor.");
  }
  return data;
}

api.get = (path, options = {}) => api(path, { ...options, method: "GET" });
api.post = (path, body, options = {}) => api(path, { ...options, method: "POST", body });
api.put = (path, body, options = {}) => api(path, { ...options, method: "PUT", body });
api.delete = (path, options = {}) => api(path, { ...options, method: "DELETE" });
