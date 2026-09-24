import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { hashSenha, validarFormatoLogin, validarComplexidadeSenha } from "../../_lib/auth.js";
import { exigirPermissao } from "../../_lib/permissoes.js";
import { ensureColunasUsuario } from "../../_lib/usuarios.js";
import { registrarAuditoriaSistema } from "../../_lib/auditoria.js";

async function carregarGruposDoUsuario(db, usuarioId) {
  const linhas = await all(db, "SELECT grupo_id FROM usuario_grupos WHERE usuario_id = ?", usuarioId);
  return linhas.map((l) => l.grupo_id);
}

async function validarGruposExistem(db, grupos) {
  if (grupos.length === 0) return true;
  const placeholders = grupos.map(() => "?").join(", ");
  const validos = await all(db, `SELECT id FROM grupos_permissao WHERE id IN (${placeholders})`, ...grupos);
  return validos.length === new Set(grupos).size;
}

export async function onRequestGet(context) {
  const { erro } = await exigirPermissao(context, "usuarios", "visualizar");
  if (erro) return erro;
  await ensureColunasUsuario(context.env.DB);
  const usuarios = await all(
    context.env.DB,
    "SELECT id, nome, setor_id, login, email, telefone, admin, deve_trocar_senha, ativo FROM usuarios ORDER BY id"
  );
  for (const usuario of usuarios) {
    usuario.grupos = await carregarGruposDoUsuario(context.env.DB, usuario.id);
  }
  return json(usuarios);
}

export async function onRequestPost(context) {
  const { usuario, erro } = await exigirPermissao(context, "usuarios", "inserir");
  if (erro) return erro;
  await ensureColunasUsuario(context.env.DB);
  const body = await context.request.json();
  if (!body.nome || !body.setor_id || !body.login || !body.senha) {
    return error("Campos obrigatórios: nome, setor_id, login, senha");
  }
  if (body.admin && usuario.admin !== 1) {
    return error("Apenas administradores podem conceder admin a um usuário.", 403);
  }
  const login = String(body.login || "").trim().toLowerCase();
  if (!validarFormatoLogin(login)) {
    return error(
      "Login inválido: use apenas letras, números, ponto ou sublinhado (ex: felipe.guntzel ou projetoszagonel), sem espaços ou símbolos."
    );
  }
  const existente = await first(context.env.DB, "SELECT id FROM usuarios WHERE login = ?", login);
  if (existente) {
    return error("Já existe um usuário com esse login");
  }
  const email = body.email ? String(body.email).trim().toLowerCase() : null;
  if (email) {
    const emailExistente = await first(context.env.DB, "SELECT id FROM usuarios WHERE LOWER(email) = ?", email);
    if (emailExistente) {
      return error("Já existe um usuário cadastrado com este e-mail.");
    }
  }

  const telefone = body.telefone ? String(body.telefone).trim() : null;
  if (telefone) {
    const digitosTelefone = telefone.replace(/\D/g, "");
    if (digitosTelefone.length > 0) {
      const todos = await all(context.env.DB, "SELECT id, telefone FROM usuarios WHERE telefone IS NOT NULL");
      const duplicado = todos.find((u) => u.telefone && u.telefone.replace(/\D/g, "") === digitosTelefone);
      if (duplicado) {
        return error("Já existe um usuário cadastrado com este número de telefone.");
      }
    }
  }

  const grupos = Array.isArray(body.grupos) ? body.grupos : [];
  if (!(await validarGruposExistem(context.env.DB, grupos))) {
    return error("Um ou mais grupos informados não existem.");
  }
  if (grupos.length > 0 && usuario.admin !== 1) {
    return error("Apenas administradores podem atribuir grupos a um usuário.", 403);
  }
  const checagemSenha = validarComplexidadeSenha(body.senha);
  if (!checagemSenha.valido) {
    return error(checagemSenha.mensagem);
  }
  const senhaHash = await hashSenha(body.senha);
  const admin = body.admin ? 1 : 0;
  const ativo = body.ativo !== undefined ? (body.ativo ? 1 : 0) : 1;
  const deveTrocarSenha = body.deve_trocar_senha !== undefined ? (body.deve_trocar_senha ? 1 : 0) : 1;
  const agora = Date.now();
  const resultado = await run(
    context.env.DB,
    "INSERT INTO usuarios (nome, setor_id, login, email, telefone, senha_hash, admin, deve_trocar_senha, ativo, token_valido_apos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    body.nome,
    body.setor_id,
    login,
    email,
    telefone,
    senhaHash,
    admin,
    deveTrocarSenha,
    ativo,
    agora
  );
  const novoId = resultado.meta.last_row_id;
  for (const grupoId of grupos) {
    await run(
      context.env.DB,
      "INSERT INTO usuario_grupos (usuario_id, grupo_id) VALUES (?, ?)",
      novoId,
      grupoId
    );
  }
  const novo = await first(
    context.env.DB,
    "SELECT id, nome, setor_id, login, email, telefone, admin, deve_trocar_senha, ativo FROM usuarios WHERE id = ?",
    novoId
  );
  novo.grupos = grupos;
  await registrarAuditoriaSistema(context.env.DB, {
    usuario_id: usuario?.id,
    usuario_nome: usuario?.nome || "Sistema",
    entidade: "usuarios",
    entidade_id: novoId,
    acao: "insercao",
    detalhes: `Usuário cadastrado: ${novo.nome} (${novo.login})`,
    dados_novos: novo,
  });
  return json(novo, 201);
}
