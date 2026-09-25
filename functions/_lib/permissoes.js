import { first, all, run } from "./db.js";
import { verificarToken } from "./sessao.js";
import { error } from "./http.js";
import { ensureColunasUsuario } from "./usuarios.js";

export const TELAS = ["empresas", "setores", "usuarios", "status", "fluxos", "chamados", "dashboards", "apontamentos"];

let colunaGrupoPaiGarantida = false;
export async function ensureColunaGrupoPai(db) {
  if (colunaGrupoPaiGarantida) return;
  try {
    await run(db, "ALTER TABLE grupos_permissao ADD COLUMN grupo_pai_id INTEGER REFERENCES grupos_permissao(id)");
  } catch (_) {}
  colunaGrupoPaiGarantida = true;
}

let tabelaPermissoesGarantida = false;
export async function ensureTabelaPermissoes(db) {
  if (tabelaPermissoesGarantida) return;
  try {
    const tableInfo = await first(db, "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'permissoes'");
    if (tableInfo && tableInfo.sql && tableInfo.sql.includes("CHECK")) {
      await run(db, "PRAGMA foreign_keys = OFF").catch(() => {});
      await run(db, `
        CREATE TABLE IF NOT EXISTS permissoes_nova (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          grupo_id INTEGER NOT NULL REFERENCES grupos_permissao(id),
          tela TEXT NOT NULL,
          visualizar INTEGER NOT NULL DEFAULT 0,
          inserir INTEGER NOT NULL DEFAULT 0,
          editar INTEGER NOT NULL DEFAULT 0,
          excluir INTEGER NOT NULL DEFAULT 0,
          ver_todos_setores INTEGER NOT NULL DEFAULT 0
        )
      `).catch(() => {});
      await run(db, `
        INSERT OR IGNORE INTO permissoes_nova (id, grupo_id, tela, visualizar, inserir, editar, excluir, ver_todos_setores)
        SELECT id, grupo_id, tela, visualizar, inserir, editar, excluir, ver_todos_setores FROM permissoes
      `).catch(() => {});
      await run(db, "DROP TABLE permissoes").catch(() => {});
      await run(db, "ALTER TABLE permissoes_nova RENAME TO permissoes").catch(() => {});
      await run(db, "CREATE UNIQUE INDEX IF NOT EXISTS idx_permissoes_grupo_tela ON permissoes(grupo_id, tela)").catch(() => {});
      await run(db, "PRAGMA foreign_keys = ON").catch(() => {});
    }
  } catch (e) {
    console.error("Falha ao migrar permissoes sem CHECK:", e);
  }
  tabelaPermissoesGarantida = true;
}

export async function obterUsuarioDaRequisicao(request, env) {
  const cabecalho = request.headers.get("Authorization") ?? "";
  const token = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : null;
  const verificado = await verificarToken(token, env.SESSAO_SEGREDO);
  if (!verificado) return null;
  await ensureColunasUsuario(env.DB);
  const usuario = await first(
    env.DB,
    "SELECT id, nome, setor_id, admin, deve_trocar_senha, token_valido_apos FROM usuarios WHERE id = ?",
    verificado.usuarioId
  );
  if (!usuario) return null;
  if (usuario.token_valido_apos && usuario.token_valido_apos > 0) {
    if (!verificado.emitidoEm || verificado.emitidoEm < usuario.token_valido_apos) {
      return null;
    }
  }
  return usuario;
}

export async function obterPermissoesDoUsuario(db, usuarioId) {
  const resultado = {};
  for (const tela of TELAS) {
    resultado[tela] = { visualizar: false, inserir: false, editar: false, excluir: false };
  }
  resultado.chamados.ver_todos_setores = false;

  const usuario = await first(db, "SELECT admin FROM usuarios WHERE id = ?", usuarioId);
  if (usuario && usuario.admin) {
    for (const tela of TELAS) {
      resultado[tela] = { visualizar: true, inserir: true, editar: true, excluir: true };
    }
    resultado.chamados.ver_todos_setores = true;
    return resultado;
  }

  await ensureColunaGrupoPai(db);

  const gruposIniciais = await all(db, "SELECT grupo_id FROM usuario_grupos WHERE usuario_id = ?", usuarioId);
  const gruposIds = new Set(gruposIniciais.map((g) => g.grupo_id));
  const fila = [...gruposIds];
  const visitados = new Set();

  while (fila.length > 0) {
    const atualId = fila.shift();
    if (visitados.has(atualId)) continue;
    visitados.add(atualId);
    try {
      const grupo = await first(db, "SELECT grupo_pai_id FROM grupos_permissao WHERE id = ?", atualId);
      if (grupo && grupo.grupo_pai_id && !gruposIds.has(grupo.grupo_pai_id)) {
        gruposIds.add(grupo.grupo_pai_id);
        fila.push(grupo.grupo_pai_id);
      }
    } catch (_) {}
  }

  if (gruposIds.size === 0) {
    return resultado;
  }

  const placeholders = Array.from(gruposIds).map(() => "?").join(", ");
  const linhas = await all(
    db,
    `SELECT p.tela, p.visualizar, p.inserir, p.editar, p.excluir, p.ver_todos_setores
     FROM permissoes p
     WHERE p.grupo_id IN (${placeholders})`,
    ...Array.from(gruposIds)
  );

  for (const linha of linhas) {
    const alvo = resultado[linha.tela];
    if (!alvo) continue;
    alvo.visualizar = alvo.visualizar || linha.visualizar === 1;
    alvo.inserir = alvo.inserir || linha.inserir === 1;
    alvo.editar = alvo.editar || linha.editar === 1;
    alvo.excluir = alvo.excluir || linha.excluir === 1;
    if (linha.tela === "chamados") {
      resultado.chamados.ver_todos_setores =
        resultado.chamados.ver_todos_setores || linha.ver_todos_setores === 1;
    }
  }
  return resultado;
}

export async function exigirPermissao(context, tela, acao) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return { erro: error("Não autenticado", 401) };
  if (usuario.deve_trocar_senha === 1) {
    return { erro: error("Troque sua senha antes de continuar", 403) };
  }
  const permissoes = await obterPermissoesDoUsuario(context.env.DB, usuario.id);
  const permitido = usuario.admin === 1 || Boolean(permissoes[tela]?.[acao]);
  if (!permitido) return { erro: error("Acesso negado", 403) };
  return { usuario, permissoes };
}

export async function exigirAdmin(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return { erro: error("Não autenticado", 401) };
  if (usuario.deve_trocar_senha === 1) {
    return { erro: error("Troque sua senha antes de continuar", 403) };
  }
  if (usuario.admin !== 1) return { erro: error("Acesso restrito a administradores", 403) };
  return { usuario };
}

export async function exigirUsuarioLogado(context) {
  const usuario = await obterUsuarioDaRequisicao(context.request, context.env);
  if (!usuario) return { erro: error("Não autenticado", 401) };
  if (usuario.deve_trocar_senha === 1) {
    return { erro: error("Troque sua senha antes de continuar", 403) };
  }
  return { usuario };
}
