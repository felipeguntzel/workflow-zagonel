import { all, first, run } from "./db.js";

/**
 * Atualiza o contador de ID em sqlite_sequence para que o próximo registro
 * receba MAX(id) + 1 (ou 1 caso a tabela esteja vazia).
 */
export async function atualizarContadorId(db, tabela) {
  try {
    const row = await first(db, `SELECT COALESCE(MAX(id), 0) AS max_id FROM ${tabela}`);
    const maxId = row ? row.max_id : 0;
    await run(
      db,
      "UPDATE sqlite_sequence SET seq = ? WHERE name = ?",
      maxId,
      tabela
    );
  } catch (e) {
    // Silencioso se a tabela não usar AUTOINCREMENT ou sqlite_sequence não tiver a entrada
  }
}

/**
 * Verifica se o registro possui dependências que impedem sua exclusão e,
 * se houver, retorna uma mensagem orientando com precisão o caminho a seguir.
 */
export async function validarDependenciasExclusao(db, tabela, id) {
  const idNum = Number(id);

  if (tabela === "empresas") {
    const empresa = await first(db, "SELECT nome FROM empresas WHERE id = ?", idNum);
    const nomeEmpresa = empresa ? `"${empresa.nome}"` : `ID #${idNum}`;

    // Verificar setores vinculados diretamente ou via setor_empresas
    const setores = await all(
      db,
      `SELECT DISTINCT s.id, s.nome FROM setores s
       LEFT JOIN setor_empresas se ON se.setor_id = s.id
       WHERE s.empresa_id = ? OR se.empresa_id = ?`,
      idNum,
      idNum
    );
    if (setores.length > 0) {
      const listaNomes = setores.map((s) => `"${s.nome}"`).join(", ");
      return (
        `Não é possível excluir a empresa ${nomeEmpresa} porque ela possui ${setores.length} setor(es) vinculado(s): ${listaNomes}.\n\n` +
        `O que fazer:\n` +
        `1. Acesse o menu "Cadastros > Setores".\n` +
        `2. Edite os setores vinculados para associá-los a outra empresa, ou exclua-os primeiro.\n` +
        `3. Após liberar os setores, retorne e exclua a empresa.`
      );
    }

    // Verificar chamados
    const chamados = await all(db, "SELECT id FROM chamados WHERE empresa_id = ? LIMIT 5", idNum);
    if (chamados.length > 0) {
      const ids = chamados.map((c) => `#${c.id}`).join(", ");
      return (
        `Não é possível excluir a empresa ${nomeEmpresa} porque existem chamados vinculados a ela (ex: ${ids}).\n\n` +
        `O que fazer:\n` +
        `1. Acesse o menu "Chamados".\n` +
        `2. É necessário que não haja chamados vinculados a esta empresa antes de excluí-la.`
      );
    }
  }

  if (tabela === "setores") {
    const setor = await first(db, "SELECT nome FROM setores WHERE id = ?", idNum);
    const nomeSetor = setor ? `"${setor.nome}"` : `ID #${idNum}`;

    // Verificar usuários
    const usuarios = await all(db, "SELECT id, nome FROM usuarios WHERE setor_id = ?", idNum);
    if (usuarios.length > 0) {
      const lista = usuarios.map((u) => `"${u.nome}"`).join(", ");
      return (
        `Não é possível excluir o setor ${nomeSetor} porque existem ${usuarios.length} usuário(s) vinculado(s) a ele: ${lista}.\n\n` +
        `O que fazer:\n` +
        `1. Acesse o menu "Cadastros > Usuários".\n` +
        `2. Edite os usuários listados e altere o setor deles (ou exclua os usuários caso não sejam mais necessários).\n` +
        `3. Depois que nenhum usuário estiver no setor ${nomeSetor}, você poderá excluí-lo.`
      );
    }

    // Verificar etapas de fluxo
    const etapas = await all(
      db,
      `SELECT e.id, e.nome, ft.nome AS fluxo_nome FROM etapas e
       JOIN fluxo_templates ft ON ft.id = e.fluxo_template_id
       WHERE e.setor_id = ?`,
      idNum
    );
    if (etapas.length > 0) {
      const lista = etapas.map((e) => `"${e.nome}" (Fluxo: "${e.fluxo_nome}")`).join(", ");
      return (
        `Não é possível excluir o setor ${nomeSetor} porque ele é responsável pela(s) etapa(s) de fluxo: ${lista}.\n\n` +
        `O que fazer:\n` +
        `1. Acesse o menu "Cadastros > Fluxos".\n` +
        `2. Altere o setor responsável dessas etapas ou exclua as etapas correspondentes.\n` +
        `3. Após desvincular as etapas, retorne para excluir o setor.`
      );
    }

    // Verificar ações de fluxo
    const acoes = await all(
      db,
      `SELECT a.id, a.rotulo FROM acoes a WHERE a.setor_destino_id = ?`,
      idNum
    );
    if (acoes.length > 0) {
      const lista = acoes.map((a) => `"${a.rotulo}"`).join(", ");
      return (
        `Não é possível excluir o setor ${nomeSetor} porque ele é o setor de destino da(s) ação(ões): ${lista}.\n\n` +
        `O que fazer:\n` +
        `1. Acesse o menu "Cadastros > Fluxos".\n` +
        `2. Edite as etapas que contêm essas ações e altere o setor de destino para outro setor.\n` +
        `3. Em seguida, exclua este setor.`
      );
    }
  }

  if (tabela === "status") {
    const statusObj = await first(db, "SELECT nome FROM status WHERE id = ?", idNum);
    const nomeStatus = statusObj ? `"${statusObj.nome}"` : `ID #${idNum}`;

    const chamados = await all(db, "SELECT id FROM chamados WHERE status_id = ? LIMIT 5", idNum);
    if (chamados.length > 0) {
      const ids = chamados.map((c) => `#${c.id}`).join(", ");
      return (
        `Não é possível excluir o status ${nomeStatus} porque existem chamados utilizando-o no momento (ex: chamados ${ids}).\n\n` +
        `O que fazer:\n` +
        `1. Acesse os chamados que possuem este status e atualize o status deles para outro válido.\n` +
        `2. Quando nenhum chamado estiver usando o status ${nomeStatus}, você poderá excluí-lo.`
      );
    }
  }

  if (tabela === "usuarios") {
    const usuario = await first(db, "SELECT nome FROM usuarios WHERE id = ?", idNum);
    const nomeUsuario = usuario ? `"${usuario.nome}"` : `ID #${idNum}`;

    const chamados = await all(
      db,
      "SELECT id FROM chamados WHERE solicitante_id = ? OR responsavel_id = ? LIMIT 5",
      idNum,
      idNum
    );
    if (chamados.length > 0) {
      const ids = chamados.map((c) => `#${c.id}`).join(", ");
      return (
        `Não é possível excluir o usuário ${nomeUsuario} porque ele está vinculado a chamados existentes como solicitante ou responsável (ex: ${ids}).\n\n` +
        `O que fazer:\n` +
        `1. Reatribua os chamados correspondentes para outro usuário responsável.\n` +
        `2. Após isso, tente excluir o usuário novamente.`
      );
    }

    const comentarios = await all(db, "SELECT id FROM comentarios WHERE usuario_id = ? LIMIT 1", idNum);
    if (comentarios.length > 0) {
      return (
        `Não é possível excluir o usuário ${nomeUsuario} porque ele possui histórico de comentários em chamados.\n` +
        `Para manter a rastreabilidade e auditoria do histórico de chamados, este usuário não pode ser removido.`
      );
    }
  }

  if (tabela === "grupos_permissao") {
    const grupo = await first(db, "SELECT nome FROM grupos_permissao WHERE id = ?", idNum);
    const nomeGrupo = grupo ? `"${grupo.nome}"` : `ID #${idNum}`;

    const usuarios = await all(
      db,
      `SELECT u.id, u.nome FROM usuarios u
       JOIN usuario_grupos ug ON ug.usuario_id = u.id
       WHERE ug.grupo_id = ?`,
      idNum
    );
    if (usuarios.length > 0) {
      const lista = usuarios.map((u) => `"${u.nome}"`).join(", ");
      return (
        `Não é possível excluir o grupo ${nomeGrupo} porque ele está atribuído a ${usuarios.length} usuário(s): ${lista}.\n\n` +
        `O que fazer:\n` +
        `1. Acesse o menu "Cadastros > Usuários".\n` +
        `2. Edite os usuários vinculados e desmarque este grupo de permissão no perfil deles.\n` +
        `3. Após desvincular todos os usuários, você poderá excluir o grupo ${nomeGrupo}.`
      );
    }
  }

  if (tabela === "fluxo_templates") {
    const fluxo = await first(db, "SELECT nome FROM fluxo_templates WHERE id = ?", idNum);
    const nomeFluxo = fluxo ? `"${fluxo.nome}"` : `ID #${idNum}`;

    const chamados = await all(
      db,
      "SELECT id FROM chamados WHERE fluxo_template_id = ? LIMIT 5",
      idNum
    );
    if (chamados.length > 0) {
      const ids = chamados.map((c) => `#${c.id}`).join(", ");
      return (
        `Não é possível excluir o fluxo ${nomeFluxo} porque existem chamados abertos originados dele (ex: ${ids}).\n\n` +
        `Para excluir este fluxo, primeiro é necessário arquivar ou remover os chamados vinculados a ele.`
      );
    }

    const etapas = await all(
      db,
      "SELECT id, nome FROM etapas WHERE fluxo_template_id = ?",
      idNum
    );
    if (etapas.length > 0) {
      const lista = etapas.map((e) => `"${e.nome}"`).join(", ");
      return (
        `Não é possível excluir o fluxo ${nomeFluxo} porque ele possui ${etapas.length} etapa(s) cadastrada(s): ${lista}.\n\n` +
        `O que fazer:\n` +
        `1. Clique no fluxo e exclua primeiro as etapas (e suas ações).\n` +
        `2. Quando o fluxo não tiver mais etapas, você poderá excluí-lo.`
      );
    }
  }

  return null;
}
