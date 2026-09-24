import { api } from "./api.js";
import { mostrarErro } from "./ui.js";
import { gerarSenhaAleatoria, validarComplexidadeSenhaCliente, calcularSha256 } from "./crud-ui.js";

const params = new URLSearchParams(window.location.search);
const token = params.get("token");

const painel = document.getElementById("painel-redefinir");
const form = document.getElementById("form-redefinir-senha");
const subtitulo = document.getElementById("subtitulo-usuario");
const msgErro = document.getElementById("mensagem-erro");
const msgSucesso = document.getElementById("mensagem-sucesso");
const btnSalvar = document.getElementById("btn-salvar");
const inputNova = document.getElementById("input-nova-senha");
const inputConfirmar = document.getElementById("input-confirmar-senha");
const btnGerar = document.getElementById("btn-gerar-senha-redefinir");
const painelGerada = document.getElementById("painel-senha-gerada");
const textoGerada = document.getElementById("texto-senha-gerada");
const btnCopiar = document.getElementById("btn-copiar-senha-gerada");
const avisoCaps = document.getElementById("aviso-capslock-redefinir");

let senhaGeradaAtual = "";
let usuarioLoginIdentificado = "";

// Gerar senha aleatória
btnGerar?.addEventListener("click", () => {
  const nova = gerarSenhaAleatoria(6);
  senhaGeradaAtual = nova;
  inputNova.value = nova;
  inputConfirmar.value = nova;
  textoGerada.textContent = nova;
  painelGerada.hidden = false;

  navigator.clipboard?.writeText(nova).catch(() => {});
  btnCopiar.textContent = "✓ Copiada!";
  setTimeout(() => {
    if (btnCopiar) btnCopiar.textContent = "Copiar";
  }, 3000);
});

btnCopiar?.addEventListener("click", () => {
  if (senhaGeradaAtual) {
    navigator.clipboard?.writeText(senhaGeradaAtual).catch(() => {});
    btnCopiar.textContent = "✓ Copiada!";
    setTimeout(() => {
      if (btnCopiar) btnCopiar.textContent = "Copiar";
    }, 3000);
  }
});

// Botões para copiar senha diretamente do campo
document.querySelectorAll(".btn-copiar-campo").forEach((btn) => {
  btn.addEventListener("click", () => {
    const alvoId = btn.dataset.alvo;
    const input = document.getElementById(alvoId);
    if (!input || !input.value) return;
    navigator.clipboard?.writeText(input.value).catch(() => {});
    const textoOriginal = btn.textContent;
    btn.textContent = "✓";
    btn.title = "Senha copiada!";
    setTimeout(() => {
      btn.textContent = textoOriginal;
      btn.title = "Copiar senha";
    }, 2500);
  });
});

// Botões de alternar visualização de senha
document.querySelectorAll(".btn-toggle-senha").forEach((btn) => {
  btn.addEventListener("click", () => {
    const alvoId = btn.dataset.alvo;
    const input = document.getElementById(alvoId);
    if (!input) return;
    if (input.type === "password") {
      input.type = "text";
      btn.textContent = "🙈";
    } else {
      input.type = "password";
      btn.textContent = "👁️";
    }
  });
});

// Detecção de Caps Lock
const checarCaps = (ev) => {
  if (!avisoCaps) return;
  if (ev.getModifierState && ev.getModifierState("CapsLock")) {
    avisoCaps.hidden = false;
    avisoCaps.style.display = "flex";
  } else {
    avisoCaps.hidden = true;
    avisoCaps.style.display = "none";
  }
};
[inputNova, inputConfirmar].forEach((inp) => {
  inp?.addEventListener("keydown", checarCaps);
  inp?.addEventListener("keyup", checarCaps);
  inp?.addEventListener("blur", () => {
    if (avisoCaps) {
      avisoCaps.hidden = true;
      avisoCaps.style.display = "none";
    }
  });
});

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
    usuarioLoginIdentificado = res.usuario_login || "";
    subtitulo.innerHTML = `Olá, <strong>${res.usuario_nome || res.usuario_login}</strong>. Digite e confirme sua nova senha abaixo:`;
  } catch (err) {
    exibirTokenInvalido(err.message || "Link de recuperação inválido ou expirado.");
  }
}

function exibirTokenInvalido(mensagem) {
  painel.innerHTML = `
    <div style="text-align: center; padding: 1.5rem 0.5rem;">
      <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">⚠️</div>
      <h2 style="margin-bottom: 0.5rem;">Link Inválido ou Expirado</h2>
      <p style="color: var(--cor-texto-secundario); font-size: 0.92rem; margin-bottom: 1.5rem; line-height: 1.5;">
        ${mensagem}
      </p>
      <a href="/" class="btn-link" style="display: inline-block; font-size: 0.95rem; font-weight: 700;">
        &larr; Voltar para o login
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

  const checagem = validarComplexidadeSenhaCliente(novaSenha);
  if (!checagem.valido) {
    mostrarErro(msgErro, new Error(checagem.mensagem));
    return;
  }

  btnSalvar.disabled = true;
  btnSalvar.textContent = "Salvando nova senha...";

  try {
    const senhaHash = await calcularSha256(novaSenha);
    await api("/recuperar-senha", {
      method: "POST",
      body: {
        acao: "redefinir",
        token,
        nova_senha: senhaHash,
      },
    });

    const infoUsuario = usuarioLoginIdentificado
      ? `Utilize seu usuário <strong>${usuarioLoginIdentificado}</strong> para acessar o sistema com sua nova senha.`
      : "Você já pode acessar o sistema com suas novas credenciais.";

    painel.innerHTML = `
      <div style="text-align: center; padding: 1.5rem 0.5rem;">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">✅</div>
        <h2 style="margin-bottom: 0.5rem; color: #15803d;">Senha Redefinida!</h2>
        <p style="color: var(--cor-texto-secundario); font-size: 0.92rem; margin-bottom: 1.5rem; line-height: 1.5;">
          Sua senha foi atualizada com sucesso. ${infoUsuario}
        </p>
        <a href="/" class="btn-link" style="display: inline-block; font-size: 0.95rem; font-weight: 700;">
          Fazer login agora &rarr;
        </a>
      </div>
    `;
  } catch (err) {
    mostrarErro(msgErro, err);
    btnSalvar.disabled = false;
    btnSalvar.textContent = "Salvar nova senha";
  }
});
