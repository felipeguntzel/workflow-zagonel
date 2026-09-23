import { exigirLogin, permissaoDaTela } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { escaparHtml, mostrarErro } from "./ui.js";
import { api } from "./api.js";

export function inicializar() {
  const usuario = exigirLogin();
  if (usuario) {
    aplicarLayout(usuario);
    iniciar(usuario).catch((e) => mostrarErro(document.getElementById("mensagem-erro"), e));
  }
}

export const inicializarNovoChamado = iniciar;

async function iniciar(usuarioLogado) {
  const container = document.getElementById("conteudo-novo-chamado");
  if (!container) return;

  const usuario = usuarioLogado || exigirLogin();
  if (!usuario) return;

  const perm = permissaoDaTela("chamados");
  if (!perm.inserir) {
    container.innerHTML = `
      <div class="pagina-cabecalho">
        <div class="pagina-cabecalho__esquerda">
          <h2>Abrir Novo Chamado</h2>
        </div>
      </div>
      <div class="painel-formulario" style="width: 100%; max-width: 100%;">
        <p style="color: var(--cor-texto-secundario); margin: 0;">Você não possui permissão para abrir novos chamados.</p>
      </div>
    `;
    return;
  }

  let fluxos = [];
  let empresas = [];
  let setores = [];

  try {
    const [resFluxos, resEmpresas, resSetores] = await Promise.all([
      api("/fluxos").catch(() => []),
      api("/empresas").catch(() => []),
      api("/setores").catch(() => []),
    ]);
    fluxos = Array.isArray(resFluxos) ? resFluxos : [];
    empresas = Array.isArray(resEmpresas) ? resEmpresas : [];
    setores = Array.isArray(resSetores) ? resSetores : [];
  } catch (e) {
    fluxos = [];
    empresas = [];
    setores = [];
  }

  if (fluxos.length === 0) {
    container.innerHTML = `
      <div class="pagina-cabecalho">
        <div class="pagina-cabecalho__esquerda">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem;">
            <a href="/chamados" style="font-size: 0.85rem; color: var(--cor-primaria); text-decoration: none; font-weight: 600;">← Meus chamados</a>
            <span style="color: var(--cor-texto-secundario);">/</span>
            <span style="font-size: 0.85rem; color: var(--cor-texto-secundario);">Novo</span>
          </div>
          <h2>Abrir Novo Chamado</h2>
        </div>
      </div>
      <div class="formulario-secao-card" style="border-left: 4px solid var(--cor-alerta);">
        <h3 style="display: flex; align-items: center; gap: 0.5rem; color: var(--cor-alerta); margin-top: 0; margin-bottom: 0.5rem;">
          <span style="font-size: 1.3rem;">⚠️</span> Nenhum fluxo cadastrado
        </h3>
        <p style="margin: 0.5rem 0 1.25rem; font-size: 0.95rem; line-height: 1.5; color: var(--cor-texto);">
          Para abrir um chamado, é necessário cadastrar primeiro pelo menos um <strong>Fluxo de Processo</strong> com suas respectivas etapas.
        </p>
        <div style="display: flex; gap: 0.75rem;">
          <a href="/fluxo" class="btn btn-primario">Cadastrar Fluxos</a>
          <a href="/chamados" class="btn btn-secundario">Voltar para Chamados</a>
        </div>
      </div>
    `;
    return;
  }

  const empresaUsuarioId = usuario.empresa_id || (empresas.length > 0 ? empresas[0].id : null);
  const setorUsuarioId = usuario.setor_id || (setores.length > 0 ? setores[0].id : null);

  container.innerHTML = `
    <div class="pagina-formulario-tela-cheia">
      <div class="pagina-cabecalho" style="margin-bottom: 0.85rem;">
        <div class="pagina-cabecalho__esquerda">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
            <a href="/chamados" style="font-size: 0.85rem; color: var(--cor-primaria); text-decoration: none; font-weight: 600;">← Meus chamados</a>
            <span style="color: var(--cor-texto-secundario);">/</span>
            <span style="font-size: 0.85rem; color: var(--cor-texto-secundario);">Novo chamado</span>
          </div>
          <h2 style="margin: 0; font-size: 1.35rem;">Abrir Novo Chamado</h2>
        </div>
      </div>

      <p id="mensagem-erro" class="erro" hidden></p>

      <form class="formulario" id="form-novo-chamado" style="gap: 0.85rem;">
        <!-- Card: Dados Principais da Solicitação (incluindo Seleção do Fluxo) -->
        <section class="formulario-secao-card">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem;">
            <h3 class="formulario-secao-titulo" style="margin-bottom: 0;">
              <span class="formulario-secao-icone">📝</span> Dados Principais da Solicitação
            </h3>
            <span id="rotulo-etapa-automatica" style="font-size: 0.8rem; color: var(--cor-texto-secundario); font-weight: 600; background: var(--cor-fundo-elevado); padding: 0.25rem 0.6rem; border-radius: 4px; border: 1px solid var(--cor-borda);" hidden></span>
          </div>

          <!-- Linha 1: Fluxo de Processo e Solicitante em 2 colunas -->
          <div class="formulario-grid-cabecalho" style="margin-bottom: 0.4rem;">
            <div class="campo-grupo" style="margin-bottom: 0;">
              <label class="campo-rotulo" for="select-fluxo">
                Fluxo de processo <span class="campo-obrigatorio">*</span>
              </label>
              <select id="select-fluxo" name="fluxo_template_id" required class="select-padrao">
                <option value="">Selecione o fluxo...</option>
                ${fluxos.map((f) => `<option value="${f.id}">${escaparHtml(f.nome)}</option>`).join("")}
              </select>
              <input type="hidden" id="input-etapa-inicial-id" name="etapa_inicial_id">
              <p id="aviso-etapas-vazias" class="campo-ajuda" style="color: var(--cor-alerta); margin-top: 0.25rem;" hidden></p>
            </div>

            <div class="campo-grupo" style="margin-bottom: 0;">
              <label class="campo-rotulo">
                Solicitante
              </label>
              <div class="campo-fixo-exibicao">
                <span>👤 ${escaparHtml(usuario.nome)}</span>
                <span class="tag-automatico">Automático</span>
              </div>
            </div>
          </div>

          <!-- Linha 2: Título do chamado com largura total -->
          <div class="campo-grupo" style="margin-top: 0.4rem; margin-bottom: 0.4rem;">
            <label class="campo-rotulo" for="campo-titulo">
              Título do chamado <span class="campo-obrigatorio">*</span>
            </label>
            <input 
              type="text" 
              id="campo-titulo" 
              name="titulo" 
              required 
              class="input-padrao" 
              placeholder="Informe um título objetivo e claro para a solicitação..."
              style="font-size: 0.95rem; font-weight: 600;"
            >
          </div>

          <!-- Linha 3: Prioridade, Setor e Empresa em 3 colunas -->
          <div class="formulario-grid-3col" style="margin-top: 0.4rem;">
            <div class="campo-grupo">
              <label class="campo-rotulo" for="select-prioridade">
                Prioridade
              </label>
              <select id="select-prioridade" name="prioridade" class="select-padrao">
                <option value="baixa">Baixa</option>
                <option value="normal" selected>Normal</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>

            <div class="campo-grupo">
              <label class="campo-rotulo" for="select-setor">
                Setor
              </label>
              <select id="select-setor" name="setor_id" class="select-padrao">
                <option value="">Selecione o setor...</option>
                ${setores
                  .map(
                    (s) =>
                      `<option value="${s.id}" ${s.id === setorUsuarioId ? "selected" : ""}>${escaparHtml(
                        s.nome
                      )}</option>`
                  )
                  .join("")}
              </select>
            </div>

            <div class="campo-grupo">
              <label class="campo-rotulo" for="select-empresa">
                Empresa
              </label>
              <select id="select-empresa" name="empresa_id" class="select-padrao">
                <option value="">Selecione a empresa...</option>
                ${empresas
                  .map(
                    (emp) =>
                      `<option value="${emp.id}" ${emp.id === empresaUsuarioId ? "selected" : ""}>${escaparHtml(
                        emp.codigo ? `[${emp.codigo}] ${emp.nome}` : emp.nome
                      )}</option>`
                  )
                  .join("")}
              </select>
            </div>
          </div>

          <!-- Linha 4: Observação livre -->
          <div class="campo-grupo" style="margin-top: 0.4rem; margin-bottom: 0;">
            <label class="campo-rotulo" for="campo-observacao">
              Observação (opcional)
            </label>
            <textarea 
              id="campo-observacao" 
              name="observacao" 
              rows="3" 
              class="textarea-padrao" 
              placeholder="Espaço livre para detalhamento adicional, orientações preliminares ou contexto da solicitação..."
            ></textarea>
          </div>
        </section>

        <!-- Card 3: Campos Personalizados da Solicitação -->
        <section id="wrap-campos-dinamicos" class="formulario-secao-card" style="display: none;">
          <h3 class="formulario-secao-titulo" style="margin-bottom: 0.65rem;">
            <span class="formulario-secao-icone">📋</span> Campos Personalizados do Fluxo
          </h3>
          <div id="container-campos-render" class="formulario-grid-2col"></div>
        </section>

        <!-- Barra de Ações Inferior -->
        <div style="display: flex; justify-content: flex-end; align-items: center; gap: 0.75rem; margin-top: 0.75rem;">
          <a href="/chamados" class="btn btn-secundario" style="min-width: 110px; text-align: center;">Cancelar</a>
          <button type="submit" class="btn btn-primario btn-abrir-chamado" id="btn-submit-chamado" style="min-width: 170px; padding: 0.65rem 1.4rem; font-weight: 700;">
            🚀 Abrir chamado
          </button>
        </div>
      </form>
    </div>
  `;

  const selectFluxo = container.querySelector("#select-fluxo");
  const inputEtapaInicial = container.querySelector("#input-etapa-inicial-id");
  const rotuloEtapaAuto = container.querySelector("#rotulo-etapa-automatica");
  const selectSetor = container.querySelector("#select-setor");
  const selectEmpresa = container.querySelector("#select-empresa");
  const selectPrioridade = container.querySelector("#select-prioridade");
  const campoTitulo = container.querySelector("#campo-titulo");
  const campoObservacao = container.querySelector("#campo-observacao");
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
      const campos = await api(`/etapas/${etapaId}/campos`);
      if (!Array.isArray(campos) || campos.length === 0) {
        wrapCampos.style.display = "none";
        containerCampos.innerHTML = "";
        camposEtapaAtuais = [];
        return;
      }

      // Ordenar rigorosamente pela coluna ordem (1 a 10) e por ID
      campos.sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || a.id - b.id);
      camposEtapaAtuais = campos.slice(0, 10);

      wrapCampos.style.display = "block";
      containerCampos.innerHTML = camposEtapaAtuais
        .map((c) => {
          let inputHtml = "";
          const reqAttr = c.obrigatorio ? "required" : "";
          const obrigatorioMark = c.obrigatorio ? ' <span class="campo-obrigatorio">*</span>' : "";
          const tipoNorm = String(c.tipo || "texto").toLowerCase();

          // Posição: esquerda, direita ou inteira
          const pos = String(c.posicao || "esquerda").toLowerCase();
          let classePos = "col-pos-esquerda";
          if (pos === "direita") {
            classePos = "col-pos-direita";
          } else if (pos === "inteira" || tipoNorm === "texto_longo" || tipoNorm === "textarea") {
            classePos = "col-pos-inteira";
          }

          // Orientação informativa / Dica
          const orientacaoBtn = c.orientacao
            ? `<button type="button" class="campo-orientacao-btn" title="Ver orientação do campo" onclick="const box = this.closest('.campo-grupo').querySelector('.campo-orientacao-texto'); if(box) box.hidden = !box.hidden;">i</button>`
            : "";
          const orientacaoBox = c.orientacao
            ? `<div class="campo-orientacao-texto" hidden>💡 ${escaparHtml(c.orientacao)}</div>`
            : "";

          if (tipoNorm === "texto_longo" || tipoNorm === "textarea") {
            inputHtml = `
              <div class="campo-grupo ${classePos}">
                <label class="campo-rotulo">
                  <span>${escaparHtml(c.rotulo)}</span>${obrigatorioMark}${orientacaoBtn}
                </label>
                ${orientacaoBox}
                <textarea name="campo_${c.nome}" data-campo-id="${c.id}" ${reqAttr} rows="3" class="textarea-padrao" placeholder="Digite aqui..."></textarea>
              </div>
            `;
          } else if (tipoNorm === "checkbox") {
            inputHtml = `
              <div class="campo-grupo ${classePos}">
                <label class="campo-rotulo">
                  <span>${escaparHtml(c.rotulo)}</span>${obrigatorioMark}${orientacaoBtn}
                </label>
                ${orientacaoBox}
                <div class="campo-fixo-exibicao" style="font-weight: normal; cursor: pointer;" onclick="const cb = this.querySelector('input'); cb.checked = !cb.checked;">
                  <label style="display: flex; align-items: center; gap: 0.5rem; width: 100%; cursor: pointer; margin: 0;">
                    <input type="checkbox" name="campo_${c.nome}" data-campo-id="${c.id}" value="sim" ${reqAttr} onclick="event.stopPropagation();">
                    <span>Marcar para confirmar</span>
                  </label>
                </div>
              </div>
            `;
          } else if (tipoNorm === "sim_nao") {
            inputHtml = `
              <div class="campo-grupo ${classePos}">
                <label class="campo-rotulo">
                  <span>${escaparHtml(c.rotulo)}</span>${obrigatorioMark}${orientacaoBtn}
                </label>
                ${orientacaoBox}
                <select name="campo_${c.nome}" data-campo-id="${c.id}" ${reqAttr} class="select-padrao">
                  <option value="">Selecione uma opção...</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </div>
            `;
          } else if (tipoNorm === "numero" || tipoNorm === "number") {
            inputHtml = `
              <div class="campo-grupo ${classePos}">
                <label class="campo-rotulo">
                  <span>${escaparHtml(c.rotulo)}</span>${obrigatorioMark}${orientacaoBtn}
                </label>
                ${orientacaoBox}
                <input type="number" step="any" name="campo_${c.nome}" data-campo-id="${c.id}" ${reqAttr} class="input-padrao" placeholder="0">
              </div>
            `;
          } else if (tipoNorm === "data" || tipoNorm === "date") {
            const diasMin = c.dias_minimos != null ? Math.max(0, parseInt(c.dias_minimos, 10) || 0) : 0;
            // Se for campo de faturamento, entrega ou previsão, exige no mínimo 1 dia se não configurado
            const ehFaturamentoOuEntrega = /faturamento|entrega|previs[aã]o/i.test(c.rotulo || c.nome);
            const diasEfetivos = diasMin > 0 ? diasMin : (ehFaturamentoOuEntrega ? 1 : 0);

            const hoje = new Date();
            const dataMin = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + diasEfetivos);
            const dataMinISO = dataMin.toISOString().slice(0, 10);

            const [ano, mes, dia] = dataMinISO.split("-");
            const dataMinFormatada = `${dia}/${mes}/${ano}`;

            const infoDica = diasEfetivos > 0
              ? `<div style="font-size: 0.78rem; color: #15803d; margin-top: 0.25rem; font-weight: 600;">📅 Seleção permitida a partir de: <strong>${dataMinFormatada}</strong> (mínimo de ${diasEfetivos} dia(s) a partir de hoje)</div>`
              : `<div style="font-size: 0.78rem; color: var(--cor-texto-secundario); margin-top: 0.25rem;">📅 Data mínima permitida: hoje (${dataMinFormatada})</div>`;

            inputHtml = `
              <div class="campo-grupo ${classePos}">
                <label class="campo-rotulo">
                  <span>${escaparHtml(c.rotulo)}</span>${obrigatorioMark}${orientacaoBtn}
                </label>
                ${orientacaoBox}
                <input 
                  type="date" 
                  name="campo_${c.nome}" 
                  id="campo_din_${c.nome}" 
                  data-campo-id="${c.id}" 
                  data-min-iso="${dataMinISO}" 
                  data-min-dias="${diasEfetivos}"
                  min="${dataMinISO}" 
                  ${reqAttr} 
                  class="input-padrao"
                >
                ${infoDica}
              </div>
            `;
          } else if (tipoNorm === "selecao" || tipoNorm === "select") {
            let opcoes = Array.isArray(c.opcoes_parsed) && c.opcoes_parsed.length > 0 ? c.opcoes_parsed : [];
            if (opcoes.length === 0 && (c.opcoes_json || c.opcoes)) {
              try {
                const parsed = JSON.parse(c.opcoes_json || c.opcoes);
                if (Array.isArray(parsed)) opcoes = parsed;
              } catch (_) {
                if (typeof c.opcoes === "string") {
                  opcoes = c.opcoes.split(",").map((s) => s.trim()).filter(Boolean);
                }
              }
            }
            inputHtml = `
              <div class="campo-grupo ${classePos}">
                <label class="campo-rotulo">
                  <span>${escaparHtml(c.rotulo)}</span>${obrigatorioMark}${orientacaoBtn}
                </label>
                ${orientacaoBox}
                <select name="campo_${c.nome}" data-campo-id="${c.id}" ${reqAttr} class="select-padrao">
                  <option value="">Selecione...</option>
                  ${opcoes.map((op) => `<option value="${escaparHtml(op)}">${escaparHtml(op)}</option>`).join("")}
                </select>
              </div>
            `;
          } else {
            inputHtml = `
              <div class="campo-grupo ${classePos}">
                <label class="campo-rotulo">
                  <span>${escaparHtml(c.rotulo)}</span>${obrigatorioMark}${orientacaoBtn}
                </label>
                ${orientacaoBox}
                <input type="text" name="campo_${c.nome}" data-campo-id="${c.id}" ${reqAttr} class="input-padrao" placeholder="Informe o valor...">
              </div>
            `;
          }

          return inputHtml;
        })
        .join("");
    } catch (err) {
      wrapCampos.style.display = "none";
      containerCampos.innerHTML = "";
    }
  }

  async function carregarEtapaPadraoDoFluxo() {
    avisoEtapasVazias.hidden = true;
    avisoEtapasVazias.textContent = "";
    rotuloEtapaAuto.hidden = true;
    rotuloEtapaAuto.textContent = "";
    inputEtapaInicial.value = "";
    wrapCampos.style.display = "none";
    containerCampos.innerHTML = "";

    const fluxoId = selectFluxo.value;
    if (!fluxoId) {
      btnSubmit.disabled = true;
      return;
    }

    try {
      const etapas = await api(`/fluxos/${fluxoId}/etapas`);
      if (!Array.isArray(etapas) || etapas.length === 0) {
        avisoEtapasVazias.textContent = "Este fluxo ainda não possui etapas. Acesse 'Cadastros > Fluxos' para cadastrar etapas.";
        avisoEtapasVazias.hidden = false;
        btnSubmit.disabled = true;
        return;
      }

      // Localizar etapa inicial padrao do fluxo (etapa com eh_inicial ou primeira etapa cadastrada)
      const inicial = etapas.find((e) => e.eh_inicial) || etapas[0];
      inputEtapaInicial.value = String(inicial.id);
      rotuloEtapaAuto.textContent = `Etapa inicial: ${inicial.nome}`;
      rotuloEtapaAuto.hidden = false;
      btnSubmit.disabled = false;

      await carregarCamposDaEtapa(inicial.id);
    } catch (err) {
      mostrarErro(msgErro, err);
      btnSubmit.disabled = true;
    }
  }

  selectFluxo.addEventListener("change", carregarEtapaPadraoDoFluxo);

  if (fluxos.length === 1) {
    selectFluxo.value = String(fluxos[0].id);
    await carregarEtapaPadraoDoFluxo();
  }

  formNovoChamado.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    msgErro.hidden = true;

    const fluxoId = Number(selectFluxo.value);
    const etapaId = Number(inputEtapaInicial.value);
    const titulo = campoTitulo.value.trim();
    const setorIdVal = selectSetor.value ? Number(selectSetor.value) : null;
    const empresaIdVal = selectEmpresa.value ? Number(selectEmpresa.value) : null;
    const prioridade = selectPrioridade.value || "normal";
    const observacao = campoObservacao.value.trim() || null;

    if (!fluxoId || !etapaId) {
      mostrarErro(msgErro, "Por favor, selecione um fluxo de processo válido.");
      return;
    }

    if (!titulo) {
      mostrarErro(msgErro, "O título do chamado é obrigatório.");
      campoTitulo.focus();
      return;
    }

    const valoresCampos = {};
    for (const c of camposEtapaAtuais) {
      const el = formNovoChamado.elements[`campo_${c.nome}`];
      if (el) {
        if (el.type === "checkbox") {
          valoresCampos[c.nome] = el.checked ? "sim" : "nao";
        } else {
          valoresCampos[c.nome] = el.value;
        }

        // Validação de data mínima no submit
        const tipoNorm = String(c.tipo || "texto").toLowerCase();
        if ((tipoNorm === "data" || tipoNorm === "date") && el.value) {
          const minIso = el.getAttribute("data-min-iso");
          const diasMin = Number(el.getAttribute("data-min-dias") || 0);
          if (minIso && el.value < minIso) {
            const [ano, mes, dia] = minIso.split("-");
            mostrarErro(
              msgErro,
              `A data informada no campo "${c.rotulo}" não pode ser anterior a ${dia}/${mes}/${ano} (antecedência mínima de ${diasMin} dia(s)).`
            );
            el.focus();
            return;
          }
        }
      }
    }

    btnSubmit.disabled = true;
    btnSubmit.textContent = "Abrindo chamado...";

    try {
      const resultado = await api("/chamados", {
        method: "POST",
        body: {
          fluxo_template_id: fluxoId,
          etapa_inicial_id: etapaId,
          titulo: titulo,
          setor_id: setorIdVal,
          empresa_id: empresaIdVal,
          prioridade: prioridade,
          observacao: observacao,
          campos: valoresCampos,
        },
      });
      window.location.href = `/chamado?id=${resultado.chamado.id}`;
    } catch (e) {
      mostrarErro(msgErro, e);
      btnSubmit.disabled = false;
      btnSubmit.textContent = "🚀 Abrir chamado";
    }
  });
}

inicializar();
