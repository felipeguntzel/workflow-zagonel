import { exigirLogin } from "./auth.js";
import { aplicarLayout } from "./layout.js";

export function inicializar() {
  const usuario = exigirLogin();
  if (!usuario) return;

  aplicarLayout(usuario);

  // Busca rápida de termos no manual
  const inputBusca = document.getElementById("busca-manual");
  const secoes = document.querySelectorAll(".manual-secao");

  if (inputBusca) {
    inputBusca.addEventListener("input", () => {
      const termo = inputBusca.value.trim().toLowerCase();
      secoes.forEach((sec) => {
        if (!termo) {
          sec.style.display = "block";
          return;
        }
        const texto = sec.textContent.toLowerCase();
        if (texto.includes(termo)) {
          sec.style.display = "block";
        } else {
          sec.style.display = "none";
        }
      });
    });
  }

  // Destaque ativo no sumário conforme rolagem
  const linksIndice = document.querySelectorAll(".manual-indice a");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          linksIndice.forEach((link) => {
            if (link.getAttribute("href") === `#${id}`) {
              link.classList.add("ativo");
            } else {
              link.classList.remove("ativo");
            }
          });
        }
      });
    },
    { rootMargin: "-20% 0px -70% 0px" }
  );

  secoes.forEach((sec) => observer.observe(sec));
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", inicializar);
  if (document.readyState === "complete" || document.readyState === "interactive") {
    inicializar();
  }
}
