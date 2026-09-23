// Service Worker do WorkFlow Zagonel (PWA)
const CACHE_NAME = "workflow-zagonel-v1";
const ARQUIVOS_ESTATICOS = [
  "/",
  "/index.html",
  "/style.css",
  "/componentes.css",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/layout.js",
  "/api.js",
  "/auth.js",
  "/ui.js",
  "/modal.js",
];

// Instalacao do Service Worker e pre-cache dos recursos estaticos essenciais
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ARQUIVOS_ESTATICOS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn("Falha no pre-cache do Service Worker:", err))
  );
});

// Ativacao e remocao de caches obsoletos de versoes anteriores
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(
          chaves.map((chave) => {
            if (chave !== CACHE_NAME) {
              return caches.delete(chave);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

// Interceptacao de requisicoes com estrategias diferenciadas
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Requisicoes nao GET ou chamadas para as APIs nao sao armazenadas em cache
  if (req.method !== "GET" || url.pathname.startsWith("/api/")) {
    return;
  }

  // Recursos estaticos: Stale-While-Revalidate (responde rapido e atualiza em segundo plano)
  if (
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".webmanifest")
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const respostaCache = await cache.match(req);
        const fetchPromise = fetch(req)
          .then((respostaRede) => {
            if (respostaRede && respostaRede.status === 200) {
              cache.put(req, respostaRede.clone());
            }
            return respostaRede;
          })
          .catch(() => respostaCache);
        return respostaCache || fetchPromise;
      })
    );
    return;
  }

  // Navegacao em paginas HTML: Network First com fallback para cache
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((respostaRede) => {
          if (respostaRede && respostaRede.status === 200) {
            const clone = respostaRede.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return respostaRede;
        })
        .catch(async () => {
          const respostaCache = await caches.match(req);
          if (respostaCache) return respostaCache;
          return caches.match("/");
        })
    );
  }
});
