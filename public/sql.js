import { exigirLogin } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { info, escaparHtml, mostrarErro } from "./ui.js";
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
      <div class="card" style="margin-top: 2rem; text-align: center; padding: 2rem;">
        <h2>Acesso Restrito</h2>
        <p style="color: var(--cor-texto-secundario); margin: 1rem 0;">
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
        <span class="badge" style="background: var(--cor-primaria); color: var(--cor-primaria-texto); font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 0.25rem;">
          Administrador
        </span>
      </div>
    </div>

    <div class="sql-layout">
      <!-- Painel Lateral: Tabelas e Pré-comandos -->
      <aside class="sql-tabelas-painel">
        <div class="sql-tabelas-cabecalho">
          <h3 class="sql-tabelas-titulo">
            Tabelas
            ${info("Lista de tabelas do sistema. Clique no nome para ver as colunas ou use os botões rápidos para carregar pré-comandos prontos (SELECT, INSERT, UPDATE, DELETE).")}
          </h3>
          <span id="contador-tabelas" class="sql-tabela-qtd">0 tabelas</span>
        </div>

        <input
          type="search"
          id="busca-tabela"
          class="sql-tabelas-busca"
          placeholder="Filtrar tabelas..."
          autocomplete="off"
        >

        <div id="lista-tabelas" class="sql-tabelas-lista">
          <p class="sql-vazio-msg">Carregando tabelas do banco...</p>
        </div>
      </aside>

      <!-- Painel Principal: Editor e Resultados -->
      <section class="sql-editor-painel">
        <!-- Caixa do Editor -->
        <div class="sql-caixa-editor">
          <div class="sql-editor-barra-topo">
            <div class="sql-editor-rotulo">
              <span>Instrução SQL</span>
              <span class="sql-editor-atalhos">Atalho: <kbd>Ctrl + Enter</kbd> para executar</span>
            </div>

            <div class="sql-historico-wrap">
              <select id="select-historico" class="sql-select-historico" title="Comandos executados recentemente">
                <option value="">Histórico recente...</option>
              </select>
            </div>
          </div>

          <textarea
            id="editor-sql-texto"
            class="sql-textarea"
            placeholder="Digite aqui o comando SQL... Exemplo: SELECT * FROM usuarios LIMIT 50;"
            spellcheck="false"
          >SELECT * FROM usuarios LIMIT 50;</textarea>

          <div class="sql-editor-acoes">
            <div class="sql-editor-botoes">
              <button type="button" id="btn-executar-sql" class="btn btn-primario" style="display: inline-flex; align-items: center; gap: 0.4rem;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                <span>Executar (Ctrl+Enter)</span>
              </button>
              <button type="button" id="btn-limpar-sql" class="btn btn-secundario">
                Limpar
              </button>
            </div>

            <div style="font-size: 0.8rem; color: var(--cor-texto-secundario);">
              Suporta SELECT, INSERT, UPDATE com WHERE e DELETE com WHERE
            </div>
          </div>
        </div>

        <!-- Caixa de Resultados -->
        <div class="sql-resultado-painel">
          <div class="sql-resultado-cabecalho">
            <div id="sql-status-execucao" class="sql-status-info">
              <span>Aguardando execução...</span>
            </div>

            <div class="sql-exportar-grupo">
              <span style="font-size: 0.8rem; color: var(--cor-texto-secundario); font-weight: 600;">Exportar:</span>
              <button type="button" id="btn-exportar-xlsx" class="btn-exportar btn-exportar-xlsx" disabled title="Exportar resultado para planilha Excel (.xlsx)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                <span>XLSX</span>
              </button>
              <button type="button" id="btn-exportar-txt" class="btn-exportar" disabled title="Exportar resultado para arquivo de texto formatado (.txt)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>
                <span>TXT</span>
              </button>
            </div>
          </div>

          <div id="sql-area-resultado">
            <p class="sql-vazio-msg">
              Execute uma instrução SQL para visualizar os resultados ou o status de alteração aqui.
            </p>
          </div>
        </div>
      </section>
    </div>
  `;

  // Elementos do DOM
  const editor = document.getElementById("editor-sql-texto");
  const btnExecutar = document.getElementById("btn-executar-sql");
  const btnLimpar = document.getElementById("btn-limpar-sql");
  const selectHistorico = document.getElementById("select-historico");
  const buscaTabela = document.getElementById("busca-tabela");
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

  // Busca em tabelas
  buscaTabela.addEventListener("input", () => {
    renderizarListaTabelas(buscaTabela.value.trim().toLowerCase());
  });

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
      alert("Digite uma instrução SQL para executar.");
      editor.focus();
      return;
    }

    btnExecutar.disabled = true;
    btnExecutar.innerHTML = `<span>Executando...</span>`;

    const statusEl = document.getElementById("sql-status-execucao");
    const areaEl = document.getElementById("sql-area-resultado");
    statusEl.innerHTML = `<span style="color: var(--cor-texto-secundario);">Executando consulta no banco D1...</span>`;

    try {
      const resp = await api("/api/sql", {
        method: "POST",
        body: JSON.stringify({ sql }),
      });

      salvarNoHistorico(sql);
      carregarHistoricoNoSelect(selectHistorico);

      if (resp.tipo === "consulta") {
        resultadoAtual = resp;
        btnExportarXlsx.disabled = resp.linhas.length === 0;
        btnExportarTxt.disabled = resp.linhas.length === 0;

        statusEl.innerHTML = `
          <span class="sql-badge-sucesso">SELECT realizado</span>
          <span>${resp.totalLinhas} registro(s) retornado(s) em ${resp.tempoMs} ms</span>
        `;
        renderizarTabelaDados(areaEl, resp.colunas, resp.linhas);
      } else {
        resultadoAtual = null;
        btnExportarXlsx.disabled = true;
        btnExportarTxt.disabled = true;

        statusEl.innerHTML = `
          <span class="sql-badge-mutacao">Comando executado</span>
          <span>${resp.linhasAfetadas ?? 0} linha(s) afetada(s) em ${resp.tempoMs} ms</span>
        `;

        areaEl.innerHTML = `
          <div class="card" style="padding: 1.5rem; border-left: 4px solid var(--cor-ok); background: var(--cor-fundo);">
            <h4 style="margin: 0 0 0.5rem 0; color: var(--cor-ok);">Comando concluído com sucesso</h4>
            <p style="margin: 0; font-family: monospace; font-size: 0.9rem;">
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
        <span style="color: var(--cor-vencido); font-weight: bold;">Erro na execução</span>
      `;
      areaEl.innerHTML = `
        <div class="sql-erro-card">
<strong>Falha ao executar instrução SQL:</strong>
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

async function carregarTabelas(mostrarCarregando = true) {
  const listaEl = document.getElementById("lista-tabelas");
  const contadorEl = document.getElementById("contador-tabelas");
  if (mostrarCarregando && listaEl) {
    listaEl.innerHTML = `<p class="sql-vazio-msg">Atualizando tabelas...</p>`;
  }

  try {
    const dados = await api("/api/sql");
    estadoTabelas = dados.tabelas || [];
    if (contadorEl) {
      contadorEl.textContent = `${estadoTabelas.length} tabelas`;
    }
    renderizarListaTabelas("");
  } catch (err) {
    if (listaEl) {
      listaEl.innerHTML = `
        <div class="sql-erro-card">
Erro ao listar tabelas: ${escaparHtml(err.message)}
        </div>
      `;
    }
  }
}

function renderizarListaTabelas(filtro) {
  const listaEl = document.getElementById("lista-tabelas");
  if (!listaEl) return;

  const filtradas = estadoTabelas.filter((t) => t.nome.toLowerCase().includes(filtro));
  if (filtradas.length === 0) {
    listaEl.innerHTML = `<p class="sql-vazio-msg">Nenhuma tabela encontrada.</p>`;
    return;
  }

  listaEl.innerHTML = filtradas
    .map((tab) => {
      const nome = escaparHtml(tab.nome);
      return `
        <div class="sql-tabela-card" data-tabela="${nome}">
          <div class="sql-tabela-topo">
            <span class="sql-tabela-nome" title="Clique para expandir as colunas da tabela ${nome}">
              ${nome}
            </span>
            <span class="sql-tabela-qtd">${tab.totalRegistros} reg</span>
          </div>

          <div class="sql-acoes-rapidas">
            <button type="button" class="btn-sql-pre" data-acao="select" data-tabela="${nome}" title="Carregar consulta SELECT">SELECT</button>
            <button type="button" class="btn-sql-pre" data-acao="insert" data-tabela="${nome}" title="Carregar modelo de INSERT">INSERT</button>
            <button type="button" class="btn-sql-pre" data-acao="update" data-tabela="${nome}" title="Carregar modelo de UPDATE com WHERE">UPDATE</button>
            <button type="button" class="btn-sql-pre" data-acao="delete" data-tabela="${nome}" title="Carregar modelo de DELETE com WHERE">DELETE</button>
          </div>

          <div class="sql-colunas-detalhe" style="display: none;">
            <div style="font-weight: 600; margin-bottom: 0.2rem;">Colunas (${tab.colunas.length}):</div>
            <ul class="sql-colunas-lista">
              ${tab.colunas
                .map(
                  (c) => `
                <li class="sql-coluna-item">
                  <span class="${c.pk ? "sql-coluna-pk" : ""}">${escaparHtml(c.nome)}${c.pk ? " (PK)" : ""}</span>
                  <span style="opacity: 0.7;">${escaparHtml(c.tipo)}</span>
                </li>
              `
                )
                .join("")}
            </ul>
          </div>
        </div>
      `;
    })
    .join("");

  // Eventos de clique nos botões de pré-comandos
  listaEl.querySelectorAll(".btn-sql-pre").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const acao = btn.getAttribute("data-acao");
      const nomeTab = btn.getAttribute("data-tabela");
      const tab = estadoTabelas.find((t) => t.nome === nomeTab);
      if (!tab || !tab.comandos) return;

      const editor = document.getElementById("editor-sql-texto");
      if (!editor) return;

      editor.value = tab.comandos[acao] || "";
      editor.focus();
      editor.setSelectionRange(editor.value.length, editor.value.length);
    });
  });

  // Evento de clique para expandir/recolher colunas
  listaEl.querySelectorAll(".sql-tabela-card").forEach((card) => {
    const topo = card.querySelector(".sql-tabela-topo");
    const detalhe = card.querySelector(".sql-colunas-detalhe");
    topo.addEventListener("click", () => {
      const visivel = detalhe.style.display !== "none";
      detalhe.style.display = visivel ? "none" : "block";
    });
  });
}

function renderizarTabelaDados(container, colunas, linhas) {
  if (linhas.length === 0) {
    container.innerHTML = `
      <div class="sql-vazio-msg">
        A consulta não retornou nenhum registro.
      </div>
    `;
    return;
  }

  const cabecalhosHtml = colunas
    .map((col) => `<th>${escaparHtml(col)}</th>`)
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
    <div class="sql-tabela-scroll">
      <table class="sql-tabela-dados">
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
      option.textContent = `${idx + 1}. ${resumo.length > 45 ? resumo.substring(0, 42) + "..." : resumo}`;
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

  // Fallback garantido: XML Spreadsheet 2003 reconhecido nativamente pelo Microsoft Excel
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

  // Calcula largura máxima de cada coluna para formatação limpa e legível
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

  // Monta cabeçalho
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
