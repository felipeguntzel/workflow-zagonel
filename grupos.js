import { exigirLogin } from "./auth.js";
import { montarNav, mostrarErro, info } from "./ui.js";
import { api } from "./api.js";

const TELAS = [
  { chave: "empresas", label: "Empresas" },
  { chave: "setores", label: "Setores" },
  { chave: "usuarios", label: "Usuários" },
  { chave: "status", label: "Status" },
  { chave: "fluxos", label: "Fluxos" },
  { chave: "chamados", label: "Chamados" },
];
const ACOES = ["visualizar", "inserir", "editar", "excluir"];

const usuario = exigirLogin();
if (usuario) {
  document.getElementById("nav").replaceWith(montarNav(usuario));
  const mensagemErro = document.getElementById("mensagem-erro");
  const container = document.getElementById("conteudo");

  if (!usuario.admin) {
    container.innerHTML = "<p>Você não tem permissão para acessar esta tela.</p>";
  } else {
    iniciar(container, mensagemErro).catch((e) => mostrarErro(mensagemErro, e));
  }
}

async function iniciar(container, mensagemErro) {
  container.innerHTML = `
    <h2>Grupos de Permissão</h2>
    <ul id="lista-grupos"></ul>
    <form class="formulario" id="form-novo-grupo">
      <label>Novo grupo
        <input type="text" name="nome" required>
      </label>
      <button type="submit">Criar</button>
    </form>
    <div id="detalhe-grupo"></div>
  `;

  const lista = container.querySelector("#lista-grupos");
  const formNovo = container.querySelector("#form-novo-grupo");
  const detalhe = container.querySelector("#detalhe-grupo");
  let grupoSelecionadoId = null;

  async function recarregarLista() {
    const grupos = await api("/grupos");
    lista.innerHTML = grupos
      .map(
        (g) => `
        <li data-id="${g.id}">
          <button type="button" class="btn-selecionar" data-id="${g.id}">${g.nome}</button>
          <button type="button" class="btn-excluir" data-id="${g.id}">Excluir</button>
        </li>`
      )
      .join("");

    lista.querySelectorAll(".btn-selecionar").forEach((btn) =>
      btn.addEventListener("click", () => abrirGrupo(Number(btn.dataset.id)))
    );
    lista.querySelectorAll(".btn-excluir").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!window.confirm("Excluir este grupo? Usuários vinculados perdem as permissões dele.")) return;
        try {
          await api(`/grupos/${btn.dataset.id}`, { method: "DELETE" });
          if (grupoSelecionadoId === Number(btn.dataset.id)) {
            grupoSelecionadoId = null;
            detalhe.innerHTML = "";
          }
          recarregarLista();
        } catch (e) {
          mostrarErro(mensagemErro, e);
        }
      })
    );
  }

  async function abrirGrupo(id) {
    grupoSelecionadoId = id;
    const grupo = await api(`/grupos/${id}`);

    detalhe.innerHTML = `
      <h3>${grupo.nome}</h3>
      <form class="formulario" id="form-renomear">
        <label>Nome
          <input type="text" name="nome" value="${grupo.nome}" required>
        </label>
        <button type="submit">Salvar nome</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>Tela</th>
            ${ACOES.map((a) => `<th>${a}</th>`).join("")}
            <th>Ver todos os setores ${info("Só relevante para Chamados: enxerga chamados de todos os setores, não só do setor do usuário.")}</th>
          </tr>
        </thead>
        <tbody>
          ${TELAS.map(
            (t) => `
            <tr data-tela="${t.chave}">
              <td>${t.label}</td>
              ${ACOES.map(
                (a) =>
                  `<td><input type="checkbox" data-acao="${a}" ${grupo.permissoes[t.chave][a] ? "checked" : ""}></td>`
              ).join("")}
              <td>
                ${
                  t.chave === "chamados"
                    ? `<input type="checkbox" data-acao="ver_todos_setores" ${grupo.permissoes.chamados.ver_todos_setores ? "checked" : ""}>`
                    : ""
                }
              </td>
            </tr>`
          ).join("")}
        </tbody>
      </table>
      <button type="button" id="btn-salvar-permissoes">Salvar permissões</button>
    `;

    detalhe.querySelector("#form-renomear").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const nome = ev.target.elements.nome.value;
      try {
        await api(`/grupos/${id}`, { method: "PUT", body: { nome } });
        recarregarLista();
      } catch (e) {
        mostrarErro(mensagemErro, e);
      }
    });

    detalhe.querySelector("#btn-salvar-permissoes").addEventListener("click", async () => {
      const matriz = {};
      for (const tela of TELAS) {
        const linha = detalhe.querySelector(`tr[data-tela="${tela.chave}"]`);
        matriz[tela.chave] = {};
        for (const acao of ACOES) {
          matriz[tela.chave][acao] = linha.querySelector(`input[data-acao="${acao}"]`).checked;
        }
        if (tela.chave === "chamados") {
          matriz.chamados.ver_todos_setores = linha.querySelector('input[data-acao="ver_todos_setores"]').checked;
        }
      }
      try {
        await api(`/grupos/${id}/permissoes`, { method: "PUT", body: matriz });
      } catch (e) {
        mostrarErro(mensagemErro, e);
      }
    });
  }

  formNovo.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const nome = formNovo.elements.nome.value;
    try {
      await api("/grupos", { method: "POST", body: { nome } });
      formNovo.reset();
      recarregarLista();
    } catch (e) {
      mostrarErro(mensagemErro, e);
    }
  });

  await recarregarLista();
}
