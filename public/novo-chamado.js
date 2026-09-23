import { exigirLogin, permissaoDaTela } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { escaparHtml, mostrarErro, info } from "./ui.js";
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

  try {
    const [resFluxos, resEmpresas] = await Promise.all([
      api("/fluxos").catch(() => []),
      api("/empresas").catch(() => []),
    ]);
    fluxos = Array.isArray(resFluxos) ? resFluxos : [];
    empresas = Array.isArray(resEmpresas) ? resEmpresas : [];
  } catch (e) {
    fluxos = [];
    empresas = [];
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
  const setorUsuarioNome = usuario.setor_nome || "Geral";

  container.innerHTML = `
    <div class="pagina-formulario-tela-cheia">
      <div class="pagina-cabecalho" style="margin-bottom: 1.25rem;">
        <div class="pagina-cabecalho__esquerda">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;">
            <a href="/chamados" style="font-size: 0.85rem; color: var(--cor-primaria); text-decoration: none; font-weight: 600;">← Meus chamados</a>
            <span style="color: var(--cor-texto-secundario);">/</span>
            <span style="font-size: 0.85rem; color: var(--cor-texto-secundario);">Novo chamado</span>
          </div>
          <h2 style="margin: 0; font-size: 1.45rem;">Abrir Novo Chamado</h2>
          <p style="font-size: 0.9rem; color: var(--cor-texto-secundario); margin: 0.25rem 0 0;">
            Preencha as informações abaixo para iniciar um processo no fluxo de trabalho.
          </p>
        </div>
      </div>

      <p id="mensagem-erro" class="erro" hidden></p>

      <form class="formulario" id="form-novo-chamado">
        <!-- Card 1: Fluxo e Etapa Inicial -->
        <section class="formulario-secao-card">
          <h3 class="formulario-secao-titulo">
            <span class="formulario-secao-icone">🔄</span> Fluxo de Processo
          </h3>
          <div class="formulario-grid-2col">
            <div class="campo-grupo">
              <label class="campo-rotulo" for="select-fluxo">
                Fluxo de processo <span class="campo-obrigatorio">*</span>
              </label>
              <select id="select-fluxo" name="fluxo_template_id" required class="select-padrao">
                <option value="">Selecione o fluxo...</option>
                ${fluxos.map((f) => `<option value="${f.id}">${escaparHtml(f.nome)}</option>`).join("")}
              </select>
              <p class="campo-ajuda">Selecione o modelo operacional aplicável a esta solicitação.</p>
            </div>

            <div class="campo-grupo" id="wrap-etapa-inicial">
              <label class="campo-rotulo" for="select-etapa-inicial">
                Etapa inicial <span class="campo-obrigatorio">*</span>
                ${info("Etapa onde a solicitação se inicia. Geralmente é a etapa de abertura, triagem ou solicitação.")}
              </label>
              <select id="select-etapa-inicial" name="etapa_inicial_id" required class="select-padrao" disabled>
                <option value="">Selecione primeiro o fluxo acima...</option>
              </select>
              <p id="aviso-etapas-vazias" class="campo-ajuda" style="color: var(--cor-alerta);" hidden></p>
            </div>
          </div>
        </section>

        <!-- Card 2: Dados Principais da Solicitação -->
        <section class="formulario-secao-card">
          <h3 class="formulario-secao-titulo">
            <span class="formulario-secao-icone">📝</span> Dados Principais da Solicitação
          </h3>
          
          <div class="formulario-grid-2col">
            <!-- Título do Chamado (Largura Total) -->
            <div class="campo-grupo col-span-2">
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
                style="font-size: 1rem; font-weight: 600;"
              >
              <p class="campo-ajuda">Identificação principal do chamado para consultas, listas e relatórios.</p>
            </div>

            <!-- Empresa do Solicitante -->
            <div class="campo-grupo">
              <label class="campo-rotulo" for="select-empresa">
                Empresa
                ${info("Empresa vinculada ao solicitante. Você pode selecionar outra caso participe de mais de uma empresa.")}
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
              <p class="campo-ajuda">Empresa padrão preenchida automaticamente com base no seu cadastro.</p>
            </div>

            <!-- Prioridade -->
            <div class="campo-grupo">
              <label class="campo-rotulo" for="select-prioridade">
                Prioridade da solicitação
              </label>
              <select id="select-prioridade" name="prioridade" class="select-padrao">
                <option value="baixa">Baixa</option>
                <option value="normal" selected>Normal</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
              <p class="campo-ajuda">Define a criticidade da solicitação para a fila de atendimento.</p>
            </div>

            <!-- Solicitante Automático (Somente leitura) -->
            <div class="campo-grupo">
              <label class="campo-rotulo">
                Solicitante
              </label>
              <div class="campo-fixo-exibicao">
                <span>👤 ${escaparHtml(usuario.nome)}</span>
                <span class="tag-automatico">Automático</span>
              </div>
              <p class="campo-ajuda">Usuário autenticado responsável pela abertura deste chamado.</p>
            </div>

            <!-- Setor Automático (Somente leitura) -->
            <div class="campo-grupo">
              <label class="campo-rotulo">
                Setor do solicitante
              </label>
              <div class="campo-fixo-exibicao">
                <span>🏢 ${escaparHtml(setorUsuarioNome)}</span>
                <span class="tag-automatico">Automático</span>
              </div>
              <p class="campo-ajuda">Setor do seu usuário no momento da abertura.</p>
            </div>

            <!-- Observação Livre (Largura Total) -->
            <div class="campo-grupo col-span-2">
              <label class="campo-rotulo" for="campo-observacao">
                Observação (opcional)
              </label>
              <textarea 
                id="campo-observacao" 
                name="observacao" 
                rows="4" 
                class="textarea-padrao" 
                placeholder="Espaço livre para detalhamento adicional, orientações preliminares ou contexto da solicitação..."
              ></textarea>
              <p class="campo-ajuda">Informações adicionais para contextualizar os responsáveis pelo atendimento.</p>
            </div>
          </div>
        </section>

        <!-- Card 3: Campos Personalizados da Solicitação -->
        <section id="wrap-campos-dinamicos" class="formulario-secao-card" style="display: none;">
          <h3 class="formulario-secao-titulo">
            <span class="formulario-secao-icone">📋</span> Campos Personalizados do Fluxo
          </h3>
          <p style="font-size: 0.88rem; color: var(--cor-texto-secundario); margin: 0 0 1rem;">
            Preencha os campos específicos configurados para esta etapa do fluxo de trabalho.
          </p>
          <div id="container-campos-render" class="formulario-grid-2col"></div>
        </section>

        <!-- Barra de Ações Inferior -->
        <div style="display: flex; justify-content: flex-end; align-items: center; gap: 0.75rem; margin-top: 1.5rem; padding-top: 1rem;">
          <a href="/chamados" class="btn btn-secundario" style="min-width: 120px; text-align: center;">Cancelar</a>
          <button type="submit" class="btn btn-primario btn-abrir-chamado" id="btn-submit-chamado" style="min-width: 180px; padding: 0.75rem 1.5rem; font-weight: 700;">
            🚀 Abrir chamado
          </button>
        </div>
      </form>
    </div>
  `;

  const selectFluxo = container.querySelector("#select-fluxo");
  const selectEtapa = container.querySelector("#select-etapa-inicial");
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

      // Ordenar por ordem definida (1 a 10) e limitar a até 10 campos personalizados
      campos.sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || a.id - b.id);
      camposEtapaAtuais = campos.slice(0, 10);

      wrapCampos.style.display = "block";
      containerCampos.innerHTML = camposEtapaAtuais
        .map((c) => {
          let inputHtml = "";
          const reqAttr = c.obrigatorio ? "required" : "";
          const obrigatorioMark = c.obrigatorio ? ' <span class="campo-obrigatorio">*</span>' : "";
          const tipoNorm = String(c.tipo || "texto").toLowerCase();

          if (tipoNorm === "texto_longo" || tipoNorm === "textarea") {
            inputHtml = `
              <div class="campo-grupo col-span-2">
                <label class="campo-rotulo">
                  ${escaparHtml(c.rotulo)}${obrigatorioMark}
                </label>
                <textarea name="campo_${c.nome}" data-campo-id="${c.id}" ${reqAttr} rows="3" class="textarea-padrao" placeholder="Digite aqui..."></textarea>
              </div>
            `;
          } else if (tipoNorm === "checkbox") {
            inputHtml = `
              <div class="campo-grupo">
                <label class="campo-rotulo">
                  ${escaparHtml(c.rotulo)}${obrigatorioMark}
                </label>
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
              <div class="campo-grupo">
                <label class="campo-rotulo">
                  ${escaparHtml(c.rotulo)}${obrigatorioMark}
                </label>
                <select name="campo_${c.nome}" data-campo-id="${c.id}" ${reqAttr} class="select-padrao">
                  <option value="">Selecione uma opção...</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </div>
            `;
          } else if (tipoNorm === "numero" || tipoNorm === "number") {
            inputHtml = `
              <div class="campo-grupo">
                <label class="campo-rotulo">
                  ${escaparHtml(c.rotulo)}${obrigatorioMark}
                </label>
                <input type="number" step="any" name="campo_${c.nome}" data-campo-id="${c.id}" ${reqAttr} class="input-padrao" placeholder="0">
              </div>
            `;
          } else if (tipoNorm === "data" || tipoNorm === "date") {
            inputHtml = `
              <div class="campo-grupo">
                <label class="campo-rotulo">
                  ${escaparHtml(c.rotulo)}${obrigatorioMark}
                </label>
                <input type="date" name="campo_${c.nome}" data-campo-id="${c.id}" ${reqAttr} class="input-padrao">
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
              <div class="campo-grupo">
                <label class="campo-rotulo">
                  ${escaparHtml(c.rotulo)}${obrigatorioMark}
                </label>
                <select name="campo_${c.nome}" data-campo-id="${c.id}" ${reqAttr} class="select-padrao">
                  <option value="">Selecione...</option>
                  ${opcoes.map((op) => `<option value="${escaparHtml(op)}">${escaparHtml(op)}</option>`).join("")}
                </select>
              </div>
            `;
          } else {
            inputHtml = `
              <div class="campo-grupo">
                <label class="campo-rotulo">
                  ${escaparHtml(c.rotulo)}${obrigatorioMark}
                </label>
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

  async function carregarEtapasIniciais() {
    avisoEtapasVazias.hidden = true;
    avisoEtapasVazias.textContent = "";
    wrapCampos.style.display = "none";
    containerCampos.innerHTML = "";

    const fluxoId = selectFluxo.value;
    if (!fluxoId) {
      selectEtapa.innerHTML = `<option value="">Selecione primeiro o fluxo acima...</option>`;
      selectEtapa.disabled = true;
      btnSubmit.disabled = true;
      return;
    }

    selectEtapa.disabled = false;
    selectEtapa.innerHTML = `<option value="">Carregando etapas...</option>`;

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
          `<option value="">Selecione a etapa...</option>` +
          etapas.map((e) => `<option value="${e.id}">${escaparHtml(e.nome)} (${e.tipo === "aprovacao" ? "Aprovação" : "Tarefa"})</option>`).join("");
        avisoEtapasVazias.textContent = "Dica: Nenhuma etapa está marcada como inicial. Exibindo todas as etapas disponíveis.";
        avisoEtapasVazias.hidden = false;
        btnSubmit.disabled = false;
      } else {
        selectEtapa.innerHTML =
          `<option value="">Selecione a etapa inicial...</option>` +
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
    const titulo = campoTitulo.value.trim();
    const empresaIdVal = selectEmpresa.value ? Number(selectEmpresa.value) : null;
    const prioridade = selectPrioridade.value || "normal";
    const observacao = campoObservacao.value.trim() || null;

    if (!fluxoId || !etapaId) {
      mostrarErro(msgErro, "Por favor, selecione um fluxo e uma etapa inicial válidos.");
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
