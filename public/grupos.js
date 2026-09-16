import { exigirLogin } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { mostrarErro, mostrarMensagem, info, escaparHtml } from "./ui.js";
import { confirmarAcao } from "./modal.js";
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
  aplicarLayout(usuario);
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
    <div class="painel">
      <form class="formulario" id="form-novo-grupo">
        <label>Novo grupo
          <input type="text" name="nome" required>
        </label>
        <button type="submit" class="btn btn-primario">Criar</button>
      </form>
    </div>
    <div id="detalhe-grupo"></div>
  `;

  const lista = container.querySelector("#lista-grupos");
  const formNovo = container.querySelector("#form-novo-grupo");
  const detalhe = container.querySelector("#detalhe-grupo");
  let grupoSelecionadoId = null;

  async function recarregarLista() {
    const grupos = await api("/grupos");
    lista.innerHTML =
      grupos.length === 0
        ? `<li>Nenhum grupo cadastrado ainda.</li>`
        : grupos
            .map(
              (g) => `
              <li data-id="${g.id}">
                <button type="button" class="btn btn-secundario btn-selecionar" data-id="${g.id}">${escaparHtml(g.nome)}</button>
                <button type="button" class="btn btn-perigo btn-excluir" data-id="${g.id}">Excluir</button>
              </li>`
            )
            .join("");

    lista.querySelectorAll(".btn-selecionar").forEach((btn) =>
      btn.addEventListener("click", async () => {
        try {
          await abrirGrupo(Number(btn.dataset.id));
        } catch (e) {
          mostrarErro(mensagemErro, e);
        }
      })
    );
    lista.querySelectorAll(".btn-excluir").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const confirmado = await confirmarAcao(
          "Excluir este grupo?",
          "Usuários vinculados perdem as permissões dele."
        );
        if (!confirmado) return;
        try {
          await api(`/grupos/${btn.dataset.id}`, { method: "DELETE" });
          if (grupoSelecionadoId === Number(btn.dataset.id)) {
            grupoSelecionadoId = null;
            detalhe.innerHTML = "";
          }
          await recarregarLista();
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
      <div class="painel">
        <h3>${escaparHtml(grupo.nome)}</h3>
        <form class="formulario" id="form-renomear">
          <label>Nome
            <input type="text" name="nome" value="${escaparHtml(grupo.nome)}" required>
          </label>
          <button type="submit" class="btn btn-primario">Salvar nome</button>
        </form>
      </div>
      <div class="tabela-wrap">
        <table>
          <thead>
            <tr>
              <th style="min-width:12ch">Tela</th>
              ${ACOES.map((a) => `<th>${a}</th>`).join("")}
              <th>Ver todos os setores ${info("Só relevante para Chamados, e só afeta a listagem 'Meus chamados': sem esta permissão, o usuário só vê ali os chamados do próprio setor. Abrir um chamado específico por link (inclusive de outro setor) e ver a árvore/comentários do chamado mãe sempre funciona para qualquer usuário autenticado, com ou sem esta permissão, isso é proposital.")}</th>
            </tr>
          </thead>
          <tbody>
            ${TELAS.map(
              (t) => `
              <tr data-tela="${t.chave}">
                <td>${escaparHtml(t.label)}</td>
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
      </div>
      <button type="button" id="btn-salvar-permissoes" class="btn btn-primario">Salvar permissões</button>
    `;

    detalhe.querySelector("#form-renomear").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const nome = ev.target.elements.nome.value;
      try {
        await api(`/grupos/${id}`, { method: "PUT", body: { nome } });
        mostrarMensagem(mensagemErro, "Nome atualizado.", "sucesso");
        await recarregarLista();
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
        mostrarMensagem(mensagemErro, "Permissões salvas.", "sucesso");
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
      await recarregarLista();
    } catch (e) {
      mostrarErro(mensagemErro, e);
    }
  });

  await recarregarLista();
}
