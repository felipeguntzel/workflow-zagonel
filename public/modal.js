// public/modal.js

// Icones SVG para os tipos de modal (perigo, aviso, sucesso, info)
const ICONES = {
  perigo: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  aviso: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
  sucesso: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="16 10 11 15 8 12"></polyline></svg>`,
  info: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
};

export function abrirModal(conteudoElemento, onOutsideClick) {
  const fundo = document.createElement("div");
  fundo.className = "modal-fundo";
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.appendChild(conteudoElemento);
  fundo.appendChild(modal);
  document.body.appendChild(fundo);

  function tratarKeyDown(ev) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      if (onOutsideClick) onOutsideClick();
      fechar();
    }
  }
  window.addEventListener("keydown", tratarKeyDown);

  function fechar() {
    window.removeEventListener("keydown", tratarKeyDown);
    fundo.remove();
  }
  fundo.addEventListener("click", (ev) => {
    if (ev.target === fundo) {
      if (onOutsideClick) onOutsideClick();
      // Nao fecha automaticamente por clique no fundo por seguranca
    }
  });

  return fechar;
}

export function confirmarAcao(titulo, mensagem, opcoes = {}) {
  return new Promise((resolve) => {
    // Trata caso o segundo argumento seja o objeto de opções
    if (typeof mensagem === "object" && mensagem !== null && Object.keys(opcoes).length === 0) {
      opcoes = mensagem;
      mensagem = "";
    }

    const textoMensagem = (mensagem != null && mensagem !== undefined) ? String(mensagem).trim() : "";
    const textoCancelar = opcoes.textoCancelar || "Cancelar";
    const textoConfirmar = opcoes.textoConfirmar || "Confirmar";

    let tipo = opcoes.tipo;
    if (!tipo) {
      const textoChecagem = `${titulo} ${textoMensagem}`.toLowerCase();
      if (
        textoChecagem.includes("excluir") ||
        textoChecagem.includes("cancelar") ||
        textoChecagem.includes("sair") ||
        textoChecagem.includes("descartar") ||
        textoChecagem.includes("encerrar")
      ) {
        tipo = "perigo";
      } else {
        tipo = "aviso";
      }
    }

    const iconeSvg = opcoes.icone || ICONES[tipo] || ICONES.aviso;
    const classeBtnConfirmar = tipo === "perigo" ? "btn-perigo" : "btn-primario";

    const fundo = document.createElement("div");
    fundo.className = "modal-fundo modal-fundo--confirmacao";
    fundo.setAttribute("role", "dialog");
    fundo.setAttribute("aria-modal", "true");

    const modal = document.createElement("div");
    modal.className = "modal-confirmacao";

    modal.innerHTML = `
      <div class="modal-confirmacao__icone modal-confirmacao__icone--${tipo}">
        ${iconeSvg}
      </div>
      <h3 class="modal-confirmacao__titulo">${titulo}</h3>
      ${textoMensagem ? `<p class="modal-confirmacao__mensagem">${textoMensagem}</p>` : ""}
      <div class="modal-confirmacao__acoes">
        <button type="button" class="btn btn-secundario modal-confirmacao__btn-cancelar">${textoCancelar}</button>
        <button type="button" class="btn ${classeBtnConfirmar} modal-confirmacao__btn-confirmar">${textoConfirmar}</button>
      </div>
    `;

    fundo.appendChild(modal);
    document.body.appendChild(fundo);

    let resolvido = false;

    function fecharModal(resultado) {
      if (resolvido) return;
      resolvido = true;
      window.removeEventListener("keydown", tratarKeyDown);
      fundo.classList.add("modal-fundo--fechando");
      setTimeout(() => {
        fundo.remove();
      }, 120);
      resolve(resultado);
    }

    function tratarKeyDown(ev) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        fecharModal(false);
      }
    }
    window.addEventListener("keydown", tratarKeyDown);

    // Clique fora da janela nao fecha a tela suspensa (regra de seguranca do sistema)
    fundo.addEventListener("click", (ev) => {
      if (ev.target === fundo) {
        // Ignora clique acidental no fundo escurecido
      }
    });

    const btnCancelar = modal.querySelector(".modal-confirmacao__btn-cancelar");
    const btnConfirmar = modal.querySelector(".modal-confirmacao__btn-confirmar");

    btnCancelar.addEventListener("click", () => fecharModal(false));
    btnConfirmar.addEventListener("click", () => fecharModal(true));

    if (opcoes.focoPadrao === "cancelar" || tipo === "perigo") {
      btnCancelar.focus();
    } else {
      btnConfirmar.focus();
    }
  });
}

export function mostrarAviso(mensagem, titulo = "Aviso", tipo = "info", textoBotao = "OK") {
  return new Promise((resolve) => {
    const iconeSvg = ICONES[tipo] || ICONES.info;
    const classeBtn = tipo === "perigo" ? "btn-perigo" : "btn-primario";

    const fundo = document.createElement("div");
    fundo.className = "modal-fundo modal-fundo--confirmacao";
    fundo.setAttribute("role", "alertdialog");
    fundo.setAttribute("aria-modal", "true");

    const modal = document.createElement("div");
    modal.className = "modal-confirmacao";

    modal.innerHTML = `
      <div class="modal-confirmacao__icone modal-confirmacao__icone--${tipo}">
        ${iconeSvg}
      </div>
      <h3 class="modal-confirmacao__titulo">${titulo}</h3>
      <p class="modal-confirmacao__mensagem">${mensagem}</p>
      <div class="modal-confirmacao__acoes">
        <button type="button" class="btn ${classeBtn} modal-confirmacao__btn-ok">${textoBotao}</button>
      </div>
    `;

    fundo.appendChild(modal);
    document.body.appendChild(fundo);

    let resolvido = false;

    function fecharModal() {
      if (resolvido) return;
      resolvido = true;
      window.removeEventListener("keydown", tratarKeyDown);
      fundo.classList.add("modal-fundo--fechando");
      setTimeout(() => {
        fundo.remove();
      }, 120);
      resolve();
    }

    function tratarKeyDown(ev) {
      if (ev.key === "Escape" || ev.key === "Enter") {
        ev.preventDefault();
        fecharModal();
      }
    }
    window.addEventListener("keydown", tratarKeyDown);

    fundo.addEventListener("click", (ev) => {
      if (ev.target === fundo) {
        // Ignora clique acidental
      }
    });

    const btnOk = modal.querySelector(".modal-confirmacao__btn-ok");
    btnOk.addEventListener("click", () => fecharModal());
    btnOk.focus();
  });
}
