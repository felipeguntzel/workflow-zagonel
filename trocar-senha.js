import { exigirLogin, getUsuarioLogado, setUsuarioLogado } from "./auth.js";
import { api } from "./api.js";
import { mostrarErro } from "./ui.js";

const usuario = exigirLogin();
if (usuario) {
  document.getElementById("form-trocar-senha").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const mensagemErro = document.getElementById("mensagem-erro");
    mensagemErro.hidden = true;
    const novaSenha = form.elements.nova_senha.value;
    const confirmarSenha = form.elements.confirmar_senha.value;
    if (novaSenha !== confirmarSenha) {
      mensagemErro.textContent = "As senhas digitadas não coincidem.";
      mensagemErro.hidden = false;
      return;
    }
    try {
      await api("/trocar-senha", { method: "POST", body: { nova_senha: novaSenha } });
      setUsuarioLogado({ ...getUsuarioLogado(), deve_trocar_senha: false });
      window.location.href = "chamados.html";
    } catch (e) {
      mostrarErro(mensagemErro, e);
    }
  });
}
