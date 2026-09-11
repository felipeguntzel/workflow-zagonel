import { api } from "./api.js";
import { info } from "./ui.js";

function valorExibicao(linha, campo, opcoesFK) {
  if (campo.opcoesEndpoint) {
    const opcoes = opcoesFK[campo.nome] ?? [];
    const alvo = opcoes.find((o) => o.id === linha[campo.nome]);
    return alvo ? alvo.nome : linha[campo.nome];
  }
  return linha[campo.nome] ?? "";
}

function campoInputHtml(campo, opcoesFK) {
  const rotulo = campo.dica ? `${campo.label} ${info(campo.dica)}` : campo.label;
  if (campo.opcoesEndpoint) {
    const opcoes = opcoesFK[campo.nome] ?? [];
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
  const opcoesFK = {};
  for (const campo of config.campos) {
    if (campo.opcoesEndpoint) opcoesFK[campo.nome] = await api(campo.opcoesEndpoint);
  }

  let editandoId = null;

  container.innerHTML = `
    <h2>${config.titulo}</h2>
    <table>
      <thead><tr>${config.campos.map((c) => `<th>${c.label}</th>`).join("")}<th></th></tr></thead>
      <tbody></tbody>
    </table>
    <h3>Novo / Editar</h3>
    <form class="formulario">
      ${config.campos.map((c) => campoInputHtml(c, opcoesFK)).join("")}
      <button type="submit">Adicionar</button>
    </form>
  `;

  const form = container.querySelector("form");
  const botaoSalvar = form.querySelector("button[type=submit]");

  function preencherFormulario(linha) {
    editandoId = linha.id;
    for (const campo of config.campos) {
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
            ${config.campos.map((c) => `<td>${valorExibicao(linha, c, opcoesFK)}</td>`).join("")}
            <td>
              <button type="button" class="btn-editar" data-id="${linha.id}">Editar</button>
              <button type="button" class="btn-excluir" data-id="${linha.id}">Excluir</button>
            </td>
          </tr>`
      )
      .join("");
    container.querySelectorAll(".btn-editar").forEach((btn) =>
      btn.addEventListener("click", () => {
        const linha = dados.find((d) => d.id === Number(btn.dataset.id));
        preencherFormulario(linha);
      })
    );
    container.querySelectorAll(".btn-excluir").forEach((btn) =>
      btn.addEventListener("click", async () => {
        await api(`${config.endpoint}/${btn.dataset.id}`, { method: "DELETE" });
        recarregar();
      })
    );
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const corpo = {};
    for (const campo of config.campos) {
      const valor = form.elements[campo.nome].value;
      corpo[campo.nome] = campo.tipo === "number" || campo.opcoesEndpoint ? Number(valor) : valor;
    }
    if (editandoId) {
      await api(`${config.endpoint}/${editandoId}`, { method: "PUT", body: corpo });
    } else {
      await api(config.endpoint, { method: "POST", body: corpo });
    }
    editandoId = null;
    form.reset();
    botaoSalvar.textContent = "Adicionar";
    recarregar();
  });

  await recarregar();
}
