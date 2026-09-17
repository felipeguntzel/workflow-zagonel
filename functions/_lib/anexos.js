import { all, first, run } from "./db.js";

const LIMITE_ARQUIVO_BYTES = 2 * 1024 * 1024; // 2 MB
const LIMITE_TOTAL_CHAMADO_MAE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Retorna o total de bytes em anexos já acumulados para a árvore de um chamado mãe.
 */
export async function obterTotalBytesAnexosDoChamadoMae(db, chamadoMaeId) {
  const row = await first(
    db,
    `SELECT COALESCE(SUM(a.tamanho_bytes), 0) AS total_bytes
     FROM chamado_anexos a
     JOIN chamados c ON c.id = a.chamado_id
     WHERE c.id = ? OR c.chamado_mae_id = ?`,
    chamadoMaeId,
    chamadoMaeId
  );
  return row ? row.total_bytes : 0;
}

/**
 * Valida os limites de armazenamento para um novo anexo.
 */
export async function validarLimiteAnexo(db, chamadoMaeId, tamanhoBytes) {
  if (tamanhoBytes > LIMITE_ARQUIVO_BYTES) {
    return `O arquivo ultrapassa o limite individual máximo de 2 MB (${(tamanhoBytes / (1024 * 1024)).toFixed(2)} MB).`;
  }
  const totalAtual = await obterTotalBytesAnexosDoChamadoMae(db, chamadoMaeId);
  if (totalAtual + tamanhoBytes > LIMITE_TOTAL_CHAMADO_MAE_BYTES) {
    return `Limite total de anexos por chamado mãe atingido (máximo de 10 MB por chamado). Atual: ${(totalAtual / (1024 * 1024)).toFixed(2)} MB.`;
  }
  return null;
}

/**
 * Salva um anexo codificado em Base64.
 */
export async function salvarAnexo(db, { chamado_id, usuario_id, nome_arquivo, tipo_mime, tamanho_bytes, conteudo_base64, eh_privado = 0 }) {
  const agora = new Date().toISOString();
  const res = await run(
    db,
    `INSERT INTO chamado_anexos
       (chamado_id, usuario_id, nome_arquivo, tipo_mime, tamanho_bytes, conteudo_base64, eh_privado, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    chamado_id,
    usuario_id,
    nome_arquivo,
    tipo_mime,
    tamanho_bytes,
    conteudo_base64,
    eh_privado ? 1 : 0,
    agora
  );
  return first(
    db,
    `SELECT a.id, a.chamado_id, a.usuario_id, a.nome_arquivo, a.tipo_mime, a.tamanho_bytes, a.eh_privado, a.criado_em, u.nome AS usuario_nome
     FROM chamado_anexos a
     JOIN usuarios u ON u.id = a.usuario_id
     WHERE a.id = ?`,
    res.meta.last_row_id
  );
}

/**
 * Lista os anexos de um chamado, respeitando privacidade.
 * Se usuarioInterage for false, oculta anexos privados.
 */
export async function listarAnexosDoChamado(db, chamadoId, podeVerPrivados = false) {
  const condicaoPrivado = podeVerPrivados ? "1 = 1" : "a.eh_privado = 0";
  return await all(
    db,
    `SELECT a.id, a.chamado_id, a.usuario_id, a.nome_arquivo, a.tipo_mime, a.tamanho_bytes, a.eh_privado, a.criado_em, u.nome AS usuario_nome
     FROM chamado_anexos a
     JOIN usuarios u ON u.id = a.usuario_id
     WHERE a.chamado_id = ? AND ${condicaoPrivado}
     ORDER BY a.id ASC`,
    chamadoId
  );
}

/**
 * Obtém o conteúdo de um anexo para download.
 */
export async function obterAnexoPorId(db, anexoId) {
  return await first(
    db,
    `SELECT a.*, u.nome AS usuario_nome
     FROM chamado_anexos a
     JOIN usuarios u ON u.id = a.usuario_id
     WHERE a.id = ?`,
    anexoId
  );
}
