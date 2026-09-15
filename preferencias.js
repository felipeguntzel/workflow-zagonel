import { getUsuarioLogado, setUsuarioLogado } from "./auth.js";
import { api } from "./api.js";
import { abrirModal } from "./modal.js";
import { aplicarPreferenciasVisuais } from "./layout.js";
import { mostrarErro } from "./ui.js";

const FONTES = [
  { valor: "arial", texto: "Arial" },
  { valor: "times", texto: "Times New Roman" },
  { valor: "verdana", texto: "Verdana" },
  { valor: "courier", texto: "Courier New" },
];
const TAMANHOS = [
  { valor: "p", texto: "P" },
  { valor: "m", texto: "M" },
  { valor: "g", texto: "G" },
  { valor: "gg", texto: "GG" },
];
const TEMAS = [
  { valor: "claro", texto: "Claro" },
  { valor: "alto-contraste", texto: "Alto contraste" },
];

export function abrirPainelPreferencias() {
  const usuarioAtual = getUsuarioLogado();
  let fonteEscolhida = usuarioAtual?.fonte ?? "arial";
  let tamanhoEscolhido = usuarioAtual?.tamanho_fonte ?? "m";
  let temaEscolhido = usuarioAtual?.tema ?? "claro";

  const conteudo = document.createElement("div");
  let fechar;

  function render() {
    conteudo.innerHTML = `
      <div class="modal__titulo">Preferências</div>
      <div style="margin-bottom:1rem;">
        <div style="font-weight:600; font-size:0.85rem; margin-bottom:0.4rem;">Fonte</div>
        <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
          ${FONTES.map(
            (f) =>
              `<button type="button" class="btn ${f.valor === fonteEscolhida ? "btn-primario" : "btn-secundario"}" data-fonte="${f.valor}">${f.texto}</button>`
          ).join("")}
        </div>
      </div>
      <div style="margin-bottom:1rem;">
        <div style="font-weight:600; font-size:0.85rem; margin-bottom:0.4rem;">Tamanho da letra</div>
        <div style="display:flex; gap:0.4rem;">
          ${TAMANHOS.map(
            (t) =>
              `<button type="button" class="btn ${t.valor === tamanhoEscolhido ? "btn-primario" : "btn-secundario"}" data-tamanho="${t.valor}">${t.texto}</button>`
          ).join("")}
        </div>
      </div>
      <div style="margin-bottom:1.25rem;">
        <div style="font-weight:600; font-size:0.85rem; margin-bottom:0.4rem;">Tema</div>
        <div style="display:flex; gap:0.4rem;">
          ${TEMAS.map(
            (t) =>
              `<button type="button" class="btn ${t.valor === temaEscolhido ? "btn-primario" : "btn-secundario"}" data-tema-opcao="${t.valor}">${t.texto}</button>`
          ).join("")}
        </div>
      </div>
      <p id="preferencias-erro" class="erro" hidden></p>
      <div class="modal__acoes">
        <button type="button" class="btn btn-secundario" id="preferencias-cancelar">Cancelar</button>
        <button type="button" class="btn btn-primario" id="preferencias-salvar">Salvar preferências</button>
      </div>
    `;

    conteudo.querySelectorAll("[data-fonte]").forEach((botao) =>
      botao.addEventListener("click", () => {
        fonteEscolhida = botao.dataset.fonte;
        render();
      })
    );
    conteudo.querySelectorAll("[data-tamanho]").forEach((botao) =>
      botao.addEventListener("click", () => {
        tamanhoEscolhido = botao.dataset.tamanho;
        render();
      })
    );
    conteudo.querySelectorAll("[data-tema-opcao]").forEach((botao) =>
      botao.addEventListener("click", () => {
        temaEscolhido = botao.dataset.temaOpcao;
        render();
      })
    );

    conteudo.querySelector("#preferencias-cancelar").addEventListener("click", () => fechar());
    conteudo.querySelector("#preferencias-salvar").addEventListener("click", async () => {
      try {
        await api("/preferencias", {
          method: "PUT",
          body: { fonte: fonteEscolhida, tamanho_fonte: tamanhoEscolhido, tema: temaEscolhido },
        });
        const usuarioAtualizado = {
          ...getUsuarioLogado(),
          fonte: fonteEscolhida,
          tamanho_fonte: tamanhoEscolhido,
          tema: temaEscolhido,
        };
        setUsuarioLogado(usuarioAtualizado);
        aplicarPreferenciasVisuais(usuarioAtualizado);
        fechar();
      } catch (e) {
        mostrarErro(conteudo.querySelector("#preferencias-erro"), e);
      }
    });
  }

  render();
  fechar = abrirModal(conteudo);
}
