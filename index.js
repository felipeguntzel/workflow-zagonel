import { api } from "./api.js";
import { setUsuarioLogado } from "./auth.js";

const select = document.getElementById("select-usuario");
const mensagemErro = document.getElementById("mensagem-erro");

async function carregarUsuarios() {
  const usuarios = await api("/usuarios");
  select.innerHTML = usuarios
    .map((u) => `<option value="${u.id}" data-setor="${u.setor_id}">${u.nome}</option>`)
    .join("");
}

document.getElementById("btn-entrar").addEventListener("click", () => {
  const opcao = select.selectedOptions[0];
  if (!opcao) return;
  setUsuarioLogado({
    id: Number(opcao.value),
    setor_id: Number(opcao.dataset.setor),
    nome: opcao.textContent,
  });
  window.location.href = "chamados.html";
});

carregarUsuarios().catch((e) => {
  mensagemErro.textContent = e.message;
  mensagemErro.hidden = false;
});
