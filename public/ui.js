const ENTIDADES_HTML = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escaparHtml(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ENTIDADES_HTML[c]);
}

export function info(texto) {
  return `<span class="info" title="${texto.replace(/"/g, "&quot;")}">i</span>`;
}

export function escaparAtributo(texto) {
  return String(texto).replace(/"/g, "&quot;");
}

export function mostrarErro(elemento, erro) {
  elemento.textContent = erro && erro.message ? erro.message : String(erro);
  elemento.className = "erro";
  elemento.hidden = false;
}

export function mostrarMensagem(elemento, texto, tipo = "aviso") {
  elemento.textContent = texto;
  elemento.className = tipo === "sucesso" ? "mensagem-sucesso" : "mensagem-aviso";
  elemento.hidden = false;
  clearTimeout(elemento._timeoutMensagem);
  elemento._timeoutMensagem = setTimeout(() => {
    elemento.hidden = true;
  }, 3000);
}

const SVG_ICONE_EDITAR =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M11.5 1.5l3 3-8.5 8.5H3v-3l8.5-8.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
const SVG_ICONE_EXCLUIR =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 4h10M6.5 4V2.5h3V4M4.5 4l.5 9.5a1 1 0 0 0 1 .95h4a1 1 0 0 0 1-.95L11.5 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function botaoIconeEditar(classe, id) {
  return `<button type="button" class="btn-icone btn-icone--editar ${classe}" data-id="${id}" aria-label="Editar" title="Editar">${SVG_ICONE_EDITAR}</button>`;
}

export function botaoIconeExcluir(classe, id) {
  return `<button type="button" class="btn-icone btn-icone--excluir ${classe}" data-id="${id}" aria-label="Excluir" title="Excluir">${SVG_ICONE_EXCLUIR}</button>`;
}
