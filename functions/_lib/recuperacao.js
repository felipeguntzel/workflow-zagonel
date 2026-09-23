import { all, first, run } from "./db.js";
import { hashSenha, validarComplexidadeSenha } from "./auth.js";
import { desbloquearUsuario } from "./rate-limit.js";

let tabelaGarantida = false;

export async function ensureRecuperacaoTabela(db) {
  if (tabelaGarantida) return;
  try {
    await run(
      db,
      `CREATE TABLE IF NOT EXISTS recuperacao_senha (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expira_em TEXT NOT NULL,
        usado INTEGER NOT NULL DEFAULT 0,
        criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      )`
    );
  } catch (_) {}
  tabelaGarantida = true;
}

export async function gerarSolicitacaoRecuperacao(db, identificador, baseUrl, env) {
  await ensureRecuperacaoTabela(db);
  const termo = String(identificador || "").trim().toLowerCase();
  if (!termo) {
    throw new Error("Informe seu login ou e-mail cadastrado.");
  }

  const usuario = await first(
    db,
    "SELECT id, nome, login, email FROM usuarios WHERE LOWER(login) = ? OR LOWER(email) = ?",
    termo,
    termo
  );

  if (!usuario) {
    throw new Error("Usuário ou e-mail não encontrado no sistema.");
  }

  if (!usuario.email || !usuario.email.includes("@")) {
    throw new Error(
      `O usuário "${usuario.nome}" não possui um e-mail cadastrado no sistema. Solicite a um administrador para atualizar seu cadastro.`
    );
  }

  // Token criptográfico aleatório
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

  // Expira em 30 minutos
  const expiraEm = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  // Invalida tokens anteriores não usados
  await run(db, "UPDATE recuperacao_senha SET usado = 1 WHERE usuario_id = ? AND usado = 0", usuario.id);

  // Insere novo token
  await run(
    db,
    "INSERT INTO recuperacao_senha (usuario_id, token, expira_em, usado) VALUES (?, ?, ?, 0)",
    usuario.id,
    token,
    expiraEm
  );

  const linkRedefinicao = `${baseUrl}/redefinir-senha?token=${token}`;

  let emailEnviado = false;
  let erroEnvio = null;

  const resendKey = env && (env.RESEND_API_KEY || env.resend_api_key || env.Resend_Api_Key || env.RESEND_KEY);
  if (!resendKey || typeof resendKey !== "string" || !resendKey.trim()) {
    throw new Error(
      "O serviço de envio de e-mails (RESEND_API_KEY) não está configurado neste ambiente. Solicite a um administrador para redefinir sua senha diretamente no painel de Usuários."
    );
  }

  try {
    const remetente = (env && (env.EMAIL_REMETENTE || env.email_remetente)) || "WorkFlow Zagonel <onboarding@resend.dev>";
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: remetente,
        to: [usuario.email],
        subject: "Redefinição de Senha - WorkFlow Zagonel",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 20px; color: #1f2937;">
            <h2 style="color: #2f6f4f;">Recuperação de Senha</h2>
            <p>Olá, <strong>${usuario.nome}</strong>,</p>
            <p>Recebemos uma solicitação para redefinir a senha do seu usuário <code>${usuario.login}</code> no sistema WorkFlow Zagonel.</p>
            <p>Clique no botão abaixo para criar sua nova senha (link válido por 30 minutos):</p>
            <p style="margin: 25px 0;">
              <a href="${linkRedefinicao}" style="background-color: #2f6f4f; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Redefinir Minha Senha
              </a>
            </p>
            <p style="font-size: 0.85rem; color: #6b7280;">Se você não solicitou a troca de senha, pode ignorar este e-mail com segurança.</p>
          </div>
        `,
      }),
    });
    emailEnviado = resp.ok;
    if (!resp.ok) {
      const txt = await resp.text();
      erroEnvio = `Resend status ${resp.status}: ${txt}`;
    }
  } catch (e) {
    erroEnvio = e.message;
  }

  if (!emailEnviado) {
    throw new Error(
      `Falha no envio do e-mail de recuperação (${erroEnvio || "serviço indisponível"}). Solicite a um administrador para redefinir sua senha diretamente no painel de Usuários.`
    );
  }

  // Mascarar e-mail para exibição segura (ex: f***@zagonel.com.br)
  const partes = usuario.email.split("@");
  const usuarioMascarado = partes[0].length > 2
    ? `${partes[0].charAt(0)}***${partes[0].slice(-1)}@${partes[1]}`
    : `${partes[0].charAt(0)}***@${partes[1]}`;

  return {
    sucesso: true,
    email_mascarado: usuarioMascarado,
    email_enviado: emailEnviado,
  };
}

export async function validarTokenRecuperacao(db, token) {
  await ensureRecuperacaoTabela(db);
  if (!token) return null;

  const registro = await first(
    db,
    `SELECT r.*, u.nome AS usuario_nome, u.login AS usuario_login, u.email AS usuario_email
     FROM recuperacao_senha r
     JOIN usuarios u ON u.id = r.usuario_id
     WHERE r.token = ? AND r.usado = 0`,
    token
  );

  if (!registro) return null;

  // Checar expiração
  const agora = new Date().getTime();
  const expira = new Date(registro.expira_em).getTime();
  if (agora > expira) {
    return null;
  }

  return registro;
}

export async function redefinirSenhaComToken(db, token, novaSenha) {
  const registro = await validarTokenRecuperacao(db, token);
  if (!registro) {
    throw new Error("Link de recuperação inválido ou expirado. Solicite uma nova redefinição.");
  }

  const checagem = validarComplexidadeSenha(novaSenha);
  if (!checagem.valido) {
    throw new Error(checagem.mensagem);
  }

  const senhaHash = await hashSenha(novaSenha);
  const agora = Date.now();

  // Atualiza senha, desmarca flag de troca obrigatoria e invalida sessoes antigas
  await run(
    db,
    "UPDATE usuarios SET senha_hash = ?, deve_trocar_senha = 0, token_valido_apos = ? WHERE id = ?",
    senhaHash,
    agora,
    registro.usuario_id
  );

  // Marca token como usado
  await run(db, "UPDATE recuperacao_senha SET usado = 1 WHERE id = ?", registro.id);

  // Desbloqueia eventuais tentativas de login bloqueadas
  await desbloquearUsuario(db, registro.usuario_login);

  return { sucesso: true, usuario_nome: registro.usuario_nome, usuario_login: registro.usuario_login };
}
