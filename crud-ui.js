import { api } from "./api.js";
import { info, mostrarErro } from "./ui.js";
import { permissaoDaTela } from "./auth.js";

function valorExibicao(linha, campo, opcoesFK) {
  if (campo.tipo === "checkbox") {
    return linha[campo.nome] ? "Sim" : "Não";
  }
  if (campo.tipo === "multiselect") {
    const opcoes = opcoesFK[campo.nome] ?? [];
    return (linha[campo.nome] ?? [])
      .map((id) => opcoes.find((o) => o.id === id)?.nome)
      .filter(Boolean)
      .join(", ");
  }
  if (campo.opcoesEndpoint) {
    const opcoes = opcoesFK[campo.nome] ?? [];
    const alvo = opcoes.find((o) => o.id === linha[campo.nome]);
    return alvo ? alvo.nome : linha[campo.nome];
  }
  return linha[campo.nome] ?? "";
}

function campoInputHtml(campo, opcoesFK) {
  const rotulo = campo.dica ? `${campo.label} ${info(campo.dica)}` : campo.label;
  if (campo.tipo === "checkbox") {
    return `
      <label>
        <input type="checkbox" name="${campo.nome}">
        ${rotulo}
      </label>`;
  }
  if (campo.tipo === "multiselect") {
    const opcoes = opcoesFK[campo.nome] ?? [];
    return `
      <label>${rotulo}
        <select name="${campo.nome}" multiple>
          ${opcoes.map((o) => `<option value="${o.id}">${o.nome}</option>`).join("")}
        </select>
      </label>`;
  }
  if (campo.opcoesEndpoint) {
    const opcoes = campo.dependeDe ? [] : opcoesFK[campo.nome] ?? [];
    return `
      <label>${rotulo}
        <select name="${campo.nome}" ${campo.obrigatorio ? "required" : ""}>
          <option value="">Selecione…</option>
          ${opcoes.map((o) => `<option value="${o.id}">${o.nome}</option>`).join("")}
        </select>
      </label>`;
  }
  const tipo = campo.tipo ?? "text";
  return `
    <label>${rotulo}
      <input type="${tipo}" name="${campo.nome}" ${campo.obrigatorio ? "required" : ""}>
    </label>`;
}

export async function renderCrud(container, config) {
  if (!config.tela) throw new Error("renderCrud: config.tela é obrigatório");
  const permissao = permissaoDaTela(config.tela);
  if (!permissao.visualizar) {
    container.innerHTML = `<h2>${config.titulo}</h2><p>Você não tem permissão para visualizar esta tela.</p>`;
    return;
  }

  const opcoesFK = {};
  for (const campo of config.campos) {
    if (campo.opcoesEndpoint) opcoesFK[campo.nome] = await api(campo.opcoesEndpoint);
  }

  const camposTabela = config.campos.filter((c) => !c.apenasFiltro);
  const podeEscrever = permissao.inserir || permissao.editar;
  let editandoId = null;

  container.innerHTML = `
    <h2>${config.titulo}</h2>
    <table>
      <thead><tr>${camposTabela.map((c) => `<th>${c.label}</th>`).join("")}<th></th></tr></thead>
      <tbody></tbody>
    </table>
    ${
      podeEscrever
        ? `<h3>Novo / Editar</h3>
           <form class="formulario">
             ${config.campos.map((c) => campoInputHtml(c, opcoesFK)).join("")}
             <button type="submit">Adicionar</button>
           </form>`
        : ""
    }
  `;

  const form = container.querySelector("form");
  const botaoSalvar = form?.querySelector("button[type=submit]");

  if (form) {
    for (const campo of config.campos) {
      if (!campo.dependeDe) continue;
      const selectPai = form.elements[campo.dependeDe];
      const selectFilho = form.elements[campo.nome];
      if (!selectPai || !selectFilho) continue;
      selectPai.addEventListener("change", () => {
        const opcoes = (opcoesFK[campo.nome] ?? []).filter(
          (o) => String(o[campo.filtrarPor]) === selectPai.value
        );
        selectFilho.innerHTML =
          `<option value="">Selecione…</option>` +
          opcoes.map((o) => `<option value="${o.id}">${o.nome}</option>`).join("");
      });
    }
  }

  function preencherFormulario(linha) {
    if (!form) return;
    editandoId = linha.id;

    // Primeiro os campos "pai": derivam seu valor a partir da linha e
    // disparam o evento de mudança, que popula as opções do campo
    // dependente antes de definirmos o valor dele no passo seguinte.
    for (const campo of config.campos) {
      if (!campo.apenasFiltro) continue;
      const dependente = config.campos.find((c) => c.dependeDe === campo.nome);
      if (!dependente) continue;
      const opcoesDependente = opcoesFK[dependente.nome] ?? [];
      const atual = opcoesDependente.find((o) => o.id === linha[dependente.nome]);
      form.elements[campo.nome].value = atual ? atual[dependente.filtrarPor] : "";
      form.elements[campo.nome].dispatchEvent(new Event("change"));
    }

    for (const campo of config.campos) {
      if (campo.apenasFiltro) continue;
      if (campo.tipo === "checkbox") {
        form.elements[campo.nome].checked = !!linha[campo.nome];
        continue;
      }
      if (campo.tipo === "multiselect") {
        const selecionados = linha[campo.nome] ?? [];
        for (const opcao of form.elements[campo.nome].options) {
          opcao.selected = selecionados.includes(Number(opcao.value));
        }
        continue;
      }
      form.elements[campo.nome].value = linha[campo.nome] ?? "";
    }

    botaoSalvar.textContent = "Salvar";
  }

  async function recarregar() {
    const dados = await api(config.endpoint);
    container.querySelector("tbody").innerHTML = dados
      .map(
        (linha) => `
          <tr data-id="${linha.id}">
            ${camposTabela.map((c) => `<td>${valorExibicao(linha, c, opcoesFK)}</td>`).join("")}
            <td>
              ${permissao.editar ? `<button type="button" class="btn-editar" data-id="${linha.id}">Editar</button>` : ""}
              ${permissao.excluir ? `<button type="button" class="btn-excluir" data-id="${linha.id}">Excluir</button>` : ""}
            </td>
          </tr>`
      )
      .join("");
    if (permissao.editar) {
      container.querySelectorAll(".btn-editar").forEach((btn) =>
        btn.addEventListener("click", () => {
          const linha = dados.find((d) => d.id === Number(btn.dataset.id));
          preencherFormulario(linha);
        })
      );
    }
    if (permissao.excluir) {
      container.querySelectorAll(".btn-excluir").forEach((btn) =>
        btn.addEventListener("click", async () => {
          try {
            await api(`${config.endpoint}/${btn.dataset.id}`, { method: "DELETE" });
            recarregar();
          } catch (e) {
            mostrarErro(document.getElementById("mensagem-erro"), e);
          }
        })
      );
    }
  }

  if (form) {
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const corpo = {};
      for (const campo of config.campos) {
        if (campo.apenasFiltro) continue;
        if (campo.tipo === "checkbox") {
          corpo[campo.nome] = form.elements[campo.nome].checked ? 1 : 0;
          continue;
        }
        if (campo.tipo === "multiselect") {
          corpo[campo.nome] = Array.from(form.elements[campo.nome].selectedOptions).map((o) => Number(o.value));
          continue;
        }
        const valor = form.elements[campo.nome].value;
        corpo[campo.nome] = campo.tipo === "number" || campo.opcoesEndpoint ? Number(valor) : valor;
      }
      try {
        if (editandoId) {
          await api(`${config.endpoint}/${editandoId}`, { method: "PUT", body: corpo });
        } else {
          await api(config.endpoint, { method: "POST", body: corpo });
        }
        editandoId = null;
        form.reset();
        botaoSalvar.textContent = "Adicionar";
        recarregar();
      } catch (e) {
        mostrarErro(document.getElementById("mensagem-erro"), e);
      }
    });
  }

  await recarregar();
}
