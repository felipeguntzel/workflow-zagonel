import { exigirLogin, permissaoDaTela } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { info, mostrarErro, escaparHtml, linkWhatsApp } from "./ui.js";
import { confirmarAcao } from "./modal.js";
import { api } from "./api.js";

const usuario = exigirLogin();
const id = new URLSearchParams(window.location.search).get("id");
const permissaoChamados = usuario
  ? permissaoDaTela("chamados")
  : { visualizar: false, inserir: false, editar: false, excluir: false };

if (usuario && id) {
  aplicarLayout(usuario);
  iniciar();
} else if (usuario) {
  aplicarLayout(usuario);
  mostrarErro(document.getElementById("mensagem-erro"), new Error("Chamado não informado."));
  document.querySelector("main").querySelectorAll(":scope > :not(#mensagem-erro)").forEach((el) => {
    el.hidden = true;
  });
}

function formatarTamanho(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function iniciar() {
  document.getElementById("link-geral").addEventListener("click", async (ev) => {
    ev.preventDefault();
    try {
      const chamado = await api(`/chamados/${id}`);
      window.location.href = `geral.html?id=${chamado.chamado_mae_id ?? chamado.id}`;
    } catch (e) {
      mostrarErro(document.getElementById("mensagem-erro"), e);
    }
  });

  const botaoExcluir = document.getElementById("btn-excluir-chamado");
  if (permissaoChamados.excluir) {
    botaoExcluir.addEventListener("click", async () => {
      const confirmado = await confirmarAcao(
        "Excluir este chamado?",
        "Toda a subárvore é excluída junto. Isso não pode ser desfeito."
      );
      if (!confirmado) return;
      try {
        await api(`/chamados/${id}`, { method: "DELETE" });
        window.location.href = "chamados.html";
      } catch (e) {
        mostrarErro(document.getElementById("mensagem-erro"), e);
      }
    });
  } else {
    botaoExcluir.hidden = true;
  }

  // Lançamento de horas
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

  // Comentários com suporte a comentário privado
  document.getElementById("form-comentario").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const ehPrivado = document.getElementById("check-comentario-privado")?.checked || false;
    try {
      await api(`/chamados/${id}/comentarios`, {
        method: "POST",
        body: {
          texto: form.elements.texto.value,
          eh_privado: ehPrivado,
        },
      });
      form.reset();
      if (document.getElementById("check-comentario-privado")) {
        document.getElementById("check-comentario-privado").checked = false;
      }
      carregarComentarios();
      carregarAuditoria();
    } catch (e) {
      mostrarErro(document.getElementById("mensagem-erro"), e);
    }
  });

  // Envio de Anexos (até 2MB por arquivo)
  const formAnexo = document.getElementById("form-anexo");
  const inputArquivo = document.getElementById("input-arquivo-anexo");
  const checkPrivado = document.getElementById("check-anexo-privado");
  const msgErroAnexo = document.getElementById("msg-erro-anexo");
  const btnEnviarAnexo = document.getElementById("btn-enviar-anexo");

  formAnexo.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    msgErroAnexo.hidden = true;

    const arquivo = inputArquivo.files[0];
    if (!arquivo) return;

    if (arquivo.size > 2 * 1024 * 1024) {
      msgErroAnexo.textContent = "O arquivo excede o limite de 2MB.";
      msgErroAnexo.hidden = false;
      return;
    }

    btnEnviarAnexo.disabled = true;
    btnEnviarAnexo.textContent = "Enviando…";

    const leitor = new FileReader();
    leitor.onload = async () => {
      try {
        const base64 = leitor.result.split(",")[1];
        await api(`/chamados/${id}/anexos`, {
          method: "POST",
          body: {
            nome_arquivo: arquivo.name,
            mime_type: arquivo.type || "application/octet-stream",
            tamanho_bytes: arquivo.size,
            conteudo_base64: base64,
            eh_privado: checkPrivado.checked,
          },
        });
        formAnexo.reset();
        checkPrivado.checked = false;
        carregarAnexos();
        carregarAuditoria();
      } catch (e) {
        msgErroAnexo.textContent = e.message || "Erro ao enviar anexo.";
        msgErroAnexo.hidden = false;
      } finally {
        btnEnviarAnexo.disabled = false;
        btnEnviarAnexo.textContent = "Enviar anexo";
      }
    };
    leitor.onerror = () => {
      msgErroAnexo.textContent = "Erro ao ler arquivo local.";
      msgErroAnexo.hidden = false;
      btnEnviarAnexo.disabled = false;
      btnEnviarAnexo.textContent = "Enviar anexo";
    };
    leitor.readAsDataURL(arquivo);
  });

  carregarTudo().catch((e) => mostrarErro(document.getElementById("mensagem-erro"), e));
}

async function carregarTudo() {
  await Promise.all([
    carregarDetalhe(),
    carregarCamposDinamicos(),
    carregarAnexos(),
    carregarAuditoria(),
    carregarHoras(),
    carregarComentarios(),
  ]);
}

async function carregarDetalhe() {
  const chamado = await api(`/chamados/${id}`);
  const finalizado = chamado.status_nome === "finalizado";

  // Buscar usuários para seleção de responsável restrito ao setor
  let usuariosDoSetor = [];
  try {
    const todosUsuarios = await api("/usuarios");
    usuariosDoSetor = todosUsuarios.filter(
      (u) => u.ativo && (chamado.setor_id == null || u.setor_id === chamado.setor_id)
    );
  } catch (e) {
    usuariosDoSetor = [];
  }

  const ehSolicitante = usuario.id === chamado.solicitante_id;
  const ehAdmin = usuario.admin === 1;

  document.getElementById("detalhe").innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
      <div>
        <h1 style="margin: 0 0 0.5rem; font-size: 1.5rem;">#${chamado.id} - ${escaparHtml(chamado.titulo)}</h1>
        <p style="margin: 0 0 0.4rem; color: var(--cor-texto-secundario); font-size: 0.95rem;">
          Fluxo: <strong>${escaparHtml(chamado.fluxo_nome || "—")}</strong> |
          Setor: <strong>${escaparHtml(chamado.setor_nome || "—")}</strong> ${info("Setor responsável por esta etapa/tarefa.")}
        </p>
        <p style="margin: 0 0 0.4rem; font-size: 0.95rem; display: flex; align-items: center; flex-wrap: wrap; gap: 0.35rem;">
          <span>Solicitante: <strong>${escaparHtml(chamado.solicitante_nome || "—")}</strong></span>
          ${linkWhatsApp(chamado.solicitante_telefone, chamado.id, chamado.titulo)}
          <span>| Abertura: <strong>${chamado.data_abertura}</strong> | Prazo: <strong>${chamado.prazo}</strong> (${chamado.situacao_prazo})</span>
        </p>
      </div>
      <div>
        <span class="badge-status" style="font-size: 0.9rem; padding: 0.35rem 0.75rem; font-weight: 700; background: var(--cor-fundo); border: 1px solid var(--cor-borda);">
          Status: ${escaparHtml(chamado.status_nome)}
        </span>
      </div>
    </div>

    <div style="margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--cor-borda); display: flex; flex-wrap: wrap; align-items: center; gap: 1rem;">
      <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
        <span style="font-weight: 600; font-size: 0.9rem;">Responsável atual:</span>
        <span style="font-size: 0.9rem;">${chamado.responsavel_nome ? escaparHtml(chamado.responsavel_nome) : "<em>Ninguém atribuído</em>"}</span>
        ${chamado.responsavel_nome ? linkWhatsApp(chamado.responsavel_telefone, chamado.id, chamado.titulo) : ""}
      </div>

      ${
        !finalizado && permissaoChamados.editar
          ? `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <select id="select-atribuir-responsavel" style="padding: 0.35rem 0.6rem; font-size: 0.85rem;">
            <option value="">Atribuir para alguém do setor…</option>
            ${usuariosDoSetor
              .map(
                (u) =>
                  `<option value="${u.id}" ${u.id === chamado.responsavel_id ? "selected" : ""}>${escaparHtml(u.nome)}</option>`
              )
              .join("")}
          </select>
          <button type="button" id="btn-salvar-atribuicao" class="btn btn-secundario btn-pequeno">Atribuir</button>
          ${
            chamado.responsavel_id === usuario.id
              ? `<button type="button" id="btn-liberar-responsavel" class="btn btn-secundario btn-pequeno">Liberar</button>`
              : `<button type="button" id="btn-assumir-responsavel" class="btn btn-secundario btn-pequeno">Assumir</button>`
          }
        </div>
      `
          : ""
      }
    </div>

    ${chamado.resultado ? `<p style="margin-top: 0.5rem; font-weight: 600;">Resultado: ${escaparHtml(chamado.resultado)}</p>` : ""}
    ${
      chamado.bloqueado
        ? `<p class="erro" style="margin-top: 0.5rem;">⚠️ Bloqueado: aguardando outra ação pré-requisito finalizar.</p>`
        : ""
    }
  `;

  async function definirResponsavel(responsavelId) {
    try {
      await api(`/chamados/${chamado.id}`, { method: "PUT", body: { responsavel_id: responsavelId } });
      carregarTudo();
    } catch (e) {
      mostrarErro(document.getElementById("mensagem-erro"), e);
    }
  }

  document.getElementById("btn-assumir-responsavel")?.addEventListener("click", () => definirResponsavel(usuario.id));
  document.getElementById("btn-liberar-responsavel")?.addEventListener("click", () => definirResponsavel(null));
  document.getElementById("btn-salvar-atribuicao")?.addEventListener("click", () => {
    const val = document.getElementById("select-atribuir-responsavel").value;
    definirResponsavel(val ? Number(val) : null);
  });

  const acaoContainer = document.getElementById("acao");
  if (finalizado || !permissaoChamados.editar) {
    acaoContainer.innerHTML = "";
    acaoContainer.hidden = true;
    return;
  }
  acaoContainer.hidden = false;

  if (chamado.etapa_id && chamado.etapa_tipo === "aprovacao") {
    await renderAprovacao(chamado);
  } else {
    await renderStatusManual(chamado);
  }
}

// Carregar e gerenciar campos dinâmicos da etapa
async function carregarCamposDinamicos() {
  const secao = document.getElementById("secao-campos-dinamicos");
  const conteudo = document.getElementById("conteudo-campos-dinamicos");
  const btnSalvar = document.getElementById("btn-salvar-campos-dinamicos");
  const msgErro = document.getElementById("msg-erro-campos");

  try {
    const camposComValores = await api(`/chamados/${id}/campos`);
    if (!Array.isArray(camposComValores) || camposComValores.length === 0) {
      secao.hidden = true;
      return;
    }

    secao.hidden = false;

    // Verificar se usuário pode editar os campos
    const chamado = await api(`/chamados/${id}`);
    const ehMae = chamado.chamado_mae_id == null;
    const ehSolicitante = usuario.id === chamado.solicitante_id;
    const ehAdmin = usuario.admin === 1;
    const podeEditar = !ehMae || ehSolicitante || ehAdmin;

    btnSalvar.hidden = !podeEditar || chamado.status_nome === "finalizado";

    conteudo.innerHTML = `
      <form id="form-campos-dinamicos" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;">
        ${camposComValores
          .map((c) => {
            const disabledAttr = podeEditar && chamado.status_nome !== "finalizado" ? "" : "disabled";
            const val = c.valor != null ? c.valor : "";
            let inputHtml = "";

            if (c.tipo === "texto_longo") {
              inputHtml = `<textarea name="campo_${c.id}" ${disabledAttr} rows="3" style="width: 100%; padding: 0.5rem; font-family: inherit; font-size: 0.9rem;">${escaparHtml(val)}</textarea>`;
            } else if (c.tipo === "numero") {
              inputHtml = `<input type="number" step="any" name="campo_${c.id}" value="${escaparHtml(val)}" ${disabledAttr} style="width: 100%; padding: 0.5rem;">`;
            } else if (c.tipo === "data") {
              inputHtml = `<input type="date" name="campo_${c.id}" value="${escaparHtml(val)}" ${disabledAttr} style="width: 100%; padding: 0.5rem;">`;
            } else if (c.tipo === "selecao") {
              let opcoes = [];
              try {
                opcoes = c.opcoes_json ? JSON.parse(c.opcoes_json) : [];
              } catch (e) {
                opcoes = [];
              }
              inputHtml = `
                <select name="campo_${c.id}" ${disabledAttr} style="width: 100%; padding: 0.5rem;">
                  <option value="">Selecione…</option>
                  ${opcoes.map((op) => `<option value="${escaparHtml(op)}" ${op === val ? "selected" : ""}>${escaparHtml(op)}</option>`).join("")}
                </select>
              `;
            } else {
              // texto simples
              inputHtml = `<input type="text" name="campo_${c.id}" value="${escaparHtml(val)}" ${disabledAttr} style="width: 100%; padding: 0.5rem;">`;
            }

            return `
              <div>
                <label style="font-weight: 600; font-size: 0.88rem; display: block; margin-bottom: 0.3rem;">
                  ${escaparHtml(c.rotulo)} ${c.obrigatorio ? '<span class="campo-obrigatorio">*</span>' : ""}
                </label>
                ${inputHtml}
              </div>
            `;
          })
          .join("")}
      </form>
    `;

    btnSalvar.onclick = async () => {
      msgErro.hidden = true;
      const form = document.getElementById("form-campos-dinamicos");
      const valores = {};
      for (const c of camposComValores) {
        const el = form.elements[`campo_${c.id}`];
        if (el) {
          valores[c.nome] = el.value;
        }
      }

      btnSalvar.disabled = true;
      btnSalvar.textContent = "Salvando…";

      try {
        await api(`/chamados/${id}/campos`, {
          method: "PUT",
          body: { valores },
        });
        carregarCamposDinamicos();
        carregarAuditoria();
      } catch (err) {
        msgErro.textContent = err.message || "Erro ao salvar campos.";
        msgErro.hidden = false;
      } finally {
        btnSalvar.disabled = false;
        btnSalvar.textContent = "Salvar alterações";
      }
    };
  } catch (err) {
    secao.hidden = true;
  }
}

// Carregar e gerenciar anexos com respeito aos limites e privacidade
async function carregarAnexos() {
  const listaEl = document.getElementById("lista-anexos");
  const resumoEl = document.getElementById("resumo-anexos");
  const msgErro = document.getElementById("msg-erro-anexo");

  try {
    const anexos = await api(`/chamados/${id}/anexos`);
    const totalBytes = anexos.reduce((acc, a) => acc + (a.tamanho_bytes || 0), 0);
    resumoEl.textContent = `(${anexos.length} arquivos, ${formatarTamanho(totalBytes)} utilizados)`;

    if (anexos.length === 0) {
      listaEl.innerHTML = `<li style="color: var(--cor-texto-secundario); font-size: 0.9rem;">Nenhum anexo adicionado a este chamado.</li>`;
      return;
    }

    listaEl.innerHTML = anexos
      .map((a) => {
        const ehPrivadoBadge = a.eh_privado
          ? `<span class="badge-status" style="background: #fee2e2; color: #991b1b; font-size: 0.75rem; margin-left: 0.5rem;">🔒 Privado</span>`
          : "";

        return `
          <li style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.75rem; background: var(--cor-fundo); border: 1px solid var(--cor-borda); border-radius: 0.35rem; margin-bottom: 0.4rem;">
            <div>
              <strong>📄 ${escaparHtml(a.nome_arquivo)}</strong>
              <span style="color: var(--cor-texto-secundario); font-size: 0.85rem; margin-left: 0.5rem;">
                (${formatarTamanho(a.tamanho_bytes)}) - enviado por ${escaparHtml(a.usuario_nome || "Anônimo")} em ${a.criado_em.slice(0, 16).replace("T", " ")}
              </span>
              ${ehPrivadoBadge}
            </div>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <button type="button" class="btn btn-secundario btn-pequeno btn-baixar-anexo" data-id="${a.id}">Baixar</button>
              ${
                a.usuario_id === usuario.id || usuario.admin === 1
                  ? `<button type="button" class="btn btn-perigo btn-pequeno btn-excluir-anexo" data-id="${a.id}">Excluir</button>`
                  : ""
              }
            </div>
          </li>
        `;
      })
      .join("");

    // Eventos de download e exclusão
    listaEl.querySelectorAll(".btn-baixar-anexo").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const anexoId = btn.dataset.id;
        try {
          const dados = await api(`/chamados/${id}/anexos?anexo_id=${anexoId}`);
          const link = document.createElement("a");
          link.href = `data:${dados.mime_type};base64,${dados.conteudo_base64}`;
          link.download = dados.nome_arquivo;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } catch (err) {
          msgErro.textContent = err.message || "Erro ao baixar arquivo.";
          msgErro.hidden = false;
        }
      });
    });

    listaEl.querySelectorAll(".btn-excluir-anexo").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const anexoId = btn.dataset.id;
        const confirmado = await confirmarAcao("Excluir anexo?", "Essa ação não poderá ser desfeita.");
        if (!confirmado) return;

        try {
          await api(`/chamados/${id}/anexos?anexo_id=${anexoId}`, { method: "DELETE" });
          carregarAnexos();
          carregarAuditoria();
        } catch (err) {
          msgErro.textContent = err.message || "Erro ao excluir arquivo.";
          msgErro.hidden = false;
        }
      });
    });
  } catch (err) {
    listaEl.innerHTML = `<li class="erro">Erro ao carregar anexos: ${escaparHtml(err.message)}</li>`;
  }
}

// Carregar histórico unificado de auditoria
async function carregarAuditoria() {
  const listaEl = document.getElementById("lista-historico-auditoria");
  try {
    const historico = await api(`/chamados/${id}/historico`);
    if (!Array.isArray(historico) || historico.length === 0) {
      listaEl.innerHTML = `<li style="color: var(--cor-texto-secundario); font-size: 0.9rem;">Nenhum registro de auditoria disponível.</li>`;
      return;
    }

    listaEl.innerHTML = historico
      .map((item) => {
        const dataFormatada = item.criado_em ? item.criado_em.slice(0, 19).replace("T", " ") : "—";
        return `
          <li style="font-size: 0.88rem; border-left: 3px solid var(--cor-primaria); padding: 0.35rem 0.6rem; background: var(--cor-fundo);">
            <div style="display: flex; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.2rem;">
              <strong style="color: var(--cor-primaria);">${escaparHtml(item.usuario_nome || "Sistema")}</strong>
              <span style="color: var(--cor-texto-secundario); font-size: 0.8rem;">${dataFormatada}</span>
            </div>
            <div style="color: var(--cor-texto);">${escaparHtml(item.detalhes)}</div>
          </li>
        `;
      })
      .join("");
  } catch (err) {
    listaEl.innerHTML = `<li style="color: var(--cor-texto-secundario); font-size: 0.88rem;">Não foi possível carregar o histórico de auditoria.</li>`;
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
        ? `<fieldset id="fieldset-acoes" style="margin-bottom: 1rem; padding: 0.75rem 1rem; border: 1px solid var(--cor-borda); border-radius: 0.35rem;">
             <legend style="font-weight: 600; padding: 0 0.4rem;">Ações a executar se aprovado</legend>
             ${etapa.acoes
               .map(
                 (a) =>
                   `<label style="display: block; margin: 0.4rem 0; cursor: pointer;"><input type="checkbox" name="acao-${a.id}" value="${a.id}"> ${escaparHtml(a.rotulo)}</label>`
               )
               .join("")}
           </fieldset>`
        : ""
    }
    <div style="display: flex; gap: 0.75rem; margin-bottom: 1rem;">
      <button type="button" id="btn-aprovar" class="btn btn-primario">✓ Aprovar e avançar</button>
    </div>
    
    <div style="border-top: 1px solid var(--cor-borda); padding-top: 1rem; margin-top: 1rem;">
      <label style="display: block; font-weight: 600; margin-bottom: 0.4rem;">
        Justificativa (obrigatória para reprovar)
        <textarea id="justificativa" style="width: 100%; min-height: 60px; margin-top: 0.2rem;"></textarea>
      </label>
      <button type="button" id="btn-reprovar" class="btn btn-perigo">✕ Reprovar</button>
    </div>
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
    const justificativa = document.getElementById("justificativa").value.trim();
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
    <h2>Atualizar Status da Etapa ${info(
      "Atualize o status conforme o andamento; marque 'finalizado' quando a tarefa estiver concluída."
    )}</h2>
    <div style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
      <select id="select-status" style="padding: 0.5rem 0.75rem; font-size: 0.95rem;">
        ${statusList
          .map(
            (s) =>
              `<option value="${s.id}" ${s.id === chamado.status_id ? "selected" : ""}>${escaparHtml(s.nome)}</option>`
          )
          .join("")}
      </select>
      <button type="button" id="btn-salvar-status" class="btn btn-primario">Salvar status</button>
    </div>
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
  document.getElementById("lista-horas").innerHTML =
    resumo.lancamentos.length === 0
      ? `<li style="color: var(--cor-texto-secundario); font-size: 0.9rem;">Nenhum lançamento ainda.</li>`
      : resumo.lancamentos
          .map(
            (l) =>
              `<li style="padding: 0.35rem 0; border-bottom: 1px solid var(--cor-borda); font-size: 0.9rem;">${l.data} - <strong>${escaparHtml(l.usuario_nome)}</strong> - <strong>${l.horas}h</strong> ${l.observacao ? `(${escaparHtml(l.observacao)})` : ""}</li>`
          )
          .join("");
}

async function carregarComentarios() {
  const comentarios = await api(`/chamados/${id}/comentarios`);
  document.getElementById("lista-comentarios").innerHTML =
    comentarios.length === 0
      ? `<li style="color: var(--cor-texto-secundario); font-size: 0.9rem;">Nenhum comentário ainda.</li>`
      : comentarios
          .map((c) => {
            const ehPrivadoBadge = c.eh_privado
              ? `<span class="badge-status" style="background: #fee2e2; color: #991b1b; font-size: 0.72rem; margin-left: 0.4rem;">🔒 Privado</span>`
              : "";
            return `
              <li style="padding: 0.6rem 0.8rem; background: var(--cor-fundo); border: 1px solid var(--cor-borda); border-radius: 0.35rem; margin-bottom: 0.5rem; font-size: 0.92rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                  <strong>${escaparHtml(c.usuario_nome ?? "Sistema")}${ehPrivadoBadge}</strong>
                  <span style="color: var(--cor-texto-secundario); font-size: 0.8rem;">${c.data}${c.eh_justificativa ? " - justificativa" : ""}</span>
                </div>
                <div style="line-height: 1.4;">${escaparHtml(c.texto)}</div>
              </li>
            `;
          })
          .join("");
}
