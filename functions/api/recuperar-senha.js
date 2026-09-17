import { json, error } from "../_lib/http.js";
import {
  gerarSolicitacaoRecuperacao,
  validarTokenRecuperacao,
  redefinirSenhaComToken,
} from "../_lib/recuperacao.js";

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const acao = body.acao || "solicitar";

    const url = new URL(context.request.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    if (acao === "solicitar") {
      const res = await gerarSolicitacaoRecuperacao(
        context.env.DB,
        body.identificador,
        baseUrl,
        context.env
      );
      return json(res);
    }

    if (acao === "validar") {
      const registro = await validarTokenRecuperacao(context.env.DB, body.token);
      if (!registro) {
        return error("Link de recuperação inválido ou expirado.", 400);
      }
      return json({
        valido: true,
        usuario_nome: registro.usuario_nome,
        usuario_login: registro.usuario_login,
      });
    }

    if (acao === "redefinir") {
      const res = await redefinirSenhaComToken(
        context.env.DB,
        body.token,
        body.nova_senha
      );
      return json(res);
    }

    return error("Ação não reconhecida.");
  } catch (err) {
    return error(err.message || "Erro ao processar recuperação de senha.");
  }
}
