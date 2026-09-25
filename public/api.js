import { getUsuarioLogado } from "./auth.js";

const BASE = "/api";

// Cache em memória para rotas de leitura rápida
const cacheMemoriaApi = new Map();
const TTL_PADRAO_MS = 60000; // 60 segundos de TTL para cadastros

// Rotas cujos GETs podem responder instantaneamente com revalidação em segundo plano
const ROTAS_CACHEAVEIS = new Set([
  "/empresas",
  "/setores",
  "/status",
  "/usuarios",
  "/grupos",
  "/fluxos",
]);

export function limparCacheApi(prefixo = "") {
  if (!prefixo) {
    cacheMemoriaApi.clear();
    return;
  }
  for (const chave of cacheMemoriaApi.keys()) {
    if (chave.startsWith(prefixo)) {
      cacheMemoriaApi.delete(chave);
    }
  }
}

function invalidarCacheCorrespondente(rotaLimpa) {
  // Ao criar/editar/excluir (POST, PUT, DELETE), invalida a rota correspondente
  const partes = rotaLimpa.split("/").filter(Boolean);
  if (partes.length > 0) {
    const raiz = "/" + partes[0];
    limparCacheApi(raiz);
  }
}

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

  const metodo = (options.method ?? "GET").toUpperCase();

  // Invalidação automática em métodos de mutação (POST, PUT, DELETE)
  if (metodo !== "GET") {
    invalidarCacheCorrespondente(rotaLimpa);
  }

  // Verificação de cache para requisições GET elegíveis
  const chaveCache = `${rotaLimpa}|${usuario?.id || 0}`;
  const ehCacheavel = metodo === "GET" && ROTAS_CACHEAVEIS.has(rotaLimpa) && !options.noCache;

  if (ehCacheavel) {
    const item = cacheMemoriaApi.get(chaveCache);
    const agora = Date.now();
    if (item && agora - item.timestamp < TTL_PADRAO_MS) {
      // Revalidação em background (Stale While Revalidate)
      buscarDaRede(rotaLimpa, metodo, headers, options.body)
        .then((dadosAtualizados) => {
          if (dadosAtualizados) {
            cacheMemoriaApi.set(chaveCache, { timestamp: Date.now(), dados: dadosAtualizados });
          }
        })
        .catch(() => {});

      // Retorno imediato (0ms) dos dados em cache
      return item.dados;
    }
  }

  const data = await buscarDaRede(rotaLimpa, metodo, headers, options.body);

  if (ehCacheavel && data) {
    cacheMemoriaApi.set(chaveCache, { timestamp: Date.now(), dados: data });
  }

  return data;
}

async function buscarDaRede(rotaLimpa, metodo, headers, body) {
  const corpo =
    body !== undefined
      ? typeof body === "string"
        ? body
        : JSON.stringify(body)
      : undefined;

  const res = await fetch(`${BASE}${rotaLimpa}`, {
    method: metodo,
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
