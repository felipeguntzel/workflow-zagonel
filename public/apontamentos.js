import { api } from "./api.js";
import { exigirLogin, permissaoDaTela } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { escaparHtml, mostrarErro, debounce, exportarParaCsv, formatarDataBR, botaoIconeEditar, botaoIconeExcluir } from "./ui.js";
import { confirmarAcao } from "./modal.js";
import { tornarTabelaReordenavel } from "./tabela-colunas.js";

let usuarioAtual = null;
let permissao = { visualizar: false, inserir: false, editar: false, excluir: false };
let dadosResposta = null;
let listaSetores = [];
let listaUsuarios = [];

let inicializado = false;
export function inicializar() {
  if (inicializado) return;
  inicializado = true;

  usuarioAtual = exigirLogin();
  if (!usuarioAtual) return;

  aplicarLayout(usuarioAtual);
  permissao = permissaoDaTela("apontamentos");
  // Se não tiver permissão explícita em 'apontamentos', herda a de 'chamados'
  if (!permissao.visualizar) {
    permissao = permissaoDaTela("chamados");
  }

  // Define mês padrão como o mês atual (YYYY-MM)
  const hoje = new Date().toISOString().slice(0, 10);
  const inputMes = document.getElementById("filtro-mes");
  if (inputMes) inputMes.value = hoje.slice(0, 7);

  const tabela = document.getElementById("tabela-apontamentos");
  if (tabela) {
    tornarTabelaReordenavel(tabela, "apontamentos", usuarioAtual?.id);
  }

  configurarEventos();
  carregarAuxiliares().then(() => {
    carregarApontamentos();
  });
}

function configurarEventos() {
  const inputMes = document.getElementById("filtro-mes");
  const inputDia = document.getElementById("filtro-dia");
  const inputBusca = document.getElementById("filtro-busca");
  const selectSetor = document.getElementById("filtro-setor");
  const selectUsuario = document.getElementById("filtro-usuario");

  document.getElementById("btn-mes-anterior")?.addEventListener("click", () => {
    if (!inputMes.value) return;
    const [ano, mes] = inputMes.value.split("-").map(Number);
    const d = new Date(ano, mes - 2, 1);
    inputMes.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (inputDia) inputDia.value = "";
    carregarApontamentos();
  });

  document.getElementById("btn-mes-proximo")?.addEventListener("click", () => {
    if (!inputMes.value) return;
    const [ano, mes] = inputMes.value.split("-").map(Number);
    const d = new Date(ano, mes, 1);
    inputMes.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (inputDia) inputDia.value = "";
    carregarApontamentos();
  });

  inputMes?.addEventListener("change", () => {
    if (inputDia) inputDia.value = "";
    carregarApontamentos();
  });

  inputDia?.addEventListener("change", () => {
    if (inputDia.value) {
      inputMes.value = inputDia.value.slice(0, 7);
    }
    carregarApontamentos();
  });

  selectSetor?.addEventListener("change", carregarApontamentos);
  selectUsuario?.addEventListener("change", carregarApontamentos);

  if (inputBusca) {
    const debounced = debounce(carregarApontamentos, 300);
    inputBusca.addEventListener("input", debounced);
  }

  document.getElementById("btn-filtrar")?.addEventListener("click", carregarApontamentos);

  document.getElementById("btn-limpar-filtros")?.addEventListener("click", () => {
    const hoje = new Date().toISOString().slice(0, 10);
    if (inputMes) inputMes.value = hoje.slice(0, 7);
    if (inputDia) inputDia.value = "";
    if (selectSetor) selectSetor.value = "";
    if (selectUsuario) selectUsuario.value = "";
    if (inputBusca) inputBusca.value = "";
    carregarApontamentos();
  });

  // Botão de Impressão
  document.getElementById("btn-imprimir-horas")?.addEventListener("click", imprimirRelatorio);

  // Botão de Exportação CSV
  document.getElementById("btn-exportar-csv")?.addEventListener("click", exportarCsv);

  // Botão de Novo Apontamento
  document.getElementById("btn-novo-apontamento")?.addEventListener("click", () => {
    abrirModalForm(null);
  });

  // Eventos do Modal de Apontamento
  const modal = document.getElementById("modal-form-apontamento");
  const fecharModal = () => {
    if (modal) {
      modal.hidden = true;
      modal.style.display = "none";
    }
  };

  document.getElementById("btn-fechar-modal-apontamento")?.addEventListener("click", fecharModal);
  document.getElementById("btn-cancelar-modal-apontamento")?.addEventListener("click", fecharModal);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) fecharModal();
  });

  document.getElementById("form-apontamento")?.addEventListener("submit", salvarFormulario);

  // Busca rápida de chamado no modal ao digitar ID
  const inputChamadoId = document.getElementById("apontamento-chamado-id");
  const spanPreview = document.getElementById("apontamento-chamado-preview");
  if (inputChamadoId && spanPreview) {
    const buscarPreviewChamado = debounce(async () => {
      const id = inputChamadoId.value.trim();
      if (!id) {
        spanPreview.textContent = "";
        return;
      }
      try {
        const c = await api(`/chamados/${id}`);
        spanPreview.textContent = c?.titulo ? `✓ #${c.id} - ${c.titulo}` : "✓ Chamado encontrado";
        spanPreview.style.color = "var(--cor-primaria)";
      } catch (_) {
        spanPreview.textContent = "✕ Chamado não encontrado";
        spanPreview.style.color = "#dc2626";
      }
    }, 350);
    inputChamadoId.addEventListener("input", buscarPreviewChamado);
  }
}

async function carregarAuxiliares() {
  try {
    const [setores, usuarios] = await Promise.all([
      api("/setores").catch(() => []),
      api("/usuarios").catch(() => []),
    ]);

    listaSetores = Array.isArray(setores) ? setores : [];
    listaUsuarios = Array.isArray(usuarios) ? usuarios : [];

    const selectSetor = document.getElementById("filtro-setor");
    if (selectSetor) {
      selectSetor.innerHTML = `
        <option value="">Todos os setores</option>
        ${listaSetores.map((s) => `<option value="${s.id}">${escaparHtml(s.nome)}</option>`).join("")}
      `;
    }

    const selectUsuario = document.getElementById("filtro-usuario");
    if (selectUsuario) {
      selectUsuario.innerHTML = `
        <option value="">Todos os usuários</option>
        ${listaUsuarios.map((u) => `<option value="${u.id}">${escaparHtml(u.nome)}</option>`).join("")}
      `;
    }

    const selectModalUsuario = document.getElementById("apontamento-usuario-id");
    if (selectModalUsuario) {
      selectModalUsuario.innerHTML = `
        <option value="">Meu próprio usuário (${escaparHtml(usuarioAtual.nome)})</option>
        ${listaUsuarios.map((u) => `<option value="${u.id}">${escaparHtml(u.nome)}</option>`).join("")}
      `;
    }
  } catch (_) {}
}

async function carregarApontamentos() {
  const tbody = document.getElementById("tbody-apontamentos");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="8" class="vazio">Buscando apontamentos...</td></tr>`;

  const mes = document.getElementById("filtro-mes")?.value || "";
  const dia = document.getElementById("filtro-dia")?.value || "";
  const setorId = document.getElementById("filtro-setor")?.value || "";
  const usuarioId = document.getElementById("filtro-usuario")?.value || "";
  const busca = document.getElementById("filtro-busca")?.value || "";

  const params = new URLSearchParams();
  if (dia) {
    params.set("dia", dia);
  } else if (mes) {
    params.set("mes", mes);
  }
  if (setorId) params.set("setor_id", setorId);
  if (usuarioId) params.set("usuario_id", usuarioId);
  if (busca) params.set("busca", busca);

  try {
    const res = await api(`/apontamentos?${params.toString()}`);
    dadosResposta = res;
    renderizarResumoEStatus(res);
    renderizarTabela(res.itens || []);
  } catch (err) {
    mostrarErro(document.getElementById("mensagem-erro"), err);
    tbody.innerHTML = `<tr><td colspan="8" class="vazio erro">Erro ao carregar apontamentos.</td></tr>`;
  }
}

function renderizarResumoEStatus(dados) {
  const cardTotalHoras = document.getElementById("card-total-horas");
  const cardSubTotal = document.getElementById("card-sub-total");
  const cardTotalLanc = document.getElementById("card-total-lancamentos");
  const cardStatusComp = document.getElementById("card-status-competencia");
  const cardStatusInfo = document.getElementById("card-status-info");
  const cardAdminAcao = document.getElementById("card-admin-acao-liberar");

  const totalHoras = Number(dados.total_horas) || 0;
  if (cardTotalHoras) cardTotalHoras.textContent = `${totalHoras.toFixed(2)}h`;
  if (cardTotalLanc) cardTotalLanc.textContent = String(dados.total_lancamentos || 0);

  if (cardSubTotal) {
    cardSubTotal.textContent = dados.dia_consultado
      ? `No dia ${formatarDataBR(dados.dia_consultado)}`
      : `Na competência ${dados.mes_consultado || "-"}`;
  }

  // Status da competência
  if (cardStatusComp) {
    if (dados.mes_liberado) {
      cardStatusComp.innerHTML = `<span class="badge badge-alerta" style="font-size: 0.85rem; padding: 0.25rem 0.65rem;">Liberado</span>`;
      if (cardStatusInfo) cardStatusInfo.textContent = "Liberado pelo Administrador para edição";
    } else if (dados.mes_fechado) {
      const dataFechamento = dados.data_fechamento ? formatarDataBR(dados.data_fechamento) : "dia 01";
      cardStatusComp.innerHTML = `<span class="badge badge-vencido" style="font-size: 0.85rem; padding: 0.25rem 0.65rem;">Fechado</span>`;
      if (cardStatusInfo) cardStatusInfo.textContent = `Encerrado em ${dataFechamento}`;
    } else {
      cardStatusComp.innerHTML = `<span class="badge badge-ok" style="font-size: 0.85rem; padding: 0.25rem 0.65rem;">Aberto</span>`;
      if (cardStatusInfo) cardStatusInfo.textContent = "Fechamento automático no dia 01 do próximo mês";
    }
  }

  // Ações de liberação exclusivas para Administradores
  if (cardAdminAcao) {
    if (usuarioAtual?.admin && dados.mes_fechado) {
      if (dados.mes_liberado) {
        cardAdminAcao.innerHTML = `
          <button type="button" id="btn-toggle-liberar-mes" class="btn btn-secundario btn-pequeno" style="font-size: 0.78rem; padding: 0.25rem 0.5rem; width: 100%;">
            🔒 Bloquear Mês Novamente
          </button>
        `;
      } else {
        cardAdminAcao.innerHTML = `
          <button type="button" id="btn-toggle-liberar-mes" class="btn btn-primario btn-pequeno" style="font-size: 0.78rem; padding: 0.25rem 0.5rem; width: 100%;">
            🔓 Liberar Edição do Mês para Usuários
          </button>
        `;
      }

      document.getElementById("btn-toggle-liberar-mes")?.addEventListener("click", async () => {
        const acaoLiberar = !dados.mes_liberado;
        const msg = acaoLiberar
          ? `Deseja liberar a edição de horas do mês ${dados.mes_consultado} para todos os usuários?`
          : `Deseja bloquear novamente a edição de horas do mês ${dados.mes_consultado}?`;
        const confirmado = await confirmarAcao("Alterar bloqueio do mês?", msg);
        if (!confirmado) return;

        try {
          await api("/apontamentos/liberar", {
            method: "POST",
            body: { ano_mes: dados.mes_consultado, liberar: acaoLiberar },
          });
          const toast = document.getElementById("toast-apontamentos");
          if (toast) {
            toast.textContent = acaoLiberar ? "✓ Mês liberado com sucesso." : "✓ Mês bloqueado.";
            toast.hidden = false;
            setTimeout(() => { toast.hidden = true; }, 3000);
          }
          carregarApontamentos();
        } catch (e) {
          mostrarErro(document.getElementById("mensagem-erro"), e);
        }
      });
    } else {
      cardAdminAcao.innerHTML = "";
    }
  }
}

function renderizarTabela(itens) {
  const tbody = document.getElementById("tbody-apontamentos");
  if (!tbody) return;

  if (!itens || itens.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="vazio">Nenhum apontamento encontrado com os filtros aplicados.</td></tr>`;
    return;
  }

  tbody.innerHTML = itens
    .map((item) => {
      const podeEditar = Boolean(item.pode_editar);
      const badgePeriodo = item.mes_liberado
        ? `<span class="badge badge-alerta" style="font-size: 0.75rem;">Liberado</span>`
        : item.mes_fechado
        ? `<span class="badge badge-vencido" style="font-size: 0.75rem;">Fechado</span>`
        : `<span class="badge badge-ok" style="font-size: 0.75rem;">Aberto</span>`;

      return `
        <tr data-id="${item.id}">
          <td><strong>${formatarDataBR(item.data)}</strong></td>
          <td>${escaparHtml(item.usuario_nome || "-")}</td>
          <td>${escaparHtml(item.setor_nome || "-")}</td>
          <td>
            <a href="/chamado?id=${item.chamado_id}" class="link-sem-sublinhado" title="Ver chamado">
              <strong>#${item.chamado_id}</strong> - ${escaparHtml(item.chamado_titulo || "Sem título")}
            </a>
          </td>
          <td style="text-align: right; font-weight: 700; color: var(--cor-primaria);">${Number(item.horas).toFixed(2)}h</td>
          <td>${item.observacao ? escaparHtml(item.observacao) : `<span style="color: var(--cor-texto-secundario); font-style: italic;">Sem observação</span>`}</td>
          <td style="text-align: center;">${badgePeriodo}</td>
          <td class="td-acoes" style="text-align: center;">
            ${
              podeEditar
                ? `
              <div style="display: flex; gap: 0.35rem; justify-content: center; align-items: center;">
                ${botaoIconeEditar(item.id, `btn-editar-apontamento-${item.id}`)}
                ${botaoIconeExcluir(item.id, `btn-excluir-apontamento-${item.id}`)}
              </div>
            `
                : `<span style="font-size: 0.78rem; color: var(--cor-texto-secundario); font-weight: 500;" title="Edição bloqueada">Bloqueado</span>`
            }
          </td>
        </tr>
      `;
    })
    .join("");

  // Eventos de clique nas ações
  itens.forEach((item) => {
    if (item.pode_editar) {
      document.getElementById(`btn-editar-apontamento-${item.id}`)?.addEventListener("click", () => {
        abrirModalForm(item);
      });

      document.getElementById(`btn-excluir-apontamento-${item.id}`)?.addEventListener("click", async () => {
        const confirmado = await confirmarAcao(
          "Excluir apontamento de horas?",
          `Deseja realmente remover o lançamento de ${item.horas}h da data ${formatarDataBR(item.data)}?`
        );
        if (!confirmado) return;

        try {
          await api(`/apontamentos/${item.id}`, { method: "DELETE" });
          const toast = document.getElementById("toast-apontamentos");
          if (toast) {
            toast.textContent = "✓ Apontamento excluído com sucesso.";
            toast.hidden = false;
            setTimeout(() => { toast.hidden = true; }, 3000);
          }
          carregarApontamentos();
        } catch (e) {
          mostrarErro(document.getElementById("mensagem-erro"), e);
        }
      });
    }
  });
}

function abrirModalForm(item = null) {
  const modal = document.getElementById("modal-form-apontamento");
  const titulo = document.getElementById("modal-apontamento-titulo");
  const form = document.getElementById("form-apontamento");
  const msgErro = document.getElementById("msg-erro-modal-apontamento");
  const avisoBloqueio = document.getElementById("aviso-bloqueio-mes");
  const inputId = document.getElementById("apontamento-id");
  const inputChamadoId = document.getElementById("apontamento-chamado-id");
  const inputData = document.getElementById("apontamento-data");
  const inputHoras = document.getElementById("apontamento-horas");
  const inputObs = document.getElementById("apontamento-obs");
  const spanPreview = document.getElementById("apontamento-chamado-preview");
  const campoUsuarioAdmin = document.getElementById("campo-usuario-admin-wrap");
  const selectUsuario = document.getElementById("apontamento-usuario-id");

  if (!modal || !form) return;
  if (msgErro) msgErro.hidden = true;

  if (item) {
    titulo.innerHTML = `<span>✏️</span> Editar Apontamento #${item.id}`;
    inputId.value = String(item.id);
    inputChamadoId.value = String(item.chamado_id);
    inputChamadoId.disabled = true; // Não altera o chamado na edição
    inputData.value = item.data;
    inputHoras.value = String(item.horas);
    inputObs.value = item.observacao || "";
    if (spanPreview) spanPreview.textContent = `#${item.chamado_id} - ${item.chamado_titulo || ""}`;

    if (campoUsuarioAdmin) campoUsuarioAdmin.style.display = "none";

    // Verifica bloqueio de mês
    if (item.mes_fechado && !item.mes_liberado && !usuarioAtual?.admin) {
      if (avisoBloqueio) avisoBloqueio.style.display = "block";
      document.getElementById("btn-salvar-modal-apontamento").disabled = true;
    } else {
      if (avisoBloqueio) avisoBloqueio.style.display = "none";
      document.getElementById("btn-salvar-modal-apontamento").disabled = false;
    }
  } else {
    titulo.innerHTML = `<span>⏱️</span> Lançar Horas`;
    inputId.value = "";
    inputChamadoId.value = "";
    inputChamadoId.disabled = false;
    inputData.value = new Date().toISOString().slice(0, 10);
    inputHoras.value = "";
    inputObs.value = "";
    if (spanPreview) spanPreview.textContent = "";
    if (avisoBloqueio) avisoBloqueio.style.display = "none";
    document.getElementById("btn-salvar-modal-apontamento").disabled = false;

    // Se for admin, exibe opção de lançar para outro usuário
    if (usuarioAtual?.admin && campoUsuarioAdmin) {
      campoUsuarioAdmin.style.display = "block";
      if (selectUsuario) selectUsuario.value = "";
    } else if (campoUsuarioAdmin) {
      campoUsuarioAdmin.style.display = "none";
    }
  }

  modal.hidden = false;
  modal.style.display = "flex";
}

async function salvarFormulario(e) {
  e.preventDefault();
  const msgErro = document.getElementById("msg-erro-modal-apontamento");
  const btnSalvar = document.getElementById("btn-salvar-modal-apontamento");
  if (msgErro) msgErro.hidden = true;

  const id = document.getElementById("apontamento-id").value;
  const chamadoId = Number(document.getElementById("apontamento-chamado-id").value);
  const data = document.getElementById("apontamento-data").value;
  const horas = Number(document.getElementById("apontamento-horas").value);
  const observacao = document.getElementById("apontamento-obs").value.trim();
  const selectUsuario = document.getElementById("apontamento-usuario-id");
  const usuarioId = selectUsuario && selectUsuario.value ? Number(selectUsuario.value) : undefined;

  if (!data || !horas || horas <= 0) {
    mostrarErro(msgErro, "Preencha a data e uma quantidade válida de horas.");
    return;
  }

  if (btnSalvar) {
    btnSalvar.disabled = true;
    btnSalvar.textContent = "Salvando...";
  }

  try {
    if (id) {
      // Edição
      await api(`/apontamentos/${id}`, {
        method: "PUT",
        body: { data, horas, observacao },
      });
    } else {
      // Novo
      if (!chamadoId) {
        throw new Error("Informe o número do chamado.");
      }
      await api("/apontamentos", {
        method: "POST",
        body: { chamado_id: chamadoId, data, horas, observacao, usuario_id: usuarioId },
      });
    }

    const modal = document.getElementById("modal-form-apontamento");
    if (modal) {
      modal.hidden = true;
      modal.style.display = "none";
    }

    const toast = document.getElementById("toast-apontamentos");
    if (toast) {
      toast.textContent = id ? "✓ Apontamento atualizado." : "✓ Apontamento registrado com sucesso.";
      toast.hidden = false;
      setTimeout(() => { toast.hidden = true; }, 3000);
    }

    carregarApontamentos();
  } catch (err) {
    mostrarErro(msgErro, err);
  } finally {
    if (btnSalvar) {
      btnSalvar.disabled = false;
      btnSalvar.textContent = "Salvar apontamento";
    }
  }
}

function imprimirRelatorio() {
  const printSub = document.getElementById("print-subtitulo");
  const printTotalHoras = document.getElementById("print-total-horas");
  const printTotalLanc = document.getElementById("print-total-lancamentos");

  const mes = document.getElementById("filtro-mes")?.value || "";
  const dia = document.getElementById("filtro-dia")?.value || "";
  const agora = new Date().toLocaleString("pt-BR");

  if (printSub) {
    const periodoTxt = dia ? `Dia: ${formatarDataBR(dia)}` : `Competência: ${mes || "Geral"}`;
    printSub.textContent = `Filtro: ${periodoTxt} | Emitido por: ${usuarioAtual?.nome || "Usuário"} em ${agora}`;
  }

  if (dadosResposta) {
    if (printTotalHoras) printTotalHoras.textContent = `${Number(dadosResposta.total_horas || 0).toFixed(2)}h`;
    if (printTotalLanc) printTotalLanc.textContent = String(dadosResposta.total_lancamentos || 0);
  }

  window.print();
}

function exportarCsv() {
  if (!dadosResposta || !dadosResposta.itens || dadosResposta.itens.length === 0) {
    alert("Não há dados para exportar com os filtros atuais.");
    return;
  }

  const cabecalhos = ["ID", "Data", "Usuário", "Setor", "Chamado ID", "Chamado Título", "Horas", "Observação", "Mês Fechado"];
  const linhas = dadosResposta.itens.map((i) => [
    i.id,
    formatarDataBR(i.data),
    i.usuario_nome || "",
    i.setor_nome || "",
    i.chamado_id,
    i.chamado_titulo || "",
    Number(i.horas).toFixed(2),
    i.observacao || "",
    i.mes_fechado ? "Sim" : "Não",
  ]);

  const nomeArquivo = `apontamento_horas_${dadosResposta.dia_consultado || dadosResposta.mes_consultado || "relatorio"}.csv`;
  exportarParaCsv(nomeArquivo, cabecalhos, linhas);
}

// Inicializa automaticamente se carregado diretamente
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inicializar);
  } else {
    inicializar();
  }
}
