import { exigirLogin, permissaoDaTela } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { info, mostrarErro, escaparAtributo, escaparHtml, botaoIconeEditar, botaoIconeExcluir } from "./ui.js";
import { confirmarAcao } from "./modal.js";
import { mostrarAvisoModal } from "./crud-ui.js";
import { api } from "./api.js";

let permissaoFluxos = { visualizar: false, inserir: false, editar: false, excluir: false };

export function inicializar() {
  const usuario = exigirLogin();
  if (!usuario) return;

  aplicarLayout(usuario);
  const container = document.getElementById("secao-fluxos-app");
  const mensagemErro = document.getElementById("mensagem-erro");
  if (!container) return;
  permissaoFluxos = permissaoDaTela("fluxos");

  if (!permissaoFluxos.visualizar) {
    container.innerHTML = "<h2>Fluxos</h2><p>Você não tem permissão para visualizar esta tela.</p>";
  } else {
    iniciar(container, mensagemErro).catch((e) => mostrarErro(mensagemErro, e));
  }
}

inicializar();

async function iniciar(container, mensagemErro) {
  let fluxos = [];
  let setores = [];
  let fluxoAtivoId = null;
  let ordemAtual = { campo: "id", direcao: "asc" };
  let modoVisualizacao = "tabela";

  try {
    [fluxos, setores] = await Promise.all([api("/fluxos"), api("/setores")]);
  } catch (e) {
    mostrarErro(mensagemErro, e);
    return;
  }

  const urlParamId = new URLSearchParams(window.location.search).get("id");
  if (urlParamId) {
    const achado = fluxos.find((f) => f.id === Number(urlParamId));
    if (achado) fluxoAtivoId = achado.id;
  }

  container.innerHTML = `
    <div class="pagina-cabecalho">
      <div class="pagina-cabecalho__esquerda">
        <h2>Fluxos de Processo</h2>
        <p style="font-size: 0.9rem; color: var(--cor-texto-secundario); margin: 0.25rem 0 0; line-height: 1.5;">
          Cadastre e gerencie os fluxos de trabalho da Engenharia e as etapas que cada chamado percorre.
        </p>
      </div>
      <div class="pagina-cabecalho__acoes">
        ${permissaoFluxos.inserir ? `<button type="button" class="btn btn-primario btn-novo-fluxo">+ Novo Fluxo</button>` : ""}
      </div>
    </div>

    <!-- Tabela principal de Fluxos -->
    <div class="tabela-wrap" style="margin-bottom: 2rem;">
      <table>
        <thead>
          <tr>
            <th class="th-ordenavel th-id" data-campo="id">#ID <span class="ordem-indicador" data-indicador="id">▲</span></th>
            <th class="th-ordenavel" data-campo="nome" style="min-width: 25ch;">Nome do Fluxo / Descrição <span class="ordem-indicador" data-indicador="nome"></span></th>
            <th>Gerenciar Processo</th>
            <th class="td-acoes">Ações</th>
          </tr>
        </thead>
        <tbody class="tbody-fluxos"></tbody>
      </table>
    </div>

    <!-- Seção de Etapas do Fluxo Ativo -->
    <div id="secao-etapas-fluxo"></div>

    <!-- Containers de modais sobrepostos -->
    <div class="container-modal-fluxo"></div>
    <div class="container-modal-etapa"></div>
    <div class="container-modal-acao"></div>
    <div class="container-modal-campos"></div>
  `;

  const tbodyFluxos = container.querySelector(".tbody-fluxos");
  const secaoEtapas = container.querySelector("#secao-etapas-fluxo");
  const modalFluxoWrap = container.querySelector(".container-modal-fluxo");
  const modalEtapaWrap = container.querySelector(".container-modal-etapa");
  const modalAcaoWrap = container.querySelector(".container-modal-acao");
  const modalCamposWrap = container.querySelector(".container-modal-campos");

  container.querySelector(".btn-novo-fluxo")?.addEventListener("click", () => {
    abrirModalFluxo(null);
  });

  // Ordenação de fluxos
  container.querySelectorAll(".th-ordenavel").forEach((th) => {
    th.addEventListener("click", () => {
      const campo = th.dataset.campo;
      if (ordemAtual.campo === campo) {
        ordemAtual.direcao = ordemAtual.direcao === "asc" ? "desc" : "asc";
      } else {
        ordemAtual.campo = campo;
        ordemAtual.direcao = "asc";
      }
      renderizarTabelaFluxos();
    });
  });

  function renderizarTabelaFluxos() {
    const dados = [...fluxos];
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
      tbodyFluxos.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 2.5rem 1.5rem; color: var(--cor-texto-secundario); line-height: 1.6;">
            Nenhum fluxo de processo cadastrado.<br>
            Clique no botão <strong>+ Novo Fluxo</strong> acima para criar o primeiro.
          </td>
        </tr>
      `;
      renderizarPainelEtapas();
      return;
    }

    tbodyFluxos.innerHTML = dados
      .map((f) => {
        const isAtivo = f.id === fluxoAtivoId;
        return `
          <tr data-id="${f.id}" class="${isAtivo ? "linha-fluxo-selecionada" : ""}" style="${isAtivo ? "background: rgba(47, 111, 79, 0.05); font-weight: 500;" : ""}">
            <td class="td-id">#${f.id}</td>
            <td>
              <div style="font-weight: 600; font-size: 0.95rem;">
                ${escaparHtml(f.nome)}
                ${isAtivo ? `<span class="badge-status" style="margin-left: 0.5rem; background: var(--cor-primaria); color: #ffffff; font-size: 0.72rem; padding: 0.2rem 0.45rem;">Configurando</span>` : ""}
              </div>
              ${f.descricao ? `<div style="font-size: 0.83rem; color: var(--cor-texto-secundario); font-weight: normal; margin-top: 0.2rem; line-height: 1.35;">${escaparHtml(f.descricao)}</div>` : ""}
            </td>
            <td>
              <button type="button" class="btn btn-pequeno ${isAtivo ? "btn-primario" : "btn-secundario"} btn-selecionar-fluxo" data-id="${f.id}" title="${isAtivo ? "Clique para recolher o painel de etapas" : "Clique para expandir e configurar as etapas"}">
                ${isAtivo ? "▲ Recolher etapas" : "Configurar etapas"}
              </button>
            </td>
            <td class="td-acoes">
              ${permissaoFluxos.editar ? botaoIconeEditar("btn-editar-fluxo", f.id) : ""}
              ${permissaoFluxos.excluir ? botaoIconeExcluir("btn-excluir-fluxo", f.id) : ""}
            </td>
          </tr>
        `;
      })
      .join("");

    // Eventos na tabela de fluxos
    tbodyFluxos.querySelectorAll(".btn-selecionar-fluxo").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.id);
        if (fluxoAtivoId === id) {
          fluxoAtivoId = null;
        } else {
          fluxoAtivoId = id;
        }
        renderizarTabelaFluxos();
        renderizarPainelEtapas();
        if (fluxoAtivoId) {
          secaoEtapas.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });

    tbodyFluxos.querySelectorAll(".btn-editar-fluxo").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.id);
        const f = fluxos.find((item) => item.id === id);
        if (f) abrirModalFluxo(f);
      });
    });

    tbodyFluxos.querySelectorAll(".btn-excluir-fluxo").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.id);
        const f = fluxos.find((item) => item.id === id);
        const confirmado = await confirmarAcao(
          `Excluir o fluxo "${f?.nome || id}"?`,
          "Todas as etapas e chamados vinculados precisam ser excluídos primeiro."
        );
        if (!confirmado) return;

        try {
          await api(`/fluxos/${id}`, { method: "DELETE" });
          fluxos = await api("/fluxos");
          if (fluxoAtivoId === id) {
            fluxoAtivoId = fluxos.length > 0 ? fluxos[0].id : null;
          }
          renderizarTabelaFluxos();
          renderizarPainelEtapas();
        } catch (err) {
          mostrarAvisoModal("Exclusão não permitida", err.message);
        }
      });
    });

    renderizarPainelEtapas();
  }

  // Painel de etapas do fluxo ativo
  async function renderizarPainelEtapas() {
    if (fluxos.length === 0) {
      secaoEtapas.innerHTML = `
        <div class="painel" style="border: 1px dashed var(--cor-borda); background: var(--cor-fundo-elevado); text-align: center; padding: 2.5rem 1.5rem; border-radius: 8px;">
          <h3 style="color: var(--cor-texto); font-size: 1.05rem; margin-bottom: 0.6rem; font-weight: 600;">Etapas do Fluxo de Trabalho</h3>
          <p style="font-size: 0.92rem; color: var(--cor-texto-secundario); max-width: 600px; margin: 0 auto; line-height: 1.6;">
            Cadastre um fluxo no botão <strong>+ Novo Fluxo</strong> acima para começar a configurar suas etapas.
          </p>
        </div>
      `;
      return;
    }

    if (!fluxoAtivoId) {
      secaoEtapas.innerHTML = `
        <div class="painel" style="border: 1px dashed var(--cor-borda); background: var(--cor-fundo-elevado); text-align: center; padding: 2rem 1.5rem; border-radius: 8px;">
          <p style="margin: 0; color: var(--cor-texto-secundario); font-size: 0.92rem;">
            Nenhum fluxo expandido no momento. Clique em <strong>Configurar etapas</strong> em um fluxo na tabela acima para visualizá-lo e gerenciá-lo.
          </p>
        </div>
      `;
      return;
    }

    const fluxoAtual = fluxos.find((f) => f.id === fluxoAtivoId);
    if (!fluxoAtual) return;

    secaoEtapas.innerHTML = `
      <div class="painel" style="box-shadow: 0 4px 16px rgba(0,0,0,0.06); padding: 1.5rem; border: 1px solid var(--cor-borda);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem; border-bottom: 1px solid var(--cor-borda); padding-bottom: 1rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
              <span style="font-size: 0.78rem; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; color: var(--cor-primaria);">Configuração de Processo</span>
              <span class="badge-status" style="background: rgba(47, 111, 79, 0.12); color: var(--cor-primaria); font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 4px; font-weight: 600;">#${fluxoAtual.id}</span>
            </div>
            <h3 style="margin: 0.1rem 0 0; font-size: 1.3rem; display: flex; align-items: center; gap: 0.6rem;">
              <span>${escaparHtml(fluxoAtual.nome)}</span>
              ${
                permissaoFluxos.editar
                  ? `<button type="button" class="btn-icone btn-icone--editar btn-editar-dados-fluxo" title="Editar nome e descrição deste fluxo" aria-label="Editar dados do fluxo">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                    </button>`
                  : ""
              }
            </h3>
            ${
              fluxoAtual.descricao
                ? `<p style="font-size: 0.88rem; color: var(--cor-texto-secundario); margin: 0.35rem 0 0; line-height: 1.45; max-width: 720px;">${escaparHtml(fluxoAtual.descricao)}</p>`
                : `<p style="font-size: 0.85rem; color: var(--cor-texto-secundario); font-style: italic; margin: 0.35rem 0 0;">Sem descrição cadastrada. ${permissaoFluxos.editar ? `<button type="button" class="btn-link-adicionar-descricao" style="background: none; border: none; color: var(--cor-primaria); font-size: 0.85rem; cursor: pointer; text-decoration: underline; padding: 0;">Adicionar descrição</button>` : ""}</p>`
            }
          </div>
          <div style="display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap;">
            <div class="troca-fluxo-wrap" style="display: flex; align-items: center; gap: 0.4rem;">
              <label for="select-troca-fluxo" style="font-size: 0.85rem; font-weight: 600; color: var(--cor-texto-secundario); white-space: nowrap;">Trocar fluxo:</label>
              <select id="select-troca-fluxo" class="select-padrao select-troca-fluxo-rapida" style="width: auto; min-width: 190px; padding: 0.45rem 0.75rem; font-size: 0.85rem; font-weight: 600;">
                ${fluxos.map((f) => `<option value="${f.id}" ${f.id === fluxoAtivoId ? "selected" : ""}>${escaparHtml(f.nome)}</option>`).join("")}
              </select>
            </div>
            <div style="display: flex; gap: 0.25rem; background: var(--cor-fundo); padding: 0.2rem; border-radius: 0.4rem; border: 1px solid var(--cor-borda);">
              <button type="button" class="btn btn-pequeno ${modoVisualizacao === "tabela" ? "btn-primario" : "btn-secundario"} btn-alternar-modo" data-modo="tabela" title="Visão em tabela">📋 Tabela</button>
              <button type="button" class="btn btn-pequeno ${modoVisualizacao === "diagrama" ? "btn-primario" : "btn-secundario"} btn-alternar-modo" data-modo="diagrama" title="Visão visual em grafo de nós">🔀 Diagrama</button>
            </div>
            ${
              permissaoFluxos.inserir
                ? `<button type="button" class="btn btn-primario btn-nova-etapa">+ Adicionar Etapa</button>`
                : ""
            }
            <button type="button" class="btn btn-secundario btn-recolher-painel" title="Recolher painel de configuração">▲ Recolher etapas</button>
          </div>
        </div>

        <div class="container-tabela-etapas">
          <p style="padding: 1.5rem; text-align: center; color: var(--cor-texto-secundario);">Carregando etapas do fluxo...</p>
        </div>
      </div>
    `;

    secaoEtapas.querySelectorAll(".btn-alternar-modo").forEach((btn) => {
      btn.addEventListener("click", () => {
        modoVisualizacao = btn.dataset.modo;
        renderizarPainelEtapas();
      });
    });

    secaoEtapas.querySelector(".select-troca-fluxo-rapida").addEventListener("change", (e) => {
      fluxoAtivoId = Number(e.target.value);
      renderizarTabelaFluxos();
      renderizarPainelEtapas();
    });

    secaoEtapas.querySelector(".btn-recolher-painel")?.addEventListener("click", () => {
      fluxoAtivoId = null;
      renderizarTabelaFluxos();
      renderizarPainelEtapas();
    });

    secaoEtapas.querySelector(".btn-editar-dados-fluxo")?.addEventListener("click", () => {
      abrirModalFluxo(fluxoAtual);
    });

    secaoEtapas.querySelector(".btn-link-adicionar-descricao")?.addEventListener("click", () => {
      abrirModalFluxo(fluxoAtual);
    });

    secaoEtapas.querySelector(".btn-nova-etapa")?.addEventListener("click", () => {
      abrirModalEtapa(null, etapasAtuais);
    });

    let etapasAtuais = [];
    try {
      etapasAtuais = await api(`/fluxos/${fluxoAtivoId}/etapas`);
    } catch (err) {
      mostrarErro(mensagemErro, err);
      return;
    }

    const containerTabela = secaoEtapas.querySelector(".container-tabela-etapas");
    const nomeSetor = (id) => setores.find((s) => s.id === id)?.nome ?? `#${id}`;
    const nomeEtapa = (id) => etapasAtuais.find((e) => e.id === id)?.nome ?? "-";

    if (etapasAtuais.length === 0) {
      containerTabela.innerHTML = `
        <div style="text-align: center; padding: 2.5rem 1.5rem; background: var(--cor-fundo); border-radius: 0.35rem;">
          <p style="font-size: 0.95rem; color: var(--cor-texto-secundario); margin-bottom: 1rem;">
            Nenhuma etapa cadastrada neste fluxo.
          </p>
          ${
            permissaoFluxos.inserir
              ? `<button type="button" class="btn btn-primario btn-nova-etapa-vazia">+ Criar primeira etapa</button>`
              : ""
          }
        </div>
      `;
      containerTabela.querySelector(".btn-nova-etapa-vazia")?.addEventListener("click", () => {
        abrirModalEtapa(null, etapasAtuais);
      });
      return;
    }

    if (modoVisualizacao === "diagrama") {
      const ordenadas = [...etapasAtuais].sort((a, b) => {
        if (a.eh_inicial && !b.eh_inicial) return -1;
        if (!a.eh_inicial && b.eh_inicial) return 1;
        return a.id - b.id;
      });

      containerTabela.innerHTML = `
        <div class="diagrama-toolbar">
          <div style="font-size: 0.85rem; color: var(--cor-texto-secundario);">
            Visualização sequencial das etapas e conexões do processo. Arraste horizontalmente para navegar.
          </div>
          ${
            permissaoFluxos.inserir
              ? `<button type="button" class="btn btn-pequeno btn-primario btn-nova-etapa-diagrama">+ Nova Etapa</button>`
              : ""
          }
        </div>
        <div class="diagrama-container">
          <div class="diagrama-grafo">
            ${ordenadas
              .map((e, idx) => {
                const badgeTipo =
                  e.tipo === "aprovacao"
                    ? `<span class="badge-status" style="background: #e0f2fe; color: #0369a1; font-size: 0.72rem; font-weight: 700;">⚖️ Aprovação</span>`
                    : `<span class="badge-status" style="background: #f1f5f9; color: #475569; font-size: 0.72rem; font-weight: 700;">📋 Tarefa</span>`;

                const badgeInicial = e.eh_inicial
                  ? `<span class="badge-status" style="background: #dcfce7; color: #15803d; font-size: 0.72rem; font-weight: 700;">🚀 Início</span>`
                  : "";

                const setorInfo = setores.find((s) => s.id === e.setor_id);
                const proximaTexto = e.etapa_proxima_id
                  ? `${escaparHtml(nomeEtapa(e.etapa_proxima_id))} (${e.etapa_proxima_vinculo === "pai" ? "Pai" : "Mãe"})`
                  : e.tipo === "aprovacao"
                  ? "Ramificação por ações"
                  : "Final do processo";

                const conector =
                  idx < ordenadas.length - 1
                    ? `<div class="diagrama-conector" aria-hidden="true">➔</div>`
                    : "";

                return `
                  <div class="diagrama-no ${e.eh_inicial ? "diagrama-no--inicial" : ""}" data-id="${e.id}">
                    <div class="diagrama-no__cabecalho">
                      <strong class="diagrama-no__titulo" title="${escaparAtributo(e.nome)}">${escaparHtml(e.nome)}</strong>
                      <div style="display: flex; gap: 0.3rem;">
                        ${badgeInicial}
                        ${badgeTipo}
                      </div>
                    </div>
                    <div class="diagrama-no__corpo">
                      <div><strong>🏢 Setor:</strong> ${escaparHtml(nomeSetor(e.setor_id))}</div>
                      <div><strong>⏱️ Prazo Padrão:</strong> ${setorInfo?.prazo_padrao_dias ?? 5} dias úteis</div>
                      <div><strong>➡️ Próxima Etapa:</strong> ${proximaTexto}</div>
                    </div>
                    <div class="diagrama-no__acoes">
                      <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
                        <div style="display: flex; gap: 0.3rem;">
                          <button type="button" class="btn btn-pequeno btn-secundario btn-gerenciar-campos" data-id="${e.id}" title="Configurar campos dinâmicos da etapa">📝 Campos</button>
                          ${
                            e.tipo === "aprovacao"
                              ? `<button type="button" class="btn btn-pequeno btn-secundario btn-gerenciar-acoes" data-id="${e.id}" title="Configurar ações condicionais">⚡ Ações</button>`
                              : ""
                          }
                        </div>
                        <div style="display: flex; gap: 0.25rem;">
                          ${permissaoFluxos.editar ? botaoIconeEditar("btn-editar-etapa", e.id) : ""}
                          ${permissaoFluxos.excluir ? botaoIconeExcluir("btn-excluir-etapa", e.id) : ""}
                        </div>
                      </div>
                    </div>
                  </div>
                  ${conector}
                `;
              })
              .join("")}
          </div>
        </div>
      `;

      containerTabela.querySelector(".btn-nova-etapa-diagrama")?.addEventListener("click", () => {
        abrirModalEtapa(null, etapasAtuais);
      });
    } else {
      containerTabela.innerHTML = `
        <div class="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th style="width: 4rem;">#ID</th>
                <th style="min-width: 18ch;">Nome da Etapa</th>
                <th>Setor Responsável</th>
                <th>Tipo</th>
                <th>Inicial?</th>
                <th>Próxima Etapa</th>
                <th>Vínculo</th>
                <th>Decisões / Ações</th>
                <th>Campos Dinâmicos</th>
                <th class="td-acoes">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${etapasAtuais
                .map((e) => {
                  const badgeTipo =
                    e.tipo === "aprovacao"
                      ? `<span class="badge-status" style="background: #e0f2fe; color: #0369a1; font-weight: 600;">Aprovação</span>`
                      : `<span class="badge-status" style="background: #f1f5f9; color: #475569; font-weight: 600;">Tarefa</span>`;

                  const badgeInicial = e.eh_inicial
                    ? `<span class="badge-status" style="background: #dcfce7; color: #15803d; font-weight: 600;">✓ Sim</span>`
                    : '<span style="color: var(--cor-texto-secundario); font-size: 0.85rem;">Não</span>';

                  const botaoAcoes =
                    e.tipo === "aprovacao"
                      ? `<button type="button" class="btn btn-pequeno btn-secundario btn-gerenciar-acoes" data-id="${e.id}">⚡ Configurar Ações</button>`
                      : '<span style="color: var(--cor-texto-secundario); font-size: 0.8rem;">-</span>';

                  const botaoCampos = `<button type="button" class="btn btn-pequeno btn-secundario btn-gerenciar-campos" data-id="${e.id}">📋 Campos da Etapa</button>`;

                  return `
                    <tr data-id="${e.id}">
                      <td class="td-id">#${e.id}</td>
                      <td style="font-weight: 600;">${escaparHtml(e.nome)}</td>
                      <td>${escaparHtml(nomeSetor(e.setor_id))}</td>
                      <td>${badgeTipo}</td>
                      <td>${badgeInicial}</td>
                      <td>${e.etapa_proxima_id ? escaparHtml(nomeEtapa(e.etapa_proxima_id)) : '<span style="color:var(--cor-texto-secundario);">Nenhuma / Usa ações</span>'}</td>
                      <td>${e.etapa_proxima_vinculo === "mae" ? "Chamado mãe" : e.etapa_proxima_vinculo === "pai" ? "Chamado pai" : "-"}</td>
                      <td>${botaoAcoes}</td>
                      <td>${botaoCampos}</td>
                      <td class="td-acoes">
                        ${permissaoFluxos.editar ? botaoIconeEditar("btn-editar-etapa", e.id) : ""}
                        ${permissaoFluxos.excluir ? botaoIconeExcluir("btn-excluir-etapa", e.id) : ""}
                      </td>
                    </tr>
                  `;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    // Eventos da tabela de etapas
    containerTabela.querySelectorAll(".btn-gerenciar-campos").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.id);
        const etapa = etapasAtuais.find((x) => x.id === id);
        if (etapa) abrirModalCampos(etapa);
      });
    });

    containerTabela.querySelectorAll(".btn-gerenciar-acoes").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.id);
        const etapa = etapasAtuais.find((x) => x.id === id);
        if (etapa) abrirModalAcoes(etapa);
      });
    });

    containerTabela.querySelectorAll(".btn-editar-etapa").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.id);
        const etapa = etapasAtuais.find((x) => x.id === id);
        if (etapa) abrirModalEtapa(etapa, etapasAtuais);
      });
    });

    containerTabela.querySelectorAll(".btn-excluir-etapa").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.id);
        const etapa = etapasAtuais.find((x) => x.id === id);
        const confirmado = await confirmarAcao(
          `Excluir etapa "${etapa?.nome || id}"?`,
          "Essa ação não poderá ser desfeita."
        );
        if (!confirmado) return;

        try {
          await api(`/etapas/${id}`, { method: "DELETE" });
          renderizarPainelEtapas();
        } catch (err) {
          mostrarAvisoModal("Exclusão não permitida", err.message);
        }
      });
    });
  }

  // Modal para criar / configurar Fluxo
  function abrirModalFluxo(fluxoEdicao = null) {
    const isEdicao = !!fluxoEdicao;
    const titulo = isEdicao ? `Editar Fluxo: ${fluxoEdicao.nome}` : "Novo Fluxo de Processo";

    modalFluxoWrap.innerHTML = `
      <div class="modal-fundo modal-fundo--cadastro" role="dialog" aria-modal="true">
        <div class="modal-cadastro modal-cadastro--simples" style="max-width: 560px;">
          <div class="modal-cabecalho">
            <h3>${escaparHtml(titulo)}</h3>
            <button type="button" class="modal-fechar" aria-label="Fechar">✕</button>
          </div>
          <form class="form-modal-fluxo" style="padding: 1.25rem;">
            <p class="erro-modal erro" hidden></p>
            
            <div class="campo-grupo">
              <label class="campo-rotulo" for="input-fluxo-nome">
                Nome do fluxo de processo <span class="campo-obrigatorio">*</span>
                ${info("Nome claro que identifica este processo na Engenharia.")}
              </label>
              <input
                type="text"
                id="input-fluxo-nome"
                name="nome"
                class="input-padrao"
                value="${escaparAtributo(fluxoEdicao?.nome || "")}"
                required
                placeholder="Ex: Criação de Novo Produto, Alteração de Engenharia..."
              >
            </div>

            <div class="campo-grupo">
              <label class="campo-rotulo" for="textarea-fluxo-descricao">
                Descrição do fluxo
                ${info("Descreva a finalidade do fluxo, setores envolvidos e orientações gerais do processo.")}
              </label>
              <textarea
                id="textarea-fluxo-descricao"
                name="descricao"
                class="textarea-padrao"
                rows="3"
                placeholder="Descreva a finalidade deste processo, setores envolvidos e regras gerais..."
              >${escaparHtml(fluxoEdicao?.descricao || "")}</textarea>
              <p class="campo-ajuda">
                ${isEdicao ? "Atualize as diretrizes gerais deste fluxo de trabalho." : "Ao salvar, o painel de configuração do fluxo será aberto diretamente na tela para você cadastrar e ordenar as etapas e ações."}
              </p>
            </div>

            <div class="modal-rodape">
              <button type="button" class="btn btn-secundario btn-cancelar-modal">Cancelar</button>
              <button type="submit" class="btn btn-primario">${isEdicao ? "Salvar alterações" : "Salvar e Configurar Fluxo"}</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const fundo = modalFluxoWrap.querySelector(".modal-fundo");
    const form = modalFluxoWrap.querySelector(".form-modal-fluxo");
    const erroEl = modalFluxoWrap.querySelector(".erro-modal");
    const fechar = () => (modalFluxoWrap.innerHTML = "");

    fundo.querySelector(".modal-fechar").addEventListener("click", fechar);
    fundo.querySelector(".btn-cancelar-modal").addEventListener("click", fechar);
    fundo.addEventListener("click", (e) => {
      if (e.target === fundo) {
        // Evita fechamento acidental ao clicar fora
      }
    });

    const inpNome = form.elements.nome;
    const inpDescricao = form.elements.descricao;
    setTimeout(() => inpNome?.focus(), 60);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      erroEl.hidden = true;
      const nome = inpNome.value.trim();
      if (!nome) {
        erroEl.textContent = "O nome do fluxo é obrigatório.";
        erroEl.hidden = false;
        inpNome.focus();
        return;
      }

      const descricao = inpDescricao ? inpDescricao.value.trim() : "";

      try {
        const corpo = { nome, descricao: descricao || null };
        if (isEdicao) {
          await api(`/fluxos/${fluxoEdicao.id}`, { method: "PUT", body: corpo });
        } else {
          const criado = await api("/fluxos", { method: "POST", body: corpo });
          fluxoAtivoId = criado.id;
        }
        fechar();
        fluxos = await api("/fluxos");
        renderizarTabelaFluxos();
        renderizarPainelEtapas();
        if (fluxoAtivoId) {
          secaoEtapas.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      } catch (err) {
        mostrarErro(erroEl, err);
      }
    });
  }

  // Modal para criar / editar Etapa
  function abrirModalEtapa(etapaEdicao = null, todasEtapas = []) {
    const isEdicao = !!etapaEdicao;
    const titulo = isEdicao ? `Editar Etapa: ${etapaEdicao.nome}` : "Nova Etapa do Fluxo";
    const outrasEtapas = todasEtapas.filter((e) => !isEdicao || e.id !== etapaEdicao.id);

    modalEtapaWrap.innerHTML = `
      <div class="modal-fundo modal-fundo--cadastro" role="dialog" aria-modal="true">
        <div class="modal-cadastro modal-cadastro--complexo" style="max-width: 650px;">
          <div class="modal-cabecalho">
            <h3>${escaparHtml(titulo)}</h3>
            <button type="button" class="modal-fechar" aria-label="Fechar">✕</button>
          </div>
          <form class="form-modal-etapa" style="padding: 1.25rem;">
            <p class="erro-modal erro" hidden></p>
            
            <div class="formulario-grid">
              <div class="campo-wrap col-full">
                <label>
                  <span class="campo-rotulo">Nome da etapa <span class="campo-obrigatorio">*</span></span>
                  <input type="text" name="nome" value="${escaparAtributo(etapaEdicao?.nome || "")}" required placeholder="Ex: Solicitação inicial, Aprovação da Engenharia...">
                </label>
              </div>

              <div class="campo-wrap">
                <label>
                  <span class="campo-rotulo">Setor responsável <span class="campo-obrigatorio">*</span></span>
                  <select name="setor_id" required>
                    <option value="">Selecione um setor…</option>
                    ${setores.map((s) => `<option value="${s.id}" ${etapaEdicao?.setor_id === s.id ? "selected" : ""}>${escaparHtml(s.nome)}</option>`).join("")}
                  </select>
                </label>
              </div>

              <div class="campo-wrap">
                <label>
                  <span class="campo-rotulo">Tipo da etapa <span class="campo-obrigatorio">*</span></span>
                  <select name="tipo" required>
                    <option value="aprovacao" ${etapaEdicao?.tipo === "aprovacao" ? "selected" : ""}>Aprovação (libera decisões ou ações)</option>
                    <option value="tarefa" ${etapaEdicao?.tipo === "tarefa" ? "selected" : ""}>Tarefa (execução de trabalho)</option>
                  </select>
                </label>
              </div>

              <div class="campo-wrap col-full" style="background: var(--cor-fundo); padding: 0.6rem 0.75rem; border-radius: 0.35rem;">
                <label class="campo-checkbox">
                  <input type="checkbox" name="eh_inicial" ${etapaEdicao?.eh_inicial ? "checked" : ""}>
                  <span><strong>É a etapa inicial deste fluxo?</strong> ${info("Marque apenas na etapa que abre o chamado mãe. O sistema finaliza e avança o fluxo automaticamente após o registro.")}</span>
                </label>
              </div>

              <div class="campo-wrap">
                <label>
                  <span class="campo-rotulo">
                    Próxima etapa (opcional)
                    ${info("Se preenchido, ao concluir esta etapa o sistema criará automaticamente a próxima etapa selecionada. Deixe vazio se esta etapa utiliza Ações de decisão.")}
                  </span>
                  <select name="etapa_proxima_id">
                    <option value="">Nenhuma / Usar Ações de decisão</option>
                    ${outrasEtapas.map((e) => `<option value="${e.id}" ${etapaEdicao?.etapa_proxima_id === e.id ? "selected" : ""}>${escaparHtml(e.nome)}</option>`).join("")}
                  </select>
                </label>
              </div>

              <div class="campo-wrap">
                <label>
                  <span class="campo-rotulo">
                    Vínculo da próxima etapa
                    ${info("Chamado pai: atrelado imediatamente a esta etapa. Chamado mãe: atrelado direto à raiz do processo.")}
                  </span>
                  <select name="etapa_proxima_vinculo">
                    <option value="pai" ${etapaEdicao?.etapa_proxima_vinculo === "pai" ? "selected" : ""}>Chamado pai (imediato)</option>
                    <option value="mae" ${etapaEdicao?.etapa_proxima_vinculo === "mae" ? "selected" : ""}>Chamado mãe (raiz)</option>
                  </select>
                </label>
              </div>
            </div>

            <div class="modal-rodape" style="margin-top: 1.25rem;">
              <button type="button" class="btn btn-secundario btn-cancelar-modal">Cancelar</button>
              <button type="submit" class="btn btn-primario">${isEdicao ? "Salvar alterações" : "Adicionar etapa"}</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const fundo = modalEtapaWrap.querySelector(".modal-fundo");
    const form = modalEtapaWrap.querySelector(".form-modal-etapa");
    const erroEl = modalEtapaWrap.querySelector(".erro-modal");
    const fechar = () => (modalEtapaWrap.innerHTML = "");

    fundo.querySelector(".modal-fechar").addEventListener("click", fechar);
    fundo.querySelector(".btn-cancelar-modal").addEventListener("click", fechar);
    fundo.addEventListener("click", (e) => {
      if (e.target === fundo) {
        // Evita fechamento acidental ao clicar fora
      }
    });

    const inpNome = form.elements.nome;
    setTimeout(() => inpNome?.focus(), 60);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      erroEl.hidden = true;

      const corpo = {
        nome: inpNome.value.trim(),
        setor_id: Number(form.elements.setor_id.value),
        tipo: form.elements.tipo.value,
        eh_inicial: form.elements.eh_inicial.checked,
        etapa_proxima_id: form.elements.etapa_proxima_id.value ? Number(form.elements.etapa_proxima_id.value) : null,
        etapa_proxima_vinculo: form.elements.etapa_proxima_id.value ? form.elements.etapa_proxima_vinculo.value : null,
      };

      try {
        if (isEdicao) {
          await api(`/etapas/${etapaEdicao.id}`, { method: "PUT", body: corpo });
        } else {
          await api(`/fluxos/${fluxoAtivoId}/etapas`, { method: "POST", body: corpo });
        }
        fechar();
        renderizarPainelEtapas();
      } catch (err) {
        mostrarErro(erroEl, err);
      }
    });
  }

  // Modal para gerenciar Ações de uma etapa de aprovação
  async function abrirModalAcoes(etapa) {
    let detalhesEtapa = null;
    try {
      detalhesEtapa = await api(`/etapas/${etapa.id}`);
    } catch (e) {
      mostrarErro(mensagemErro, e);
      return;
    }

    function renderConteudoAcoes() {
      const acoes = detalhesEtapa.acoes || [];
      modalAcaoWrap.innerHTML = `
        <div class="modal-fundo modal-fundo--cadastro" role="dialog" aria-modal="true">
          <div class="modal-cadastro modal-cadastro--complexo" style="max-width: 780px;">
            <div class="modal-cabecalho">
              <h3>Ações de Aprovação: ${escaparHtml(etapa.nome)}</h3>
              <button type="button" class="modal-fechar" aria-label="Fechar">✕</button>
            </div>
            <div style="padding: 1.25rem;">
              <p class="erro-modal-acao erro" hidden></p>
              
              <div style="margin-bottom: 1.25rem;">
                <h4 style="margin: 0 0 0.5rem; font-size: 0.95rem;">Ações cadastradas</h4>
                <div class="tabela-wrap" style="max-height: 220px; overflow-y: auto;">
                  <table style="margin: 0;">
                    <thead>
                      <tr>
                        <th>Rótulo da Ação</th>
                        <th>Setor Destino</th>
                        <th>Vínculo</th>
                        <th>Pré-requisito</th>
                        <th class="td-acoes">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${
                        acoes.length === 0
                          ? `<tr><td colspan="5" style="text-align: center; padding: 1.25rem; color: var(--cor-texto-secundario);">Nenhuma ação cadastrada nesta etapa de aprovação.</td></tr>`
                          : acoes
                              .map(
                                (a) => `
                        <tr>
                          <td style="font-weight: 600;">${escaparHtml(a.rotulo)}</td>
                          <td>${escaparHtml(setores.find((s) => s.id === a.setor_destino_id)?.nome ?? a.setor_destino_id)}</td>
                          <td>${a.vinculo === "mae" ? "Chamado mãe" : "Chamado pai"}</td>
                          <td>${a.prerequisito_acao_id ? escaparHtml(acoes.find((x) => x.id === a.prerequisito_acao_id)?.rotulo ?? "-") : "-"}</td>
                          <td class="td-acoes">
                            ${permissaoFluxos.excluir ? botaoIconeExcluir("btn-excluir-acao", a.id) : ""}
                          </td>
                        </tr>
                      `
                              )
                              .join("")
                      }
                    </tbody>
                  </table>
                </div>
              </div>

              ${
                permissaoFluxos.inserir
                  ? `
                <div style="border-top: 1px solid var(--cor-borda); padding-top: 1rem;">
                  <h4 style="margin: 0 0 0.6rem; font-size: 0.95rem;">Adicionar nova ação</h4>
                  <form class="form-nova-acao" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; align-items: end;">
                    <div>
                      <label style="font-size: 0.85rem; font-weight: 600; display: block; margin-bottom: 0.3rem;">Rótulo da Ação *</label>
                      <input type="text" name="rotulo" required placeholder="Ex: Liberar Ferramentaria" style="width: 100%;">
                    </div>
                    <div>
                      <label style="font-size: 0.85rem; font-weight: 600; display: block; margin-bottom: 0.3rem;">Setor destino *</label>
                      <select name="setor_destino_id" required style="width: 100%;">
                        <option value="">Selecione…</option>
                        ${setores.map((s) => `<option value="${s.id}">${escaparHtml(s.nome)}</option>`).join("")}
                      </select>
                    </div>
                    <div>
                      <label style="font-size: 0.85rem; font-weight: 600; display: block; margin-bottom: 0.3rem;">Vínculo *</label>
                      <select name="vinculo" required style="width: 100%;">
                        <option value="mae">Chamado mãe (raiz)</option>
                        <option value="pai">Chamado pai (imediato)</option>
                      </select>
                    </div>
                    <div>
                      <label style="font-size: 0.85rem; font-weight: 600; display: block; margin-bottom: 0.3rem;">Pré-requisito</label>
                      <select name="prerequisito_acao_id" style="width: 100%;">
                        <option value="">Nenhum</option>
                        ${acoes.map((a) => `<option value="${a.id}">${escaparHtml(a.rotulo)}</option>`).join("")}
                      </select>
                    </div>
                    <div>
                      <button type="submit" class="btn btn-primario" style="width: 100%;">+ Adicionar Ação</button>
                    </div>
                  </form>
                </div>
              `
                  : ""
              }
            </div>
            <div class="modal-rodape">
              <button type="button" class="btn btn-secundario btn-fechar-modal-acao">Fechar</button>
            </div>
          </div>
        </div>
      `;

      const fundo = modalAcaoWrap.querySelector(".modal-fundo");
      const fechar = () => (modalAcaoWrap.innerHTML = "");

      fundo.querySelector(".modal-fechar").addEventListener("click", fechar);
      fundo.querySelector(".btn-fechar-modal-acao").addEventListener("click", fechar);
      fundo.addEventListener("click", (e) => {
        if (e.target === fundo) {
          // Evita fechamento acidental ao clicar fora
        }
      });

      // Excluir ação
      fundo.querySelectorAll(".btn-excluir-acao").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const confirmado = await confirmarAcao("Excluir esta ação?", "Essa ação não poderá ser desfeita.");
          if (!confirmado) return;
          try {
            await api(`/acoes/${btn.dataset.id}`, { method: "DELETE" });
            detalhesEtapa = await api(`/etapas/${etapa.id}`);
            renderConteudoAcoes();
          } catch (err) {
            mostrarErro(fundo.querySelector(".erro-modal-acao"), err);
          }
        });
      });

      // Adicionar ação
      const formAcao = fundo.querySelector(".form-nova-acao");
      formAcao?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const erroEl = fundo.querySelector(".erro-modal-acao");
        erroEl.hidden = true;

        const corpo = {
          rotulo: formAcao.elements.rotulo.value.trim(),
          setor_destino_id: Number(formAcao.elements.setor_destino_id.value),
          vinculo: formAcao.elements.vinculo.value,
          prerequisito_acao_id: formAcao.elements.prerequisito_acao_id.value
            ? Number(formAcao.elements.prerequisito_acao_id.value)
            : null,
        };

        try {
          await api(`/etapas/${etapa.id}/acoes`, { method: "POST", body: corpo });
          detalhesEtapa = await api(`/etapas/${etapa.id}`);
          renderConteudoAcoes();
        } catch (err) {
          mostrarErro(erroEl, err);
        }
      });
    }

    renderConteudoAcoes();
  }

  // Modal para gerenciar Campos Dinâmicos de uma etapa
  async function abrirModalCampos(etapa) {
    let campos = [];
    try {
      campos = await api(`/etapas/${etapa.id}/campos`);
    } catch (e) {
      mostrarErro(mensagemErro, e);
      return;
    }

    function renderConteudoCampos() {
      modalCamposWrap.innerHTML = `
        <div class="modal-fundo modal-fundo--cadastro" role="dialog" aria-modal="true">
          <div class="modal-cadastro modal-cadastro--complexo" style="max-width: 820px;">
            <div class="modal-cabecalho">
              <h3>Campos Personalizados da Etapa: ${escaparHtml(etapa.nome)}</h3>
              <button type="button" class="modal-fechar" aria-label="Fechar">✕</button>
            </div>
            <div style="padding: 1.25rem;">
              <p class="erro-modal-campos erro" hidden></p>
              
              <p style="font-size: 0.88rem; color: var(--cor-texto-secundario); margin: 0 0 1rem;">
                Configure os campos específicos que o solicitante ou operador deve preencher nesta etapa (ex: Código do produto de referência, Data estimada de faturamento, Detalhamento técnico, etc.).
              </p>

              <div style="margin-bottom: 1.25rem;">
                <h4 style="margin: 0 0 0.5rem; font-size: 0.95rem;">Campos configurados</h4>
                <div class="tabela-wrap" style="max-height: 240px; overflow-y: auto;">
                  <table style="margin: 0;">
                    <thead>
                      <tr>
                        <th style="width: 50px; text-align: center;">Ordem</th>
                        <th>Identificador</th>
                        <th>Rótulo (Label)</th>
                        <th>Tipo</th>
                        <th>Obrigatório?</th>
                        <th>Opções (Seleção)</th>
                        <th class="td-acoes">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${
                        campos.length === 0
                          ? `<tr><td colspan="7" style="text-align: center; padding: 1.25rem; color: var(--cor-texto-secundario);">Nenhum campo personalizado configurado para esta etapa.</td></tr>`
                          : campos
                              .map(
                                (c) => {
                                  const tiposLegiveis = {
                                    texto: "Texto curto",
                                    textarea: "Texto longo",
                                    texto_longo: "Texto longo",
                                    numero: "Número",
                                    data: "Data",
                                    select: "Lista suspensa",
                                    selecao: "Lista suspensa",
                                    checkbox: "Caixa de seleção",
                                    sim_nao: "Sim ou Não",
                                  };
                                  const tipoRotulo = tiposLegiveis[c.tipo] || c.tipo;
                                  const opcoesRaw = c.opcoes_json || c.opcoes;
                                  let opcoesFormatadas = "-";
                                  if (opcoesRaw) {
                                    try {
                                      const arr = JSON.parse(opcoesRaw);
                                      opcoesFormatadas = Array.isArray(arr) ? arr.join(", ") : String(opcoesRaw);
                                    } catch (_) {
                                      opcoesFormatadas = String(opcoesRaw);
                                    }
                                  }

                                  return `
                        <tr>
                          <td style="font-weight: 700; text-align: center;">${c.ordem || 0}</td>
                          <td style="font-family: monospace; font-size: 0.85rem;">${escaparHtml(c.nome)}</td>
                          <td style="font-weight: 600;">${escaparHtml(c.rotulo)}</td>
                          <td><span class="badge-status" style="background: var(--cor-fundo-elevado); border: 1px solid var(--cor-borda); font-size: 0.8rem;">${escaparHtml(tipoRotulo)}</span></td>
                          <td>${c.obrigatorio ? '<strong style="color: var(--cor-alerta);">Sim</strong>' : "Não"}</td>
                          <td style="font-size: 0.85rem; color: var(--cor-texto-secundario);">${escaparHtml(opcoesFormatadas)}</td>
                          <td class="td-acoes">
                            ${permissaoFluxos.excluir ? botaoIconeExcluir("btn-excluir-campo", c.id) : ""}
                          </td>
                        </tr>
                      `;
                                }
                              )
                              .join("")
                      }
                    </tbody>
                  </table>
                </div>
              </div>

              ${
                permissaoFluxos.inserir
                  ? `
                <div style="border-top: 1px solid var(--cor-borda); padding-top: 1.25rem;">
                  <h4 style="margin: 0 0 0.75rem; font-size: 0.95rem;">+ Adicionar novo campo personalizado</h4>
                  <form class="form-novo-campo" style="display: grid; grid-template-columns: 80px 1fr 1.2fr 1.1fr auto; gap: 0.6rem; align-items: end;">
                    <div>
                      <label style="font-size: 0.8rem; font-weight: 600; display: block; margin-bottom: 0.2rem;">Ordem *</label>
                      <input type="number" name="ordem" min="1" max="10" value="${campos.length + 1}" required style="width: 100%; padding: 0.4rem 0.5rem; font-size: 0.85rem;">
                    </div>
                    <div>
                      <label style="font-size: 0.8rem; font-weight: 600; display: block; margin-bottom: 0.2rem;">Identificador (código) *</label>
                      <input type="text" name="nome" placeholder="ex: produto_referencia" required style="width: 100%; padding: 0.4rem 0.5rem; font-family: monospace; font-size: 0.85rem;">
                    </div>
                    <div>
                      <label style="font-size: 0.8rem; font-weight: 600; display: block; margin-bottom: 0.2rem;">Rótulo exibido *</label>
                      <input type="text" name="rotulo" placeholder="ex: Produto de Referência" required style="width: 100%; padding: 0.4rem 0.5rem; font-size: 0.85rem;">
                    </div>
                    <div>
                      <label style="font-size: 0.8rem; font-weight: 600; display: block; margin-bottom: 0.2rem;">Tipo do campo *</label>
                      <select name="tipo" required style="width: 100%; padding: 0.4rem 0.5rem; font-size: 0.85rem;">
                        <option value="texto">Texto curto</option>
                        <option value="texto_longo">Texto longo (Detalhamento)</option>
                        <option value="numero">Número</option>
                        <option value="data">Data</option>
                        <option value="selecao">Lista suspensa (Seleção)</option>
                        <option value="checkbox">Caixa de seleção (Checkbox)</option>
                        <option value="sim_nao">Sim ou Não</option>
                      </select>
                    </div>
                    <div style="display: flex; gap: 0.5rem; align-items: center; padding-bottom: 0.3rem;">
                      <label style="display: flex; align-items: center; gap: 0.3rem; font-size: 0.85rem; cursor: pointer; white-space: nowrap;">
                        <input type="checkbox" name="obrigatorio"> Obrigatório
                      </label>
                    </div>
                    <div class="wrap-opcoes-selecao" style="grid-column: 1 / -2; display: none;">
                      <label style="font-size: 0.8rem; font-weight: 600; display: block; margin-bottom: 0.2rem;">Opções da lista suspensa (separadas por vírgula)</label>
                      <input type="text" name="opcoes_texto" placeholder="ex: Opção 1, Opção 2, Opção 3" style="width: 100%; padding: 0.4rem 0.5rem; font-size: 0.85rem;">
                    </div>
                    <div style="grid-column: -2 / -1; justify-self: end;">
                      <button type="submit" class="btn btn-primario btn-pequeno" style="padding: 0.45rem 0.9rem;">+ Adicionar</button>
                    </div>
                  </form>
                </div>
              `
                  : ""
              }
            </div>
            <div class="modal-rodape" style="display: flex; justify-content: flex-end; padding: 0.75rem 1.25rem; border-top: 1px solid var(--cor-borda);">
              <button type="button" class="btn btn-secundario btn-fechar-modal-campos">Fechar</button>
            </div>
          </div>
        </div>
      `;

      const fundo = modalCamposWrap.querySelector(".modal-fundo");
      const fechar = () => (modalCamposWrap.innerHTML = "");

      fundo.querySelector(".modal-fechar").addEventListener("click", fechar);
      fundo.querySelector(".btn-fechar-modal-campos").addEventListener("click", fechar);
      fundo.addEventListener("click", (e) => {
        if (e.target === fundo) {
          // Evita fechamento acidental ao clicar fora
        }
      });

      const formCampo = fundo.querySelector(".form-novo-campo");
      if (formCampo) {
        const selectTipo = formCampo.elements.tipo;
        const wrapOpcoes = formCampo.querySelector(".wrap-opcoes-selecao");
        selectTipo.addEventListener("change", () => {
          wrapOpcoes.style.display = selectTipo.value === "selecao" ? "block" : "none";
        });

        formCampo.addEventListener("submit", async (e) => {
          e.preventDefault();
          const erroEl = fundo.querySelector(".erro-modal-campos");
          erroEl.hidden = true;

          const nomeLimpo = formCampo.elements.nome.value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
          const tipo = formCampo.elements.tipo.value;
          let opcoesJson = null;

          if (tipo === "selecao") {
            const raw = formCampo.elements.opcoes_texto.value;
            const lista = raw.split(",").map((s) => s.trim()).filter(Boolean);
            opcoesJson = JSON.stringify(lista);
          }

          const corpo = {
            nome: nomeLimpo,
            rotulo: formCampo.elements.rotulo.value.trim(),
            tipo: tipo,
            obrigatorio: formCampo.elements.obrigatorio.checked,
            opcoes: opcoesJson,
            opcoes_json: opcoesJson,
          };

          try {
            await api(`/etapas/${etapa.id}/campos`, { method: "POST", body: corpo });
            campos = await api(`/etapas/${etapa.id}/campos`);
            renderConteudoCampos();
          } catch (err) {
            mostrarErro(erroEl, err);
          }
        });
      }

      fundo.querySelectorAll(".btn-excluir-campo").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const confirmado = await confirmarAcao("Excluir este campo?", "Valores já preenchidos podem ser perdidos.");
          if (!confirmado) return;
          try {
            await api(`/etapas/${etapa.id}/campos?campo_id=${btn.dataset.id}`, { method: "DELETE" });
            campos = await api(`/etapas/${etapa.id}/campos`);
            renderConteudoCampos();
          } catch (err) {
            mostrarErro(fundo.querySelector(".erro-modal-campos"), err);
          }
        });
      });
    }

    renderConteudoCampos();
  }

  renderizarTabelaFluxos();
}
