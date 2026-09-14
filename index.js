import { api } from "./api.js";
import { setUsuarioLogado } from "./auth.js";

document.getElementById("form-login").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const mensagemErro = document.getElementById("mensagem-erro");
  mensagemErro.hidden = true;
  try {
    const usuario = await api("/login", {
      method: "POST",
      body: {
        login: form.elements.login.value,
        senha: form.elements.senha.value,
      },
    });
    setUsuarioLogado(usuario);
    window.location.href = "chamados.html";
  } catch (e) {
    mensagemErro.textContent = e.message;
    mensagemErro.hidden = false;
  }
});
