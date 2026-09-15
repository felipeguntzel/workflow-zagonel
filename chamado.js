import { exigirLogin, permissaoDaTela } from "./auth.js";
import { montarNav, info, mostrarErro } from "./ui.js";
import { api } from "./api.js";

const usuario = exigirLogin();
const id = new URLSearchParams(window.location.search).get("id");
const permissaoChamados = usuario
  ? permissaoDaTela("chamados")
  : { visualizar: false, inserir: false, editar: false, excluir: false };

if (usuario && id) {
  document.getElementById("nav").replaceWith(montarNav(usuario));
  iniciar();
}

function iniciar() {
  document.getElementById("link-geral").addEventListener("click", async (ev) => {
    ev.preventDefault();
    const chamado = await api(`/chamados/${id}`);
    window.location.href = `geral.html?id=${chamado.chamado_mae_id ?? chamado.id}`;
  });

  const botaoExcluir = document.getElementById("btn-excluir-chamado");
  if (permissaoChamados.excluir) {
    botaoExcluir.addEventListener("click", async () => {
      if (!window.confirm("Excluir este chamado e toda a sua subárvore? Isso não pode ser desfeito.")) {
        return;
      }
      await api(`/chamados/${id}`, { method: "DELETE" });
      window.location.href = "chamados.html";
    });
  } else {
    botaoExcluir.hidden = true;
  }

  const formHoras = document.getElementById("form-horas");
  if (permissaoChamados.inserir) {
    formHoras.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const form = ev.target;
      try {
        await api(`/chamados/${id}/horas`, {
          method: "POST",
          body: {
            data: form.elements.data.value,
            horas: Number(form.elements.horas.value),
            observacao: form.elements.observacao.value || null,
          },
        });
        form.reset();
        carregarHoras();
      } catch (e) {
        mostrarErro(document.getElementById("mensagem-erro"), e);
      }
    });
  } else {
    formHoras.hidden = true;
  }

  document.getElementById("form-comentario").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    try {
      await api(`/chamados/${id}/comentarios`, {
        method: "POST",
        body: { texto: form.elements.texto.value },
      });
      form.reset();
      carregarComentarios();
    } catch (e) {
      mostrarErro(document.getElementById("mensagem-erro"), e);
    }
  });

  carregarTudo().catch((e) => mostrarErro(document.getElementById("mensagem-erro"), e));
}

async function carregarTudo() {
  await Promise.all([carregarDetalhe(), carregarHoras(), carregarComentarios()]);
}

async function carregarDetalhe() {
  const chamado = await api(`/chamados/${id}`);
  const finalizado = chamado.status_nome === "finalizado";

  document.getElementById("detalhe").innerHTML = `
    <h1>#${chamado.id} - ${chamado.titulo}</h1>
    <p>Setor: ${chamado.setor_nome} ${info("Setor responsável por esta etapa/tarefa.")}</p>
    <p>Status: ${chamado.status_nome} - Prazo: ${chamado.prazo} (${chamado.situacao_prazo})</p>
    ${chamado.resultado ? `<p>Resultado: ${chamado.resultado}</p>` : ""}
    ${
      chamado.bloqueado
        ? `<p class="erro">Bloqueado: aguardando outra ação pré-requisito finalizar.</p>`
        : ""
    }
  `;

  const acaoContainer = document.getElementById("acao");
  if (finalizado || !permissaoChamados.editar) {
    acaoContainer.innerHTML = "";
    return;
  }

  if (chamado.etapa_id && chamado.etapa_tipo === "aprovacao") {
    await renderAprovacao(chamado);
  } else {
    await renderStatusManual(chamado);
  }
}

async function renderAprovacao(chamado) {
  const etapa = await api(`/etapas/${chamado.etapa_id}`);
  const acaoContainer = document.getElementById("acao");

  acaoContainer.innerHTML = `
    <h2>Avaliação ${info(
      "Aprova a solicitação e libera a próxima etapa do fluxo automaticamente, ou reprova e encerra toda a cadeia acima."
    )}</h2>
    ${
      etapa.acoes.length > 0
        ? `<fieldset id="fieldset-acoes">
             <legend>Ações a executar se aprovado</legend>
             ${etapa.acoes
               .map(
                 (a) =>
                   `<label><input type="checkbox" name="acao-${a.id}" value="${a.id}"> ${a.rotulo}</label>`
               )
               .join("")}
           </fieldset>`
        : ""
    }
    <button type="button" id="btn-aprovar">Aprovar</button>
    <label>Justificativa (obrigatória para reprovar)
      <textarea id="justificativa"></textarea>
    </label>
    <button type="button" id="btn-reprovar">Reprovar</button>
    <p id="erro-decisao" class="erro" hidden></p>
  `;

  async function enviarDecisao(corpo) {
    try {
      await api(`/chamados/${chamado.id}/decisao`, {
        method: "POST",
        body: corpo,
      });
      carregarTudo();
    } catch (e) {
      const erro = document.getElementById("erro-decisao");
      erro.textContent = e.message;
      erro.hidden = false;
    }
  }

  document.getElementById("btn-aprovar").addEventListener("click", () => {
    const acoes = {};
    etapa.acoes.forEach((a) => {
      acoes[a.id] = acaoContainer.querySelector(`[name="acao-${a.id}"]`).checked;
    });
    enviarDecisao({ decisao: "aprovado", acoes });
  });

  document.getElementById("btn-reprovar").addEventListener("click", () => {
    const justificativa = document.getElementById("justificativa").value;
    if (!justificativa) {
      const erro = document.getElementById("erro-decisao");
      erro.textContent = "Justificativa é obrigatória para reprovar.";
      erro.hidden = false;
      return;
    }
    enviarDecisao({ decisao: "reprovado", justificativa });
  });
}

async function renderStatusManual(chamado) {
  const statusList = await api("/status");
  const acaoContainer = document.getElementById("acao");

  acaoContainer.innerHTML = `
    <h2>Status ${info(
      "Atualize o status conforme o andamento; marque 'finalizado' quando a tarefa estiver concluída."
    )}</h2>
    <select id="select-status">
      ${statusList
        .map(
          (s) =>
            `<option value="${s.id}" ${s.id === chamado.status_id ? "selected" : ""}>${s.nome}</option>`
        )
        .join("")}
    </select>
    <button type="button" id="btn-salvar-status">Salvar status</button>
    <p id="erro-status" class="erro" hidden></p>
  `;

  document.getElementById("btn-salvar-status").addEventListener("click", async () => {
    const statusId = Number(document.getElementById("select-status").value);
    const statusEscolhido = statusList.find((s) => s.id === statusId);
    if (chamado.bloqueado && statusEscolhido.nome === "finalizado") {
      const erro = document.getElementById("erro-status");
      erro.textContent = "Não é possível finalizar: chamado bloqueado aguardando pré-requisito.";
      erro.hidden = false;
      return;
    }
    try {
      await api(`/chamados/${chamado.id}`, { method: "PUT", body: { status_id: statusId } });
      carregarTudo();
    } catch (e) {
      mostrarErro(document.getElementById("erro-status"), e);
    }
  });
}

async function carregarHoras() {
  const resumo = await api(`/chamados/${id}/horas`);
  document.getElementById("total-horas").textContent = `(total: ${resumo.total_horas}h)`;
  document.getElementById("lista-horas").innerHTML = resumo.lancamentos
    .map(
      (l) =>
        `<li>${l.data} - ${l.usuario_nome} - ${l.horas}h ${l.observacao ? `(${l.observacao})` : ""}</li>`
    )
    .join("");
}

async function carregarComentarios() {
  const comentarios = await api(`/chamados/${id}/comentarios`);
  document.getElementById("lista-comentarios").innerHTML = comentarios
    .map(
      (c) =>
        `<li><strong>${c.usuario_nome ?? "Sistema"}</strong> (${c.data})${
          c.eh_justificativa ? " - justificativa" : ""
        }: ${c.texto}</li>`
    )
    .join("");
}
