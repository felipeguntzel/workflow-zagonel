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

export function traduzirTextoParaPtBr(mensagem) {
  if (!mensagem) return "Ocorreu um erro inesperado.";
  const str = String(mensagem);

  if (str.includes("Cannot read properties of null") || str.includes("reading 'filter'")) {
    return "Dados não encontrados ou incompletos para esta operação.";
  }
  if (str.includes("Failed to fetch") || str.includes("NetworkError")) {
    return "Falha de conexão com o servidor. Verifique sua conexão com a internet e tente novamente.";
  }
  if (str.includes("Invalid token") || str.includes("jwt")) {
    return "Sessão inválida ou expirada. Por favor, faça login novamente.";
  }
  if (str.includes("Unauthorized") || str.includes("401")) {
    return "Acesso não autorizado. Por favor, realize o login novamente.";
  }
  if (str.includes("Forbidden") || str.includes("403")) {
    return "Você não possui permissão para realizar esta operação.";
  }
  if (str.includes("Not Found") || str.includes("404")) {
    return "Registro não encontrado no servidor.";
  }
  if (str.includes("Internal Server Error") || str.includes("500")) {
    return "Erro interno no servidor. Tente novamente em instantes.";
  }
  if (str.includes("is not defined")) {
    return "Erro de execução na tela. Por favor, recarregue a página.";
  }
  return str;
}

export function mostrarErro(elemento, erro) {
  if (!elemento) return;
  const msgOriginal = erro && erro.message ? erro.message : String(erro || "");
  elemento.textContent = traduzirTextoParaPtBr(msgOriginal);
  elemento.className = "erro";
  elemento.hidden = false;
}

export function mostrarMensagem(elemento, texto, tipo = "aviso") {
  if (!elemento) return;
  elemento.textContent = traduzirTextoParaPtBr(texto);
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

export function linkWhatsApp(telefone, chamadoId, chamadoTitulo) {
  if (!telefone) return "";
  const apenasDigitos = String(telefone).replace(/\D/g, "");
  if (!apenasDigitos || apenasDigitos.length < 8) return "";
  const numeroCompleto = apenasDigitos.length <= 11 ? `55${apenasDigitos}` : apenasDigitos;
  const texto = chamadoId
    ? `Olá, referente ao chamado #${chamadoId} ${chamadoTitulo || ""}`.trim()
    : "Olá!";
  const url = `https://wa.me/${numeroCompleto}?text=${encodeURIComponent(texto)}`;
  return `
    <a href="${url}" target="_blank" rel="noopener noreferrer" class="link-whatsapp" title="Abrir conversa no WhatsApp: '${texto}'" style="display: inline-flex; align-items: center; gap: 0.35rem; margin-left: 0.5rem; text-decoration: none; color: #15803d; font-size: 0.8rem; font-weight: 600; padding: 0.15rem 0.45rem; background: rgba(34, 197, 94, 0.12); border-radius: 4px; border: 1px solid rgba(34, 197, 94, 0.25);">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
      <span>WhatsApp</span>
    </a>
  `;
}
