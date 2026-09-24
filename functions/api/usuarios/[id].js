import { all, first, run } from "../../_lib/db.js";
import { json, error } from "../../_lib/http.js";
import { hashSenha, validarFormatoLogin, validarComplexidadeSenha } from "../../_lib/auth.js";
import { exigirPermissao } from "../../_lib/permissoes.js";
import { validarDependenciasExclusao, atualizarContadorId } from "../../_lib/dependencias.js";
import { ensureColunasUsuario } from "../../_lib/usuarios.js";
import { registrarAuditoriaSistema } from "../../_lib/auditoria.js";
import { desbloquearUsuario } from "../../_lib/rate-limit.js";

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
  const usuario = await first(
    context.env.DB,
    "SELECT id, nome, setor_id, login, email, telefone, admin, deve_trocar_senha, ativo FROM usuarios WHERE id = ?",
    context.params.id
  );
  if (!usuario) return error("Não encontrado", 404);
  usuario.grupos = await carregarGruposDoUsuario(context.env.DB, usuario.id);
  return json(usuario);
}

export async function onRequestPut(context) {
  const { usuario, erro } = await exigirPermissao(context, "usuarios", "editar");
  if (erro) return erro;
  await ensureColunasUsuario(context.env.DB);
  const body = await context.request.json();

  if (body.admin !== undefined) {
    const alvo = await first(context.env.DB, "SELECT admin FROM usuarios WHERE id = ?", context.params.id);
    if (!alvo) return error("Não encontrado", 404);
    const novoAdmin = body.admin ? 1 : 0;
    if (novoAdmin !== alvo.admin && usuario.admin !== 1) {
      return error("Apenas administradores podem alterar o status de administrador de um usuário.", 403);
    }
  }

  const colunas = ["nome", "setor_id"].filter((c) => body[c] !== undefined);
  const valores = colunas.map((c) => body[c]);

  if (body.email !== undefined) {
    const emailNormalizado = body.email ? String(body.email).trim().toLowerCase() : null;
    if (emailNormalizado) {
      const existente = await first(
        context.env.DB,
        "SELECT id FROM usuarios WHERE LOWER(email) = ? AND id != ?",
        emailNormalizado,
        context.params.id
      );
      if (existente) return error("Já existe um usuário cadastrado com este e-mail.");
    }
    colunas.push("email");
    valores.push(emailNormalizado);
  }

  if (body.telefone !== undefined) {
    const telNormalizado = body.telefone ? String(body.telefone).trim() : null;
    if (telNormalizado) {
      const digitos = telNormalizado.replace(/\D/g, "");
      if (digitos.length > 0) {
        const outros = await all(
          context.env.DB,
          "SELECT id, telefone FROM usuarios WHERE telefone IS NOT NULL AND id != ?",
          context.params.id
        );
        const duplicado = outros.find((u) => u.telefone && u.telefone.replace(/\D/g, "") === digitos);
        if (duplicado) return error("Já existe um usuário cadastrado com este número de telefone.");
      }
    }
    colunas.push("telefone");
    valores.push(telNormalizado);
  }

  let login = null;
  if (body.login !== undefined) {
    login = String(body.login).toLowerCase();
    if (!validarFormatoLogin(login)) {
      return error(
        "Login inválido: use o padrão nome.sobrenome (ex: felipe.guntzel), com letras minúsculas, números e ponto."
      );
    }
    const existente = await first(
      context.env.DB,
      "SELECT id FROM usuarios WHERE login = ? AND id != ?",
      login,
      context.params.id
    );
    if (existente) return error("Já existe um usuário com esse login");
    colunas.push("login");
    valores.push(login);
  }

  if (body.senha !== undefined && body.senha !== "") {
    const checagemSenha = validarComplexidadeSenha(body.senha);
    if (!checagemSenha.valido) {
      return error(checagemSenha.mensagem);
    }
    const senhaHash = await hashSenha(body.senha);
    colunas.push("senha_hash", "token_valido_apos");
    valores.push(senhaHash, Date.now());

    const alvo = await first(context.env.DB, "SELECT login FROM usuarios WHERE id = ?", context.params.id);
    if (alvo?.login) {
      await desbloquearUsuario(context.env.DB, alvo.login);
    }
  }

  if (body.deve_trocar_senha !== undefined) {
    colunas.push("deve_trocar_senha");
    valores.push(body.deve_trocar_senha ? 1 : 0);
  }

  if (body.ativo !== undefined) {
    const novoAtivo = body.ativo ? 1 : 0;
    if (novoAtivo === 0 && Number(context.params.id) === usuario.id) {
      const adminsAtivos = await all(
        context.env.DB,
        "SELECT id FROM usuarios WHERE admin = 1 AND ativo = 1"
      );
      if (adminsAtivos.length <= 1) {
        return error("Você não pode inativar sua própria conta pois é o único administrador ativo do sistema.", 400);
      }
    }
    colunas.push("ativo");
    valores.push(novoAtivo);

    if (novoAtivo === 1) {
      const alvo = await first(context.env.DB, "SELECT login FROM usuarios WHERE id = ?", context.params.id);
      if (alvo?.login) {
        await desbloquearUsuario(context.env.DB, alvo.login);
      }
    }
  }

  if (body.admin !== undefined) {
    colunas.push("admin");
    valores.push(body.admin ? 1 : 0);
  }

  if (Array.isArray(body.grupos)) {
    if (!(await validarGruposExistem(context.env.DB, body.grupos))) {
      return error("Um ou mais grupos informados não existem.");
    }
    const gruposAtuais = await carregarGruposDoUsuario(context.env.DB, context.params.id);
    const mudouGrupos =
      gruposAtuais.length !== body.grupos.length ||
      gruposAtuais.some((g) => !body.grupos.includes(g));
    if (mudouGrupos && usuario.admin !== 1) {
      return error("Apenas administradores podem alterar os grupos de um usuário.", 403);
    }
  }

  const antes = await first(
    context.env.DB,
    "SELECT id, nome, setor_id, login, admin, deve_trocar_senha, ativo FROM usuarios WHERE id = ?",
    context.params.id
  );
  if (!antes) return error("Não encontrado", 404);

  if (colunas.length === 0 && !Array.isArray(body.grupos)) {
    return error("Nenhum campo para atualizar");
  }

  if (colunas.length > 0) {
    const set = colunas.map((c) => `${c} = ?`).join(", ");
    await run(context.env.DB, `UPDATE usuarios SET ${set} WHERE id = ?`, ...valores, context.params.id);
  }

  if (Array.isArray(body.grupos)) {
    await run(context.env.DB, "DELETE FROM usuario_grupos WHERE usuario_id = ?", context.params.id);
    for (const grupoId of body.grupos) {
      await run(
        context.env.DB,
        "INSERT INTO usuario_grupos (usuario_id, grupo_id) VALUES (?, ?)",
        context.params.id,
        grupoId
      );
    }
  }

  const atualizado = await first(
    context.env.DB,
    "SELECT id, nome, setor_id, login, admin, deve_trocar_senha, ativo FROM usuarios WHERE id = ?",
    context.params.id
  );
  if (!atualizado) return error("Não encontrado", 404);
  atualizado.grupos = await carregarGruposDoUsuario(context.env.DB, context.params.id);

  await registrarAuditoriaSistema(context.env.DB, {
    usuario_id: usuario?.id,
    usuario_nome: usuario?.nome || "Sistema",
    entidade: "usuarios",
    entidade_id: Number(context.params.id),
    acao: "edicao",
    detalhes: `Usuário atualizado: ${atualizado.nome} (${atualizado.login})`,
    dados_antigos: antes,
    dados_novos: atualizado,
  });

  return json(atualizado);
}

export async function onRequestDelete(context) {
  const { usuario, erro } = await exigirPermissao(context, "usuarios", "excluir");
  if (erro) return erro;
  const erroDependencia = await validarDependenciasExclusao(context.env.DB, "usuarios", context.params.id);
  if (erroDependencia) return error(erroDependencia, 400);

  const antes = await first(
    context.env.DB,
    "SELECT id, nome, login FROM usuarios WHERE id = ?",
    context.params.id
  );

  try {
    await run(context.env.DB, "DELETE FROM usuario_grupos WHERE usuario_id = ?", context.params.id);
    const res = await run(context.env.DB, "DELETE FROM usuarios WHERE id = ?", context.params.id);
    if (res.meta.changes === 0) return error("Não encontrado", 404);
    await atualizarContadorId(context.env.DB, "usuarios");

    await registrarAuditoriaSistema(context.env.DB, {
      usuario_id: usuario?.id,
      usuario_nome: usuario?.nome || "Sistema",
      entidade: "usuarios",
      entidade_id: Number(context.params.id),
      acao: "exclusao",
      detalhes: `Usuário excluído: ${antes?.nome || context.params.id} (${antes?.login || ""})`,
      dados_antigos: antes,
    });

    return json({ ok: true });
  } catch (e) {
    if (String(e.message).includes("FOREIGN KEY") || String(e.message).includes("CONSTRAINT")) {
      return error(
        "Não é possível excluir este usuário pois existem outros registros vinculados a ele no sistema.",
        400
      );
    }
    throw e;
  }
}
