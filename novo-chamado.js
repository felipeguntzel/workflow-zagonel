import { exigirLogin } from "./auth.js";
import { montarNav, escaparHtml } from "./ui.js";
import { api } from "./api.js";

const usuario = exigirLogin();
if (usuario) {
  document.getElementById("nav").replaceWith(montarNav(usuario));
  iniciar().catch((e) => {
    const mensagem = document.getElementById("mensagem-erro");
    mensagem.textContent = e.message;
    mensagem.hidden = false;
  });
}

async function iniciar() {
  const fluxos = await api("/fluxos");
  const selectFluxo = document.getElementById("select-fluxo");
  selectFluxo.innerHTML = fluxos.map((f) => `<option value="${f.id}">${escaparHtml(f.nome)}</option>`).join("");

  async function carregarEtapasIniciais() {
    const etapas = await api(`/fluxos/${selectFluxo.value}/etapas`);
    const iniciais = etapas.filter((e) => e.eh_inicial);
    document.getElementById("select-etapa-inicial").innerHTML = iniciais
      .map((e) => `<option value="${e.id}">${escaparHtml(e.nome)}</option>`)
      .join("");
  }

  selectFluxo.addEventListener("change", carregarEtapasIniciais);
  await carregarEtapasIniciais();

  document.getElementById("form-novo-chamado").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    try {
      const resultado = await api("/chamados", {
        method: "POST",
        body: {
          fluxo_template_id: Number(form.elements.fluxo_template_id.value),
          etapa_inicial_id: Number(form.elements.etapa_inicial_id.value),
          prazo: form.elements.prazo.value || null,
        },
      });
      window.location.href = `chamado.html?id=${resultado.chamado.id}`;
    } catch (e) {
      const mensagem = document.getElementById("mensagem-erro");
      mensagem.textContent = e.message;
      mensagem.hidden = false;
    }
  });
}
