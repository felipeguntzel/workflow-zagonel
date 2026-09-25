import { api } from "./api.js";
import {
  info,
  mostrarErro,
  escaparAtributo,
  escaparHtml,
  botaoIconeEditar,
  botaoIconeExcluir,
  debounce,
  SVG_ICONE_OLHO,
  SVG_ICONE_OLHO_RISCADO,
  alternarVisualizacaoSenha
} from "./ui.js";
import { permissaoDaTela } from "./auth.js";
import { confirmarAcao } from "./modal.js";
import { tornarTabelaReordenavel } from "./tabela-colunas.js";

export function gerarSenhaAleatoria(tamanho = 6) {
  const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const numeros = "23456789";
  const todos = letras + numeros;
  const bytes = crypto.getRandomValues(new Uint8Array(tamanho));
  let senha = "";
  senha += letras[bytes[0] % letras.length];
  senha += numeros[bytes[1] % numeros.length];
  for (let i = 2; i < tamanho; i++) {
    senha += todos[bytes[i] % todos.length];
  }
  return senha.split("").sort(() => Math.random() - 0.5).join("");
}

export function ehSequenciaNumerica(str) {
  if (typeof str !== "string" || str.length < 2) return false;
  let crescente = true;
  let decrescente = true;
  for (let i = 1; i < str.length; i++) {
    const prev = Number(str[i - 1]);
    const curr = Number(str[i]);
    if (curr !== prev + 1) crescente = false;
    if (curr !== prev - 1) decrescente = false;
  }
  return crescente || decrescente;
}

export function validarComplexidadeSenhaCliente(senha) {
  if (typeof senha !== "string") {
    return { valido: false, mensagem: "Senha inválida." };
  }
  if (senha.length < 6) {
    return { valido: false, mensagem: "A senha deve ter no mínimo 6 caracteres." };
  }
  if (senha.length > 10) {
    return { valido: false, mensagem: "A senha deve ter no máximo 10 caracteres." };
  }
  if (/^\d+$/.test(senha)) {
    if (new Set(senha).size === 1) {
      return { valido: false, mensagem: "A senha numérica não pode conter números repetidos (ex: 111111)." };
    }
    if (ehSequenciaNumerica(senha)) {
      return { valido: false, mensagem: "A senha numérica não pode ser uma sequência de 1 em 1 (ex: 123456)." };
    }
  }
  return { valido: true };
}

export async function calcularSha256(texto) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function mostrarAvisoModal(titulo, mensagem, acoes = []) {
  const modalWrap = document.createElement("div");
  modalWrap.className = "modal-fundo modal-fundo--aviso";
  modalWrap.setAttribute("role", "dialog");
  modalWrap.setAttribute("aria-modal", "true");

  const linhas = String(mensagem)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let conteudoHtml = "";
  let emLista = false;

  for (const l of linhas) {
    if (/^\d+\./.test(l)) {
      if (!emLista) {
        conteudoHtml += `<ol style="margin: 0.5rem 0 0.8rem 1.4rem; padding: 0;">`;
        emLista = true;
      }
      conteudoHtml += `<li style="margin-bottom: 0.35rem; line-height: 1.4;">${escaparHtml(l.replace(/^\d+\.\s*/, ""))}</li>`;
    } else {
      if (emLista) {
        conteudoHtml += `</ol>`;
        emLista = false;
      }
      if (l.toLowerCase().startsWith("o que fazer")) {
        conteudoHtml += `<p style="font-weight: 700; margin-top: 0.8rem; margin-bottom: 0.3rem; color: var(--cor-texto);">${escaparHtml(l)}</p>`;
      } else {
        conteudoHtml += `<p style="margin-bottom: 0.5rem; line-height: 1.5; color: var(--cor-texto);">${escaparHtml(l)}</p>`;
      }
    }
  }
  if (emLista) conteudoHtml += `</ol>`;

  modalWrap.innerHTML = `
    <div class="modal-cadastro modal-cadastro--simples" style="max-width: 520px; box-shadow: 0 10px 30px rgba(0,0,0,0.25);">
      <div class="modal-cabecalho" style="background: #fff5f5; border-bottom: 1px solid #fed7d7;">
        <h3 style="color: #9b2c2c; display: flex; align-items: center; gap: 0.5rem; font-size: 1.05rem;">
          <span style="font-size: 1.25rem;">⚠️</span> ${escaparHtml(titulo)}
        </h3>
        <button type="button" class="modal-fechar" aria-label="Fechar">✕</button>
      </div>
      <div style="padding: 1.25rem; font-size: 0.92rem; background: var(--cor-superficie);">
        ${conteudoHtml}
      </div>
      <div class="modal-rodape" style="background: var(--cor-fundo);">
        ${acoes
          .map(
            (a, i) => `
          <button type="button" class="btn ${a.primario ? "btn-primario" : "btn-secundario"} btn-aviso-acao-${i}">
            ${escaparHtml(a.texto)}
          </button>
        `
          )
          .join("")}
        <button type="button" class="btn btn-secundario btn-fechar-aviso">Entendido</button>
      </div>
    </div>
  `;

  document.body.appendChild(modalWrap);
  const fechar = () => modalWrap.remove();
  modalWrap.querySelector(".modal-fechar")?.addEventListener("click", fechar);
  modalWrap.querySelector(".btn-fechar-aviso")?.addEventListener("click", fechar);
  modalWrap.addEventListener("click", (e) => {
    if (e.target === modalWrap) fechar();
  });

  acoes.forEach((a, i) => {
    const btn = modalWrap.querySelector(`.btn-aviso-acao-${i}`);
    btn?.addEventListener("click", () => {
      fechar();
      a.onClick?.();
    });
  });
}

export function formatarRotuloFK(o) {
  if (!o) return "";
  if (o.codigo && o.nome) return `${o.codigo} - ${o.nome}`;
  return o.nome ?? "";
}

function valorExibicao(linha, campo, opcoesFK) {
  if (campo.tipo === "checkbox") {
    if (campo.nome === "ativo") {
      return linha[campo.nome] !== 0 ? "Ativo" : "Inativo";
    }
    return linha[campo.nome] ? "Sim" : "Não";
  }
  if (campo.tipo === "multiselect") {
    const opcoes = opcoesFK[campo.nome] ?? [];
    const selecionados = Array.isArray(linha[campo.nome])
      ? linha[campo.nome]
      : linha[campo.nome] !== undefined && linha[campo.nome] !== null
      ? [linha[campo.nome]]
      : [];
    const nomes = selecionados
      .map((id) => {
        const item = opcoes.find((o) => o.id === id);
        return item ? formatarRotuloFK(item) : "";
      })
      .filter(Boolean);
    return nomes.length > 0 ? nomes.join(", ") : "";
  }
  if (campo.opcoesEndpoint) {
    const opcoes = opcoesFK[campo.nome] ?? [];
    const alvo = opcoes.find((o) => o.id === linha[campo.nome]);
    return alvo ? formatarRotuloFK(alvo) : linha[campo.nome] ?? "";
  }
  return linha[campo.nome] ?? "";
}

const cacheFK = new Map();

export function limparCacheFK() {
  cacheFK.clear();
}

async function obterOpcoesFK(endpoint) {
  const agora = Date.now();
  const emCache = cacheFK.get(endpoint);
  if (emCache && agora - emCache.tempo < 60000) {
    return emCache.dados;
  }
  const dados = await api(endpoint).catch(() => []);
  const lista = Array.isArray(dados) ? dados : [];
  cacheFK.set(endpoint, { dados: lista, tempo: agora });
  return lista;
}

export async function renderCrud(container, config) {
  if (!config.tela) throw new Error("renderCrud: config.tela é obrigatório");
  const permissao = permissaoDaTela(config.tela);
  if (!permissao.visualizar) {
    container.innerHTML = `<h2>${config.titulo}</h2><p>Você não tem permissão para visualizar esta tela.</p>`;
    return;
  }

  const camposVisiveis = config.campos.filter((c) => !c.apenasFiltro);
  const camposEditaveis = config.campos.filter((c) => !c.apenasFiltro);
  const ehSimples = config.estilo ? config.estilo === "simples" : camposEditaveis.length <= 2;

  let listaDados = [];
  let editandoLinhaId = null;
  let ordemAtual = { campo: "id", direcao: "asc" };
  let termoBusca = "";
  const opcoesFK = {};

  // Renderiza imediatamente a estrutura da tela com esqueleto de carregamento
  container.innerHTML = `
    <div class="pagina-cabecalho">
      <div class="pagina-cabecalho__esquerda">
        <h2>${config.titulo}</h2>
      </div>
      <div class="pagina-cabecalho__acoes" style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
        <input type="search" class="input-busca-crud" placeholder="Buscar..." aria-label="Filtrar registros" style="padding: 0.4rem 0.75rem; font-size: 0.88rem; border-radius: 0.35rem; border: 1px solid var(--cor-borda); background: var(--cor-fundo); color: var(--cor-texto); min-width: 180px;">
        ${permissao.inserir ? `<button type="button" class="btn btn-primario btn-adicionar-registro">+ Adicionar</button>` : ""}
        <button type="button" class="btn btn-secundario btn-pequeno btn-config-colunas" data-tabela="crud_${String(config.tela || config.endpoint || "tabela").replace(/[^a-zA-Z0-9_]/g, "_")}" title="Personalizar exibição de colunas da tabela">
          <span>⚙️</span> Colunas
        </button>
      </div>
    </div>
    <div class="container-banner-prerequisito"></div>
    <div class="tabela-wrap">
      <table>
        <thead>
          <tr>
            <th class="th-ordenavel th-id" data-campo="id">#ID <span class="ordem-indicador" data-indicador="id">▲</span></th>
            ${camposVisiveis
              .map(
                (c, i) => `
                <th class="th-ordenavel" data-campo="${c.nome}" ${i === 0 && config.larguraColuna1 ? `style="min-width:${config.larguraColuna1}ch"` : ""}>
                  ${c.label} <span class="ordem-indicador" data-indicador="${c.nome}"></span>
                </th>
              `
              )
              .join("")}
            <th class="td-acoes">Ações</th>
          </tr>
        </thead>
        <tbody class="tbody-crud">
          ${[1, 2, 3, 4, 5]
            .map(
              () => `
            <tr class="linha-esqueleto">
              <td class="td-id"><div class="esqueleto-bloco" style="width: 28px;"></div></td>
              ${camposVisiveis.map(() => `<td><div class="esqueleto-bloco" style="width: 65%;"></div></td>`).join("")}
              <td class="td-acoes"><div class="esqueleto-bloco" style="width: 44px; margin-left: auto;"></div></td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
    <div class="container-modal-crud"></div>
  `;

  const tabelaCrud = container.querySelector("table");
  if (tabelaCrud) {
    tornarTabelaReordenavel(tabelaCrud, `crud_${String(config.tela || config.endpoint || "tabela").replace(/[^a-zA-Z0-9_]/g, "_")}`);
  }

  function verificarPreRequisitos() {
    const faltantes = [];

    if (Array.isArray(config.preRequisitos)) {
      for (const req of config.preRequisitos) {
        const dados = opcoesFK[req.endpoint] || opcoesFK[req.nome] || [];
        if (dados.length === 0) {
          faltantes.push({ nome: req.nome, url: req.url });
        }
      }
    }

    for (const campo of config.campos) {
      if (campo.obrigatorio && campo.opcoesEndpoint) {
        const opcoes = opcoesFK[campo.nome] ?? [];
        if (opcoes.length === 0) {
          const nomeAmigavel = campo.label;
          if (!faltantes.some((f) => f.nome.toLowerCase() === nomeAmigavel.toLowerCase())) {
            let url = "";
            if (campo.opcoesEndpoint.includes("empresas")) url = "/empresas";
            else if (campo.opcoesEndpoint.includes("setores")) url = "/setores";
            else if (campo.opcoesEndpoint.includes("status")) url = "/status";
            else if (campo.opcoesEndpoint.includes("fluxos")) url = "/fluxo";
            faltantes.push({ nome: nomeAmigavel, url });
          }
        }
      }
    }

    return faltantes;
  }

  const tbody = container.querySelector(".tbody-crud");
  const containerModal = container.querySelector(".container-modal-crud");
  const btnAdicionar = container.querySelector(".btn-adicionar-registro");

  btnAdicionar?.addEventListener("click", () => {
    const pendencias = verificarPreRequisitos();
    if (pendencias.length > 0) {
      const nomes = pendencias.map((f) => `"${f.nome}"`).join(", ");
      const primeiro = pendencias[0];
      const acoes = primeiro.url
        ? [
            {
              texto: `Cadastrar ${primeiro.nome} agora`,
              primario: true,
              onClick: () => {
                window.location.href = primeiro.url;
              },
            },
          ]
        : [];

      mostrarAvisoModal(
        "Cadastro prévio necessário",
        `Para cadastrar um novo ${config.tituloSingular || config.titulo}, é obrigatório existir pelo menos um cadastro de ${nomes} no sistema.\n\n` +
          `Atualmente não há nenhum registro em ${nomes}.\n` +
          `Por favor, realize primeiro o cadastro de ${nomes} antes de continuar.`,
        acoes
      );
      return;
    }
    abrirModalCadastro(null);
  });

  // Configurar ordenação por clique nos cabeçalhos
  container.querySelectorAll(".th-ordenavel").forEach((th) => {
    th.addEventListener("click", () => {
      const campo = th.dataset.campo;
      if (!campo) return;
      if (ordemAtual.campo === campo) {
        ordemAtual.direcao = ordemAtual.direcao === "asc" ? "desc" : "asc";
      } else {
        ordemAtual.campo = campo;
        ordemAtual.direcao = "asc";
      }
      renderizarLinhas();
    });
  });

  const inputBusca = container.querySelector(".input-busca-crud");
  if (inputBusca) {
    inputBusca.addEventListener(
      "input",
      debounce((e) => {
        termoBusca = e.target.value || "";
        renderizarLinhas();
      }, 300)
    );
  }

  function renderizarLinhas() {
    let dados = [...listaDados];
    if (termoBusca.trim()) {
      const q = termoBusca.trim().toLowerCase();
      dados = dados.filter((linha) => {
        if (String(linha.id).includes(q)) return true;
        for (const c of camposVisiveis) {
          const val = String(valorExibicao(linha, c, opcoesFK) || "").toLowerCase();
          if (val.includes(q)) return true;
        }
        return false;
      });
    }

    dados.sort((a, b) => {
      let valA = a[ordemAtual.campo];
      let valB = b[ordemAtual.campo];

      const campoConfig = config.campos.find((c) => c.nome === ordemAtual.campo);
      if (campoConfig?.opcoesEndpoint || campoConfig?.tipo === "multiselect") {
        valA = valorExibicao(a, campoConfig, opcoesFK);
        valB = valorExibicao(b, campoConfig, opcoesFK);
      }

      if (ordemAtual.campo === "id" || campoConfig?.tipo === "number") {
        const numA = Number(valA ?? 0);
        const numB = Number(valB ?? 0);
        return ordemAtual.direcao === "asc" ? numA - numB : numB - numA;
      }

      const comp = String(valA ?? "").localeCompare(String(valB ?? ""), "pt-BR", { numeric: true, sensitivity: "base" });
      return ordemAtual.direcao === "asc" ? comp : -comp;
    });

    container.querySelectorAll(".ordem-indicador").forEach((indicador) => {
      const campo = indicador.dataset.indicador;
      if (campo === ordemAtual.campo) {
        indicador.textContent = ordemAtual.direcao === "asc" ? "▲" : "▼";
      } else {
        indicador.textContent = "";
      }
    });

    if (dados.length === 0) {
      const msgVazio = termoBusca.trim()
        ? `Nenhum registro encontrado para "${escaparHtml(termoBusca)}".`
        : "Nenhum registro encontrado.";
      tbody.innerHTML = `<tr><td colspan="${camposVisiveis.length + 2}" style="text-align:center; padding: 2rem 1.5rem; color: var(--cor-texto-secundario);">${msgVazio}</td></tr>`;
      return;
    }

    tbody.innerHTML = dados
      .map((linha) => {
        if (linha.id === editandoLinhaId && ehSimples) {
          return renderLinhaEdicaoInline(linha);
        }

        const acoesExtrasHtml = (config.acoesExtras ?? [])
          .map(
            (acao) =>
              `<button type="button" class="btn btn-pequeno btn-secundario btn-acao-extra ${acao.classe ?? ""}" data-id="${linha.id}" title="${escaparAtributo(acao.rotulo)}">${escaparHtml(acao.rotulo)}</button>`
          )
          .join("");

        return `
          <tr data-id="${linha.id}">
            <td class="td-id">#${linha.id}</td>
            ${camposVisiveis
              .map((c) => {
                if (c.tipo === "cor") {
                  const corVal = linha[c.nome];
                  const celulaHtml = corVal
                    ? `<span style="display:inline-flex; align-items:center; gap:0.45rem;"><span style="display:inline-block; width:13px; height:13px; border-radius:50%; background:${escaparAtributo(corVal)}; border:1px solid rgba(0,0,0,0.25);"></span><span style="font-family:monospace; font-size:0.85rem;">${escaparHtml(corVal)}</span></span>`
                    : "-";
                  return `<td title="${escaparAtributo(corVal || '')}">${celulaHtml}</td>`;
                }
                return `<td title="${escaparAtributo(String(valorExibicao(linha, c, opcoesFK)))}">${escaparHtml(valorExibicao(linha, c, opcoesFK))}</td>`;
              })
              .join("")}
            <td class="td-acoes">
              ${acoesExtrasHtml}
              ${permissao.editar ? botaoIconeEditar("btn-editar", linha.id) : ""}
              ${permissao.excluir ? botaoIconeExcluir("btn-excluir", linha.id) : ""}
            </td>
          </tr>
        `;
      })
      .join("");

    vincularEventosLinhas();
  }

  function renderLinhaEdicaoInline(linha) {
    const colunasInputs = camposVisiveis
      .map((c) => {
        const val = linha[c.nome] ?? "";
        if (c.tipo === "cor") {
          return `
            <td>
              <input type="color" class="campo-inline" data-campo="${c.nome}" value="${escaparAtributo(val || '#2563eb')}" style="width: 44px; height: 32px; padding: 2px; cursor: pointer; border-radius: 4px; border: 1px solid var(--cor-borda);">
            </td>
          `;
        }
        return `
          <td>
            <input type="${c.tipo ?? "text"}" class="campo-inline" data-campo="${c.nome}" value="${escaparAtributo(val)}" ${c.obrigatorio ? "required" : ""} placeholder="${escaparAtributo(c.label)}">
          </td>
        `;
      })
      .join("");

    return `
      <tr class="tr-editando-inline" data-id="${linha.id}">
        <td class="td-id">#${linha.id}</td>
        ${colunasInputs}
        <td class="td-acoes">
          <div class="acoes-inline">
            <button type="button" class="btn-acao-inline btn-salvar-inline" title="Salvar alteração">✓</button>
            <button type="button" class="btn-acao-inline btn-cancelar-inline" title="Cancelar">✕</button>
          </div>
        </td>
      </tr>
    `;
  }

  function vincularEventosLinhas() {
    // Ações extras (ex: Permissões)
    (config.acoesExtras ?? []).forEach((acao) => {
      tbody.querySelectorAll(`.${acao.classe ?? "btn-acao-extra"}`).forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = Number(btn.dataset.id);
          const linha = listaDados.find((d) => d.id === id);
          if (linha) acao.onClick?.(linha, recarregar);
        });
      });
    });

    // Editar
    tbody.querySelectorAll(".btn-editar").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.id);
        const linha = listaDados.find((d) => d.id === id);
        if (!linha) return;

        if (ehSimples) {
          editandoLinhaId = id;
          renderizarLinhas();
          const primeiroInput = tbody.querySelector(".tr-editando-inline .campo-inline");
          primeiroInput?.focus();
        } else {
          abrirModalCadastro(linha);
        }
      });
    });

    // Salvar inline
    tbody.querySelectorAll(".btn-salvar-inline").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const tr = btn.closest("tr");
        const id = Number(tr.dataset.id);
        const inputs = tr.querySelectorAll(".campo-inline");
        const corpo = {};
        let valido = true;

        inputs.forEach((inp) => {
          const nomeCampo = inp.dataset.campo;
          const valor = inp.value.trim();
          const campoCfg = config.campos.find((c) => c.nome === nomeCampo);
          if (campoCfg?.obrigatorio && !valor) {
            inp.style.borderColor = "var(--cor-vencido)";
            inp.focus();
            valido = false;
            return;
          }
          if (campoCfg?.tipo === "cor" && valor) {
            const duplicado = listaDados.find((d) => d.id !== id && d.cor && d.cor.toLowerCase() === valor.toLowerCase());
            if (duplicado) {
              mostrarAvisoModal("Cor já utilizada", `A cor "${valor}" já está associada ao status "${duplicado.nome}". Escolha uma cor diferente.`);
              inp.style.borderColor = "var(--cor-vencido)";
              inp.focus();
              valido = false;
              return;
            }
          }
          corpo[nomeCampo] = campoCfg?.tipo === "number" ? Number(valor) : valor;
        });

        if (!valido) return;

        try {
          await api(`${config.endpoint}/${id}`, { method: "PUT", body: corpo });
          editandoLinhaId = null;
          await recarregar();
          config.aoSalvar?.();
        } catch (e) {
          mostrarErro(document.getElementById("mensagem-erro"), e);
        }
      });
    });

    // Tecla Enter e Esc na linha inline
    tbody.querySelectorAll(".tr-editando-inline .campo-inline").forEach((inp) => {
      inp.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          inp.closest("tr").querySelector(".btn-salvar-inline")?.click();
        }
        if (ev.key === "Escape") {
          ev.preventDefault();
          editandoLinhaId = null;
          renderizarLinhas();
        }
      });
    });

    // Cancelar inline
    tbody.querySelectorAll(".btn-cancelar-inline").forEach((btn) => {
      btn.addEventListener("click", () => {
        editandoLinhaId = null;
        renderizarLinhas();
      });
    });

    // Excluir com validação de dependências e instruções passo a passo
    tbody.querySelectorAll(".btn-excluir").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const linha = listaDados.find((d) => String(d.id) === String(id));
        const rotuloItem = linha?.nome ? `"${linha.nome}"` : `#${id}`;

        const confirmado = await confirmarAcao(
          `Excluir ${config.tituloSingular || "registro"} ${rotuloItem}?`,
          "Essa ação não poderá ser desfeita."
        );
        if (!confirmado) return;

        try {
          await api(`${config.endpoint}/${id}`, { method: "DELETE" });
          await recarregar();
        } catch (e) {
          mostrarAvisoModal("Exclusão não permitida", e.message);
        }
      });
    });
  }

  // Gerar campos de formulário para o modal
  function renderCampoModalHtml(campo, linhaEdicao = null) {
    const obrigatorioMarca = campo.obrigatorio ? `<span class="campo-obrigatorio" title="Campo obrigatório">*</span>` : "";
    const dicaHtml = campo.dica ? info(campo.dica) : "";
    const rotuloHtml = `<span class="campo-rotulo">${escaparHtml(campo.label)} ${obrigatorioMarca} ${dicaHtml}</span>`;
    const colClasse = campo.tipo === "multiselect" || campo.colFull ? "col-full" : "";

    if (campo.tipo === "checkbox") {
      const marcado = linhaEdicao ? !!linhaEdicao[campo.nome] : (campo.padrao !== undefined ? !!campo.padrao : false);
      return `
        <div class="campo-wrap ${colClasse}">
          <label class="campo-checkbox">
            <input type="checkbox" name="${campo.nome}" ${marcado ? "checked" : ""}>
            <span>${escaparHtml(campo.label)} ${dicaHtml}</span>
          </label>
        </div>
      `;
    }

    if (campo.tipo === "multiselect") {
      const opcoes = opcoesFK[campo.nome] ?? [];
      const selecionados = linhaEdicao
        ? Array.isArray(linhaEdicao[campo.nome])
          ? linhaEdicao[campo.nome]
          : [linhaEdicao[campo.nome]]
        : [];
      return `
        <div class="campo-wrap ${colClasse}">
          <label style="margin-bottom: 0.35rem; display: block;">${rotuloHtml}</label>
          <div class="multiselect-caixa" data-campo="${campo.nome}">
            ${
              opcoes.length === 0
                ? `<span style="font-size:0.85rem; color:var(--cor-texto-secundario); padding:0.4rem;">Nenhuma opção disponível.</span>`
                : opcoes
                    .map(
                      (o) => `
              <label class="multiselect-item">
                <input type="checkbox" name="${campo.nome}[]" value="${o.id}" ${selecionados.includes(o.id) ? "checked" : ""}>
                <span>${escaparHtml(formatarRotuloFK(o))}</span>
              </label>
            `
                    )
                    .join("")
            }
          </div>
        </div>
      `;
    }

    if (campo.opcoesEndpoint) {
      const opcoes = campo.dependeDe ? [] : opcoesFK[campo.nome] ?? [];
      const valorAtual = linhaEdicao ? linhaEdicao[campo.nome] : "";
      return `
        <div class="campo-wrap ${colClasse}">
          <label>${rotuloHtml}
            <select name="${campo.nome}" ${campo.obrigatorio ? "required" : ""}>
              <option value="">Selecione…</option>
              ${opcoes.map((o) => `<option value="${o.id}" ${valorAtual === o.id ? "selected" : ""}>${escaparHtml(formatarRotuloFK(o))}</option>`).join("")}
            </select>
          </label>
        </div>
      `;
    }

    if (campo.tipo === "password") {
      const placeholder =
        linhaEdicao
          ? "(Deixe em branco para manter a atual)"
          : "6 a 10 dígitos (números/letras/símbolos)";

      return `
        <div class="campo-wrap ${colClasse}">
          <label>${rotuloHtml}
            <div class="campo-senha-container" style="display: flex; gap: 0.4rem; align-items: center;">
              <input type="password" name="${campo.nome}" autocomplete="new-password" ${campo.obrigatorio && !linhaEdicao ? "required" : ""} placeholder="${escaparAtributo(placeholder)}" style="flex: 1;">
              <button type="button" class="btn btn-secundario btn-gerar-senha" data-campo="${campo.nome}" style="white-space: nowrap; font-size: 0.8rem; padding: 0.45rem 0.65rem;" title="Gerar senha aleatória de 6 dígitos misturando letras e números">⚡ Gerar senha</button>
              <button type="button" class="btn btn-secundario btn-toggle-senha" data-campo="${campo.nome}" style="display: inline-flex; align-items: center; justify-content: center; padding: 0.45rem 0.6rem;" title="Visualizar ou ocultar senha" aria-label="Visualizar ou ocultar senha">${SVG_ICONE_OLHO}</button>
            </div>
            <div class="aviso-capslock aviso-capslock-${campo.nome}" hidden style="display: none; align-items: center; gap: 0.35rem; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.78rem; font-weight: 600; margin-top: 0.35rem;">⚠️ Caps Lock ativado</div>
          </label>
        </div>
      `;
    }

    if (campo.tipo === "cor") {
      const valorAtual = linhaEdicao ? linhaEdicao[campo.nome] ?? "#2563eb" : "#2563eb";
      const paleta = ["#2563eb", "#16a34a", "#eab308", "#f97316", "#dc2626", "#9333ea", "#06b6d4", "#ec4899", "#6b7280", "#4f46e5"];
      return `
        <div class="campo-wrap ${colClasse}">
          <label>${rotuloHtml}
            <div style="display: flex; gap: 0.6rem; align-items: center; margin-top: 0.25rem; flex-wrap: wrap;">
              <input type="color" id="picker-cor-${campo.nome}" value="${escaparAtributo(valorAtual)}" style="width: 44px; height: 38px; padding: 2px; cursor: pointer; border-radius: 4px; border: 1px solid var(--cor-borda);">
              <input type="text" name="${campo.nome}" id="input-texto-cor-${campo.nome}" value="${escaparAtributo(valorAtual)}" style="width: 110px; font-family: monospace; font-size: 0.88rem;" class="input-padrao" maxlength="7" placeholder="#000000">
              <div class="paleta-swatches" style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
                ${paleta.map(p => `
                  <button type="button" class="btn-swatch-cor" data-cor="${p}" data-campo="${campo.nome}" style="width: 24px; height: 24px; border-radius: 50%; background: ${p}; border: 2px solid ${valorAtual === p ? 'var(--cor-texto)' : 'transparent'}; cursor: pointer;" title="${p}"></button>
                `).join("")}
              </div>
            </div>
          </label>
        </div>
      `;
    }

    const tipo = campo.tipo ?? "text";
    const valorAtual = linhaEdicao ? linhaEdicao[campo.nome] ?? "" : "";
    const disabled = linhaEdicao && campo.desabilitadoNaEdicao ? "disabled" : "";
    const placeholder = campo.placeholder || (campo.obrigatorio ? "Preenchimento obrigatório" : "");

    return `
      <div class="campo-wrap ${colClasse}">
        <label>${rotuloHtml}
          <input type="${tipo}" name="${campo.nome}" value="${escaparAtributo(valorAtual)}" ${campo.obrigatorio && !linhaEdicao ? "required" : ""} ${disabled} placeholder="${escaparAtributo(placeholder)}">
        </label>
      </div>
    `;
  }

  // Abre modal sobreposto para adicionar ou editar
  function abrirModalCadastro(linhaEdicao = null) {
    const isEdicao = !!linhaEdicao;
    const tituloModal = isEdicao
      ? `Editar: ${linhaEdicao.nome || config.tituloSingular || config.titulo}`
      : `Novo ${config.tituloSingular || config.titulo}`;

    const modalClasse = ehSimples ? "modal-cadastro--simples" : "modal-cadastro--complexo";
    const gridClasse = ehSimples ? "" : "formulario-grid";

    containerModal.innerHTML = `
      <div class="modal-fundo modal-fundo--cadastro" role="dialog" aria-modal="true">
        <div class="modal-cadastro ${modalClasse}">
          <div class="modal-cabecalho">
            <h3>${escaparHtml(tituloModal)}</h3>
            <button type="button" class="modal-fechar" aria-label="Fechar">✕</button>
          </div>
          <form class="form-modal-cadastro">
            <p class="erro-modal erro" hidden></p>
            <div class="${gridClasse}">
              ${config.campos.map((c) => renderCampoModalHtml(c, linhaEdicao)).join("")}
            </div>
            <div class="modal-rodape">
              <button type="button" class="btn btn-secundario btn-cancelar-modal">Cancelar</button>
              <button type="submit" class="btn btn-primario">${isEdicao ? "Salvar alterações" : "Adicionar"}</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const modalFundo = containerModal.querySelector(".modal-fundo--cadastro");
    const formModal = containerModal.querySelector(".form-modal-cadastro");
    const erroModal = containerModal.querySelector(".erro-modal");

    function fecharModal() {
      window.removeEventListener("keydown", escHandler);
      containerModal.innerHTML = "";
    }

    // Captura valores atuais do formulário para verificar alterações
    function capturarValoresFormulario() {
      const valores = {};
      for (const campo of config.campos) {
        if (campo.apenasFiltro) continue;
        if (campo.tipo === "checkbox") {
          valores[campo.nome] = formModal.elements[campo.nome]?.checked ? 1 : 0;
        } else if (campo.tipo === "multiselect") {
          valores[campo.nome] = Array.from(
            formModal.querySelectorAll(`input[name="${campo.nome}[]"]:checked`)
          ).map((el) => String(el.value)).sort().join(",");
        } else {
          valores[campo.nome] = formModal.elements[campo.nome]?.value ?? "";
        }
      }
      return valores;
    }

    const valoresIniciais = capturarValoresFormulario();

    function houveAlteracao() {
      const atuais = capturarValoresFormulario();
      for (const k of Object.keys(valoresIniciais)) {
        if (atuais[k] !== valoresIniciais[k]) return true;
      }
      return false;
    }

    // Destaca campos obrigatórios vazios com foco e borda vermelha
    function destacarCamposObrigatorios() {
      let primeiroInvalido = null;
      formModal.querySelectorAll(".campo-destaque-obrigatorio").forEach((el) => {
        el.classList.remove("campo-destaque-obrigatorio");
      });

      for (const campo of config.campos) {
        if (!campo.obrigatorio || campo.apenasFiltro) continue;
        if (isEdicao && campo.tipo === "password") continue;

        let valido = true;
        let elementoDestaque = null;

        if (campo.tipo === "multiselect") {
          const selecionados = formModal.querySelectorAll(`input[name="${campo.nome}[]"]:checked`);
          if (selecionados.length === 0) {
            valido = false;
            elementoDestaque = formModal.querySelector(`.multiselect-caixa[data-campo="${campo.nome}"]`);
          }
        } else {
          const inputEl = formModal.elements[campo.nome];
          if (!inputEl || !inputEl.value.trim()) {
            valido = false;
            elementoDestaque = inputEl;
          }
        }

        if (!valido && elementoDestaque) {
          elementoDestaque.classList.add("campo-destaque-obrigatorio");
          if (!primeiroInvalido) primeiroInvalido = elementoDestaque;
        }
      }

      if (primeiroInvalido) {
        primeiroInvalido.focus?.();
        mostrarErro(erroModal, new Error("Preencha todos os campos obrigatórios em destaque para continuar."));
      }
    }

    async function tentarFecharModal() {
      if (!houveAlteracao()) {
        fecharModal();
        return;
      }

      const desejaSair = await confirmarAcao(
        "Deseja sair sem salvar?",
        "Os dados informados foram alterados e ainda não foram salvos. Deseja realmente sair e descartar as alterações?",
        {
          textoCancelar: "Não, continuar editando",
          textoConfirmar: "Sim, descartar e sair",
          tipo: "aviso",
          focoPadrao: "cancelar",
        }
      );

      if (desejaSair) {
        fecharModal();
      } else {
        destacarCamposObrigatorios();
      }
    }

    // Fechamento somente por intenção explícita (botão Cancelar, botão X ou tecla ESC)
    modalFundo.querySelector(".modal-fechar").addEventListener("click", tentarFecharModal);
    modalFundo.querySelector(".btn-cancelar-modal").addEventListener("click", tentarFecharModal);

    // IMPORTANTE: Clique fora da janela NÃO fecha a tela suspensa
    modalFundo.addEventListener("click", (ev) => {
      if (ev.target === modalFundo) {
        // Ignora clique acidental no fundo escurecido
      }
    });

    const escHandler = (ev) => {
      if (ev.key === "Escape") {
        if (!document.body.contains(formModal)) {
          window.removeEventListener("keydown", escHandler);
          return;
        }
        const modalAvisoAberto = document.querySelector(".modal-fundo--aviso");
        if (modalAvisoAberto) return;
        tentarFecharModal();
      }
    };
    window.addEventListener("keydown", escHandler);

    // Botão Gerar Senha Aleatória
    formModal.querySelectorAll(".btn-gerar-senha").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nomeCampo = btn.dataset.campo;
        const input = formModal.elements[nomeCampo];
        if (!input) return;
        const novaSenha = gerarSenhaAleatoria(6);
        input.value = novaSenha;
        input.type = "text";
        input.classList.remove("campo-destaque-obrigatorio");
        const btnToggle = formModal.querySelector(`.btn-toggle-senha[data-campo="${nomeCampo}"]`);
        if (btnToggle) {
          btnToggle.innerHTML = SVG_ICONE_OLHO_RISCADO;
          btnToggle.title = "Ocultar senha";
          btnToggle.setAttribute("aria-label", "Ocultar senha");
        }

        navigator.clipboard?.writeText(novaSenha).catch(() => {});
        const feedback = document.createElement("span");
        feedback.style.cssText = "font-size:0.75rem; color:#15803d; font-weight:bold; margin-left:0.35rem;";
        feedback.textContent = "✓ Gerada e copiada!";
        btn.parentElement.appendChild(feedback);
        setTimeout(() => feedback.remove(), 3500);
      });
    });

    // Botão Visualizar / Ocultar Senha
    formModal.querySelectorAll(".btn-toggle-senha").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nomeCampo = btn.dataset.campo;
        const input = formModal.elements[nomeCampo];
        if (!input) return;
        alternarVisualizacaoSenha(input, btn);
      });
    });

    // Indicador visual de Caps Lock ativado
    formModal.querySelectorAll('input[type="password"], input[name="senha"]').forEach((input) => {
      const avisoCaps = formModal.querySelector(`.aviso-capslock-${input.name}`);
      const checarCaps = (ev) => {
        if (!avisoCaps) return;
        if (ev.getModifierState && ev.getModifierState("CapsLock")) {
          avisoCaps.hidden = false;
          avisoCaps.style.display = "flex";
        } else {
          avisoCaps.hidden = true;
          avisoCaps.style.display = "none";
        }
      };
      input.addEventListener("keydown", checarCaps);
      input.addEventListener("keyup", checarCaps);
      input.addEventListener("blur", () => {
        if (avisoCaps) {
          avisoCaps.hidden = true;
          avisoCaps.style.display = "none";
        }
      });
    });

    // Limpar destaque de campo obrigatório ao digitar/alterar
    formModal.addEventListener("input", (ev) => {
      ev.target.classList.remove("campo-destaque-obrigatorio");
    });
    formModal.addEventListener("change", (ev) => {
      ev.target.classList.remove("campo-destaque-obrigatorio");
    });

    // Sugestão automática de login no formato nome.sobrenome ao criar usuário
    if (!isEdicao && formModal.elements.nome && formModal.elements.login) {
      let loginEditadoManualmente = false;
      formModal.elements.login.addEventListener("input", () => {
        loginEditadoManualmente = true;
      });
      formModal.elements.nome.addEventListener("input", () => {
        if (!loginEditadoManualmente) {
          const nomeVal = formModal.elements.nome.value;
          const limpo = nomeVal
            .trim()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, "");
          const partes = limpo.split(/\s+/).filter(Boolean);
          if (partes.length >= 2) {
            formModal.elements.login.value = `${partes[0]}.${partes[partes.length - 1]}`;
          } else if (partes.length === 1) {
            formModal.elements.login.value = partes[0];
          } else {
            formModal.elements.login.value = "";
          }
        }
      });
    }

    // Sincronização e eventos de campos de cor (paleta e picker)
    formModal.querySelectorAll(".btn-swatch-cor").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cor = btn.dataset.cor;
        const nomeCampo = btn.dataset.campo;
        const inputTexto = formModal.querySelector(`#input-texto-cor-${nomeCampo}`);
        const picker = formModal.querySelector(`#picker-cor-${nomeCampo}`);
        if (inputTexto) inputTexto.value = cor;
        if (picker) picker.value = cor;
        formModal.querySelectorAll(`.btn-swatch-cor[data-campo="${nomeCampo}"]`).forEach((b) => {
          b.style.borderColor = b.dataset.cor === cor ? "var(--cor-texto)" : "transparent";
        });
      });
    });

    config.campos.filter((c) => c.tipo === "cor").forEach((c) => {
      const picker = formModal.querySelector(`#picker-cor-${c.nome}`);
      const inputTexto = formModal.querySelector(`#input-texto-cor-${c.nome}`);
      if (picker && inputTexto) {
        picker.addEventListener("input", () => {
          inputTexto.value = picker.value;
          formModal.querySelectorAll(`.btn-swatch-cor[data-campo="${c.nome}"]`).forEach((b) => {
            b.style.borderColor = b.dataset.cor.toLowerCase() === picker.value.toLowerCase() ? "var(--cor-texto)" : "transparent";
          });
        });
        inputTexto.addEventListener("input", () => {
          if (/^#[0-9a-f]{6}$/i.test(inputTexto.value)) {
            picker.value = inputTexto.value;
            formModal.querySelectorAll(`.btn-swatch-cor[data-campo="${c.nome}"]`).forEach((b) => {
              b.style.borderColor = b.dataset.cor.toLowerCase() === inputTexto.value.toLowerCase() ? "var(--cor-texto)" : "transparent";
            });
          }
        });
      }
    });

    // Configurar selects dependentes (ex: Empresa -> Setores)
    for (const campo of config.campos) {
      if (!campo.dependeDe) continue;
      const selectPai = formModal.elements[campo.dependeDe];
      const selectFilho = formModal.elements[campo.nome];
      if (!selectPai || !selectFilho) continue;

      const atualizarSelectFilho = () => {
        const paiVal = Number(selectPai.value);
        const opcoes = (opcoesFK[campo.nome] ?? []).filter((o) => {
          if (Array.isArray(o[campo.filtrarPor])) {
            return o[campo.filtrarPor].includes(paiVal);
          }
          if (Array.isArray(o.empresas)) {
            return o.empresas.includes(paiVal);
          }
          return String(o[campo.filtrarPor]) === selectPai.value;
        });

        const valorAtual = linhaEdicao ? linhaEdicao[campo.nome] : "";
        selectFilho.innerHTML =
          `<option value="">Selecione…</option>` +
          opcoes
            .map((o) => `<option value="${o.id}" ${valorAtual === o.id ? "selected" : ""}>${escaparHtml(formatarRotuloFK(o))}</option>`)
            .join("");
      };

      selectPai.addEventListener("change", atualizarSelectFilho);
      if (selectPai.value) atualizarSelectFilho();
    }

    // Se estiver em edição e houver campos apenasFiltro (como empresa_id em Usuários)
    if (isEdicao) {
      for (const campo of config.campos) {
        if (!campo.apenasFiltro) continue;
        const dependente = config.campos.find((c) => c.dependeDe === campo.nome);
        if (!dependente) continue;
        const opcoesDependente = opcoesFK[dependente.nome] ?? [];
        const atual = opcoesDependente.find((o) => o.id === linhaEdicao[dependente.nome]);
        if (atual && formModal.elements[campo.nome]) {
          const empId =
            Array.isArray(atual.empresas) && atual.empresas.length > 0
              ? atual.empresas[0]
              : atual[dependente.filtrarPor];
          formModal.elements[campo.nome].value = empId;
          formModal.elements[campo.nome].dispatchEvent(new Event("change"));
        }
      }
    }

    const primeiroInput = formModal.querySelector("input:not([disabled]), select:not([disabled])");
    setTimeout(() => primeiroInput?.focus(), 60);

    formModal.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      erroModal.hidden = true;
      formModal.querySelectorAll(".campo-destaque-obrigatorio").forEach((el) => {
        el.classList.remove("campo-destaque-obrigatorio");
      });

      const corpo = {};
      let erroValidacao = null;

      for (const campo of config.campos) {
        if (campo.apenasFiltro) continue;

        if (campo.tipo === "checkbox") {
          corpo[campo.nome] = formModal.elements[campo.nome].checked ? 1 : 0;
          continue;
        }

        if (campo.tipo === "multiselect") {
          const selecionados = Array.from(
            formModal.querySelectorAll(`input[name="${campo.nome}[]"]:checked`)
          ).map((el) => Number(el.value));

          if (campo.obrigatorio && selecionados.length === 0) {
            erroValidacao = `Selecione pelo menos uma opção para o campo "${campo.label}".`;
            const caixa = formModal.querySelector(`.multiselect-caixa[data-campo="${campo.nome}"]`);
            caixa?.classList.add("campo-destaque-obrigatorio");
            break;
          }
          corpo[campo.nome] = selecionados;
          continue;
        }

        const inputEl = formModal.elements[campo.nome];
        const valor = inputEl ? inputEl.value.trim() : "";

        if (campo.obrigatorio && !valor && !(isEdicao && campo.tipo === "password")) {
          erroValidacao = `O campo "${campo.label}" é obrigatório.`;
          inputEl?.classList.add("campo-destaque-obrigatorio");
          inputEl?.focus();
          break;
        }

        if (campo.tipo === "cor" && valor) {
          const editId = isEdicao ? Number(linhaEdicao.id) : null;
          const duplicado = listaDados.find((d) => d.id !== editId && d.cor && d.cor.toLowerCase() === valor.toLowerCase());
          if (duplicado) {
            erroValidacao = `A cor "${valor}" já está associada ao status "${duplicado.nome}". Escolha uma cor diferente para evitar repetição.`;
            inputEl?.classList.add("campo-destaque-obrigatorio");
            inputEl?.focus();
            break;
          }
        }

        if (campo.nome === "login") {
          const loginLimpo = String(valor || "").trim().toLowerCase();
          if (!/^[a-z0-9]+([._][a-z0-9]+)*$/.test(loginLimpo)) {
            erroValidacao = `Login inválido: use apenas letras, números, ponto ou sublinhado (ex: felipe.guntzel ou projetoszagonel), sem espaços ou símbolos.`;
            inputEl?.classList.add("campo-destaque-obrigatorio");
            inputEl?.focus();
            break;
          }
          corpo[campo.nome] = loginLimpo;
          continue;
        }

        if (campo.tipo === "password") {
          if (isEdicao && !valor) {
            continue;
          }
          const checagemSenha = validarComplexidadeSenhaCliente(valor);
          if (!checagemSenha.valido) {
            erroValidacao = checagemSenha.mensagem;
            inputEl?.classList.add("campo-destaque-obrigatorio");
            inputEl?.focus();
            break;
          }
          corpo[campo.nome] = await calcularSha256(valor);
          continue;
        }

        corpo[campo.nome] = campo.tipo === "number" || campo.opcoesEndpoint ? Number(valor) : valor;
      }

      if (erroValidacao) {
        mostrarErro(erroModal, new Error(erroValidacao));
        return;
      }

      try {
        if (isEdicao) {
          await api(`${config.endpoint}/${linhaEdicao.id}`, { method: "PUT", body: corpo });
        } else {
          await api(config.endpoint, { method: "POST", body: corpo });
        }
        limparCacheFK();
        fecharModal();
        await recarregar();
        config.aoSalvar?.();
      } catch (e) {
        mostrarErro(erroModal, e);
      }
    });
  }

  function atualizarBannerPrerequisitos() {
    const faltantes = verificarPreRequisitos();
    const bannerContainer = container.querySelector(".container-banner-prerequisito");
    if (!bannerContainer) return;
    if (faltantes.length > 0) {
      bannerContainer.innerHTML = `
        <div class="aviso-banner-prerequisito">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 1.25rem;">⚠️</span>
            <span><strong>Atenção:</strong> Para cadastrar <em>${escaparHtml(config.titulo)}</em>, é necessário primeiro cadastrar: <strong>${escaparHtml(faltantes.map((f) => f.nome).join(", "))}</strong>.</span>
          </div>
          ${
            faltantes[0].url
              ? `<a href="${escaparAtributo(faltantes[0].url)}" class="btn btn-primario btn-pequeno" style="white-space: nowrap;">Cadastrar ${escaparHtml(faltantes[0].nome)}</a>`
              : ""
          }
        </div>
      `;
    } else {
      bannerContainer.innerHTML = "";
    }
  }

  async function recarregar() {
    try {
      const dados = await api(config.endpoint);
      listaDados = Array.isArray(dados) ? dados : [];
      atualizarBannerPrerequisitos();
      renderizarLinhas();
    } catch (e) {
      mostrarErro(document.getElementById("mensagem-erro"), e);
    }
  }

  // Carrega FKs e dados da tabela em paralelo de alta velocidade
  const promessasFK = [
    ...config.campos.filter((c) => c.opcoesEndpoint).map(async (c) => {
      opcoesFK[c.nome] = await obterOpcoesFK(c.opcoesEndpoint);
    }),
    ...(Array.isArray(config.preRequisitos)
      ? config.preRequisitos.filter((r) => r.endpoint).map(async (r) => {
          if (!opcoesFK[r.endpoint]) opcoesFK[r.endpoint] = await obterOpcoesFK(r.endpoint);
        })
      : []),
  ];

  const [_, dadosIniciais] = await Promise.all([
    Promise.all(promessasFK),
    api(config.endpoint).catch((e) => {
      mostrarErro(document.getElementById("mensagem-erro"), e);
      return [];
    }),
  ]);

  listaDados = Array.isArray(dadosIniciais) ? dadosIniciais : [];
  atualizarBannerPrerequisitos();
  renderizarLinhas();
}
