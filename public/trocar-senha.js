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
    if (novaSenha.length < 8) {
      mensagemErro.textContent = "A senha deve ter pelo menos 8 caracteres.";
      mensagemErro.hidden = false;
      return;
    }
    if (!/[A-Z]/.test(novaSenha)) {
      mensagemErro.textContent = "A senha deve conter pelo menos uma letra maiúscula.";
      mensagemErro.hidden = false;
      return;
    }
    if (!/[a-z]/.test(novaSenha)) {
      mensagemErro.textContent = "A senha deve conter pelo menos uma letra minúscula.";
      mensagemErro.hidden = false;
      return;
    }
    if (!/[0-9]/.test(novaSenha)) {
      mensagemErro.textContent = "A senha deve conter pelo menos um número.";
      mensagemErro.hidden = false;
      return;
    }
    if (!/[^A-Za-z0-9]/.test(novaSenha)) {
      mensagemErro.textContent = "A senha deve conter pelo menos um caractere especial ou símbolo (@, #, $, etc.).";
      mensagemErro.hidden = false;
      return;
    }
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
