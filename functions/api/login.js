import { first, run } from "../_lib/db.js";
import { json, error } from "../_lib/http.js";
import { hashSenha, verificarSenha, ehHashLegado } from "../_lib/auth.js";
import { gerarToken } from "../_lib/sessao.js";
import { obterPermissoesDoUsuario } from "../_lib/permissoes.js";
import { verificarRateLimit, registrarFalhaLogin, limparTentativasLogin } from "../_lib/rate-limit.js";

export async function onRequestPost(context) {
  const body = await context.request.json();
  if (!body.login || !body.senha) {
    return error("Login e senha são obrigatórios");
  }
  const loginNormalizado = String(body.login).toLowerCase();
  const ip = context.request.headers.get("CF-Connecting-IP") || "ip_desconhecido";
  const chaveRateLimit = `${loginNormalizado}:${ip}`;

  const statusRateLimit = await verificarRateLimit(context.env.DB, chaveRateLimit);
  if (statusRateLimit.bloqueado) {
    return error(statusRateLimit.mensagem, 429);
  }

  const usuario = await first(
    context.env.DB,
    "SELECT id, nome, setor_id, admin, deve_trocar_senha, fonte, tamanho_fonte, tema, senha_hash FROM usuarios WHERE login = ?",
    loginNormalizado
  );
  if (!usuario || !(await verificarSenha(body.senha, usuario.senha_hash))) {
    const falha = await registrarFalhaLogin(context.env.DB, chaveRateLimit);
    if (falha.bloqueado) {
      return error(
        `Muitas tentativas incorretas. Acesso temporariamente bloqueado por ${falha.minutosRestantes} minuto(s).`,
        429
      );
    }
    const avisoTentativas = falha.tentativasRestantes <= 2
      ? ` Tentativa(s) restante(s) antes do bloqueio temporário: ${falha.tentativasRestantes}.`
      : "";
    return error(`Login ou senha inválidos.${avisoTentativas}`, 401);
  }

  await limparTentativasLogin(context.env.DB, chaveRateLimit);

  if (ehHashLegado(usuario.senha_hash)) {
    await run(context.env.DB, "UPDATE usuarios SET senha_hash = ? WHERE id = ?", await hashSenha(body.senha), usuario.id);
  }
  delete usuario.senha_hash;
  const token = await gerarToken(usuario.id, context.env.SESSAO_SEGREDO);
  const permissoes = await obterPermissoesDoUsuario(context.env.DB, usuario.id);
  return json({ ...usuario, token, permissoes });
}
