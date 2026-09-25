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
       COALESCE(c.titulo, e.nome, a.rotulo) AS titulo,
       e.nome AS etapa_nome,
       e.tipo AS etapa_tipo,
       st.nome AS status_nome,
       st.cor AS status_cor,
       resp.nome AS responsavel_nome,
       sol.nome AS solicitante_nome,
       emp.nome AS empresa_nome,
       ft.nome AS fluxo_nome
     FROM chamados c
     LEFT JOIN etapas e ON e.id = c.etapa_id
     LEFT JOIN acoes a ON a.id = c.acao_origem_id
     LEFT JOIN setores s ON s.id = COALESCE(e.setor_id, a.setor_destino_id)
     LEFT JOIN status st ON st.id = c.status_id
     LEFT JOIN usuarios resp ON resp.id = c.responsavel_id
     LEFT JOIN usuarios sol ON sol.id = c.solicitante_id
     LEFT JOIN empresas emp ON emp.id = c.empresa_id
     LEFT JOIN fluxo_templates ft ON ft.id = c.fluxo_template_id
     WHERE c.id = ? OR c.chamado_mae_id = ?
     ORDER BY c.id`,
    raizId,
    raizId
  );
  return json(nos);
}
