import { exigirLogin, permissaoDaTela } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { info, mostrarErro, escaparHtml, escaparAtributo, linkWhatsApp, formatarDataBR } from "./ui.js";
import { confirmarAcao } from "./modal.js";
import { api } from "./api.js";

let id = new URLSearchParams(window.location.search).get("id");
let permissaoChamados = { visualizar: false, inserir: false, editar: false, excluir: false };
let usuario = null;
let chamadoAtual = null;

let estadoRecolhimento = {
  detalhe: false,
  campos: false,
};

export function inicializar() {
  usuario = exigirLogin();
  id = new URLSearchParams(window.location.search).get("id");
  permissaoChamados = usuario
    ? permissaoDaTela("chamados")
    : { visualizar: false, inserir: false, editar: false, excluir: false };

  if (usuario && id) {
    aplicarLayout(usuario);
    iniciar();
  } else if (usuario) {
    aplicarLayout(usuario);
    mostrarErro(document.getElementById("mensagem-erro"), new Error("Chamado não informado."));
    document.querySelector("main").querySelectorAll(":scope > :not(#mensagem-erro)").forEach((el) => {
      el.hidden = true;
    });
  }
}

inicializar();

function formatarTamanho(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function capturarImagemDoClipboard(e, callback) {
  const clipboardData = e.clipboardData || window.clipboardData;
  if (!clipboardData || !clipboardData.items) return false;

  for (let i = 0; i < clipboardData.items.length; i++) {
    const item = clipboardData.items[i];
    if (item.type && item.type.includes("image")) {
      const blob = item.getAsFile();
      if (blob) {
        e.preventDefault();
        callback(blob);
        return true;
      }
    }
  }
  return false;
}

function iniciar() {
  document.getElementById("link-geral").addEventListener("click", async (ev) => {
    ev.preventDefault();
    try {
      const chamado = await api(`/chamados/${id}`);
      window.location.href = `/geral?id=${chamado.chamado_mae_id ?? chamado.id}`;
    } catch (e) {
      mostrarErro(document.getElementById("mensagem-erro"), e);
    }
  });

  const botaoExcluir = document.getElementById("btn-excluir-chamado");
  if (permissaoChamados.excluir) {
    botaoExcluir.addEventListener("click", async () => {
      const confirmado = await confirmarAcao(
        "Excluir este chamado?",
        "Toda a subárvore é excluída junto. Isso não pode ser desfeito."
      );
      if (!confirmado) return;
      try {
        await api(`/chamados/${id}`, { method: "DELETE" });
        window.location.href = "/chamados";
      } catch (e) {
        mostrarErro(document.getElementById("mensagem-erro"), e);
      }
    });
  } else {
    botaoExcluir.hidden = true;
  }

  // Evento de recolhimento do card de campos personalizados
  const btnRecolherCampos = document.getElementById("btn-recolher-campos");
  const cabecalhoCampos = document.getElementById("cabecalho-campos-dinamicos");
  const conteudoCampos = document.getElementById("conteudo-campos-dinamicos");
  const btnSalvarCampos = document.getElementById("btn-salvar-campos-dinamicos");
  if (btnRecolherCampos) {
    btnRecolherCampos.addEventListener("click", () => {
      estadoRecolhimento.campos = !estadoRecolhimento.campos;
      conteudoCampos.style.display = estadoRecolhimento.campos ? "none" : "";
      if (btnSalvarCampos) {
        btnSalvarCampos.style.display = estadoRecolhimento.campos ? "none" : "";
      }
      if (cabecalhoCampos) {
        cabecalhoCampos.classList.toggle("painel-chamado-cabecalho--recolhido", estadoRecolhimento.campos);
      }
      btnRecolherCampos.textContent = estadoRecolhimento.campos ? "▼ Expandir" : "▲ Recolher";
    });
  }

  // Atalho para abrir tela suspensa de horas
  document.querySelectorAll("#btn-abrir-modal-horas, .btn-abrir-modal-horas").forEach((b) => {
    b.addEventListener("click", abrirModalHoras);
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("#btn-abrir-modal-horas, .btn-abrir-modal-horas")) {
      e.preventDefault();
      abrirModalHoras();
    }
  });

  // Integração Comentários + Anexos
  configurarFormularioComentariosEAnexos();

  carregarTudo().catch((e) => mostrarErro(document.getElementById("mensagem-erro"), e));
}

let cacheStatus = null;
let cacheUsuarios = null;

async function obterStatusList() {
  if (cacheStatus) return cacheStatus;
  try {
    cacheStatus = await api("/status");
  } catch (e) {
    cacheStatus = [];
  }
  return cacheStatus;
}

async function obterUsuarios() {
  if (cacheUsuarios) return cacheUsuarios;
  try {
    cacheUsuarios = await api("/usuarios");
  } catch (e) {
    cacheUsuarios = [];
  }
  return cacheUsuarios;
}

async function carregarTudo() {
  // Carrega imediatamente em paralelo o chamado e seus campos (dados prioritários para exibição instantânea)
  const [chamadoPromise, camposPromise] = [
    api(`/chamados/${id}`),
    api(`/chamados/${id}/campos`).catch(() => []),
  ];

  // Dispara em segundo plano os itens secundários para não bloquear a renderização dos dados da solicitação
  const secundariasPromise = Promise.all([
    carregarAuditoria(),
    carregarComentariosEAnexos(),
    atualizarResumoHoras(),
  ]);

  try {
    const chamado = await chamadoPromise;
    // Renderiza os dados obrigatórios e campos imediatamente
    await Promise.all([
      carregarDetalhe(chamado),
      carregarCamposDinamicos(chamado, camposPromise),
    ]);
  } catch (e) {
    mostrarErro(document.getElementById("mensagem-erro"), e);
  }

  await secundariasPromise;
}

async function carregarDetalhe(chamadoRecebido = null) {
  const chamado = chamadoRecebido || (await api(`/chamados/${id}`));
  chamadoAtual = chamado;
  const finalizado = Boolean(
    chamado.data_finalizacao ||
    String(chamado.status_nome || "").toLowerCase() === "finalizado"
  );

  const statusList = await obterStatusList();

  function badgePrioridade(p) {
    const prioridadeNorm = String(p || "normal").toLowerCase();
    if (prioridadeNorm === "urgente") {
      return `<span class="badge-status badge-legenda" style="background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; font-weight: 800;">🚨 Urgente</span>`;
    }
    if (prioridadeNorm === "alta") {
      return `<span class="badge-status badge-legenda" style="background: #fef3c7; color: #92400e; border: 1px solid #fde68a; font-weight: 700;">⚠️ Alta</span>`;
    }
    if (prioridadeNorm === "baixa") {
      return `<span class="badge-status badge-legenda" style="background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; font-weight: 600;">⬇️ Baixa</span>`;
    }
    return `<span class="badge-status badge-legenda" style="background: #eaf3ee; color: #1d4a35; border: 1px solid #bbf7d0; font-weight: 600;">Normal</span>`;
  }

  const podeEditarStatus = permissaoChamados.editar;
  const ehEtapaAprovacao = chamado.etapa_id && chamado.etapa_tipo === "aprovacao";

  const detalheEl = document.getElementById("detalhe");
  detalheEl.innerHTML = `
    <!-- Topo do Card de Detalhes -->
    <div id="cabecalho-detalhe" class="painel-chamado-cabecalho ${estadoRecolhimento.detalhe ? 'painel-chamado-cabecalho--recolhido' : ''}">
      <div class="cabecalho-lado-esquerdo">
        <h1 class="cabecalho-titulo">
          #${chamado.id} - ${escaparHtml(chamado.titulo)}
        </h1>
        <div class="cabecalho-legendas">
          <span class="badge-status badge-legenda" style="background: ${chamado.status_cor ? chamado.status_cor + '18' : 'var(--cor-fundo)'}; color: ${chamado.status_cor || 'var(--cor-texto)'}; border: 1px solid ${chamado.status_cor ? chamado.status_cor + '55' : 'var(--cor-borda)'};">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${chamado.status_cor || 'var(--cor-primaria)'};"></span>
            Status: ${escaparHtml(chamado.status_nome)}
          </span>
          ${badgePrioridade(chamado.prioridade)}
        </div>
      </div>

      <div class="cabecalho-lado-direito">
        <!-- Atualizar Status no Topo da Tela (Salva automaticamente ao selecionar) -->
        ${
          podeEditarStatus && !ehEtapaAprovacao
            ? `
          <div class="grupo-acao-status">
            <select id="select-status-topo" class="select-padrao select-acao-cabecalho" title="Alterar status do chamado">
              ${statusList
                .map(
                  (s) =>
                    `<option value="${s.id}" ${s.id === chamado.status_id ? "selected" : ""}>${escaparHtml(s.nome)}</option>`
                )
                .join("")}
            </select>
          </div>
        `
            : ""
        }

        <!-- Botão Recolher do Card de Dados Obrigatórios -->
        <button type="button" id="btn-recolher-detalhe" class="btn btn-secundario btn-acao-cabecalho btn-recolher-card" title="Recolher / Expandir dados obrigatórios">
          ${estadoRecolhimento.detalhe ? "▼ Expandir" : "▲ Recolher"}
        </button>
      </div>
    </div>

    <!-- Mensagem rápida de confirmação de status -->
    <div id="toast-status-topo" class="toast-status-rapido" style="margin-top: 0.5rem;" hidden>✓ Status alterado.</div>
    <p id="erro-status-topo" class="erro" style="margin-top: 0.4rem;" hidden></p>

    <!-- Conteúdo Recolhível dos Dados Obrigatórios -->
    <div id="detalhe-conteudo-recolhivel" style="${estadoRecolhimento.detalhe ? 'display: none;' : ''} margin-top: 0.85rem;">
      <p style="margin: 0 0 0.35rem; color: var(--cor-texto-secundario); font-size: 0.92rem;">
        Fluxo: <strong>${escaparHtml(chamado.fluxo_nome || "-")}</strong> |
        Empresa: <strong>${escaparHtml(chamado.empresa_nome || "Geral")}</strong> |
        Setor: <strong>${escaparHtml(chamado.setor_nome || "-")}</strong> ${info("Setor responsável por esta etapa/tarefa.")}
      </p>

      <p style="margin: 0 0 0.45rem; font-size: 0.92rem; display: flex; align-items: center; flex-wrap: wrap; gap: 0.35rem;">
        <span>Solicitante: <strong>${escaparHtml(chamado.solicitante_nome || "-")}</strong></span>
        ${linkWhatsApp(chamado.solicitante_telefone, chamado.id, chamado.titulo)}
        <span>| Abertura: <strong>${formatarDataBR(chamado.data_abertura)}</strong> | Prazo: <strong>${formatarDataBR(chamado.prazo)}</strong> (${chamado.situacao_prazo})</span>
      </p>

      ${
        chamado.observacao
          ? `
        <div style="margin-top: 0.65rem; padding: 0.65rem 0.85rem; background: var(--cor-fundo); border: 1px solid var(--cor-borda); border-left: 4px solid var(--cor-primaria); border-radius: 0.35rem; font-size: 0.9rem;">
          <strong style="color: var(--cor-primaria); display: block; margin-bottom: 0.25rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.03em;">
            📝 Observações da solicitação
          </strong>
          <div style="white-space: pre-wrap; line-height: 1.45; color: var(--cor-texto);">${escaparHtml(chamado.observacao)}</div>
        </div>
      `
          : ""
      }

      <!-- Atribuição de Responsável no Canto Esquerdo com Visual Padronizado -->
      <div class="bloco-atribuicao-responsavel" style="margin-top: 0.85rem; padding-top: 0.75rem; border-top: 1px solid var(--cor-borda); display: flex; flex-direction: column; align-items: flex-start; gap: 0.6rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
          <span style="font-weight: 600; font-size: 0.88rem; color: var(--cor-texto-secundario);">Responsável atual:</span>
          <span style="font-size: 0.9rem; font-weight: 600;">
            ${chamado.responsavel_nome ? escaparHtml(chamado.responsavel_nome) : `<em style="color: var(--cor-texto-secundario); font-weight: normal;">Ninguém atribuído</em>`}
          </span>
          ${chamado.responsavel_nome ? linkWhatsApp(chamado.responsavel_telefone, chamado.id, chamado.titulo) : ""}
        </div>

        ${
          !finalizado && permissaoChamados.editar
            ? `
          <div style="display: flex; align-items: center; justify-content: flex-start; gap: 0.5rem; flex-wrap: wrap;">
            <select id="select-atribuir-responsavel" class="select-padrao" style="min-width: 230px; max-width: 320px; padding: 0.4rem 0.65rem; font-size: 0.85rem; height: 36px; box-sizing: border-box;" title="Selecione um responsável para atribuir imediatamente">
              <option value="">Atribuir para alguém do setor…</option>
            </select>
            ${
              chamado.responsavel_id === usuario.id
                ? `<button type="button" id="btn-liberar-responsavel" class="btn btn-secundario" style="height: 36px; padding: 0 1rem; font-size: 0.85rem; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box;">Liberar</button>`
                : `<button type="button" id="btn-assumir-responsavel" class="btn btn-secundario" style="height: 36px; padding: 0 1rem; font-size: 0.85rem; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box;">Assumir</button>`
            }
          </div>
        `
            : ""
        }
      </div>

      ${chamado.resultado ? `<p style="margin-top: 0.5rem; font-weight: 600;">Resultado: ${escaparHtml(chamado.resultado)}</p>` : ""}
      ${
        chamado.bloqueado
          ? `<p class="erro" style="margin-top: 0.5rem;">⚠️ Bloqueado: aguardando outra ação pré-requisito finalizar.</p>`
          : ""
      }
    </div>
  `;
  detalheEl.hidden = false;

  // Carrega lista de usuários em background sem travar a exibição da tela
  if (!finalizado && permissaoChamados.editar) {
    obterUsuarios().then((todos) => {
      const select = document.getElementById("select-atribuir-responsavel");
      if (!select) return;
      const usuariosDoSetor = todos.filter(
        (u) => u.ativo && (chamado.setor_id == null || u.setor_id === chamado.setor_id)
      );
      select.innerHTML = `
        <option value="">Atribuir para alguém do setor…</option>
        ${usuariosDoSetor
          .map(
            (u) =>
              `<option value="${u.id}" ${u.id === chamado.responsavel_id ? "selected" : ""}>${escaparHtml(u.nome)}</option>`
          )
          .join("")}
      `;
    });
  }

  // Handler de recolhimento do card de detalhes
  document.getElementById("btn-recolher-detalhe")?.addEventListener("click", () => {
    estadoRecolhimento.detalhe = !estadoRecolhimento.detalhe;
    const box = document.getElementById("detalhe-conteudo-recolhivel");
    const cabecalho = document.getElementById("cabecalho-detalhe");
    if (box) {
      box.style.display = estadoRecolhimento.detalhe ? "none" : "block";
    }
    if (cabecalho) {
      cabecalho.classList.toggle("painel-chamado-cabecalho--recolhido", estadoRecolhimento.detalhe);
    }
    const btn = document.getElementById("btn-recolher-detalhe");
    if (btn) {
      btn.textContent = estadoRecolhimento.detalhe ? "▼ Expandir" : "▲ Recolher";
    }
  });

  // Salvar status automaticamente ao alterar a opção no select do topo com resposta instantânea
  const selectStatusTopo = document.getElementById("select-status-topo");
  if (selectStatusTopo) {
    let statusAnterior = Number(selectStatusTopo.value);
    selectStatusTopo.addEventListener("change", async () => {
      const erroStatus = document.getElementById("erro-status-topo");
      const toastStatus = document.getElementById("toast-status-topo");
      if (erroStatus) erroStatus.hidden = true;

      const statusId = Number(selectStatusTopo.value);
      const statusEscolhido = statusList.find((s) => s.id === statusId);

      if (chamado.bloqueado && String(statusEscolhido?.nome || "").toLowerCase() === "finalizado") {
        if (erroStatus) {
          erroStatus.textContent = "Não é possível finalizar: chamado bloqueado aguardando pré-requisito.";
          erroStatus.hidden = false;
        }
        selectStatusTopo.value = String(statusAnterior);
        return;
      }

      // Atualização visual otimista imediata (< 10ms)
      const badgeLegenda = document.querySelector(".cabecalho-legendas .badge-status");
      if (badgeLegenda && statusEscolhido) {
        badgeLegenda.style.background = statusEscolhido.cor ? statusEscolhido.cor + "18" : "var(--cor-fundo)";
        badgeLegenda.style.color = statusEscolhido.cor || "var(--cor-texto)";
        badgeLegenda.style.borderColor = statusEscolhido.cor ? statusEscolhido.cor + "55" : "var(--cor-borda)";
        badgeLegenda.innerHTML = `<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${statusEscolhido.cor || "var(--cor-primaria)"};"></span>Status: ${escaparHtml(statusEscolhido.nome)}`;
      }

      if (toastStatus) {
        toastStatus.textContent = "✓ Status alterado.";
        toastStatus.hidden = false;
        clearTimeout(toastStatus._timeout);
        toastStatus._timeout = setTimeout(() => {
          toastStatus.hidden = true;
        }, 2500);
      }

      try {
        const chamadoAtualizado = await api(`/chamados/${chamado.id}`, { method: "PUT", body: { status_id: statusId } });
        statusAnterior = statusId;
        chamadoAtual = chamadoAtualizado;

        const foiFinalizado = String(statusEscolhido?.nome || "").toLowerCase() === "finalizado";
        if (foiFinalizado) {
          // Quando finalizado, pode ter avançado fluxo e desbloqueado etapas seguintes
          await carregarTudo();
        } else {
          // Apenas atualiza auditoria em background sem recriar todo o DOM
          carregarAuditoria();
        }
      } catch (e) {
        selectStatusTopo.value = String(statusAnterior);
        // Reverte badge em caso de falha
        const stAntes = statusList.find((s) => s.id === statusAnterior);
        if (badgeLegenda && stAntes) {
          badgeLegenda.style.background = stAntes.cor ? stAntes.cor + "18" : "var(--cor-fundo)";
          badgeLegenda.style.color = stAntes.cor || "var(--cor-texto)";
          badgeLegenda.style.borderColor = stAntes.cor ? stAntes.cor + "55" : "var(--cor-borda)";
          badgeLegenda.innerHTML = `<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${stAntes.cor || "var(--cor-primaria)"};"></span>Status: ${escaparHtml(stAntes.nome)}`;
        }
        if (toastStatus) toastStatus.hidden = true;
        mostrarErro(erroStatus, e);
      }
    });
  }

  // Atualização otimista e ultra rápida de responsável (sem recarregar o chamado inteiro)
  async function definirResponsavel(responsavelId) {
    const todosUsuarios = await obterUsuarios();
    const usuarioEscolhido = todosUsuarios.find((u) => u.id === responsavelId);
    const responsavelAnteriorId = chamado.responsavel_id;
    const responsavelAnteriorNome = chamado.responsavel_nome;

    // 1. Atualização visual otimista instantânea na tela
    const containerResp = document.querySelector(".bloco-atribuicao-responsavel");
    const spanNomeResp = containerResp?.querySelector("span:nth-child(2)");
    if (spanNomeResp) {
      spanNomeResp.innerHTML = usuarioEscolhido
        ? escaparHtml(usuarioEscolhido.nome)
        : `<em style="color: var(--cor-texto-secundario); font-weight: normal;">Ninguém atribuído</em>`;
    }

    const selectResp = document.getElementById("select-atribuir-responsavel");
    if (selectResp) {
      selectResp.value = responsavelId ? String(responsavelId) : "";
    }

    const btnAcao = document.getElementById("btn-assumir-responsavel") || document.getElementById("btn-liberar-responsavel");
    if (btnAcao) {
      if (responsavelId === usuario.id) {
        btnAcao.id = "btn-liberar-responsavel";
        btnAcao.textContent = "Liberar";
      } else {
        btnAcao.id = "btn-assumir-responsavel";
        btnAcao.textContent = "Assumir";
      }
    }

    // Exibe toast de confirmação rápido
    const toastStatus = document.getElementById("toast-status-topo");
    if (toastStatus) {
      toastStatus.textContent = "✓ Responsável atualizado.";
      toastStatus.hidden = false;
      clearTimeout(toastStatus._timeout);
      toastStatus._timeout = setTimeout(() => {
        toastStatus.hidden = true;
      }, 2500);
    }

    // 2. Dispara PUT em segundo plano
    try {
      const respAtualizado = await api(`/chamados/${chamado.id}`, { method: "PUT", body: { responsavel_id: responsavelId } });
      if (respAtualizado) {
        chamadoAtual = respAtualizado;
        chamado.responsavel_id = respAtualizado.responsavel_id;
        chamado.responsavel_nome = respAtualizado.responsavel_nome;
        // Se a transição automática mudou para previsto, sincroniza o status no select
        if (respAtualizado.status_id && respAtualizado.status_id !== chamado.status_id) {
          chamado.status_id = respAtualizado.status_id;
          chamado.status_nome = respAtualizado.status_nome;
          chamado.status_cor = respAtualizado.status_cor;
          if (selectStatusTopo) selectStatusTopo.value = String(respAtualizado.status_id);
          const badgeLegenda = document.querySelector(".cabecalho-legendas .badge-status");
          if (badgeLegenda) {
            badgeLegenda.style.background = respAtualizado.status_cor ? respAtualizado.status_cor + "18" : "var(--cor-fundo)";
            badgeLegenda.style.color = respAtualizado.status_cor || "var(--cor-texto)";
            badgeLegenda.style.borderColor = respAtualizado.status_cor ? respAtualizado.status_cor + "55" : "var(--cor-borda)";
            badgeLegenda.innerHTML = `<span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${respAtualizado.status_cor || "var(--cor-primaria)"};"></span>Status: ${escaparHtml(respAtualizado.status_nome)}`;
          }
        }
      }
      // Atualiza o histórico de auditoria em segundo plano
      carregarAuditoria();
    } catch (e) {
      // Reverte em caso de erro
      chamado.responsavel_id = responsavelAnteriorId;
      chamado.responsavel_nome = responsavelAnteriorNome;
      if (spanNomeResp) {
        spanNomeResp.innerHTML = responsavelAnteriorNome
          ? escaparHtml(responsavelAnteriorNome)
          : `<em style="color: var(--cor-texto-secundario); font-weight: normal;">Ninguém atribuído</em>`;
      }
      if (selectResp) selectResp.value = responsavelAnteriorId ? String(responsavelAnteriorId) : "";
      if (toastStatus) toastStatus.hidden = true;
      mostrarErro(document.getElementById("mensagem-erro"), e);
    }
  }

  // Delegação de cliques para botões de assumir e liberar responsável
  document.getElementById("detalhe")?.addEventListener("click", (e) => {
    if (e.target.closest("#btn-assumir-responsavel")) {
      definirResponsavel(usuario.id);
    } else if (e.target.closest("#btn-liberar-responsavel")) {
      definirResponsavel(null);
    }
  });

  document.getElementById("select-atribuir-responsavel")?.addEventListener("change", (e) => {
    const val = e.target.value;
    definirResponsavel(val ? Number(val) : null);
  });

  const acaoContainer = document.getElementById("acao");
  if (ehEtapaAprovacao && !finalizado && permissaoChamados.editar) {
    acaoContainer.hidden = false;
    renderAprovacao(chamado);
  } else {
    acaoContainer.innerHTML = "";
    acaoContainer.hidden = true;
  }
}

// Carregar e gerenciar campos dinâmicos da etapa
async function carregarCamposDinamicos(chamadoRecebido = null, camposPromiseRecebida = null) {
  const secao = document.getElementById("secao-campos-dinamicos");
  const conteudo = document.getElementById("conteudo-campos-dinamicos");
  const btnSalvar = document.getElementById("btn-salvar-campos-dinamicos");
  const msgErro = document.getElementById("msg-erro-campos");
  const msgSucesso = document.getElementById("msg-sucesso-campos");

  try {
    const camposComValores = camposPromiseRecebida
      ? await camposPromiseRecebida
      : await api(`/chamados/${id}/campos`);

    if (!Array.isArray(camposComValores) || camposComValores.length === 0) {
      secao.hidden = true;
      return;
    }

    secao.hidden = false;

    // Obter dados do chamado sem fazer requisição extra duplicada
    const chamado = chamadoRecebido || (await api(`/chamados/${id}`));
    const ehMae = chamado.chamado_mae_id == null;
    const ehSolicitante = usuario.id === chamado.solicitante_id;
    const ehAdmin = usuario.admin === 1;
    const statusFinalizado = String(chamado.status_nome || "").toLowerCase() === "finalizado";
    const podeEditar = (!ehMae || ehSolicitante || ehAdmin) && !statusFinalizado;

    btnSalvar.hidden = !podeEditar;

    const ladoEsquerdo = document.querySelector("#cabecalho-campos-dinamicos .cabecalho-lado-esquerdo");
    if (ladoEsquerdo) {
      ladoEsquerdo.innerHTML = `
        <h2 class="cabecalho-titulo">📋 Campos da Solicitação / Etapa</h2>
        <div class="cabecalho-legendas">
          <span class="badge-status badge-legenda badge-legenda-secundaria">
            ${camposComValores.length} campo(s)
          </span>
          ${chamado.chamado_mae_id ? '<span class="badge-status badge-legenda badge-legenda-secundaria">Etapa do Fluxo</span>' : '<span class="badge-status badge-legenda badge-legenda-secundaria">Solicitação Original</span>'}
        </div>
      `;
    }

    conteudo.innerHTML = `
      <form id="form-campos-dinamicos" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 0.85rem;">
        ${camposComValores
          .map((c) => {
            const ehSomenteLeitura = c.somente_leitura || c.da_solicitacao;
            const disabledAttr = (podeEditar && !ehSomenteLeitura) ? "" : "disabled";
            const val = c.valor != null ? String(c.valor) : "";
            const tipoNorm = String(c.tipo || "texto").toLowerCase();
            let inputHtml = "";

            if (tipoNorm === "texto_longo" || tipoNorm === "textarea") {
              inputHtml = `<textarea name="campo_${c.id}" data-id="${c.id}" data-nome="${c.nome}" ${disabledAttr} rows="3" class="textarea-padrao" style="width: 100%;">${escaparHtml(val)}</textarea>`;
            } else if (tipoNorm === "numero" || tipoNorm === "number") {
              inputHtml = `<input type="number" step="any" name="campo_${c.id}" data-id="${c.id}" data-nome="${c.nome}" value="${escaparHtml(val)}" ${disabledAttr} class="input-padrao" style="width: 100%;">`;
            } else if (tipoNorm === "data" || tipoNorm === "date") {
              let dateVal = val.trim();
              if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateVal)) {
                const [d, m, y] = dateVal.split("/");
                dateVal = `${y}-${m}-${d}`;
              } else if (dateVal.length > 10) {
                dateVal = dateVal.slice(0, 10);
              }
              inputHtml = `<input type="date" name="campo_${c.id}" data-id="${c.id}" data-nome="${c.nome}" value="${escaparHtml(dateVal)}" ${disabledAttr} class="input-padrao" style="width: 100%;">`;
            } else if (tipoNorm === "checkbox") {
              const checkedAttr = val === "sim" || val === "true" || val === "1" ? "checked" : "";
              inputHtml = `
                <div class="campo-fixo-exibicao" style="font-weight: normal; cursor: pointer;">
                  <label style="display: flex; align-items: center; gap: 0.5rem; width: 100%; cursor: pointer; margin: 0;">
                    <input type="checkbox" name="campo_${c.id}" data-id="${c.id}" data-nome="${c.nome}" value="sim" ${checkedAttr} ${disabledAttr}>
                    <span>Marcar para confirmar</span>
                  </label>
                </div>
              `;
            } else if (tipoNorm === "sim_nao") {
              inputHtml = `
                <select name="campo_${c.id}" data-id="${c.id}" data-nome="${c.nome}" ${disabledAttr} class="select-padrao" style="width: 100%;">
                  <option value="">Selecione…</option>
                  <option value="sim" ${val === "sim" ? "selected" : ""}>Sim</option>
                  <option value="nao" ${val === "nao" ? "selected" : ""}>Não</option>
                </select>
              `;
            } else if (tipoNorm === "selecao" || tipoNorm === "select") {
              let opcoes = Array.isArray(c.opcoes_parsed) && c.opcoes_parsed.length > 0 ? c.opcoes_parsed : [];
              if (opcoes.length === 0 && (c.opcoes_json || c.opcoes)) {
                try {
                  const parsed = JSON.parse(c.opcoes_json || c.opcoes);
                  if (Array.isArray(parsed)) opcoes = parsed;
                } catch (_) {}
              }
              inputHtml = `
                <select name="campo_${c.id}" data-id="${c.id}" data-nome="${c.nome}" ${disabledAttr} class="select-padrao" style="width: 100%;">
                  <option value="">Selecione…</option>
                  ${opcoes.map((op) => `<option value="${escaparHtml(op)}" ${String(op) === String(val) ? "selected" : ""}>${escaparHtml(op)}</option>`).join("")}
                </select>
              `;
            } else {
              // texto simples
              inputHtml = `<input type="text" name="campo_${c.id}" data-id="${c.id}" data-nome="${c.nome}" value="${escaparHtml(val)}" ${disabledAttr} class="input-padrao" style="width: 100%;">`;
            }

            const solicitacaoBadge = c.da_solicitacao
              ? `<span style="font-size: 0.72rem; font-weight: normal; background: var(--cor-fundo-elevado); color: var(--cor-texto-secundario); padding: 0.15rem 0.45rem; border-radius: 3px; border: 1px solid var(--cor-borda); margin-left: 0.4rem;">Solicitação</span>`
              : "";

            return `
              <div class="campo-grupo" style="margin-bottom: 0;">
                <label class="campo-rotulo" style="font-weight: 600; font-size: 0.88rem; display: block; margin-bottom: 0.3rem;">
                  ${escaparHtml(c.rotulo)} ${c.obrigatorio ? '<span class="campo-obrigatorio">*</span>' : ""}${solicitacaoBadge}
                </label>
                ${inputHtml}
              </div>
            `;
          })
          .join("")}
      </form>
    `;

    btnSalvar.onclick = async () => {
      msgErro.hidden = true;
      if (msgSucesso) msgSucesso.hidden = true;

      const form = document.getElementById("form-campos-dinamicos");
      const valores = {};
      for (const c of camposComValores) {
        const el = form.elements[`campo_${c.id}`] || form.querySelector(`[data-id="${c.id}"]`);
        if (el) {
          const v = el.type === "checkbox" ? (el.checked ? "sim" : "nao") : el.value;
          valores[c.id] = v;
          valores[c.nome] = v;
        }
      }

      btnSalvar.disabled = true;
      btnSalvar.textContent = "Salvando…";

      try {
        await api(`/chamados/${id}/campos`, {
          method: "PUT",
          body: { valores },
        });
        await carregarCamposDinamicos();
        if (msgSucesso) {
          msgSucesso.textContent = "✓ Campos salvos com sucesso.";
          msgSucesso.hidden = false;
          setTimeout(() => (msgSucesso.hidden = true), 3000);
        }
        carregarAuditoria();
      } catch (err) {
        msgErro.textContent = err.message || "Erro ao salvar campos.";
        msgErro.hidden = false;
      } finally {
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Salvar alterações";
      }
    };
  } catch (err) {
    secao.hidden = true;
  }
}

// Configuração unificada de formulário para Comentários + Anexos
function configurarFormularioComentariosEAnexos() {
  const formComentario = document.getElementById("form-comentario");
  if (!formComentario) return;
  if (formComentario.dataset.listenerConfigurado) return;
  formComentario.dataset.listenerConfigurado = "true";

  const textareaComentario = document.getElementById("textarea-comentario");
  const inputArquivo = document.getElementById("input-arquivo-anexo");
  const previewAnexoWrap = document.getElementById("preview-anexo-wrap");
  const msgErroAnexo = document.getElementById("msg-erro-anexo");
  const btnSubmit = document.getElementById("btn-submit-comentario");

  const previewPrintWrap = document.getElementById("preview-print-comentario");
  const imgPreviewPrint = document.getElementById("img-preview-print");
  const nomePrintComentario = document.getElementById("nome-print-comentario");
  const btnRemoverPrint = document.getElementById("btn-remover-print");

  let arquivoSelecionado = null;
  let printColado = null;

  function limparArquivo() {
    arquivoSelecionado = null;
    if (inputArquivo) inputArquivo.value = "";
    if (previewAnexoWrap) {
      previewAnexoWrap.innerHTML = "";
      previewAnexoWrap.hidden = true;
    }
  }

  function limparPrint() {
    printColado = null;
    if (previewPrintWrap) previewPrintWrap.hidden = true;
    if (imgPreviewPrint) imgPreviewPrint.src = "";
    if (nomePrintComentario) nomePrintComentario.textContent = "";
  }

  if (btnRemoverPrint) {
    btnRemoverPrint.addEventListener("click", limparPrint);
  }

  if (inputArquivo) {
    inputArquivo.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) {
        limparArquivo();
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        if (msgErroAnexo) {
          msgErroAnexo.textContent = "O arquivo excede o limite máximo permitido de 2MB.";
          msgErroAnexo.hidden = false;
        }
        limparArquivo();
        return;
      }
      if (msgErroAnexo) msgErroAnexo.hidden = true;
      arquivoSelecionado = file;

      if (previewAnexoWrap) {
        previewAnexoWrap.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; background: var(--cor-fundo-elevado); padding: 0.4rem 0.6rem; border-radius: 4px; border: 1px solid var(--cor-borda); font-size: 0.85rem;">
            <span>📎 <strong>${escaparHtml(file.name)}</strong> (${formatarTamanho(file.size)})</span>
            <button type="button" class="btn-icone btn-icone--excluir btn-remover-arquivo" title="Remover anexo">✕</button>
          </div>
        `;
        previewAnexoWrap.hidden = false;
        previewAnexoWrap.querySelector(".btn-remover-arquivo")?.addEventListener("click", limparArquivo);
      }
    });
  }

  if (textareaComentario) {
    textareaComentario.addEventListener("paste", (e) => {
      capturarImagemDoClipboard(e, (blob) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const nomeArquivo = `print_${timestamp}.png`;
        printColado = { file: blob, nome: nomeArquivo };

        if (previewPrintWrap && imgPreviewPrint) {
          const reader = new FileReader();
          reader.onload = () => {
            imgPreviewPrint.src = reader.result;
            if (nomePrintComentario) nomePrintComentario.textContent = nomeArquivo;
            previewPrintWrap.hidden = false;
          };
          reader.readAsDataURL(blob);
        }
      });
    });
  }

  if (formComentario) {
    formComentario.addEventListener("submit", async (e) => {
      e.preventDefault();
      const texto = textareaComentario ? textareaComentario.value.trim() : "";
      const ehPrivado = document.getElementById("check-comentario-privado")?.checked || false;

      if (!texto && !arquivoSelecionado && !printColado) {
        return;
      }

      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.textContent = "Enviando…";
      }

      try {
        // Enviar anexo selecionado
        if (arquivoSelecionado) {
          const leitor = new FileReader();
          await new Promise((resolve, reject) => {
            leitor.onload = async () => {
              try {
                const base64 = leitor.result.split(",")[1];
                await api(`/chamados/${id}/anexos`, {
                  method: "POST",
                  body: {
                    nome_arquivo: arquivoSelecionado.name,
                    mime_type: arquivoSelecionado.type || "application/octet-stream",
                    tamanho_bytes: arquivoSelecionado.size,
                    conteudo_base64: base64,
                    eh_privado: ehPrivado,
                    texto: texto,
                  },
                });
                resolve();
              } catch (err) {
                reject(err);
              }
            };
            leitor.onerror = reject;
            leitor.readAsDataURL(arquivoSelecionado);
          });
        } else if (printColado && printColado.file) {
          // Enviar print colado
          const leitorPrint = new FileReader();
          await new Promise((resolve, reject) => {
            leitorPrint.onload = async () => {
              try {
                const base64 = leitorPrint.result.split(",")[1];
                await api(`/chamados/${id}/anexos`, {
                  method: "POST",
                  body: {
                    nome_arquivo: printColado.nome,
                    mime_type: printColado.file.type || "image/png",
                    tamanho_bytes: printColado.file.size,
                    conteudo_base64: base64,
                    eh_privado: ehPrivado,
                    texto: texto,
                  },
                });
                resolve();
              } catch (err) {
                reject(err);
              }
            };
            leitorPrint.onerror = reject;
            leitorPrint.readAsDataURL(printColado.file);
          });
        } else if (texto) {
          // Apenas comentário textual
          await api(`/chamados/${id}/comentarios`, {
            method: "POST",
            body: {
              texto: texto,
              eh_privado: ehPrivado,
            },
          });
        }

        formComentario.reset();
        limparArquivo();
        limparPrint();
        if (document.getElementById("check-comentario-privado")) {
          document.getElementById("check-comentario-privado").checked = false;
        }

        await carregarComentariosEAnexos();
        carregarAuditoria();
      } catch (err) {
        mostrarErro(document.getElementById("mensagem-erro"), err);
      } finally {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.textContent = "Enviar comentário";
        }
      }
    });
  }
}

// Helper para verificar se o anexo é uma imagem visualizável diretamente
function ehArquivoImagem(nomeArquivo, mimeType = "") {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const extensoes = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"];
  const nome = String(nomeArquivo || "").toLowerCase();
  return extensoes.some((ext) => nome.endsWith(ext));
}

// Modal / Lightbox para pré-visualização direta de imagens anexadas
async function abrirModalVisualizarImagem(anexoId, nomeArquivo) {
  let container = document.getElementById("modal-imagem-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "modal-imagem-container";
    document.body.appendChild(container);
  }

  container.innerHTML = `
    <div class="modal-imagem-overlay" id="overlay-imagem" role="dialog" aria-modal="true">
      <div class="modal-imagem-dialog">
        <div class="modal-imagem-header">
          <strong style="font-size: 0.95rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 65vw;">
            🖼️ ${escaparHtml(nomeArquivo)}
          </strong>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <button type="button" class="btn btn-secundario btn-pequeno" id="btn-baixar-imagem-modal">📥 Baixar</button>
            <button type="button" class="btn-icone" id="btn-fechar-modal-imagem" aria-label="Fechar visualização">✕</button>
          </div>
        </div>
        <div class="modal-imagem-body">
          <div id="modal-imagem-loading" style="padding: 2.5rem; color: var(--cor-texto-secundario); font-size: 0.9rem;">
            Carregando imagem...
          </div>
          <img id="modal-imagem-tag" class="modal-imagem-preview" src="" alt="${escaparAtributo(nomeArquivo)}" style="display: none;" />
        </div>
      </div>
    </div>
  `;

  const fechar = () => {
    container.innerHTML = "";
    document.removeEventListener("keydown", onKeyDown);
  };
  const onKeyDown = (e) => {
    if (e.key === "Escape") fechar();
  };
  document.addEventListener("keydown", onKeyDown);

  document.getElementById("btn-fechar-modal-imagem")?.addEventListener("click", fechar);
  document.getElementById("overlay-imagem")?.addEventListener("click", (e) => {
    if (e.target.id === "overlay-imagem") fechar();
  });

  try {
    const dados = await api(`/chamados/${id}/anexos?anexo_id=${anexoId}`);
    const imgEl = document.getElementById("modal-imagem-tag");
    const loadingEl = document.getElementById("modal-imagem-loading");
    const btnBaixar = document.getElementById("btn-baixar-imagem-modal");

    if (imgEl && loadingEl) {
      const src = `data:${dados.mime_type || "image/png"};base64,${dados.conteudo_base64}`;
      imgEl.src = src;
      imgEl.style.display = "block";
      loadingEl.style.display = "none";

      if (btnBaixar) {
        btnBaixar.onclick = () => {
          const link = document.createElement("a");
          link.href = src;
          link.download = dados.nome_arquivo || nomeArquivo;
          link.click();
        };
      }
    }
  } catch (e) {
    const loadingEl = document.getElementById("modal-imagem-loading");
    if (loadingEl) {
      loadingEl.textContent = "Erro ao carregar pré-visualização da imagem.";
    }
  }
}

// Carregar feed integrado de Comentários e Anexos
async function carregarComentariosEAnexos(chamadoRecebido = null) {
  const listaEl = document.getElementById("lista-comentarios");
  const resumoEl = document.getElementById("resumo-anexos");
  if (!listaEl) return;

  const chamadoInfo = chamadoRecebido || chamadoAtual;
  const finalizado = Boolean(
    chamadoInfo?.data_finalizacao ||
    String(chamadoInfo?.status_nome || "").toLowerCase() === "finalizado"
  );

  try {
    const [comentarios, anexos] = await Promise.all([
      api(`/chamados/${id}/comentarios`).catch(() => []),
      api(`/chamados/${id}/anexos`).catch(() => []),
    ]);

    const totalBytes = anexos.reduce((acc, a) => acc + (a.tamanho_bytes || 0), 0);
    if (resumoEl) {
      if (anexos.length > 0) {
        resumoEl.textContent = `📎 ${anexos.length} anexo(s) (${formatarTamanho(totalBytes)})`;
        resumoEl.hidden = false;
      } else {
        resumoEl.textContent = "";
        resumoEl.hidden = true;
      }
    }

    if (comentarios.length === 0 && anexos.length === 0) {
      listaEl.innerHTML = `<li style="color: var(--cor-texto-secundario); font-size: 0.9rem; text-align: center; padding: 1rem 0;">Nenhum comentário ou anexo ainda.</li>`;
      return;
    }

    let htmlItens = "";

    // Exibir primeiro a barra de anexos disponíveis caso existam
    if (anexos.length > 0) {
      htmlItens += `
        <li style="background: var(--cor-fundo-elevado); border: 1px dashed var(--cor-borda); border-radius: 6px; padding: 0.65rem 0.85rem; margin-bottom: 0.5rem;">
          <span style="font-size: 0.82rem; font-weight: 700; color: var(--cor-texto-secundario); text-transform: uppercase; display: block; margin-bottom: 0.4rem;">
            📎 Arquivos anexados (${anexos.length}):
          </span>
          <div style="display: flex; flex-wrap: wrap; gap: 0.4rem;">
            ${anexos
              .map((a) => {
                const ehImagem = ehArquivoImagem(a.nome_arquivo, a.mime_type);
                // Regra: Somente quem adicionou o anexo pode remover, e somente pode remover se a atividade NÃO foi finalizada ainda
                const podeRemoverAnexo = !finalizado && a.usuario_id === usuario.id;

                return `
                  <div style="display: inline-flex; align-items: center; gap: 0.35rem; background: var(--cor-fundo); border: 1px solid var(--cor-borda); padding: 0.25rem 0.55rem; border-radius: 4px; font-size: 0.82rem;">
                    <span>${ehImagem ? "🖼️" : "📄"} <strong>${escaparHtml(a.nome_arquivo)}</strong> <small style="color: var(--cor-texto-secundario);">(${formatarTamanho(a.tamanho_bytes)})</small></span>
                    ${
                      ehImagem
                        ? `<button type="button" class="btn btn-primario btn-pequeno btn-ver-imagem-anexo" data-id="${a.id}" data-nome="${escaparAtributo(a.nome_arquivo)}" style="padding: 0.15rem 0.5rem; font-size: 0.78rem;">👁️ Ver</button>`
                        : ""
                    }
                    <button type="button" class="btn btn-secundario btn-pequeno btn-baixar-anexo" data-id="${a.id}" style="padding: 0.15rem 0.45rem; font-size: 0.78rem;">Baixar</button>
                    ${
                      podeRemoverAnexo
                        ? `<button type="button" class="btn btn-perigo btn-pequeno btn-excluir-anexo" data-id="${a.id}" title="Excluir anexo" style="padding: 0.15rem 0.45rem; font-size: 0.78rem;">✕</button>`
                        : ""
                    }
                  </div>
                `;
              })
              .join("")}
          </div>
        </li>
      `;
    }

    // Exibir timeline de comentários
    htmlItens += comentarios
      .map((c) => {
        const ehPrivadoBadge = c.eh_privado
          ? `<span class="badge-status" style="background: #fee2e2; color: #991b1b; font-size: 0.72rem; margin-left: 0.4rem;">🔒 Privado</span>`
          : "";

        // Regra: Comentários só podem ser excluídos se a atividade ainda NÃO finalizou, e somente pelo autor
        const podeRemoverComentario = !finalizado && c.usuario_id === usuario.id;

        return `
          <li style="padding: 0.65rem 0.85rem; background: var(--cor-fundo); border: 1px solid var(--cor-borda); border-radius: 0.35rem; font-size: 0.9rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem;">
              <strong>${escaparHtml(c.usuario_nome ?? "Sistema")}${ehPrivadoBadge}</strong>
              <div style="display: flex; align-items: center; gap: 0.4rem;">
                <span style="color: var(--cor-texto-secundario); font-size: 0.8rem;">
                  ${formatarDataBR(c.data)}${c.eh_justificativa ? " - justificativa" : ""}
                </span>
                ${
                  podeRemoverComentario
                    ? `<button type="button" class="btn-icone btn-icone--excluir btn-excluir-comentario" data-id="${c.id}" title="Excluir comentário" style="font-size: 0.8rem; padding: 0.1rem 0.3rem;">✕</button>`
                    : ""
                }
              </div>
            </div>
            <div style="line-height: 1.45; white-space: pre-wrap;">${escaparHtml(c.texto)}</div>
          </li>
        `;
      })
      .join("");

    listaEl.innerHTML = htmlItens;

    // Listeners para visualização direta de imagens em tela cheia / lightbox
    listaEl.querySelectorAll(".btn-ver-imagem-anexo").forEach((btn) => {
      btn.addEventListener("click", () => {
        const anexoId = btn.dataset.id;
        const nomeArquivo = btn.dataset.nome || "Imagem";
        abrirModalVisualizarImagem(anexoId, nomeArquivo);
      });
    });

    // Listeners de download e exclusão de anexo
    listaEl.querySelectorAll(".btn-baixar-anexo").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const anexoId = btn.dataset.id;
        try {
          const dados = await api(`/chamados/${id}/anexos?anexo_id=${anexoId}`);
          const link = document.createElement("a");
          link.href = `data:${dados.mime_type};base64,${dados.conteudo_base64}`;
          link.download = dados.nome_arquivo;
          link.click();
        } catch (e) {
          mostrarErro(document.getElementById("mensagem-erro"), e);
        }
      });
    });

    listaEl.querySelectorAll(".btn-excluir-anexo").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const anexoId = btn.dataset.id;
        const confirmado = await confirmarAcao(
          "Excluir este arquivo anexo?",
          "Tem certeza que deseja remover este anexo? Esta ação não pode ser desfeita."
        );
        if (!confirmado) return;
        try {
          await api(`/chamados/${id}/anexos?anexo_id=${anexoId}`, { method: "DELETE" });
          await carregarComentariosEAnexos();
          carregarAuditoria();
        } catch (e) {
          mostrarErro(document.getElementById("mensagem-erro"), e);
        }
      });
    });

    // Listeners para exclusão de comentário
    listaEl.querySelectorAll(".btn-excluir-comentario").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const comentarioId = btn.dataset.id;
        const confirmado = await confirmarAcao(
          "Excluir este comentário?",
          "Tem certeza que deseja remover este comentário? Esta ação não pode ser desfeita."
        );
        if (!confirmado) return;
        try {
          await api(`/chamados/${id}/comentarios?comentario_id=${comentarioId}`, { method: "DELETE" });
          await carregarComentariosEAnexos();
          carregarAuditoria();
        } catch (e) {
          mostrarErro(document.getElementById("mensagem-erro"), e);
        }
      });
    });
  } catch (err) {
    listaEl.innerHTML = `<li style="color: var(--cor-texto-secundario); font-size: 0.9rem;">Erro ao carregar comentários.</li>`;
  }
}

// Atualizar indicador de total de horas no card de comentários
async function atualizarResumoHoras() {
  const el = document.getElementById("indicador-horas-topo");
  if (!el) return;
  try {
    const resumo = await api(`/chamados/${id}/horas`);
    const total = Number(resumo.total_horas) || 0;
    if (total > 0) {
      el.textContent = `⏱️ ${total}h apontadas`;
      el.hidden = false;
    } else {
      el.textContent = "";
      el.hidden = true;
    }
  } catch (_) {
    el.textContent = "";
    el.hidden = true;
  }
}

// Abrir tela suspensa (modal flutuante) para apontamento rápido de horas
export async function abrirModalHoras() {
  let container = document.getElementById("modal-horas-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "modal-horas-container";
    document.body.appendChild(container);
  }

  const chamadoId = id || new URLSearchParams(window.location.search).get("id");
  const hoje = new Date().toISOString().slice(0, 10);

  // Renderização instantânea do modal sem bloquear pela rede
  container.innerHTML = `
    <div class="modal-horas-overlay" id="overlay-horas" role="dialog" aria-modal="true">
      <div class="modal-horas-dialog">
        <div class="modal-horas-header">
          <h3 style="margin: 0; font-size: 1.1rem; display: flex; align-items: center; gap: 0.4rem;">
            <span>⏱️</span> Apontamento Rápido de Horas
          </h3>
          <button type="button" class="btn-icone" id="btn-fechar-modal-horas" aria-label="Fechar modal">✕</button>
        </div>

        <div class="modal-horas-body">
          <p id="msg-erro-modal-horas" class="erro" hidden></p>
          <div id="toast-sucesso-horas" class="toast-status-rapido" style="margin-bottom: 0.75rem;" hidden>✓ Horas apontadas com sucesso.</div>

          <!-- Total Destaque -->
          <div style="background: var(--cor-fundo); border: 1px solid var(--cor-borda); border-radius: 6px; padding: 0.65rem 0.85rem; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.88rem; color: var(--cor-texto-secundario);">Total apontado neste chamado:</span>
            <strong id="modal-horas-total-destaque" style="font-size: 1.1rem; color: var(--cor-primaria);">Carregando...</strong>
          </div>

          <!-- Formulário de Apontamento -->
          <form id="form-modal-horas" style="display: flex; flex-direction: column; gap: 0.85rem;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
              <div class="campo-grupo" style="margin: 0;">
                <label class="campo-rotulo" for="modal-campo-horas-data">Data *</label>
                <input type="date" id="modal-campo-horas-data" required class="input-padrao" value="${hoje}">
              </div>
              <div class="campo-grupo" style="margin: 0;">
                <label class="campo-rotulo" for="modal-campo-horas-qtd">Horas *</label>
                <input type="number" step="0.25" min="0.25" id="modal-campo-horas-qtd" required placeholder="Ex: 1.5" class="input-padrao" autofocus>
              </div>
            </div>

            <!-- Botões Rápidos de Tempo -->
            <div>
              <span style="font-size: 0.78rem; font-weight: 600; color: var(--cor-texto-secundario); display: block; margin-bottom: 0.3rem;">Adição rápida:</span>
              <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
                <button type="button" class="btn-tempo-rapido-modal btn btn-secundario btn-pequeno" data-horas="0.25">+15m</button>
                <button type="button" class="btn-tempo-rapido-modal btn btn-secundario btn-pequeno" data-horas="0.5">+30m</button>
                <button type="button" class="btn-tempo-rapido-modal btn btn-secundario btn-pequeno" data-horas="1.0">+1h</button>
                <button type="button" class="btn-tempo-rapido-modal btn btn-secundario btn-pequeno" data-horas="2.0">+2h</button>
                <button type="button" class="btn-tempo-rapido-modal btn btn-secundario btn-pequeno" data-horas="4.0">+4h</button>
              </div>
            </div>

            <div class="campo-grupo" style="margin: 0;">
              <label class="campo-rotulo" for="modal-campo-horas-obs">Observação / Atividade</label>
              <input type="text" id="modal-campo-horas-obs" placeholder="Descrição do trabalho executado..." class="input-padrao">
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem;">
              <button type="button" id="btn-cancelar-modal-horas" class="btn btn-secundario">Cancelar</button>
              <button type="submit" class="btn btn-primario" id="btn-submit-modal-horas">Salvar apontamento</button>
            </div>
          </form>

          <!-- Histórico de Lançamentos -->
          <div style="margin-top: 1.15rem; border-top: 1px solid var(--cor-borda); padding-top: 0.85rem;">
            <span style="font-size: 0.8rem; font-weight: 700; color: var(--cor-texto-secundario); text-transform: uppercase;">Últimos apontamentos:</span>
            <ul id="modal-lista-horas" style="list-style: none; padding: 0; margin: 0.5rem 0 0; max-height: 140px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.3rem;">
              <li style="color: var(--cor-texto-secundario); font-size: 0.85rem;">Carregando histórico...</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  `;

  const overlay = document.getElementById("overlay-horas");
  const fechar = () => {
    container.innerHTML = "";
    document.removeEventListener("keydown", onKeyDown);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") fechar();
  };
  document.addEventListener("keydown", onKeyDown);

  document.getElementById("btn-fechar-modal-horas")?.addEventListener("click", fechar);
  document.getElementById("btn-cancelar-modal-horas")?.addEventListener("click", fechar);
  overlay?.addEventListener("click", (e) => {
    if (e.target === overlay) fechar();
  });

  const campoQtd = document.getElementById("modal-campo-horas-qtd");
  container.querySelectorAll(".btn-tempo-rapido-modal").forEach((btn) => {
    btn.addEventListener("click", () => {
      const incremento = Number(btn.dataset.horas) || 0;
      if (campoQtd) {
        const atual = Number(campoQtd.value) || 0;
        const total = atual > 0 ? atual + incremento : incremento;
        campoQtd.value = total % 1 === 0 ? total.toFixed(1) : total.toString();
        campoQtd.focus();
      }
    });
  });

  // Carrega histórico e total em background sem travar abertura da tela
  if (chamadoId) {
    api(`/chamados/${chamadoId}/horas`)
      .then((resumoHoras) => {
        const elDestaque = document.getElementById("modal-horas-total-destaque");
        const elLista = document.getElementById("modal-lista-horas");
        if (elDestaque) {
          elDestaque.textContent = `${resumoHoras.total_horas || 0}h`;
        }
        if (elLista) {
          if (!resumoHoras.lancamentos || resumoHoras.lancamentos.length === 0) {
            elLista.innerHTML = `<li style="color: var(--cor-texto-secundario); font-size: 0.85rem;">Nenhum apontamento registrado ainda.</li>`;
          } else {
            elLista.innerHTML = resumoHoras.lancamentos
              .map(
                (l) =>
                  `<li style="padding: 0.35rem 0.5rem; background: var(--cor-fundo); border-radius: 4px; font-size: 0.85rem; border: 1px solid var(--cor-borda);">
                     <strong>${formatarDataBR(l.data)}</strong> - <strong>${l.horas}h</strong> por ${escaparHtml(l.usuario_nome || "Usuário")} ${l.observacao ? `<em>(${escaparHtml(l.observacao)})</em>` : ""}
                   </li>`
              )
              .join("");
          }
        }
      })
      .catch(() => {
        const elDestaque = document.getElementById("modal-horas-total-destaque");
        const elLista = document.getElementById("modal-lista-horas");
        if (elDestaque) elDestaque.textContent = "0h";
        if (elLista) elLista.innerHTML = `<li style="color: var(--cor-texto-secundario); font-size: 0.85rem;">Nenhum apontamento registrado ainda.</li>`;
      });
  }

  const formModal = document.getElementById("form-modal-horas");
  formModal?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const dataVal = document.getElementById("modal-campo-horas-data").value;
    const horasVal = Number(campoQtd.value);
    const obsVal = document.getElementById("modal-campo-horas-obs").value.trim() || null;
    const msgErro = document.getElementById("msg-erro-modal-horas");
    const btnSubmit = document.getElementById("btn-submit-modal-horas");

    if (!dataVal || !horasVal) return;

    btnSubmit.disabled = true;
    btnSubmit.textContent = "Salvando...";

    try {
      await api(`/chamados/${chamadoId}/horas`, {
        method: "POST",
        body: {
          data: dataVal,
          horas: horasVal,
          observacao: obsVal,
        },
      });

      await Promise.all([
        atualizarResumoHoras(),
        carregarAuditoria(),
      ]);
      fechar();
    } catch (err) {
      if (msgErro) {
        msgErro.textContent = err.message || "Erro ao apontar horas.";
        msgErro.hidden = false;
      }
      btnSubmit.disabled = false;
      btnSubmit.textContent = "Salvar apontamento";
    }
  });
}

// Ouvinte de clique delegado no documento para garantir disparo imediato do botão apontar horas
document.addEventListener("click", (e) => {
  const btn = e.target.closest("#btn-abrir-modal-horas");
  if (btn) {
    e.preventDefault();
    abrirModalHoras();
  }
});

// Carregar histórico unificado de auditoria
async function carregarAuditoria() {
  const listaEl = document.getElementById("lista-historico-auditoria");
  if (!listaEl) return;
  try {
    const historico = await api(`/chamados/${id}/historico`);
    if (!Array.isArray(historico) || historico.length === 0) {
      listaEl.innerHTML = `<li style="color: var(--cor-texto-secundario); font-size: 0.9rem;">Nenhum registro de auditoria disponível.</li>`;
      return;
    }

    listaEl.innerHTML = historico
      .map((item) => {
        let dataFormatada = "-";
        if (item.criado_em) {
          const partes = item.criado_em.slice(0, 19).replace("T", " ").split(" ");
          const dataBR = formatarDataBR(partes[0]);
          const hora = partes[1] ? partes[1].slice(0, 5) : "";
          dataFormatada = `${dataBR} ${hora}`.trim();
        }
        return `
          <li style="font-size: 0.88rem; border-left: 3px solid var(--cor-primaria); padding: 0.35rem 0.6rem; background: var(--cor-fundo);">
            <div style="display: flex; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.2rem;">
              <strong style="color: var(--cor-primaria);">${escaparHtml(item.usuario_nome || "Sistema")}</strong>
              <span style="color: var(--cor-texto-secundario); font-size: 0.8rem;">${dataFormatada}</span>
            </div>
            <div style="color: var(--cor-texto);">${escaparHtml(item.detalhes)}</div>
          </li>
        `;
      })
      .join("");
  } catch (err) {
    listaEl.innerHTML = `<li style="color: var(--cor-texto-secundario); font-size: 0.88rem;">Não foi possível carregar o histórico de auditoria.</li>`;
  }
}

async function renderAprovacao(chamado) {
  let etapa = null;
  try {
    etapa = await api(`/etapas/${chamado.etapa_id}`);
  } catch (e) {
    return;
  }
  const acaoContainer = document.getElementById("acao");
  if (!acaoContainer) return;

  const acoesList = etapa.acoes || [];

  acaoContainer.innerHTML = `
    <div class="formulario-secao-cabecalho" style="margin-bottom: 0.85rem;">
      <h3 style="margin: 0; font-size: 1.15rem; display: flex; align-items: center; gap: 0.45rem;">
        <span>⚖️</span> Avaliação da Tarefa / Etapa
        ${info("Aprova a solicitação e libera a próxima etapa do fluxo automaticamente, ou reprova e encerra a cadeia.")}
      </h3>
      <span class="badge-status" style="background: rgba(47, 111, 79, 0.1); color: var(--cor-primaria); border: 1px solid rgba(47, 111, 79, 0.25); font-weight: 700; font-size: 0.8rem;">
        Etapa de Decisão
      </span>
    </div>

    ${
      acoesList.length > 0
        ? `
        <div style="margin-bottom: 1.25rem;">
          <label class="campo-rotulo" style="font-weight: 600; margin-bottom: 0.35rem; color: var(--cor-texto);">
            Ações a executar se aprovado:
          </label>
          <p style="font-size: 0.82rem; color: var(--cor-texto-secundario); margin: 0 0 0.65rem;">
            Marque as ações desejadas e, se necessário, informe uma observação ou orientação de como executar cada uma:
          </p>
          <div style="display: flex; flex-direction: column; gap: 0.65rem;">
            ${acoesList
              .map(
                (a) => `
                <div class="card-acao-decisao" style="background: var(--cor-fundo-elevado); border: 1px solid var(--cor-borda); border-radius: 6px; padding: 0.65rem 0.85rem;">
                  <label class="acao-checkbox-item" style="display: flex; align-items: center; gap: 0.6rem; cursor: pointer; font-weight: 600; font-size: 0.92rem; margin: 0;">
                    <input type="checkbox" name="acao-${a.id}" value="${a.id}" class="check-acao-decisao" style="width: 17px; height: 17px; cursor: pointer;">
                    <span>${escaparHtml(a.rotulo)}</span>
                    <span style="font-size: 0.75rem; color: var(--cor-texto-secundario); font-weight: normal; margin-left: auto;">${a.vinculo === "mae" ? "Vínculo: Chamado mãe" : "Vínculo: Chamado pai"}</span>
                  </label>
                  ${a.observacao ? `<div style="font-size: 0.8rem; color: var(--cor-texto-secundario); margin: 0.25rem 0 0 1.65rem;">💡 <em>Orientação pré-definida: ${escaparHtml(a.observacao)}</em></div>` : ""}
                  <div class="wrap-obs-acao" id="wrap-obs-acao-${a.id}" style="margin-top: 0.45rem; margin-left: 1.65rem;" hidden>
                    <label style="font-size: 0.78rem; font-weight: 600; color: var(--cor-texto-secundario); display: block; margin-bottom: 0.2rem;">
                      Observação / Orientação de como fazer esta ação:
                    </label>
                    <textarea 
                      name="obs-acao-${a.id}" 
                      rows="2" 
                      class="textarea-padrao" 
                      placeholder="Instruções ou orientações de como fazer esta ação..."
                      style="width: 100%; font-size: 0.85rem;"
                    >${escaparHtml(a.observacao || "")}</textarea>
                  </div>
                </div>
              `
              )
              .join("")}
          </div>
        </div>
      `
        : ""
    }

    <!-- Bloco de Justificativa para Reprovação -->
    <div class="bloco-justificativa-reprovacao" style="margin-bottom: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.35rem;">
        <label for="justificativa" style="font-weight: 600; font-size: 0.88rem; color: var(--cor-texto); margin: 0;">
          Justificativa <span style="font-weight: normal; color: var(--cor-texto-secundario); font-size: 0.82rem;">(obrigatória apenas se reprovar)</span>
        </label>
        <span style="font-size: 0.78rem; color: var(--cor-texto-secundario);">Ficará registrada no histórico e comentários</span>
      </div>
      <textarea id="justificativa" class="textarea-padrao" rows="2" style="width: 100%; resize: vertical;" placeholder="Informe o motivo da reprovação detalhado..."></textarea>
    </div>

    <!-- Painel de Botões de Ação Padronizados -->
    <div class="painel-acoes-decisao">
      <button type="button" id="btn-aprovar" class="btn btn-decisao btn-decisao-aprovar">
        ✓ Aprovar e avançar
      </button>
      <button type="button" id="btn-reprovar" class="btn btn-decisao btn-decisao-reprovar">
        ✕ Reprovar etapa
      </button>
    </div>

    <p id="erro-decisao" class="erro" style="margin-top: 0.65rem;" hidden></p>
  `;

  // Toggle da área de observação ao marcar/desmarcar cada ação
  acoesList.forEach((a) => {
    const cb = acaoContainer.querySelector(`[name="acao-${a.id}"]`);
    const wrapObs = acaoContainer.querySelector(`#wrap-obs-acao-${a.id}`);
    cb?.addEventListener("change", () => {
      if (wrapObs) {
        wrapObs.hidden = !cb.checked;
        if (cb.checked) {
          wrapObs.querySelector("textarea")?.focus();
        }
      }
    });
  });

  async function enviarDecisao(corpo, botaoAcionado) {
    const erro = document.getElementById("erro-decisao");
    const btnAprovar = document.getElementById("btn-aprovar");
    const btnReprovar = document.getElementById("btn-reprovar");
    if (erro) erro.hidden = true;
    if (btnAprovar) btnAprovar.disabled = true;
    if (btnReprovar) btnReprovar.disabled = true;

    try {
      await api(`/chamados/${chamado.id}/decisao`, {
        method: "POST",
        body: corpo,
      });
      await carregarTudo();
    } catch (e) {
      if (erro) {
        erro.textContent = e.message || "Falha ao processar decisão.";
        erro.hidden = false;
      }
    } finally {
      if (btnAprovar) btnAprovar.disabled = false;
      if (btnReprovar) btnReprovar.disabled = false;
    }
  }

  document.getElementById("btn-aprovar")?.addEventListener("click", (e) => {
    const acoes = {};
    const observacoesAcoes = {};
    acoesList.forEach((a) => {
      const cb = acaoContainer.querySelector(`[name="acao-${a.id}"]`);
      if (cb && cb.checked) {
        acoes[a.id] = true;
        const campoObs = acaoContainer.querySelector(`[name="obs-acao-${a.id}"]`);
        if (campoObs && campoObs.value.trim()) {
          observacoesAcoes[a.id] = campoObs.value.trim();
        }
      } else {
        acoes[a.id] = false;
      }
    });
    enviarDecisao({ decisao: "aprovado", acoes, observacoes_acoes: observacoesAcoes }, e.currentTarget);
  });

  document.getElementById("btn-reprovar")?.addEventListener("click", (e) => {
    const campoJust = document.getElementById("justificativa");
    const justificativa = campoJust?.value.trim();
    if (!justificativa) {
      const erro = document.getElementById("erro-decisao");
      if (erro) {
        erro.textContent = "A justificativa é obrigatória para registrar a reprovação desta etapa.";
        erro.hidden = false;
      }
      campoJust?.focus();
      return;
    }
    enviarDecisao({ decisao: "reprovado", justificativa }, e.currentTarget);
  });
}

// Expõe globalmente para acionamento por botões no cabeçalho ou inline
if (typeof window !== "undefined") {
  window.abrirModalHoras = abrirModalHoras;
}

