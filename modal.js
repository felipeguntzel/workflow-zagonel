export function abrirModal(conteudoElemento, onOutsideClick) {
  const fundo = document.createElement("div");
  fundo.className = "modal-fundo";
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.appendChild(conteudoElemento);
  fundo.appendChild(modal);
  document.body.appendChild(fundo);

  function fechar() {
    fundo.remove();
  }
  fundo.addEventListener("click", (ev) => {
    if (ev.target === fundo) {
      if (onOutsideClick) onOutsideClick();
      fechar();
    }
  });

  return fechar;
}

export function confirmarAcao(titulo, mensagem) {
  return new Promise((resolve) => {
    const conteudo = document.createElement("div");
    conteudo.innerHTML = `
      <div class="modal__titulo">${titulo}</div>
      <div class="modal__mensagem">${mensagem}</div>
      <div class="modal__acoes">
        <button type="button" class="btn btn-secundario" id="modal-cancelar">Cancelar</button>
        <button type="button" class="btn btn-perigo" id="modal-confirmar">Confirmar</button>
      </div>
    `;
    let resolved = false;
    const onOutsideClick = () => {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    };
    const fechar = abrirModal(conteudo, onOutsideClick);
    conteudo.querySelector("#modal-cancelar").addEventListener("click", () => {
      if (!resolved) {
        resolved = true;
        fechar();
        resolve(false);
      }
    });
    conteudo.querySelector("#modal-confirmar").addEventListener("click", () => {
      if (!resolved) {
        resolved = true;
        fechar();
        resolve(true);
      }
    });
  });
}
