import { exigirLogin } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { mostrarErro, info, escaparHtml, escaparAtributo, botaoIconeEditar, botaoIconeExcluir } from "./ui.js";
import { confirmarAcao } from "./modal.js";
import { mostrarAvisoModal } from "./crud-ui.js";
import { api } from "./api.js";
import { tornarTabelaReordenavel } from "./tabela-colunas.js";

const TELAS = [
  { chave: "empresas", label: "Empresas", dica: "Acesso ao cadastro de empresas" },
  { chave: "setores", label: "Setores", dica: "Acesso ao cadastro de setores produtivos e administrativos" },
  { chave: "usuarios", label: "Usuários", dica: "Acesso ao cadastro de usuários e operadores" },
  { chave: "status", label: "Status", dica: "Acesso aos status de chamados" },
  { chave: "fluxos", label: "Fluxos", dica: "Acesso à criação de fluxos de processo e suas etapas" },
  { chave: "chamados", label: "Chamados", dica: "Acesso à visualização e abertura de chamados" },
  { chave: "dashboards", label: "Dashboards", dica: "Acesso aos dashboards e indicadores operacionais de desempenho" },
];

const ACOES = [
  { chave: "visualizar", label: "Visualizar" },
  { chave: "inserir", label: "Inserir" },
  { chave: "editar", label: "Editar" },
  { chave: "excluir", label: "Excluir" },
];

export function inicializar() {
  const usuario = exigirLogin();
  if (!usuario) return;

  aplicarLayout(usuario);
  const container = document.getElementById("secao-grupos");
  const mensagemErro = document.getElementById("mensagem-erro");
  if (!container) return;

  if (!usuario.admin) {
    container.innerHTML = "<p>Você não tem permissão para acessar esta tela.</p>";
  } else {
    iniciar(container, mensagemErro).catch((e) => mostrarErro(mensagemErro, e));
  }
}

inicializar();

async function iniciar(container, mensagemErro) {
  let grupos = [];
  let ordemAtual = { campo: "id", direcao: "asc" };

  container.innerHTML = `
    <div class="pagina-cabecalho">
      <div class="pagina-cabecalho__esquerda">
        <h2>Grupos de Permissão</h2>
      </div>
      <div class="pagina-cabecalho__acoes">
        <button type="button" class="btn btn-primario btn-adicionar-grupo">+ Adicionar</button>
      </div>
    </div>
    <div class="tabela-wrap">
      <table>
        <thead>
          <tr>
            <th class="th-ordenavel th-id" data-campo="id">#ID <span class="ordem-indicador" data-indicador="id">▲</span></th>
            <th class="th-ordenavel" data-campo="nome" style="min-width: 18ch;">Nome do grupo <span class="ordem-indicador" data-indicador="nome"></span></th>
            <th>Grupo Superior (Herança)</th>
            <th>Permissões configuradas</th>
            <th class="td-acoes">Ações</th>
          </tr>
        </thead>
        <tbody class="tbody-grupos"></tbody>
      </table>
    </div>
    <div class="container-modal-grupo"></div>
  `;

  const tabelaGrupos = container.querySelector("table");
  if (tabelaGrupos) {
    tornarTabelaReordenavel(tabelaGrupos, "grupos");
  }

  const tbody = container.querySelector(".tbody-grupos");
  const containerModal = container.querySelector(".container-modal-grupo");
  const btnAdicionar = container.querySelector(".btn-adicionar-grupo");

  btnAdicionar.addEventListener("click", () => {
    abrirModalGrupo(null);
  });

  // Ordenação por cabeçalho
  container.querySelectorAll(".th-ordenavel").forEach((th) => {
    th.addEventListener("click", () => {
      const campo = th.dataset.campo;
      if (ordemAtual.campo === campo) {
        ordemAtual.direcao = ordemAtual.direcao === "asc" ? "desc" : "asc";
      } else {
        ordemAtual.campo = campo;
        ordemAtual.direcao = "asc";
      }
      renderizarLinhas();
    });
  });

  function renderizarLinhas() {
    const dados = [...grupos];
    dados.sort((a, b) => {
      if (ordemAtual.campo === "id") {
        return ordemAtual.direcao === "asc" ? a.id - b.id : b.id - a.id;
      }
      const comp = String(a[ordemAtual.campo] ?? "").localeCompare(String(b[ordemAtual.campo] ?? ""), "pt-BR");
      return ordemAtual.direcao === "asc" ? comp : -comp;
    });

    container.querySelectorAll(".ordem-indicador").forEach((ind) => {
      ind.textContent = ind.dataset.indicador === ordemAtual.campo ? (ordemAtual.direcao === "asc" ? "▲" : "▼") : "";
    });

    if (dados.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2.5rem 1.5rem; color: var(--cor-texto-secundario);">Nenhum grupo de permissão encontrado. Clique em "+ Adicionar" para cadastrar.</td></tr>`;
      return;
    }

    tbody.innerHTML = dados
      .map((g) => {
        const telasNomes = (g.telasPermitidas || []).map((t) => TELAS.find((item) => item.chave === t)?.label || t);
        let resumoPermissoes = "";
        if (telasNomes.length === 0) {
          resumoPermissoes = `<span style="color: var(--cor-texto-secundario); font-size: 0.85rem;">Nenhuma permissão concedida</span>`;
        } else if (telasNomes.length === TELAS.length) {
          resumoPermissoes = `<span class="badge-status" style="background:#e6f4ea; color:#137333; font-weight: 600;">Acesso a todas as telas (${telasNomes.length})</span>`;
        } else {
          resumoPermissoes = `<span title="${escaparAtributo(telasNomes.join(", "))}" style="font-size: 0.88rem;">${escaparHtml(telasNomes.join(", "))}</span>`;
        }

        return `
          <tr data-id="${g.id}">
            <td class="td-id">#${g.id}</td>
            <td style="font-weight: 600;">${escaparHtml(g.nome)}</td>
            <td style="color: var(--cor-texto-secundario); font-size: 0.88rem;">${escaparHtml(g.grupo_pai_nome || "-")}</td>
            <td>${resumoPermissoes}</td>
            <td class="td-acoes">
              ${botaoIconeEditar("btn-editar-grupo", g.id)}
              ${botaoIconeExcluir("btn-excluir-grupo", g.id)}
            </td>
          </tr>
        `;
      })
      .join("");

    // Eventos editar
    tbody.querySelectorAll(".btn-editar-grupo").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.id);
        const grupo = grupos.find((item) => item.id === id);
        if (!grupo) return;
        try {
          const detalhes = await api(`/grupos/${id}`);
          abrirModalGrupo(detalhes);
        } catch (e) {
          mostrarErro(mensagemErro, e);
        }
      });
    });

    // Eventos excluir
    tbody.querySelectorAll(".btn-excluir-grupo").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.id);
        const grupo = grupos.find((item) => item.id === id);
        const rotulo = grupo ? `"${grupo.nome}"` : `#${id}`;

        const confirmado = await confirmarAcao(
          `Excluir grupo de permissão ${rotulo}?`,
          "Essa ação não poderá ser desfeita."
        );
        if (!confirmado) return;

        try {
          await api(`/grupos/${id}`, { method: "DELETE" });
          await recarregar();
        } catch (e) {
          mostrarAvisoModal("Exclusão não permitida", e.message);
        }
      });
    });
  }

  // Modal completo de criação / edição com nome e matriz de permissões integrados
  function abrirModalGrupo(grupoEdicao = null) {
    const isEdicao = !!grupoEdicao;
    const titulo = isEdicao ? `Editar Grupo: ${grupoEdicao.nome}` : "Novo Grupo de Permissão";
    const permissoesAtuais = grupoEdicao?.permissoes || {};

    containerModal.innerHTML = `
      <div class="modal-fundo modal-fundo--cadastro" role="dialog" aria-modal="true">
        <div class="modal-cadastro modal-cadastro--complexo" style="max-width: 860px; box-shadow: 0 12px 36px rgba(0,0,0,0.28);">
          <div class="modal-cabecalho">
            <h3>${escaparHtml(titulo)}</h3>
            <div class="modal-acoes-topo">
              <button type="button" class="modal-btn-topo btn-toggle-tela-cheia" title="Alternar entre tela cheia e janela padrão" aria-label="Alternar tela cheia">
                <span class="icone-tela-cheia">⛶</span>
                <span class="texto-tela-cheia">Tela cheia</span>
              </button>
              <button type="button" class="modal-fechar" aria-label="Fechar">✕</button>
            </div>
          </div>
          <form class="form-modal-grupo" style="padding: 1.25rem;">
            <p class="erro-modal erro" hidden></p>
            
            <div style="margin-bottom: 1.25rem;">
              <label style="font-weight: 600; display: block; margin-bottom: 0.35rem;">
                Nome do grupo <span class="campo-obrigatorio">*</span>
                ${info("Exemplos: Engenharia de Produto, Qualidade, Produção, Almoxarifado.")}
              </label>
              <input type="text" name="nome" value="${escaparAtributo(grupoEdicao?.nome || "")}" required placeholder="Digite o nome do grupo de permissão" style="width: 100%; max-width: 480px;">
            </div>

            <div style="margin-bottom: 1.25rem;">
              <label style="font-weight: 600; display: block; margin-bottom: 0.35rem;">
                Grupo Superior / Pai (Opcional - Herança de Permissões)
                ${info("Se selecionado, os usuários deste grupo herdarão automaticamente todas as permissões concedidas ao grupo pai.")}
              </label>
              <select name="grupo_pai_id" style="width: 100%; max-width: 480px; padding: 0.5rem; border-radius: 4px; border: 1px solid var(--cor-borda); background: var(--cor-superficie); color: var(--cor-texto);">
                <option value="">Nenhum (grupo independente)</option>
                ${grupos
                  .filter((g) => !isEdicao || g.id !== grupoEdicao.id)
                  .map(
                    (g) =>
                      `<option value="${g.id}" ${grupoEdicao?.grupo_pai_id === g.id ? "selected" : ""}>${escaparHtml(g.nome)}</option>`
                  )
                  .join("")}
              </select>
            </div>

            <div class="secao-permissoes-grupo" style="margin-top: 1.25rem; border-top: 1px solid var(--cor-borda); padding-top: 1rem;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.65rem; flex-wrap: wrap; gap: 0.5rem;">
                <div>
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="font-weight: 700; font-size: 0.95rem;">Permissões de Acesso</span>
                    <button type="button" class="btn btn-secundario btn-pequeno btn-ajuda-permissoes" title="Clique para ver o que cada permissão libera">
                      ℹ️ O que cada permissão libera?
                    </button>
                  </div>
                  <p style="font-size: 0.84rem; color: var(--cor-texto-secundario); margin: 0.2rem 0 0;">
                    Marque as telas e ações permitidas para os usuários vinculados a este grupo:
                  </p>
                </div>
                <div style="display: flex; gap: 0.4rem;">
                  <button type="button" class="btn btn-secundario btn-pequeno btn-marcar-todas">Marcar todas</button>
                  <button type="button" class="btn btn-secundario btn-pequeno btn-desmarcar-todas">Desmarcar todas</button>
                </div>
              </div>

              <!-- Painel expansível com o que cada permissão libera e exemplos -->
              <div class="painel-ajuda-permissoes" hidden>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <strong style="font-size: 0.92rem;">Guia de Permissões e Ações no Sistema</strong>
                  <button type="button" class="btn btn-secundario btn-pequeno btn-fechar-ajuda-permissoes" style="padding: 0.15rem 0.4rem; font-size: 0.75rem;">Fechar ajuda ✕</button>
                </div>
                <div class="painel-ajuda-permissoes__grid">
                  <div class="painel-ajuda-item">
                    <strong>👁️ Visualizar</strong>
                    <p>Permite acessar e consultar os registros da tela sem fazer qualquer modificação.</p>
                    <span class="exemplo">Exemplo: Consultar empresas, etapas de um fluxo ou histórico de chamados.</span>
                  </div>
                  <div class="painel-ajuda-item">
                    <strong>➕ Inserir</strong>
                    <p>Permite cadastrar e criar novos registros no sistema.</p>
                    <span class="exemplo">Exemplo: Cadastrar uma nova empresa, criar um usuário ou abrir um novo chamado.</span>
                  </div>
                  <div class="painel-ajuda-item">
                    <strong>✏️ Editar</strong>
                    <p>Permite modificar e atualizar registros já cadastrados.</p>
                    <span class="exemplo">Exemplo: Alterar o fluxo de processos, trocar prazos ou reatribuir responsáveis.</span>
                  </div>
                  <div class="painel-ajuda-item">
                    <strong>🗑️ Excluir</strong>
                    <p>Permite remover definitivamente registros cadastrados.</p>
                    <span class="exemplo">Exemplo: Apagar uma empresa sem vínculos ou excluir um chamado e toda sua subárvore.</span>
                  </div>
                  <div class="painel-ajuda-item" style="grid-column: 1 / -1;">
                    <strong>🌐 Ver todos os setores (Exclusivo de Chamados)</strong>
                    <p>Permite que os usuários deste grupo visualizem chamados abertos para <em>qualquer setor</em> da empresa. Se desmarcado, o operador enxerga unicamente os chamados direcionados ao seu próprio setor de lotação.</p>
                    <span class="exemplo">Exemplo: Coordenadores, gerentes ou analistas de suporte geral que precisam monitorar o fluxo global.</span>
                  </div>
                </div>
              </div>

              <div class="tabela-wrap tabela-permissoes-wrap" style="max-height: 380px; overflow: auto; border: 1px solid var(--cor-borda); border-radius: 0.35rem; position: relative;">
                <table class="tabela-permissoes-matriz" style="margin: 0;">
                  <thead>
                    <tr>
                      <th style="min-width: 14ch;">Tela</th>
                      <th style="text-align: center;">
                        Visualizar
                        ${info("Permite acessar e consultar os registros da tela sem fazer alterações.")}
                      </th>
                      <th style="text-align: center;">
                        Inserir
                        ${info("Permite cadastrar e criar novos registros nesta tela.")}
                      </th>
                      <th style="text-align: center;">
                        Editar
                        ${info("Permite alterar e atualizar registros existentes nesta tela.")}
                      </th>
                      <th style="text-align: center;">
                        Excluir
                        ${info("Permite remover e apagar registros existentes nesta tela.")}
                      </th>
                      <th style="text-align: center;">
                        Ver todos os setores
                        ${info("Exclusivo de Chamados. Sem isso, o usuário só vê chamados do seu próprio setor.")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    ${TELAS.map((t) => {
                      const p = permissoesAtuais[t.chave] || {};
                      return `
                        <tr data-tela="${t.chave}">
                          <td style="font-weight: 600;">
                            ${escaparHtml(t.label)}
                            <span style="display: block; font-size: 0.76rem; font-weight: normal; color: var(--cor-texto-secundario);">${escaparHtml(t.dica)}</span>
                          </td>
                          ${ACOES.map(
                            (a) => `
                            <td style="text-align: center;">
                              <input type="checkbox" data-acao="${a.chave}" ${p[a.chave] ? "checked" : ""}>
                            </td>
                          `
                          ).join("")}
                          <td style="text-align: center;">
                            ${
                              t.chave === "chamados"
                                ? `<input type="checkbox" data-acao="ver_todos_setores" ${p.ver_todos_setores ? "checked" : ""}>`
                                : '<span style="color:var(--cor-texto-secundario); font-size:0.8rem;">-</span>'
                            }
                          </td>
                        </tr>
                      `;
                    }).join("")}
                  </tbody>
                </table>
              </div>
            </div>

            <div class="modal-rodape" style="margin-top: 1.25rem;">
              <button type="button" class="btn btn-secundario btn-cancelar-modal">Cancelar</button>
              <button type="submit" class="btn btn-primario">${isEdicao ? "Salvar alterações" : "Adicionar grupo"}</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const modalFundo = containerModal.querySelector(".modal-fundo--cadastro");
    const modalCadastro = containerModal.querySelector(".modal-cadastro");
    const form = containerModal.querySelector(".form-modal-grupo");
    const erroModal = containerModal.querySelector(".erro-modal");

    // Toggle de tela cheia
    const btnTelaCheia = modalFundo.querySelector(".btn-toggle-tela-cheia");
    const iconeTelaCheia = btnTelaCheia.querySelector(".icone-tela-cheia");
    const textoTelaCheia = btnTelaCheia.querySelector(".texto-tela-cheia");
    btnTelaCheia.addEventListener("click", () => {
      const telaCheiaAtiva = modalCadastro.classList.toggle("modal-cadastro--tela-cheia");
      iconeTelaCheia.textContent = telaCheiaAtiva ? "🗗" : "⛶";
      textoTelaCheia.textContent = telaCheiaAtiva ? "Restaurar" : "Tela cheia";
    });

    // Toggle de ajuda explicativa de permissões
    const btnAjudaPermissoes = modalFundo.querySelector(".btn-ajuda-permissoes");
    const painelAjuda = modalFundo.querySelector(".painel-ajuda-permissoes");
    const btnFecharAjuda = modalFundo.querySelector(".btn-fechar-ajuda-permissoes");

    btnAjudaPermissoes.addEventListener("click", () => {
      painelAjuda.hidden = !painelAjuda.hidden;
    });
    btnFecharAjuda.addEventListener("click", () => {
      painelAjuda.hidden = true;
    });

    function fechar() {
      window.removeEventListener("keydown", escHandler);
      containerModal.innerHTML = "";
    }

    const nomeInicial = grupoEdicao ? (grupoEdicao.nome || "") : "";
    const descInicial = grupoEdicao ? (grupoEdicao.descricao || "") : "";
    const chksIniciais = Array.from(form.querySelectorAll('.tabela-permissoes-matriz input[type="checkbox"]')).map((c) => c.checked);

    function houveAlteracao() {
      if (form.elements.nome.value.trim() !== nomeInicial.trim()) return true;
      if ((form.elements.descricao?.value || "").trim() !== descInicial.trim()) return true;
      const chksAtuais = Array.from(form.querySelectorAll('.tabela-permissoes-matriz input[type="checkbox"]')).map((c) => c.checked);
      for (let i = 0; i < chksIniciais.length; i++) {
        if (chksIniciais[i] !== chksAtuais[i]) return true;
      }
      return false;
    }

    async function tentarFechar() {
      if (!houveAlteracao()) {
        fechar();
        return;
      }
      const sair = await confirmarAcao(
        "Deseja sair sem salvar?",
        "Os dados informados foram alterados e ainda não foram salvos. Deseja realmente sair e descartar as alterações?",
        {
          textoCancelar: "Não, continuar editando",
          textoConfirmar: "Sim, descartar e sair",
          tipo: "aviso",
          focoPadrao: "cancelar",
        }
      );
      if (sair) {
        fechar();
      } else {
        if (!form.elements.nome.value.trim()) {
          form.elements.nome.classList.add("campo-destaque-obrigatorio");
          form.elements.nome.focus();
          mostrarErro(erroModal, new Error("Informe o nome do grupo em destaque para continuar."));
        }
      }
    }

    modalFundo.querySelector(".modal-fechar").addEventListener("click", tentarFechar);
    modalFundo.querySelector(".btn-cancelar-modal").addEventListener("click", tentarFechar);

    // Evita fechamento acidental ao clicar fora do modal
    modalFundo.addEventListener("click", (e) => {
      if (e.target === modalFundo) {
        // Ignora clique no fundo
      }
    });

    const escHandler = (e) => {
      if (e.key === "Escape") {
        if (!document.body.contains(form)) {
          window.removeEventListener("keydown", escHandler);
          return;
        }
        const avisoAberto = document.querySelector(".modal-fundo--aviso");
        if (avisoAberto) return;
        tentarFechar();
      }
    };
    window.addEventListener("keydown", escHandler);

    // Marcar / Desmarcar todas
    form.querySelector(".btn-marcar-todas").addEventListener("click", () => {
      form.querySelectorAll('.tabela-permissoes-matriz input[type="checkbox"]').forEach((chk) => (chk.checked = true));
    });
    form.querySelector(".btn-desmarcar-todas").addEventListener("click", () => {
      form.querySelectorAll('.tabela-permissoes-matriz input[type="checkbox"]').forEach((chk) => (chk.checked = false));
    });

    const inputNome = form.elements.nome;
    setTimeout(() => inputNome?.focus(), 60);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      erroModal.hidden = true;

      const nome = inputNome.value.trim();
      if (!nome) {
        erroModal.textContent = "O Nome do grupo é obrigatório.";
        erroModal.hidden = false;
        inputNome.focus();
        return;
      }

      const permissoes = {};
      for (const t of TELAS) {
        const tr = form.querySelector(`tr[data-tela="${t.chave}"]`);
        permissoes[t.chave] = {};
        for (const a of ACOES) {
          const chk = tr?.querySelector(`input[data-acao="${a.chave}"]`);
          permissoes[t.chave][a.chave] = !!chk?.checked;
        }
        if (t.chave === "chamados") {
          const chkTodos = tr?.querySelector('input[data-acao="ver_todos_setores"]');
          permissoes.chamados.ver_todos_setores = !!chkTodos?.checked;
        }
      }

      const grupo_pai_id = form.elements.grupo_pai_id?.value
        ? Number(form.elements.grupo_pai_id.value)
        : null;

      try {
        if (isEdicao) {
          await api(`/grupos/${grupoEdicao.id}`, {
            method: "PUT",
            body: { nome, grupo_pai_id, permissoes },
          });
        } else {
          await api("/grupos", {
            method: "POST",
            body: { nome, grupo_pai_id, permissoes },
          });
        }
        fechar();
        await recarregar();
      } catch (err) {
        mostrarErro(erroModal, err);
      }
    });
  }

  async function recarregar() {
    try {
      grupos = await api("/grupos");
      renderizarLinhas();
    } catch (e) {
      mostrarErro(mensagemErro, e);
    }
  }

  await recarregar();
}
