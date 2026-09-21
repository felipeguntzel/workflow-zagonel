import { api } from "./api.js";
import { mostrarErro } from "./ui.js";

const params = new URLSearchParams(window.location.search);
const token = params.get("token");

const painel = document.getElementById("painel-redefinir");
const form = document.getElementById("form-redefinir-senha");
const subtitulo = document.getElementById("subtitulo-usuario");
const msgErro = document.getElementById("mensagem-erro");
const msgSucesso = document.getElementById("mensagem-sucesso");
const btnSalvar = document.getElementById("btn-salvar");

if (!token) {
  exibirTokenInvalido("Nenhum código de recuperação foi informado.");
} else {
  validarToken();
}

async function validarToken() {
  try {
    const res = await api("/recuperar-senha", {
      method: "POST",
      body: { acao: "validar", token },
    });
    subtitulo.innerHTML = `Olá, <strong>${res.usuario_nome || res.usuario_login}</strong>. Digite e confirme sua nova senha abaixo:`;
  } catch (err) {
    exibirTokenInvalido(err.message || "Link de recuperação inválido ou expirado.");
  }
}

function exibirTokenInvalido(mensagem) {
  painel.innerHTML = `
    <div style="text-align: center; padding: 2rem 1rem;">
      <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">⚠️</div>
      <h2 style="margin-bottom: 0.5rem;">Link Inválido ou Expirado</h2>
      <p style="color: var(--cor-texto-secundario); font-size: 0.95rem; margin-bottom: 1.5rem; line-height: 1.5;">
        ${mensagem}
      </p>
      <a href="index.html" class="btn btn-primario" style="text-decoration: none; display: inline-block; padding: 0.6rem 1.25rem;">
        Ir para tela de login
      </a>
    </div>
  `;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msgErro.hidden = true;
  msgSucesso.hidden = true;

  const novaSenha = form.elements.nova_senha.value;
  const confirmarSenha = form.elements.confirmar_senha.value;

  if (novaSenha !== confirmarSenha) {
    mostrarErro(msgErro, new Error("As duas senhas digitadas não coincidem."));
    return;
  }

  if (novaSenha.length < 8) {
    mostrarErro(msgErro, new Error("A senha deve ter pelo menos 8 caracteres."));
    return;
  }
  if (!/[A-Z]/.test(novaSenha)) {
    mostrarErro(msgErro, new Error("A senha deve conter pelo menos uma letra maiúscula."));
    return;
  }
  if (!/[a-z]/.test(novaSenha)) {
    mostrarErro(msgErro, new Error("A senha deve conter pelo menos uma letra minúscula."));
    return;
  }
  if (!/[0-9]/.test(novaSenha)) {
    mostrarErro(msgErro, new Error("A senha deve conter pelo menos um número."));
    return;
  }
  if (!/[^A-Za-z0-9]/.test(novaSenha)) {
    mostrarErro(msgErro, new Error("A senha deve conter pelo menos um caractere especial ou símbolo (@, #, $, etc.)."));
    return;
  }

  btnSalvar.disabled = true;
  btnSalvar.textContent = "Salvando nova senha…";

  try {
    await api("/recuperar-senha", {
      method: "POST",
      body: {
        acao: "redefinir",
        token,
        nova_senha: novaSenha,
      },
    });

    painel.innerHTML = `
      <div style="text-align: center; padding: 2rem 1rem;">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">✅</div>
        <h2 style="margin-bottom: 0.5rem; color: #15803d;">Senha Redefinida!</h2>
        <p style="color: var(--cor-texto-secundario); font-size: 0.95rem; margin-bottom: 1.5rem; line-height: 1.5;">
          Sua senha foi atualizada com sucesso. Você já pode acessar o sistema com suas novas credenciais.
        </p>
        <a href="index.html" class="btn btn-primario" style="text-decoration: none; display: inline-block; padding: 0.6rem 1.5rem;">
          Fazer login agora
        </a>
      </div>
    `;
  } catch (err) {
    mostrarErro(msgErro, err);
    btnSalvar.disabled = false;
    btnSalvar.textContent = "Salvar nova senha";
  }
});
