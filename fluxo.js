import { exigirLogin, permissaoDaTela } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { info, mostrarErro } from "./ui.js";
import { renderCrud } from "./crud-ui.js";
import { confirmarAcao } from "./modal.js";
import { api } from "./api.js";

const usuario = exigirLogin();
let permissaoFluxos = { visualizar: false, inserir: false, editar: false, excluir: false };

if (usuario) {
  aplicarLayout(usuario);
  const mensagemErro = document.getElementById("mensagem-erro");
  permissaoFluxos = permissaoDaTela("fluxos");

  await renderCrud(document.getElementById("secao-fluxos"), {
    titulo: "Fluxos",
    endpoint: "/fluxos",
    tela: "fluxos",
    campos: [{ nome: "nome", label: "Nome", obrigatorio: true }],
  }).catch((e) => mostrarErro(mensagemErro, e));

  const secaoEditarEtapas = document.getElementById("secao-editar-etapas");
  if (permissaoFluxos.visualizar) {
    await iniciarSelecaoFluxo();
  } else {
    secaoEditarEtapas.hidden = true;
  }
}

async function iniciarSelecaoFluxo() {
  const fluxos = await api("/fluxos");
  const select = document.getElementById("select-fluxo");
  select.innerHTML =
    `<option value="">Selecione um fluxo…</option>` +
    fluxos.map((f) => `<option value="${f.id}">${f.nome}</option>`).join("");
  select.addEventListener("change", () => {
    if (select.value) renderEtapas(Number(select.value));
    else document.getElementById("secao-etapas").innerHTML = "";
  });
}

async function renderEtapas(fluxoId) {
  const [etapas, setores] = await Promise.all([
    api(`/fluxos/${fluxoId}/etapas`),
    api("/setores"),
  ]);
  const container = document.getElementById("secao-etapas");

  const nomeSetor = (id) => setores.find((s) => s.id === id)?.nome ?? id;
  const nomeEtapa = (id) => etapas.find((e) => e.id === id)?.nome ?? "-";

  container.innerHTML = `
    <h3>Etapas</h3>
    <table>
      <thead>
        <tr><th>Nome</th><th>Setor</th><th>Tipo</th><th>Inicial?</th><th>Próxima etapa</th><th>Vínculo</th><th></th></tr>
      </thead>
      <tbody>
        ${etapas
          .map(
            (e) => `
          <tr>
            <td>${e.nome}</td>
            <td>${nomeSetor(e.setor_id)}</td>
            <td>${e.tipo}</td>
            <td>${e.eh_inicial ? "Sim" : "Não"}</td>
            <td>${e.etapa_proxima_id ? nomeEtapa(e.etapa_proxima_id) : "-"}</td>
            <td>${e.etapa_proxima_vinculo ?? "-"}</td>
            <td>
              ${e.tipo === "aprovacao" ? `<button type="button" class="btn btn-secundario btn-acoes" data-id="${e.id}">Ações</button>` : ""}
              ${permissaoFluxos.excluir ? `<button type="button" class="btn btn-perigo btn-excluir-etapa" data-id="${e.id}">Excluir</button>` : ""}
            </td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>

    ${
      permissaoFluxos.inserir
        ? `
    <h4>Nova etapa</h4>
    <form class="formulario" id="form-etapa">
      <label>Nome <input name="nome" required></label>
      <label>Setor
        <select name="setor_id" required>
          ${setores.map((s) => `<option value="${s.id}">${s.nome}</option>`).join("")}
        </select>
      </label>
      <label>Tipo
        <select name="tipo" required>
          <option value="aprovacao">Aprovação</option>
          <option value="tarefa">Tarefa</option>
        </select>
      </label>
      <label><input type="checkbox" name="eh_inicial"> É a etapa inicial? ${info(
        "Marque só na etapa que abre o chamado mãe. O sistema finaliza essa etapa e avança o fluxo automaticamente assim que o chamado é criado."
      )}</label>
      <label>Próxima etapa (opcional - deixe em branco se esta etapa usa Ações) ${info(
        "Quando esta etapa for aprovada/finalizada, cria automaticamente um chamado para a etapa escolhida aqui. Deixe em branco se esta etapa libera uma lista de Ações em vez de uma única próxima etapa."
      )}
        <select name="etapa_proxima_id">
          <option value="">Nenhuma / usar Ações</option>
          ${etapas.map((e) => `<option value="${e.id}">${e.nome}</option>`).join("")}
        </select>
      </label>
      <label>Vínculo da próxima etapa ${info(
        "Define a quem o novo chamado fica atrelado na árvore: 'pai' o vincula a esta própria etapa; 'mãe' o vincula direto à raiz, pulando esta etapa."
      )}
        <select name="etapa_proxima_vinculo">
          <option value="pai">Chamado pai (imediato)</option>
          <option value="mae">Chamado mãe (raiz)</option>
        </select>
      </label>
      <button type="submit" class="btn btn-primario">Adicionar etapa</button>
    </form>
    `
        : ""
    }

    <div id="secao-acoes"></div>
  `;

  container.querySelectorAll(".btn-acoes").forEach((btn) =>
    btn.addEventListener("click", () => renderAcoes(Number(btn.dataset.id)))
  );
  if (permissaoFluxos.excluir) {
    container.querySelectorAll(".btn-excluir-etapa").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const confirmado = await confirmarAcao("Excluir esta etapa?", "Essa ação não pode ser desfeita.");
        if (!confirmado) return;
        try {
          await api(`/etapas/${btn.dataset.id}`, { method: "DELETE" });
          renderEtapas(fluxoId);
        } catch (e) {
          mostrarErro(document.getElementById("mensagem-erro"), e);
        }
      })
    );
  }

  if (permissaoFluxos.inserir) {
    document.getElementById("form-etapa").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const form = ev.target;
      try {
        await api(`/fluxos/${fluxoId}/etapas`, {
          method: "POST",
          body: {
            nome: form.elements.nome.value,
            setor_id: Number(form.elements.setor_id.value),
            tipo: form.elements.tipo.value,
            eh_inicial: form.elements.eh_inicial.checked,
            etapa_proxima_id: form.elements.etapa_proxima_id.value
              ? Number(form.elements.etapa_proxima_id.value)
              : null,
            etapa_proxima_vinculo: form.elements.etapa_proxima_id.value
              ? form.elements.etapa_proxima_vinculo.value
              : null,
          },
        });
        renderEtapas(fluxoId);
      } catch (e) {
        mostrarErro(document.getElementById("mensagem-erro"), e);
      }
    });

    const selectTipo = document.getElementById("form-etapa").elements.tipo;
    const checkboxInicial = document.getElementById("form-etapa").elements.eh_inicial;
    const campoProximaEtapa = document.getElementById("form-etapa").elements.etapa_proxima_id.closest("label");
    const campoVinculo = document.getElementById("form-etapa").elements.etapa_proxima_vinculo.closest("label");

    function atualizarCamposProximaEtapa() {
      // Uma etapa tipo "tarefa" só avança o fluxo automaticamente quando é a
      // etapa inicial (caso especial tratado na criação do chamado). Uma
      // "tarefa" não-inicial com etapa_proxima_id configurada nunca avançaria
      // sozinha, então escondemos os campos para não permitir essa combinação.
      const oculto = selectTipo.value === "tarefa" && !checkboxInicial.checked;
      campoProximaEtapa.hidden = oculto;
      campoVinculo.hidden = oculto;
    }
    selectTipo.addEventListener("change", atualizarCamposProximaEtapa);
    checkboxInicial.addEventListener("change", atualizarCamposProximaEtapa);
    atualizarCamposProximaEtapa();
  }
}

async function renderAcoes(etapaId) {
  const etapa = await api(`/etapas/${etapaId}`);
  const setores = await api("/setores");
  const container = document.getElementById("secao-acoes");

  container.innerHTML = `
    <h4>Ações de "${etapa.nome}"</h4>
    <table>
      <thead><tr><th>Rótulo</th><th>Setor destino</th><th>Vínculo</th><th>Pré-requisito</th><th></th></tr></thead>
      <tbody>
        ${etapa.acoes
          .map(
            (a) => `
          <tr>
            <td>${a.rotulo}</td>
            <td>${setores.find((s) => s.id === a.setor_destino_id)?.nome ?? a.setor_destino_id}</td>
            <td>${a.vinculo}</td>
            <td>${
              a.prerequisito_acao_id
                ? etapa.acoes.find((x) => x.id === a.prerequisito_acao_id)?.rotulo ?? "-"
                : "-"
            }</td>
            <td>${permissaoFluxos.excluir ? `<button type="button" class="btn btn-perigo btn-excluir-acao" data-id="${a.id}">Excluir</button>` : ""}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
    ${
      permissaoFluxos.inserir
        ? `
    <h5>Nova ação</h5>
    <form class="formulario" id="form-acao">
      <label>Rótulo <input name="rotulo" required></label>
      <label>Setor destino
        <select name="setor_destino_id" required>
          ${setores.map((s) => `<option value="${s.id}">${s.nome}</option>`).join("")}
        </select>
      </label>
      <label>Vínculo ${info(
        "Define a quem a tarefa criada fica atrelada na árvore: 'mãe' a vincula direto à raiz; 'pai' a vincula a esta etapa de aprovação."
      )}
        <select name="vinculo" required>
          <option value="mae">Chamado mãe (raiz)</option>
          <option value="pai">Chamado pai (imediato)</option>
        </select>
      </label>
      <label>Pré-requisito (opcional) ${info(
        "Se escolhida, a tarefa desta ação nasce bloqueada até que o chamado da ação pré-requisito seja finalizado."
      )}
        <select name="prerequisito_acao_id">
          <option value="">Nenhum</option>
          ${etapa.acoes.map((a) => `<option value="${a.id}">${a.rotulo}</option>`).join("")}
        </select>
      </label>
      <button type="submit" class="btn btn-primario">Adicionar ação</button>
    </form>
    `
        : ""
    }
  `;

  if (permissaoFluxos.excluir) {
    container.querySelectorAll(".btn-excluir-acao").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const confirmado = await confirmarAcao("Excluir esta ação?", "Essa ação não pode ser desfeita.");
        if (!confirmado) return;
        try {
          await api(`/acoes/${btn.dataset.id}`, { method: "DELETE" });
          renderAcoes(etapaId);
        } catch (e) {
          mostrarErro(document.getElementById("mensagem-erro"), e);
        }
      })
    );
  }

  if (permissaoFluxos.inserir) {
    document.getElementById("form-acao").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const form = ev.target;
      try {
        await api(`/etapas/${etapaId}/acoes`, {
          method: "POST",
          body: {
            rotulo: form.elements.rotulo.value,
            setor_destino_id: Number(form.elements.setor_destino_id.value),
            vinculo: form.elements.vinculo.value,
            prerequisito_acao_id: form.elements.prerequisito_acao_id.value
              ? Number(form.elements.prerequisito_acao_id.value)
              : null,
          },
        });
        renderAcoes(etapaId);
      } catch (e) {
        mostrarErro(document.getElementById("mensagem-erro"), e);
      }
    });
  }
}
