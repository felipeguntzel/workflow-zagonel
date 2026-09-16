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
}

export function situacaoClasse(situacao) {
  if (situacao === "vencido") return "badge badge-vencido";
  if (situacao === "alerta") return "badge badge-alerta";
  return "badge badge-ok";
}
