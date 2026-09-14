import { all, first } from "../../../_lib/db.js";
import { json, error } from "../../../_lib/http.js";
import { obterUsuarioDaRequisicao } from "../../../_lib/permissoes.js";

export async function onRequestGet(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return error("Não autenticado", 401);

  const raiz = await first(context.env.DB, "SELECT * FROM chamados WHERE id = ?", context.params.id);
  if (!raiz) return error("Não encontrado", 404);
  const raizId = raiz.chamado_mae_id ?? raiz.id;

  const nos = await all(
    context.env.DB,
    `SELECT
       c.*,
       COALESCE(e.setor_id, a.setor_destino_id) AS setor_id,
       s.nome AS setor_nome,
       COALESCE(e.nome, a.rotulo) AS titulo,
       st.nome AS status_nome
     FROM chamados c
     LEFT JOIN etapas e ON e.id = c.etapa_id
     LEFT JOIN acoes a ON a.id = c.acao_origem_id
     LEFT JOIN setores s ON s.id = COALESCE(e.setor_id, a.setor_destino_id)
     LEFT JOIN status st ON st.id = c.status_id
     WHERE c.id = ? OR c.chamado_mae_id = ?
     ORDER BY c.id`,
    raizId,
    raizId
  );
  return json(nos);
}
