export function abrirModal(conteudoElemento) {
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
    if (ev.target === fundo) fechar();
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
    const fechar = abrirModal(conteudo);
    conteudo.querySelector("#modal-cancelar").addEventListener("click", () => {
      fechar();
      resolve(false);
    });
    conteudo.querySelector("#modal-confirmar").addEventListener("click", () => {
      fechar();
      resolve(true);
    });
  });
}
