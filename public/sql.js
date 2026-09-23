import { exigirLogin } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { info, escaparHtml } from "./ui.js";
import { api } from "./api.js";

const CHAVE_HISTORICO = "workflow_zagonel_sql_historico";

let estadoTabelas = [];
let resultadoAtual = null;

export function inicializar() {
  const usuario = exigirLogin();
  if (!usuario) return;

  aplicarLayout(usuario);
  const container = document.getElementById("sql-container");
  if (!container) return;

  if (!usuario.admin) {
    container.innerHTML = `
      <div class="painel" style="margin-top: 2rem; text-align: center; padding: 2.5rem; max-width: 600px; margin-left: auto; margin-right: auto;">
        <h3 style="color: var(--cor-primaria); margin-top: 0;">Acesso Restrito</h3>
        <p style="color: var(--cor-texto-secundario); margin: 1rem 0 1.5rem; line-height: 1.5;">
          O Editor SQL é uma ferramenta avançada e de segurança crítica, disponível exclusivamente para administradores do sistema.
        </p>
        <a href="/chamados" class="btn btn-primario">Voltar para Meus Chamados</a>
      </div>
    `;
  } else {
    iniciarEditor(container);
  }
}

inicializar();

async function iniciarEditor(container) {
  container.innerHTML = `
    <div class="pagina-cabecalho">
      <div class="pagina-cabecalho__esquerda">
        <h2>
          Editor SQL
          ${info("Console de administração do banco de dados SQLite (D1). Permite executar consultas SELECT e comandos de mutação (INSERT, UPDATE, DELETE). Use com cautela.")}
        </h2>
        <p style="color: var(--cor-texto-secundario); margin: 0.35rem 0 0; font-size: 0.88rem;">
          Execute consultas e comandos diretamente no banco de dados SQLite (Cloudflare D1).
        </p>
      </div>
      <div>
        <span class="badge" style="background: var(--cor-primaria); color: var(--cor-primaria-texto); font-size: 0.82rem; font-weight: 700; padding: 0.35rem 0.75rem; border-radius: 0.35rem;">
          Administrador
        </span>
      </div>
    </div>

    <div class="sql-console-wrap">
      <!-- Painel Principal do Console -->
      <div class="painel">
        <div class="sql-ferramentas-topo">
          <div class="sql-modelos-grupo">
            <label for="select-tabela-modelo" style="font-weight: 700; font-size: 0.85rem; color: var(--cor-texto-secundario); white-space: nowrap;">
              Tabela:
            </label>
            <select id="select-tabela-modelo" class="select-padrao" style="width: auto; min-width: 210px; font-weight: 600; padding: 0.45rem 0.75rem; font-size: 0.85rem;">
              <option value="">Carregando tabelas...</option>
            </select>
            <button type="button" class="btn btn-secundario btn-modelo-sql" data-acao="select" title="Inserir comando SELECT com limite" style="font-size: 0.82rem; padding: 0.45rem 0.7rem;">+ SELECT</button>
            <button type="button" class="btn btn-secundario btn-modelo-sql" data-acao="insert" title="Inserir modelo de INSERT" style="font-size: 0.82rem; padding: 0.45rem 0.7rem;">+ INSERT</button>
            <button type="button" class="btn btn-secundario btn-modelo-sql" data-acao="update" title="Inserir modelo de UPDATE com WHERE" style="font-size: 0.82rem; padding: 0.45rem 0.7rem;">+ UPDATE</button>
            <button type="button" class="btn btn-secundario btn-modelo-sql" data-acao="delete" title="Inserir modelo de DELETE com WHERE" style="font-size: 0.82rem; padding: 0.45rem 0.7rem;">+ DELETE</button>
          </div>

          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <button type="button" id="btn-abrir-esquema" class="btn btn-secundario" title="Ver estrutura de tabelas e colunas" style="font-size: 0.82rem; padding: 0.45rem 0.75rem;">
              Ver Estrutura das Tabelas
            </button>
            <select id="select-historico" class="select-padrao" title="Histórico de comandos executados nesta sessão" style="width: auto; min-width: 170px; font-size: 0.85rem; padding: 0.45rem 0.75rem;">
              <option value="">Histórico recente...</option>
            </select>
          </div>
        </div>

        <textarea
          id="editor-sql-texto"
          class="textarea-padrao sql-textarea"
          placeholder="Digite a instrução SQL aqui... Exemplo: SELECT * FROM usuarios LIMIT 50;"
          spellcheck="false"
        >SELECT * FROM usuarios LIMIT 50;</textarea>

        <div class="sql-acoes-rodape">
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <button type="button" id="btn-executar-sql" class="btn btn-primario" style="display: inline-flex; align-items: center; gap: 0.45rem; font-weight: 700; padding: 0.55rem 1.25rem;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              <span>Executar (Ctrl+Enter)</span>
            </button>
            <button type="button" id="btn-limpar-sql" class="btn btn-secundario">
              Limpar
            </button>
          </div>

          <div style="font-size: 0.82rem; color: var(--cor-texto-secundario);">
            Atalho: <kbd style="background: var(--cor-fundo); border: 1px solid var(--cor-borda); padding: 0.15rem 0.4rem; border-radius: 0.25rem; font-family: monospace;">Ctrl + Enter</kbd> &bull; Suporta SELECT, INSERT, UPDATE e DELETE com WHERE
          </div>
        </div>
      </div>

      <!-- Painel de Resultados -->
      <div class="painel">
        <div class="sql-ferramentas-topo" style="margin-bottom: 0.85rem;">
          <div id="sql-status-execucao" class="sql-status-info">
            <span style="color: var(--cor-texto-secundario);">Aguardando execução de comando...</span>
          </div>

          <div style="display: flex; align-items: center; gap: 0.4rem;">
            <span style="font-size: 0.82rem; color: var(--cor-texto-secundario); font-weight: 600;">Exportar:</span>
            <button type="button" id="btn-exportar-xlsx" class="btn btn-secundario" disabled title="Exportar resultado para planilha Excel (.xlsx)" style="font-size: 0.82rem; padding: 0.35rem 0.65rem;">
              Excel (.xlsx)
            </button>
            <button type="button" id="btn-exportar-txt" class="btn btn-secundario" disabled title="Exportar resultado para arquivo de texto formatado (.txt)" style="font-size: 0.82rem; padding: 0.35rem 0.65rem;">
              Texto (.txt)
            </button>
          </div>
        </div>

        <div id="sql-area-resultado">
          <p style="padding: 2.5rem 1rem; text-align: center; color: var(--cor-texto-secundario); font-size: 0.9rem;">
            Execute uma instrução SQL acima para visualizar os dados ou status de alteração aqui.
          </p>
        </div>
      </div>
    </div>

    <!-- Modal de Esquema do Banco -->
    <div id="modal-esquema-wrap"></div>
  `;

  // Elementos do DOM
  const editor = document.getElementById("editor-sql-texto");
  const btnExecutar = document.getElementById("btn-executar-sql");
  const btnLimpar = document.getElementById("btn-limpar-sql");
  const selectHistorico = document.getElementById("select-historico");
  const selectTabelaModelo = document.getElementById("select-tabela-modelo");
  const btnAbrirEsquema = document.getElementById("btn-abrir-esquema");
  const btnExportarXlsx = document.getElementById("btn-exportar-xlsx");
  const btnExportarTxt = document.getElementById("btn-exportar-txt");

  // Configura atalhos no editor
  editor.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      executarComando();
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const inicio = editor.selectionStart;
      const fim = editor.selectionEnd;
      editor.value = editor.value.substring(0, inicio) + "  " + editor.value.substring(fim);
      editor.selectionStart = editor.selectionEnd = inicio + 2;
    }
  });

  btnExecutar.addEventListener("click", executarComando);
  btnLimpar.addEventListener("click", () => {
    editor.value = "";
    editor.focus();
  });

  // Histórico recente
  carregarHistoricoNoSelect(selectHistorico);
  selectHistorico.addEventListener("change", () => {
    if (selectHistorico.value) {
      editor.value = selectHistorico.value;
      editor.focus();
    }
  });

  // Botões de modelos rápidos por tabela
  container.querySelectorAll(".btn-modelo-sql").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const acao = btn.getAttribute("data-acao");
      const nomeTab = selectTabelaModelo.value;
      if (!nomeTab) {
        const { mostrarAviso } = await import("./modal.js");
        await mostrarAviso("Por favor, selecione uma tabela de referência primeiro.", "Tabela obrigatória", "aviso");
        selectTabelaModelo.focus();
        return;
      }
      const tab = estadoTabelas.find((t) => t.nome === nomeTab);
      if (!tab || !tab.comandos) return;

      editor.value = tab.comandos[acao] || "";
      editor.focus();
      editor.setSelectionRange(editor.value.length, editor.value.length);
    });
  });

  // Modal de Esquema do Banco
  btnAbrirEsquema.addEventListener("click", abrirModalEsquema);

  // Exportação
  btnExportarXlsx.addEventListener("click", () => {
    if (!resultadoAtual || !resultadoAtual.linhas || resultadoAtual.linhas.length === 0) return;
    exportarConsultaXlsx(resultadoAtual.colunas, resultadoAtual.linhas);
  });

  btnExportarTxt.addEventListener("click", () => {
    if (!resultadoAtual || !resultadoAtual.linhas || resultadoAtual.linhas.length === 0) return;
    exportarConsultaTxt(resultadoAtual.colunas, resultadoAtual.linhas);
  });

  // Carrega as tabelas do backend
  await carregarTabelas();

  async function executarComando() {
    let sql = "";
    const selecao = editor.value.substring(editor.selectionStart, editor.selectionEnd).trim();
    if (selecao) {
      sql = selecao;
    } else {
      sql = editor.value.trim();
    }

    if (!sql) {
      const { mostrarAviso } = await import("./modal.js");
      await mostrarAviso("Digite uma instrução SQL para executar.", "Instrução SQL", "aviso");
      editor.focus();
      return;
    }

    btnExecutar.disabled = true;
    btnExecutar.innerHTML = `<span>Executando...</span>`;

    const statusEl = document.getElementById("sql-status-execucao");
    const areaEl = document.getElementById("sql-area-resultado");
    statusEl.innerHTML = `<span style="color: var(--cor-texto-secundario);">Executando instrução no banco D1...</span>`;

    try {
      const resp = await api("/sql", {
        method: "POST",
        body: { sql },
      });

      salvarNoHistorico(sql);
      carregarHistoricoNoSelect(selectHistorico);

      if (resp.tipo === "consulta") {
        resultadoAtual = resp;
        btnExportarXlsx.disabled = resp.linhas.length === 0;
        btnExportarTxt.disabled = resp.linhas.length === 0;

        statusEl.innerHTML = `
          <span class="sql-badge-tag sql-badge-sucesso">SELECT</span>
          <span style="font-weight: 600;">${resp.totalLinhas} registro(s) retornado(s) em ${resp.tempoMs} ms</span>
        `;
        renderizarTabelaDados(areaEl, resp.colunas, resp.linhas);
      } else {
        resultadoAtual = null;
        btnExportarXlsx.disabled = true;
        btnExportarTxt.disabled = true;

        statusEl.innerHTML = `
          <span class="sql-badge-tag sql-badge-mutacao">${resp.tipo ? resp.tipo.toUpperCase() : "EXECUÇÃO"}</span>
          <span style="font-weight: 600;">${resp.linhasAfetadas ?? 0} linha(s) afetada(s) em ${resp.tempoMs} ms</span>
        `;

        areaEl.innerHTML = `
          <div style="padding: 1.5rem; border-left: 4px solid var(--cor-ok); background: var(--cor-fundo-elevado); border-radius: 0.4rem; border: 1px solid var(--cor-borda);">
            <h4 style="margin: 0 0 0.5rem 0; color: var(--cor-ok);">Comando executado com sucesso</h4>
            <p style="margin: 0; font-size: 0.9rem;">
              Linhas afetadas: <strong>${resp.linhasAfetadas ?? 0}</strong>
              ${resp.lastRowId ? `<br>Último ID gerado: <strong>${resp.lastRowId}</strong>` : ""}
            </p>
          </div>
        `;

        // Recarrega contadores das tabelas em segundo plano
        carregarTabelas(false);
      }
    } catch (err) {
      resultadoAtual = null;
      btnExportarXlsx.disabled = true;
      btnExportarTxt.disabled = true;

      statusEl.innerHTML = `
        <span class="sql-badge-tag sql-badge-erro">FALHA</span>
        <span style="color: var(--cor-vencido); font-weight: 600;">Erro na execução</span>
      `;
      areaEl.innerHTML = `
        <div style="padding: 1rem; border-radius: 0.4rem; background: rgba(192, 57, 43, 0.08); border: 1px solid var(--cor-vencido); color: var(--cor-vencido); font-family: monospace; font-size: 0.88rem; white-space: pre-wrap;">
<strong>Erro retornado pelo banco:</strong>
${escaparHtml(err.message || String(err))}
        </div>
      `;
    } finally {
      btnExecutar.disabled = false;
      btnExecutar.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        <span>Executar (Ctrl+Enter)</span>
      `;
    }
  }
}

async function carregarTabelas(atualizarSelect = true) {
  const selectEl = document.getElementById("select-tabela-modelo");

  try {
    const dados = await api("/sql");
    estadoTabelas = (dados && Array.isArray(dados.tabelas)) ? dados.tabelas : [];
    
    if (atualizarSelect && selectEl) {
      if (estadoTabelas.length === 0) {
        selectEl.innerHTML = `<option value="">Nenhuma tabela encontrada</option>`;
      } else {
        const valorAnterior = selectEl.value;
        selectEl.innerHTML = `
          <option value="">Selecione uma tabela (${estadoTabelas.length})...</option>
          ${estadoTabelas.map((t) => `<option value="${escaparHtml(t.nome)}" ${t.nome === valorAnterior ? "selected" : ""}>${escaparHtml(t.nome)} (${t.totalRegistros} reg)</option>`).join("")}
        `;
        if (!valorAnterior && estadoTabelas.some((t) => t.nome === "usuarios")) {
          selectEl.value = "usuarios";
        }
      }
    }
  } catch (err) {
    if (selectEl) {
      selectEl.innerHTML = `<option value="">Erro ao listar tabelas</option>`;
    }
  }
}

function renderizarTabelaDados(container, colunas, linhas) {
  if (linhas.length === 0) {
    container.innerHTML = `
      <p style="padding: 2rem; text-align: center; color: var(--cor-texto-secundario);">
        A consulta foi executada com sucesso, mas não retornou nenhum registro.
      </p>
    `;
    return;
  }

  const cabecalhosHtml = colunas
    .map((col) => `<th style="white-space: nowrap;">${escaparHtml(col)}</th>`)
    .join("");

  const linhasHtml = linhas
    .map((linha) => {
      const celulas = colunas
        .map((col) => {
          const val = linha[col];
          if (val === null || val === undefined) {
            return `<td><span class="sql-valor-null">NULL</span></td>`;
          }
          if (typeof val === "number") {
            return `<td class="sql-valor-numero">${val}</td>`;
          }
          return `<td>${escaparHtml(String(val))}</td>`;
        })
        .join("");
      return `<tr>${celulas}</tr>`;
    })
    .join("");

  container.innerHTML = `
    <div class="tabela-wrap sql-tabela-scroll">
      <table class="tabela">
        <thead>
          <tr>${cabecalhosHtml}</tr>
        </thead>
        <tbody>
          ${linhasHtml}
        </tbody>
      </table>
    </div>
  `;
}

// Modal com Esquema do Banco de Dados
function abrirModalEsquema() {
  const modalWrap = document.getElementById("modal-esquema-wrap");
  if (!modalWrap) return;

  modalWrap.innerHTML = `
    <div class="modal-fundo modal-fundo--cadastro" role="dialog" aria-modal="true">
      <div class="modal-cadastro" style="max-width: 720px;">
        <div class="modal-cabecalho">
          <h3>Estrutura das Tabelas (Esquema do Banco)</h3>
          <button type="button" class="modal-fechar" aria-label="Fechar">✕</button>
        </div>
        <div style="padding: 1.25rem;">
          <input
            type="search"
            id="busca-modal-esquema"
            class="input-padrao"
            placeholder="Filtrar por nome de tabela ou coluna..."
            style="margin-bottom: 1rem;"
            autocomplete="off"
          >
          <div id="lista-modal-esquema" style="max-height: 480px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.85rem; padding-right: 0.35rem;">
            ${renderizarItensEsquema("")}
          </div>
        </div>
        <div class="modal-rodape">
          <button type="button" class="btn btn-secundario btn-fechar-esquema">Fechar</button>
        </div>
      </div>
    </div>
  `;

  const fundo = modalWrap.querySelector(".modal-fundo");
  const btnFechar = modalWrap.querySelector(".modal-fechar");
  const btnFecharRodape = modalWrap.querySelector(".btn-fechar-esquema");
  const buscaInp = modalWrap.querySelector("#busca-modal-esquema");
  const listaEl = modalWrap.querySelector("#lista-modal-esquema");

  function fechar() {
    modalWrap.innerHTML = "";
  }

  btnFechar?.addEventListener("click", fechar);
  btnFecharRodape?.addEventListener("click", fechar);
  fundo?.addEventListener("click", (e) => {
    if (e.target === fundo) fechar();
  });

  buscaInp?.addEventListener("input", () => {
    const filtro = buscaInp.value.trim().toLowerCase();
    listaEl.innerHTML = renderizarItensEsquema(filtro);
    vincularSelecaoTabela();
  });

  function vincularSelecaoTabela() {
    listaEl.querySelectorAll(".btn-usar-tabela-esquema").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nomeTab = btn.getAttribute("data-tabela");
        const select = document.getElementById("select-tabela-modelo");
        if (select) {
          select.value = nomeTab;
        }
        fechar();
      });
    });
  }

  vincularSelecaoTabela();
  setTimeout(() => buscaInp?.focus(), 60);
}

function renderizarItensEsquema(filtro) {
  if (estadoTabelas.length === 0) {
    return `<p style="text-align: center; color: var(--cor-texto-secundario); padding: 1.5rem;">Nenhuma tabela encontrada no banco.</p>`;
  }

  const filtradas = estadoTabelas.filter((t) => {
    if (!filtro) return true;
    if (t.nome.toLowerCase().includes(filtro)) return true;
    return t.colunas.some((c) => c.nome.toLowerCase().includes(filtro));
  });

  if (filtradas.length === 0) {
    return `<p style="text-align: center; color: var(--cor-texto-secundario); padding: 1.5rem;">Nenhuma tabela corresponde ao filtro digitado.</p>`;
  }

  return filtradas
    .map((tab) => {
      const nome = escaparHtml(tab.nome);
      return `
        <div style="border: var(--cor-borda-largura) solid var(--cor-borda); border-radius: 0.45rem; padding: 0.75rem 1rem; background: var(--cor-fundo-elevado);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <strong style="font-family: monospace; font-size: 0.95rem; color: var(--cor-primaria);">${nome}</strong>
              <span class="badge" style="font-size: 0.75rem;">${tab.totalRegistros} registros</span>
            </div>
            <button type="button" class="btn btn-secundario btn-usar-tabela-esquema" data-tabela="${nome}" style="font-size: 0.78rem; padding: 0.25rem 0.6rem;">
              Selecionar no Console
            </button>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 0.35rem;">
            ${tab.colunas
              .map(
                (c) => `
              <span style="font-size: 0.78rem; font-family: monospace; background: var(--cor-fundo); border: 1px solid var(--cor-borda); padding: 0.15rem 0.45rem; border-radius: 0.25rem; display: inline-flex; align-items: center; gap: 0.3rem;">
                <span style="${c.pk ? "color: var(--cor-alerta); font-weight: 700;" : ""}">${escaparHtml(c.nome)}</span>
                <span style="opacity: 0.6; font-size: 0.72rem;">${escaparHtml(c.tipo || "TEXT")}${c.pk ? " PK" : ""}</span>
              </span>
            `
              )
              .join("")}
          </div>
        </div>
      `;
    })
    .join("");
}

// Histórico de comandos
function carregarHistoricoNoSelect(select) {
  try {
    const raw = sessionStorage.getItem(CHAVE_HISTORICO);
    const lista = raw ? JSON.parse(raw) : [];
    select.innerHTML = `<option value="">Histórico recente (${lista.length})...</option>`;
    lista.forEach((cmd, idx) => {
      const option = document.createElement("option");
      option.value = cmd;
      const resumo = cmd.replace(/\s+/g, " ").trim();
      option.textContent = `${idx + 1}. ${resumo.length > 35 ? resumo.substring(0, 32) + "..." : resumo}`;
      select.appendChild(option);
    });
  } catch (_) {}
}

function salvarNoHistorico(sql) {
  try {
    const raw = sessionStorage.getItem(CHAVE_HISTORICO);
    let lista = raw ? JSON.parse(raw) : [];
    lista = lista.filter((item) => item.trim() !== sql.trim());
    lista.unshift(sql.trim());
    if (lista.length > 15) lista.pop();
    sessionStorage.setItem(CHAVE_HISTORICO, JSON.stringify(lista));
  } catch (_) {}
}

// Exportações
function exportarConsultaXlsx(colunas, linhas) {
  const dataHora = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const nomeArquivo = `consulta_sql_${dataHora}`;

  if (typeof window.XLSX !== "undefined") {
    try {
      const ws = window.XLSX.utils.json_to_sheet(linhas);
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, "Resultado");
      window.XLSX.writeFile(wb, `${nomeArquivo}.xlsx`);
      return;
    } catch (e) {
      console.warn("Falha ao gerar com SheetJS, usando fallback XML Excel:", e);
    }
  }

  exportarComoXmlSpreadsheet(colunas, linhas, nomeArquivo);
}

function exportarComoXmlSpreadsheet(colunas, linhas, nomeArquivo) {
  let xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Resultado">
  <Table>
   <Row>`;

  for (const col of colunas) {
    xml += `<Cell><Data ss:Type="String">${escaparXml(col)}</Data></Cell>`;
  }
  xml += `</Row>\n`;

  for (const linha of linhas) {
    xml += `   <Row>`;
    for (const col of colunas) {
      const val = linha[col];
      if (val === null || val === undefined) {
        xml += `<Cell><Data ss:Type="String"></Data></Cell>`;
      } else if (typeof val === "number") {
        xml += `<Cell><Data ss:Type="Number">${val}</Data></Cell>`;
      } else {
        xml += `<Cell><Data ss:Type="String">${escaparXml(String(val))}</Data></Cell>`;
      }
    }
    xml += `</Row>\n`;
  }

  xml += `  </Table>
 </Worksheet>
</Workbook>`;

  dispararDownload(xml, `${nomeArquivo}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

function exportarConsultaTxt(colunas, linhas) {
  const dataHora = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const nomeArquivo = `consulta_sql_${dataHora}`;

  const larguras = {};
  for (const col of colunas) {
    larguras[col] = col.length;
  }

  for (const linha of linhas) {
    for (const col of colunas) {
      const val = linha[col];
      const str = val === null || val === undefined ? "NULL" : String(val);
      if (str.length > larguras[col]) {
        larguras[col] = Math.min(str.length, 60);
      }
    }
  }

  const linhaCabecalho = colunas.map((col) => col.padEnd(larguras[col])).join(" | ");
  const linhaDivisoria = colunas.map((col) => "-".repeat(larguras[col])).join("-+-");

  const linhasCorpo = linhas.map((linha) => {
    return colunas
      .map((col) => {
        const val = linha[col];
        const str = val === null || val === undefined ? "NULL" : String(val);
        const limpa = str.replace(/[\r\n]+/g, " ");
        if (typeof val === "number") {
          return limpa.padStart(larguras[col]);
        }
        return limpa.padEnd(larguras[col]);
      })
      .join(" | ");
  });

  const relatorioTxt = [
    `WorkFlow Zagonel: Exportação de Consulta SQL`,
    `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
    `Total de registros: ${linhas.length}`,
    "",
    linhaCabecalho,
    linhaDivisoria,
    ...linhasCorpo,
    "",
    `Fim do relatório (${linhas.length} registros)`,
  ].join("\r\n");

  dispararDownload(relatorioTxt, `${nomeArquivo}.txt`, "text/plain;charset=utf-8;");
}

function escaparXml(texto) {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function dispararDownload(conteudo, nomeArquivo, tipoMime) {
  const blob = new Blob([conteudo], { type: tipoMime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
