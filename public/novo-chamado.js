import { exigirLogin, permissaoDaTela } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { escaparHtml, mostrarErro, info } from "./ui.js";
import { api } from "./api.js";

const usuario = exigirLogin();
if (usuario) {
  aplicarLayout(usuario);
  iniciar().catch((e) => mostrarErro(document.getElementById("mensagem-erro"), e));
}

async function iniciar() {
  const container = document.getElementById("conteudo-novo-chamado");
  const perm = permissaoDaTela("chamados");
  if (!perm.inserir) {
    container.innerHTML = `
      <div class="pagina-cabecalho">
        <h2>Abrir novo chamado</h2>
      </div>
      <p style="color: var(--cor-texto-secundario); padding: 1rem 0;">Você não possui permissão para abrir novos chamados.</p>
    `;
    return;
  }

  let fluxos = [];
  try {
    fluxos = await api("/fluxos");
  } catch (e) {
    fluxos = [];
  }

  if (!Array.isArray(fluxos) || fluxos.length === 0) {
    container.innerHTML = `
      <div class="pagina-cabecalho">
        <div class="pagina-cabecalho__esquerda">
          <h2>Abrir Novo Chamado</h2>
        </div>
      </div>
      <div class="painel" style="max-width: 680px; margin-top: 1rem; border-left: 4px solid var(--cor-alerta); box-shadow: 0 4px 14px rgba(0,0,0,0.06);">
        <h3 style="display: flex; align-items: center; gap: 0.5rem; color: #92400e; margin-bottom: 0.5rem;">
          <span style="font-size: 1.3rem;">⚠️</span> Nenhum fluxo cadastrado
        </h3>
        <p style="margin: 0.5rem 0 1.25rem; font-size: 0.95rem; line-height: 1.5; color: var(--cor-texto);">
          Para abrir um chamado, é necessário cadastrar primeiro pelo menos um <strong>Fluxo de Processo</strong> com suas respectivas etapas.
        </p>
        <div style="display: flex; gap: 0.75rem;">
          <a href="fluxo.html" class="btn btn-primario">Cadastrar Fluxos</a>
          <a href="chamados.html" class="btn btn-secundario">Voltar para Chamados</a>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="pagina-cabecalho">
      <div class="pagina-cabecalho__esquerda">
        <h2>Abrir Novo Chamado</h2>
        <p style="font-size: 0.9rem; color: var(--cor-texto-secundario); margin: 0.2rem 0 0;">
          Preencha os dados abaixo para iniciar um novo processo no fluxo de trabalho.
        </p>
      </div>
    </div>
    
    <p id="mensagem-erro" class="erro" hidden></p>

    <div class="painel" style="max-width: 720px; margin-top: 1rem; box-shadow: 0 4px 16px rgba(0,0,0,0.08);">
      <form class="formulario" id="form-novo-chamado" style="display: flex; flex-direction: column; gap: 1.2rem;">
        <div>
          <label style="font-weight: 600; display: block; margin-bottom: 0.4rem;">
            Fluxo de processo <span class="campo-obrigatorio">*</span>
          </label>
          <select id="select-fluxo" name="fluxo_template_id" required style="width: 100%; padding: 0.6rem 0.75rem;">
            <option value="">Selecione um fluxo…</option>
            ${fluxos.map((f) => `<option value="${f.id}">${escaparHtml(f.nome)}</option>`).join("")}
          </select>
        </div>

        <div id="wrap-etapa-inicial">
          <label style="font-weight: 600; display: block; margin-bottom: 0.4rem;">
            Etapa inicial <span class="campo-obrigatorio">*</span>
            ${info("Etapa onde o chamado mãe se inicia. Geralmente é a etapa de solicitação ou triagem.")}
          </label>
          <select id="select-etapa-inicial" name="etapa_inicial_id" required style="width: 100%; padding: 0.6rem 0.75rem;">
            <option value="">Selecione primeiro o fluxo acima…</option>
          </select>
          <p id="aviso-etapas-vazias" style="font-size: 0.85rem; color: var(--cor-alerta); margin-top: 0.35rem;" hidden></p>
        </div>

        <!-- Renderização de campos personalizados dinâmicos -->
        <div id="wrap-campos-dinamicos" style="display: none; border-top: 1px solid var(--cor-borda); padding-top: 1.25rem;">
          <h4 style="margin: 0 0 1rem; font-size: 1.05rem; color: var(--cor-primaria);">Campos da Solicitação</h4>
          <div id="container-campos-render" style="display: flex; flex-direction: column; gap: 1rem;"></div>
        </div>

        <div>
          <label style="font-weight: 600; display: block; margin-bottom: 0.4rem;">
            Prazo limite (opcional)
            ${info("Se deixado em branco, o sistema calcula o prazo automaticamente com base no prazo padrão em dias do setor da etapa.")}
          </label>
          <input type="date" name="prazo" style="width: 100%; max-width: 240px; padding: 0.55rem 0.75rem;">
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1rem; border-top: 1px solid var(--cor-borda); padding-top: 1.25rem;">
          <a href="chamados.html" class="btn btn-secundario">Cancelar</a>
          <button type="submit" class="btn btn-primario btn-abrir-chamado" id="btn-submit-chamado" style="min-width: 140px;">
            Abrir chamado
          </button>
        </div>
      </form>
    </div>
  `;

  const selectFluxo = container.querySelector("#select-fluxo");
  const selectEtapa = container.querySelector("#select-etapa-inicial");
  const avisoEtapasVazias = container.querySelector("#aviso-etapas-vazias");
  const btnSubmit = container.querySelector("#btn-submit-chamado");
  const formNovoChamado = container.querySelector("#form-novo-chamado");
  const msgErro = container.querySelector("#mensagem-erro");
  const wrapCampos = container.querySelector("#wrap-campos-dinamicos");
  const containerCampos = container.querySelector("#container-campos-render");

  let camposEtapaAtuais = [];

  async function carregarCamposDaEtapa(etapaId) {
    if (!etapaId) {
      wrapCampos.style.display = "none";
      containerCampos.innerHTML = "";
      camposEtapaAtuais = [];
      return;
    }

    try {
      camposEtapaAtuais = await api(`/etapas/${etapaId}/campos`);
      if (camposEtapaAtuais.length === 0) {
        wrapCampos.style.display = "none";
        containerCampos.innerHTML = "";
        return;
      }

      wrapCampos.style.display = "block";
      containerCampos.innerHTML = camposEtapaAtuais
        .map((c) => {
          let inputHtml = "";
          const reqAttr = c.obrigatorio ? "required" : "";
          const obrigatorioMark = c.obrigatorio ? ' <span class="campo-obrigatorio">*</span>' : "";

          if (c.tipo === "texto_longo") {
            inputHtml = `<textarea name="campo_${c.nome}" ${reqAttr} rows="3" style="width: 100%; padding: 0.5rem; font-family: inherit; font-size: 0.9rem;"></textarea>`;
          } else if (c.tipo === "numero") {
            inputHtml = `<input type="number" step="any" name="campo_${c.nome}" ${reqAttr} style="width: 100%; max-width: 240px; padding: 0.55rem 0.75rem;">`;
          } else if (c.tipo === "data") {
            inputHtml = `<input type="date" name="campo_${c.nome}" ${reqAttr} style="width: 100%; max-width: 240px; padding: 0.55rem 0.75rem;">`;
          } else if (c.tipo === "selecao") {
            let opcoes = [];
            try {
              opcoes = c.opcoes_json ? JSON.parse(c.opcoes_json) : [];
            } catch (e) {
              opcoes = [];
            }
            inputHtml = `
              <select name="campo_${c.nome}" ${reqAttr} style="width: 100%; max-width: 320px; padding: 0.55rem 0.75rem;">
                <option value="">Selecione…</option>
                ${opcoes.map((op) => `<option value="${escaparHtml(op)}">${escaparHtml(op)}</option>`).join("")}
              </select>
            `;
          } else {
            // texto curto
            inputHtml = `<input type="text" name="campo_${c.nome}" ${reqAttr} style="width: 100%; padding: 0.55rem 0.75rem;">`;
          }

          return `
            <div>
              <label style="font-weight: 600; display: block; margin-bottom: 0.35rem; font-size: 0.92rem;">
                ${escaparHtml(c.rotulo)}${obrigatorioMark}
              </label>
              ${inputHtml}
            </div>
          `;
        })
        .join("");
    } catch (err) {
      wrapCampos.style.display = "none";
      containerCampos.innerHTML = "";
    }
  }

  async function carregarEtapasIniciais() {
    avisoEtapasVazias.hidden = true;
    avisoEtapasVazias.textContent = "";
    wrapCampos.style.display = "none";
    containerCampos.innerHTML = "";

    const fluxoId = selectFluxo.value;
    if (!fluxoId) {
      selectEtapa.innerHTML = `<option value="">Selecione primeiro o fluxo acima…</option>`;
      selectEtapa.disabled = true;
      btnSubmit.disabled = true;
      return;
    }

    selectEtapa.disabled = false;
    selectEtapa.innerHTML = `<option value="">Carregando etapas…</option>`;

    try {
      const etapas = await api(`/fluxos/${fluxoId}/etapas`);
      if (!Array.isArray(etapas) || etapas.length === 0) {
        selectEtapa.innerHTML = `<option value="">Nenhuma etapa cadastrada neste fluxo</option>`;
        avisoEtapasVazias.textContent = "Este fluxo ainda não possui etapas. Acesse 'Cadastros > Fluxos' para cadastrar etapas.";
        avisoEtapasVazias.hidden = false;
        btnSubmit.disabled = true;
        return;
      }

      const iniciais = etapas.filter((e) => e.eh_inicial);
      if (iniciais.length === 0) {
        selectEtapa.innerHTML =
          `<option value="">Selecione a etapa…</option>` +
          etapas.map((e) => `<option value="${e.id}">${escaparHtml(e.nome)} (${e.tipo === "aprovacao" ? "Aprovação" : "Tarefa"})</option>`).join("");
        avisoEtapasVazias.textContent = "Dica: Nenhuma etapa está marcada com 'É a etapa inicial?'. Exibindo todas as etapas disponíveis.";
        avisoEtapasVazias.hidden = false;
        btnSubmit.disabled = false;
      } else {
        selectEtapa.innerHTML =
          `<option value="">Selecione a etapa inicial…</option>` +
          iniciais.map((e) => `<option value="${e.id}">${escaparHtml(e.nome)}</option>`).join("");
        if (iniciais.length === 1) {
          selectEtapa.value = String(iniciais[0].id);
          await carregarCamposDaEtapa(iniciais[0].id);
        }
        btnSubmit.disabled = false;
      }
    } catch (err) {
      mostrarErro(msgErro, err);
      selectEtapa.innerHTML = `<option value="">Erro ao carregar etapas</option>`;
      btnSubmit.disabled = true;
    }
  }

  selectFluxo.addEventListener("change", carregarEtapasIniciais);

  selectEtapa.addEventListener("change", () => {
    carregarCamposDaEtapa(selectEtapa.value);
  });

  if (fluxos.length === 1) {
    selectFluxo.value = String(fluxos[0].id);
    await carregarEtapasIniciais();
  }

  formNovoChamado.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    msgErro.hidden = true;

    const fluxoId = Number(selectFluxo.value);
    const etapaId = Number(selectEtapa.value);
    const prazo = formNovoChamado.elements.prazo?.value || null;

    if (!fluxoId || !etapaId) {
      mostrarErro(msgErro, "Por favor, selecione um fluxo e uma etapa inicial válidos.");
      return;
    }

    const valoresCampos = {};
    for (const c of camposEtapaAtuais) {
      const el = formNovoChamado.elements[`campo_${c.nome}`];
      if (el) {
        valoresCampos[c.nome] = el.value;
      }
    }

    btnSubmit.disabled = true;
    btnSubmit.textContent = "Abrindo chamado…";

    try {
      const resultado = await api("/chamados", {
        method: "POST",
        body: {
          fluxo_template_id: fluxoId,
          etapa_inicial_id: etapaId,
          prazo: prazo,
          campos: valoresCampos,
        },
      });
      window.location.href = `chamado.html?id=${resultado.chamado.id}`;
    } catch (e) {
      mostrarErro(msgErro, e);
      btnSubmit.disabled = false;
      btnSubmit.textContent = "Abrir chamado";
    }
  });
}
