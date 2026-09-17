import { api } from "./api.js";
import { setUsuarioLogado } from "./auth.js";
import { mostrarErro } from "./ui.js";

const formLogin = document.getElementById("form-login");
const mensagemErro = document.getElementById("mensagem-erro");
const btnEsqueciSenha = document.getElementById("btn-esqueci-senha");
const painelRecuperacao = document.getElementById("painel-recuperacao");
const formRecuperar = document.getElementById("form-recuperar-senha");
const inputIdentificador = document.getElementById("recuperar-identificador");
const btnCancelarRecuperacao = document.getElementById("btn-cancelar-recuperacao");
const btnEnviarRecuperacao = document.getElementById("btn-enviar-recuperacao");
const msgRecuperacaoErro = document.getElementById("msg-recuperacao-erro");
const msgRecuperacaoSucesso = document.getElementById("msg-recuperacao-sucesso");

formLogin.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  mensagemErro.hidden = true;
  try {
    const usuario = await api("/login", {
      method: "POST",
      body: {
        login: formLogin.elements.login.value,
        senha: formLogin.elements.senha.value,
      },
    });
    setUsuarioLogado(usuario);
    window.location.href = usuario.deve_trocar_senha ? "trocar-senha.html" : "chamados.html";
  } catch (e) {
    mostrarErro(mensagemErro, e);
  }
});

btnEsqueciSenha?.addEventListener("click", () => {
  painelRecuperacao.hidden = !painelRecuperacao.hidden;
  msgRecuperacaoErro.hidden = true;
  msgRecuperacaoSucesso.hidden = true;
  if (!painelRecuperacao.hidden) {
    inputIdentificador.focus();
    painelRecuperacao.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
});

btnCancelarRecuperacao?.addEventListener("click", () => {
  painelRecuperacao.hidden = true;
  msgRecuperacaoErro.hidden = true;
  msgRecuperacaoSucesso.hidden = true;
});

formRecuperar?.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  msgRecuperacaoErro.hidden = true;
  msgRecuperacaoSucesso.hidden = true;

  const identificador = inputIdentificador.value.trim();
  if (!identificador) return;

  btnEnviarRecuperacao.disabled = true;
  btnEnviarRecuperacao.textContent = "Gerando solicitação…";

  try {
    const res = await api("/recuperar-senha", {
      method: "POST",
      body: { acao: "solicitar", identificador },
    });

    let htmlSucesso = `
      <div>
        <strong>Solicitação registrada com sucesso!</strong><br>
        Um link de recuperação válido por 30 minutos foi gerado para o e-mail cadastrado <strong>(${res.email_mascarado})</strong>.
      </div>
    `;

    // Se estiver em ambiente sem serviço externo ou de teste, disponibiliza o link de teste
    if (res.link_recuperacao && !res.email_enviado) {
      htmlSucesso += `
        <div style="margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px dashed rgba(21, 128, 61, 0.4); font-size: 0.84rem;">
          <em>Link de redefinição direta:</em><br>
          <a href="${res.link_recuperacao}" style="color: #15803d; font-weight: bold; word-break: break-all;">
            Clique aqui para redefinir sua senha agora
          </a>
        </div>
      `;
    }

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

