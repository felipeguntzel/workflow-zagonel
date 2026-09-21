import { api } from "./api.js";
import { exigirLogin } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { escaparHtml, mostrarErro } from "./ui.js";

export function inicializar() {
  const usuario = exigirLogin();
  if (!usuario) return;

  aplicarLayout(usuario);
  if (!usuario.admin) {
    mostrarErro(document.getElementById("mensagem-erro"), "Acesso restrito a administradores.");
    return;
  }
  inicializarAuditoria();
}

export const inicializarAuditoria = async function () {
  const container = document.getElementById("secao-auditoria");
  if (!container) return;

  container.innerHTML = `
    <div class="pagina-cabecalho">
      <div class="pagina-cabecalho__esquerda">
        <h2>Auditoria do Sistema</h2>
        <p style="font-size: 0.9rem; color: var(--cor-texto-secundario); margin: 0.2rem 0 0;">
          Histórico e rastreabilidade de todas as alterações cadastrais e administrativas
        </p>
      </div>
    </div>

    <div class="painel" style="margin-bottom: 1.5rem;">
      <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-end;">
        <div style="flex: 1; min-width: 180px;">
          <label for="filtro-entidade" style="display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem;">Entidade / Tabela</label>
          <select id="filtro-entidade" class="select-padrao" style="width: 100%; padding: 0.55rem 0.75rem; border-radius: 0.35rem; border: 1px solid var(--cor-borda); background: var(--cor-fundo-elevado); color: var(--cor-texto);">
            <option value="">Todas as entidades</option>
            <option value="usuarios">Usuários</option>
            <option value="grupos_permissao">Grupos de Permissão</option>
            <option value="setores">Setores</option>
            <option value="empresas">Empresas</option>
            <option value="status">Status</option>
            <option value="fluxos">Fluxos</option>
            <option value="etapas">Etapas</option>
            <option value="acoes">Ações</option>
          </select>
        </div>

        <div style="flex: 1; min-width: 160px;">
          <label for="filtro-acao" style="display: block; font-weight: 600; font-size: 0.85rem; margin-bottom: 0.35rem;">Tipo de Ação</label>
          <select id="filtro-acao" class="select-padrao" style="width: 100%; padding: 0.55rem 0.75rem; border-radius: 0.35rem; border: 1px solid var(--cor-borda); background: var(--cor-fundo-elevado); color: var(--cor-texto);">
            <option value="">Todas as ações</option>
            <option value="insercao">Inserção / Criação</option>
            <option value="edicao">Edição / Atualização</option>
            <option value="exclusao">Exclusão</option>
          </select>
        </div>

        <div>
          <button type="button" id="btn-filtrar-auditoria" class="btn btn-primario">Filtrar</button>
          <button type="button" id="btn-limpar-filtros" class="btn btn-secundario" style="margin-left: 0.5rem;">Limpar</button>
        </div>
      </div>
    </div>

    <div id="tabela-auditoria-wrap" class="tabela-wrap">
      <table>
        <thead>
          <tr>
            <th style="min-width: 15ch;">Data / Hora</th>
            <th style="min-width: 16ch;">Usuário</th>
            <th>Ação</th>
            <th>Entidade</th>
            <th>Registro</th>
            <th class="td-acoes">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${[1, 2, 3, 4, 5]
            .map(
              () => `
            <tr class="linha-esqueleto">
              <td><div class="esqueleto-bloco" style="width: 110px;"></div></td>
              <td><div class="esqueleto-bloco" style="width: 90px;"></div></td>
              <td><div class="esqueleto-bloco" style="width: 60px;"></div></td>
              <td><div class="esqueleto-bloco" style="width: 80px;"></div></td>
              <td><div class="esqueleto-bloco" style="width: 50px;"></div></td>
              <td class="td-acoes"><div class="esqueleto-bloco" style="width: 44px; margin-left: auto;"></div></td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <div id="modal-auditoria-detalhes" class="modal-fundo" hidden style="display: none;">
      <div class="modal-cadastro" role="dialog" style="max-width: 650px; max-height: 85vh; display: flex; flex-direction: column;">
        <div class="modal-cabecalho">
          <h3 id="modal-auditoria-titulo" style="margin: 0; font-size: 1.1rem;">Detalhes do Evento</h3>
          <button type="button" id="btn-fechar-modal-detalhes" class="modal-fechar" aria-label="Fechar">✕</button>
        </div>
        <div id="modal-auditoria-conteudo" style="overflow-y: auto; padding: 1.25rem; flex: 1; font-size: 0.9rem; background: var(--cor-fundo-elevado);"></div>
        <div class="modal-rodape" style="background: var(--cor-fundo);">
          <button type="button" id="btn-fechar-modal-rodape" class="btn btn-secundario">Fechar</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("btn-filtrar-auditoria").addEventListener("click", carregarLogs);
  document.getElementById("btn-limpar-filtros").addEventListener("click", () => {
    document.getElementById("filtro-entidade").value = "";
    document.getElementById("filtro-acao").value = "";
    carregarLogs();
  });

  const modalFundo = document.getElementById("modal-auditoria-detalhes");
  const fecharModal = () => {
    modalFundo.hidden = true;
    modalFundo.style.display = "none";
  };
  document.getElementById("btn-fechar-modal-detalhes").addEventListener("click", fecharModal);
  document.getElementById("btn-fechar-modal-rodape").addEventListener("click", fecharModal);
  modalFundo.addEventListener("click", (ev) => {
    if (ev.target === modalFundo) fecharModal();
  });

  await carregarLogs();
};

let logsCarregados = [];

async function carregarLogs() {
  const wrap = document.getElementById("tabela-auditoria-wrap");
  if (!wrap) return;

  const entidade = document.getElementById("filtro-entidade")?.value || "";
  const acao = document.getElementById("filtro-acao")?.value || "";

  const params = new URLSearchParams();
  if (entidade) params.set("entidade", entidade);
  if (acao) params.set("acao", acao);

  try {
    const res = await api(`/auditoria?${params.toString()}`);
    logsCarregados = Array.isArray(res) ? res : [];
    renderizarTabela(logsCarregados);
  } catch (e) {
    mostrarErro(document.getElementById("mensagem-erro"), "Erro ao carregar auditoria: " + (e.message || e));
    wrap.innerHTML = '<div style="padding: 2rem; color: var(--cor-vencido); text-align: center;">Não foi possível carregar os registros de auditoria.</div>';
  }
}

function renderizarTabela(logs) {
  const wrap = document.getElementById("tabela-auditoria-wrap");
  if (!wrap) return;

  if (logs.length === 0) {
    wrap.innerHTML = '<div style="padding: 2.5rem; text-align: center; color: var(--cor-texto-secundario);">Nenhum registro de auditoria encontrado para os filtros selecionados.</div>';
    return;
  }

  const badgeAcao = (acao) => {
    if (acao === "insercao") {
      return '<span style="background: rgba(46, 125, 50, 0.15); color: #2e7d32; padding: 2px 8px; border-radius: 12px; font-weight: 600; font-size: 0.78rem;">Inserção</span>';
    }
    if (acao === "edicao") {
      return '<span style="background: rgba(25, 118, 210, 0.15); color: #1976d2; padding: 2px 8px; border-radius: 12px; font-weight: 600; font-size: 0.78rem;">Edição</span>';
    }
    if (acao === "exclusao") {
      return '<span style="background: rgba(211, 47, 47, 0.15); color: #d32f2f; padding: 2px 8px; border-radius: 12px; font-weight: 600; font-size: 0.78rem;">Exclusão</span>';
    }
    return `<span style="background: var(--cor-fundo); padding: 2px 8px; border-radius: 12px; font-size: 0.78rem;">${escaparHtml(acao)}</span>`;
  };

  const formatarData = (str) => {
    if (!str) return "-";
    return str.replace("T", " ").slice(0, 19);
  };

  const linhasHtml = logs
    .map(
      (log, idx) => `
      <tr>
        <td style="white-space: nowrap; font-size: 0.85rem;">${escaparHtml(formatarData(log.criado_em))}</td>
        <td style="font-weight: 600;">${escaparHtml(log.usuario_nome || "Sistema")}</td>
        <td>${badgeAcao(log.acao)}</td>
        <td style="font-family: monospace; font-size: 0.85rem;">${escaparHtml(log.entidade)}${log.entidade_id ? ` #${log.entidade_id}` : ""}</td>
        <td style="max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escaparHtml(log.detalhes || "")}">${escaparHtml(log.detalhes || "-")}</td>
        <td style="text-align: right;">
          <button type="button" class="btn btn-secundario btn-pequeno btn-ver-detalhes" data-idx="${idx}">
            Ver dados
          </button>
        </td>
      </tr>
    `
    )
    .join("");

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Data/Hora</th>
          <th>Usuário</th>
          <th>Ação</th>
          <th>Entidade</th>
          <th>Descrição</th>
          <th style="text-align: right;">Dados</th>
        </tr>
      </thead>
      <tbody>
        ${linhasHtml}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll(".btn-ver-detalhes").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-idx"));
      const log = logsCarregados[idx];
      if (log) abrirModalDetalhes(log);
    });
  });
}

function abrirModalDetalhes(log) {
  const modalFundo = document.getElementById("modal-auditoria-detalhes");
  const modalTitulo = document.getElementById("modal-auditoria-titulo");
  const modalConteudo = document.getElementById("modal-auditoria-conteudo");
  if (!modalFundo || !modalConteudo) return;

  modalTitulo.textContent = `Registro #${log.id} (${log.entidade} #${log.entidade_id ?? ""})`;

  const formatarJson = (valor) => {
    if (!valor) return '<span style="color: var(--cor-texto-secundario); font-style: italic;">Nenhum dado</span>';
    try {
      const parsed = typeof valor === "string" ? JSON.parse(valor) : valor;
      delete parsed.senha_hash;
      return `<pre style="background: var(--cor-fundo); padding: 0.75rem; border-radius: 4px; border: 1px solid var(--cor-borda); overflow-x: auto; font-size: 0.82rem; margin: 0.4rem 0;">${escaparHtml(JSON.stringify(parsed, null, 2))}</pre>`;
    } catch (_) {
      return `<pre style="background: var(--cor-fundo); padding: 0.75rem; border-radius: 4px; border: 1px solid var(--cor-borda); overflow-x: auto; font-size: 0.82rem; margin: 0.4rem 0;">${escaparHtml(String(valor))}</pre>`;
    }
  };

  modalConteudo.innerHTML = `
    <div style="margin-bottom: 0.75rem; line-height: 1.6;">
      <strong>Data/Hora:</strong> ${escaparHtml(log.criado_em)}<br>
      <strong>Usuário Responsável:</strong> ${escaparHtml(log.usuario_nome)} (ID ${log.usuario_id ?? "Sistema"})<br>
      <strong>Ação:</strong> ${escaparHtml(log.acao)}<br>
      <strong>Descrição:</strong> ${escaparHtml(log.detalhes || "-")}
    </div>

    ${
      log.dados_antigos
        ? `
      <div style="margin-top: 1rem;">
        <strong style="color: var(--cor-vencido);">Dados Anteriores:</strong>
        ${formatarJson(log.dados_antigos)}
      </div>
    `
        : ""
    }

    ${
      log.dados_novos
        ? `
      <div style="margin-top: 1rem;">
        <strong style="color: var(--cor-primaria);">Dados Novos:</strong>
        ${formatarJson(log.dados_novos)}
      </div>
    `
        : ""
    }
  `;

  modalFundo.hidden = false;
  modalFundo.style.display = "flex";
}

// Inicialização imediata quando carregado diretamente
inicializar();
