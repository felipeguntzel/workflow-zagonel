// Service Worker do WorkFlow Zagonel (PWA)
const CACHE_NAME = "workflow-zagonel-v2.1.2";
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
  "/versao.json",
];

// Instalação do Service Worker e pré-cache dos recursos estáticos essenciais
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ARQUIVOS_ESTATICOS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn("Falha no pré-cache do Service Worker:", err))
  );
});

// Ativação e remoção imediata de caches obsoletos de versões anteriores
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(
          chaves.map((chave) => {
            if (chave !== CACHE_NAME) {
              console.log("Removendo cache antigo do Service Worker:", chave);
              return caches.delete(chave);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

// Mensagens do cliente para controle de versão e cache
self.addEventListener("message", (event) => {
  if (event.data) {
    if (event.data.type === "SKIP_WAITING") {
      self.skipWaiting();
    }
    if (event.data.type === "LIMPAR_CACHE") {
      caches.keys().then((chaves) => {
        return Promise.all(chaves.map((c) => caches.delete(c)));
      });
    }
  }
});

// Interceptação de requisições com estratégias de alta performance
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Requisições não GET ou chamadas para as APIs não são armazenadas no Service Worker
  if (req.method !== "GET" || url.pathname.startsWith("/api/")) {
    return;
  }

  // Scripts e Folhas de Estilo (.js, .css): Network-First com fallback rápido para Cache
  // Garante que novas versões do código sejam carregadas imediatamente, sem prender o usuário em cache velho
  if (url.pathname.endsWith(".js") || url.pathname.endsWith(".css")) {
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
          return respostaCache || new Response("", { status: 408 });
        })
    );
    return;
  }

  // Recursos estáticos multimídia (imagens, ícones, manifest): Stale-While-Revalidate
  if (
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".ico") ||
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

  // Navegação em páginas HTML: Network First com fallback para cache
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
