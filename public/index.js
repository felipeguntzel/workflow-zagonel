import { api } from "./api.js";
import { setUsuarioLogado } from "./auth.js";
import { mostrarErro, escaparHtml } from "./ui.js";

const formLogin = document.getElementById("form-login");
const mensagemErro = document.getElementById("mensagem-erro");
const btnEsqueciSenha = document.getElementById("btn-esqueci-senha");
const formRecuperar = document.getElementById("form-recuperar-senha");
const inputIdentificador = document.getElementById("recuperar-identificador");
const btnCancelarRecuperacao = document.getElementById("btn-cancelar-recuperacao");
const btnEnviarRecuperacao = document.getElementById("btn-enviar-recuperacao");
const msgRecuperacaoErro = document.getElementById("msg-recuperacao-erro");
const msgRecuperacaoSucesso = document.getElementById("msg-recuperacao-sucesso");

const inputSenha = formLogin?.elements?.senha;
const avisoCapsLogin = document.getElementById("aviso-capslock-login");

async function calcularSha256(texto) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const checarCapsLogin = (ev) => {
  if (!avisoCapsLogin) return;
  if (ev.getModifierState && ev.getModifierState("CapsLock")) {
    avisoCapsLogin.hidden = false;
    avisoCapsLogin.style.display = "flex";
  } else {
    avisoCapsLogin.hidden = true;
    avisoCapsLogin.style.display = "none";
  }
};
inputSenha?.addEventListener("keydown", checarCapsLogin);
inputSenha?.addEventListener("keyup", checarCapsLogin);
inputSenha?.addEventListener("blur", () => {
  if (avisoCapsLogin) {
    avisoCapsLogin.hidden = true;
    avisoCapsLogin.style.display = "none";
  }
});

function abrirRecuperacao() {
  if (!formRecuperar || !formLogin) return;
  formLogin.hidden = true;
  formRecuperar.hidden = false;
  msgRecuperacaoErro.hidden = true;
  msgRecuperacaoSucesso.hidden = true;

  const loginDigitado = formLogin.elements.login?.value?.trim();
  if (loginDigitado && !inputIdentificador.value.trim()) {
    inputIdentificador.value = loginDigitado;
  }
  inputIdentificador.focus();
}

function voltarParaLogin() {
  if (!formRecuperar || !formLogin) return;
  formRecuperar.hidden = true;
  formLogin.hidden = false;
  msgRecuperacaoErro.hidden = true;
  msgRecuperacaoSucesso.hidden = true;
  formLogin.elements.login?.focus();
}

btnEsqueciSenha?.addEventListener("click", abrirRecuperacao);
btnCancelarRecuperacao?.addEventListener("click", voltarParaLogin);

formLogin?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  mensagemErro.hidden = true;
  mensagemErro.innerHTML = "";
  try {
    const senhaHash = await calcularSha256(formLogin.elements.senha.value);
    const usuario = await api("/login", {
      method: "POST",
      body: {
        login: formLogin.elements.login.value.trim(),
        senha: senhaHash,
      },
    });
    setUsuarioLogado(usuario);
    window.location.href = usuario.deve_trocar_senha ? "/trocar-senha" : "/chamados";
  } catch (e) {
    const msg = e && e.message ? e.message : String(e || "");
    if (msg.includes("bloqueado") || msg.includes("Redefina sua senha")) {
      mensagemErro.innerHTML = `
        <div>${escaparHtml(msg)}</div>
        <div style="margin-top: 0.5rem; text-align: right;">
          <button type="button" id="btn-atalho-redefinir" class="btn-link" style="color: #b91c1c !important; font-weight: 700;">
            Redefinir senha agora &rarr;
          </button>
        </div>
      `;
      mensagemErro.className = "erro";
      mensagemErro.hidden = false;
      document.getElementById("btn-atalho-redefinir")?.addEventListener("click", abrirRecuperacao);
    } else {
      mostrarErro(mensagemErro, e);
    }
  }
});

formRecuperar?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  msgRecuperacaoErro.hidden = true;
  msgRecuperacaoSucesso.hidden = true;

  const identificador = inputIdentificador.value.trim();
  if (!identificador) return;

  btnEnviarRecuperacao.disabled = true;
  btnEnviarRecuperacao.textContent = "Gerando solicitação...";

  try {
    const res = await api("/recuperar-senha", {
      method: "POST",
      body: { acao: "solicitar", identificador },
    });

    let htmlSucesso = `
      <div style="display: flex; gap: 0.5rem; align-items: flex-start;">
        <span style="font-size: 1.25rem; line-height: 1;">✉️</span>
        <div>
          <strong style="display: block; margin-bottom: 0.25rem;">Solicitação registrada com sucesso!</strong>
          Enviamos as instruções e o link seguro para o e-mail cadastrado <strong>(${escaparHtml(res.email_mascarado)})</strong>. O link expira em 30 minutos.
        </div>
      </div>
    `;

    msgRecuperacaoSucesso.innerHTML = htmlSucesso;
    msgRecuperacaoSucesso.hidden = false;
    formRecuperar.reset();
  } catch (err) {
    mostrarErro(msgRecuperacaoErro, err);
  } finally {
    btnEnviarRecuperacao.disabled = false;
    btnEnviarRecuperacao.textContent = "Enviar link de recuperação";
  }
});

