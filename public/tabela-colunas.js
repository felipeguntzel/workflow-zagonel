/**
 * Módulo de Reordenação e Visibilidade de Colunas de Tabelas por Usuário
 * - Permite arrastar os cabeçalhos das colunas (drag-and-drop)
 * - Permite ocultar e exibir colunas sob demanda
 * - Salva as preferências de ordem e visibilidade do usuário no localStorage
 */

export function tornarTabelaReordenavel(tabela, chaveIdentificador, usuarioId = null) {
  if (!tabela) return;

  const theadTr = tabela.querySelector("thead tr");
  const tbody = tabela.querySelector("tbody");
  if (!theadTr) return;

  // Evita re-inicialização com duplicação de eventos na mesma tabela
  if (tabela.dataset.tabelaReordenavelIniciada === chaveIdentificador) {
    return;
  }
  tabela.dataset.tabelaReordenavelIniciada = chaveIdentificador;

  const uid = usuarioId || obterUsuarioIdAtual() || "anon";
  const storageKeyOrdem = `workflow_cols_${uid}_${chaveIdentificador}`;
  const storageKeyVis = `workflow_cols_vis_${uid}_${chaveIdentificador}`;

  // Obter identificador único para cada th
  function obterIdColuna(th, idx) {
    return (
      th.dataset.col ||
      th.dataset.campo ||
      th.getAttribute("data-id") ||
      (th.textContent || "").trim() ||
      `col_${idx}`
    );
  }

  // Configura identificadores fixos e labels originais nos th
  const cabecalhosIniciais = Array.from(theadTr.children);
  cabecalhosIniciais.forEach((th, idx) => {
    if (!th.dataset.colId) {
      th.dataset.colId = obterIdColuna(th, idx);
    }
    if (!th.dataset.colLabel) {
      th.dataset.colLabel = (th.textContent || "").replace(/[▲▼]/g, "").trim() || th.dataset.colId;
    }
  });

  // Aplica ordem salva anteriormente, se existir
  aplicarOrdemSalva();

  // Aplica visibilidade salva anteriormente, se existir
  aplicarVisibilidadeSalva();

  // Injeta botão "⚙️ Colunas"
  injetarBotaoColunas();

  // Ativa eventos de drag-and-drop em cada th
  let arrastandoIdx = null;

  function atualizarDraggable() {
    Array.from(theadTr.children).forEach((th, idx) => {
      if (th.classList.contains("th-fixo")) {
        th.removeAttribute("draggable");
        return;
      }

      th.setAttribute("draggable", "true");
      th.title = (th.title ? th.title + " - " : "") + "Arraste para reordenar coluna";

      th.ondragstart = (e) => {
        arrastandoIdx = idx;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", th.dataset.colId);
        th.classList.add("th-arrastando");
      };

      th.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (arrastandoIdx !== null && arrastandoIdx !== idx) {
          th.classList.add("th-drop-alvo");
        }
      };

      th.ondragleave = () => {
        th.classList.remove("th-drop-alvo");
      };

      th.ondrop = (e) => {
        e.preventDefault();
        th.classList.remove("th-drop-alvo");
        if (arrastandoIdx !== null && arrastandoIdx !== idx) {
          reordenarColunas(arrastandoIdx, idx);
        }
      };

      th.ondragend = () => {
        th.classList.remove("th-arrastando");
        Array.from(theadTr.children).forEach((h) => h.classList.remove("th-drop-alvo"));
        arrastandoIdx = null;
      };
    });
  }

  atualizarDraggable();

  function reordenarColunas(deIdx, paraIdx) {
    const ths = Array.from(theadTr.children);
    const thMovido = ths[deIdx];
    if (!thMovido) return;

    // Reorganiza no thead
    if (paraIdx < deIdx) {
      theadTr.insertBefore(thMovido, ths[paraIdx]);
    } else {
      theadTr.insertBefore(thMovido, ths[paraIdx].nextSibling);
    }

    // Reorganiza cada linha do tbody
    if (tbody) {
      Array.from(tbody.querySelectorAll("tr")).forEach((tr) => {
        const tds = Array.from(tr.children);
        if (tds.length === ths.length) {
          const tdMovido = tds[deIdx];
          if (tdMovido) {
            if (paraIdx < deIdx) {
              tr.insertBefore(tdMovido, tds[paraIdx]);
            } else {
              tr.insertBefore(tdMovido, tds[paraIdx].nextSibling);
            }
          }
        }
      });
    }

    salvarOrdemAtual();
    aplicarVisibilidadeSalva();
    atualizarDraggable();
  }

  function salvarOrdemAtual() {
    try {
      const ids = Array.from(theadTr.children).map((th) => th.dataset.colId);
      localStorage.setItem(storageKeyOrdem, JSON.stringify(ids));
    } catch (_) {}
  }

  function aplicarOrdemSalva() {
    try {
      const salva = JSON.parse(localStorage.getItem(storageKeyOrdem) || "null");
      if (!Array.isArray(salva) || salva.length === 0) return;

      const thsAtuais = Array.from(theadTr.children);
      const mapaThs = new Map(thsAtuais.map((th) => [th.dataset.colId, th]));

      const reordenados = [];
      salva.forEach((id) => {
        if (mapaThs.has(id)) {
          reordenados.push(mapaThs.get(id));
          mapaThs.delete(id);
        }
      });
      mapaThs.forEach((th) => reordenados.push(th));

      const mapaIndices = reordenados.map((th) => thsAtuais.indexOf(th));
      reordenados.forEach((th) => theadTr.appendChild(th));

      if (tbody) {
        reordenarLinhasTbody(mapaIndices);
      }
    } catch (_) {}
  }

  function reordenarLinhasTbody(mapaIndices) {
    if (!tbody) return;
    Array.from(tbody.querySelectorAll("tr")).forEach((tr) => {
      const tds = Array.from(tr.children);
      if (tds.length === mapaIndices.length) {
        const novosTds = mapaIndices.map((i) => tds[i]);
        novosTds.forEach((td) => {
          if (td) tr.appendChild(td);
        });
      }
    });
  }

  // ==========================================
  // Controle de Visibilidade (Ocultar / Exibir)
  // ==========================================
  function obterVisibilidadeSalva() {
    try {
      return JSON.parse(localStorage.getItem(storageKeyVis) || "{}");
    } catch (_) {
      return {};
    }
  }

  function salvarVisibilidade(mapaVis) {
    try {
      localStorage.setItem(storageKeyVis, JSON.stringify(mapaVis));
    } catch (_) {}
  }

  function aplicarVisibilidadeSalva() {
    const mapaVis = obterVisibilidadeSalva();
    const ths = Array.from(theadTr.children);

    ths.forEach((th, idx) => {
      const id = th.dataset.colId;
      const visivel = mapaVis[id] !== false; // Padrão é visível se não especificado
      if (visivel) {
        th.classList.remove("coluna-oculta");
      } else {
        th.classList.add("coluna-oculta");
      }

      if (tbody) {
        Array.from(tbody.querySelectorAll("tr")).forEach((tr) => {
          const td = tr.children[idx];
          if (td) {
            if (visivel) {
              td.classList.remove("coluna-oculta");
            } else {
              td.classList.add("coluna-oculta");
            }
          }
        });
      }
    });
  }

  // Injetar ou vincular botão "⚙️ Colunas"
  function injetarBotaoColunas() {
    // 1. Procura se já existe botão específico ou padrão na página
    const btnPreExistente =
      document.getElementById(`btn-colunas-${chaveIdentificador}`) ||
      document.querySelector(`.btn-config-colunas[data-tabela="${chaveIdentificador}"]`) ||
      (chaveIdentificador === "chamados" ? document.getElementById("btn-colunas-chamados") : null);

    if (btnPreExistente) {
      if (!btnPreExistente.dataset.colunasVinculado) {
        btnPreExistente.dataset.colunasVinculado = "1";
        btnPreExistente.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          abrirPopoverColunas(btnPreExistente);
        });
      }
      return;
    }

    const wrap = tabela.closest(".tabela-wrap") || tabela.parentElement;
    if (!wrap) return;

    // Procura local no cabeçalho ou acima da tabela
    let containerAcoes =
      document.querySelector(".pagina-cabecalho__acoes") ||
      wrap.previousElementSibling?.querySelector(".pagina-cabecalho__acoes") ||
      document.querySelector(".crud-barra-acoes");

    // Cria botão de colunas se ainda não existir para esta tabela
    const btnId = `btn-config-colunas-${chaveIdentificador}`;
    let btn = document.getElementById(btnId);
    if (btn) return;

    btn = document.createElement("button");
    btn.type = "button";
    btn.id = btnId;
    btn.className = "btn btn-secundario btn-pequeno btn-config-colunas";
    btn.innerHTML = `<span>⚙️</span> Colunas`;
    btn.title = "Personalizar exibição de colunas da tabela";

    if (containerAcoes) {
      containerAcoes.insertBefore(btn, containerAcoes.firstChild);
    } else {
      const barraControle = document.createElement("div");
      barraControle.style.display = "flex";
      barraControle.style.justifyContent = "flex-end";
      barraControle.style.marginBottom = "0.5rem";
      barraControle.appendChild(btn);
      wrap.parentElement.insertBefore(barraControle, wrap);
    }

    btn.dataset.colunasVinculado = "1";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      abrirPopoverColunas(btn);
    });
  }

  function abrirPopoverColunas(btnElemento) {
    const existente = document.querySelector(".popover-config-colunas");
    if (existente) {
      existente.remove();
      return;
    }

    const mapaVis = obterVisibilidadeSalva();
    const ths = Array.from(theadTr.children);

    const popover = document.createElement("div");
    popover.className = "popover-config-colunas";

    const ret = btnElemento.getBoundingClientRect();
    const larguraPopover = 260;
    let left = ret.right - larguraPopover;
    if (left < 10) left = 10;
    if (left + larguraPopover > window.innerWidth - 10) {
      left = Math.max(10, window.innerWidth - larguraPopover - 10);
    }

    // Como o popover tem position: fixed, usamos coordenadas de viewport sem somar scrollY
    const topo = ret.bottom + 6;
    if (topo + 320 > window.innerHeight && ret.top > 320) {
      popover.style.top = `${Math.max(10, ret.top - 330)}px`;
    } else {
      popover.style.top = `${Math.max(10, topo)}px`;
    }
    popover.style.left = `${left}px`;

    let htmlItens = `
      <div class="popover-config-colunas__topo">
        <strong style="font-size: 0.85rem;">Exibir / Ocultar Colunas</strong>
        <button type="button" class="btn-icone btn-fechar-popover-colunas" style="font-size: 0.85rem;" aria-label="Fechar">✕</button>
      </div>
      <div style="display: flex; flex-direction: column; gap: 0.3rem; max-height: 230px; overflow-y: auto;">
    `;

    ths.forEach((th) => {
      const id = th.dataset.colId;
      const label = th.dataset.colLabel || id;
      const visivel = mapaVis[id] !== false;
      htmlItens += `
        <label class="popover-config-colunas__item">
          <input type="checkbox" data-col-id="${id}" ${visivel ? "checked" : ""}>
          <span>${label}</span>
        </label>
      `;
    });

    htmlItens += `
      </div>
      <div class="popover-config-colunas__rodape" style="display: flex; justify-content: space-between; gap: 0.5rem; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--cor-borda);">
        <button type="button" class="btn btn-secundario btn-pequeno btn-exibir-todas" style="font-size: 0.76rem; padding: 0.25rem 0.5rem;">Exibir todas</button>
        <button type="button" class="btn btn-secundario btn-pequeno btn-resetar-colunas" style="font-size: 0.76rem; padding: 0.25rem 0.5rem;">Restaurar padrão</button>
      </div>
    `;

    popover.innerHTML = htmlItens;
    document.body.appendChild(popover);

    let fecharAoClicarFora = null;
    const fecharPopover = () => {
      popover.remove();
      if (fecharAoClicarFora) {
        document.removeEventListener("click", fecharAoClicarFora);
        fecharAoClicarFora = null;
      }
    };

    // Eventos dentro do popover
    popover.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener("change", () => {
        const id = cb.dataset.colId;
        const atual = obterVisibilidadeSalva();
        atual[id] = cb.checked;
        salvarVisibilidade(atual);
        aplicarVisibilidadeSalva();
      });
    });

    popover.querySelector(".btn-fechar-popover-colunas")?.addEventListener("click", fecharPopover);

    popover.querySelector(".btn-exibir-todas")?.addEventListener("click", () => {
      const mapa = {};
      ths.forEach((th) => {
        mapa[th.dataset.colId] = true;
      });
      salvarVisibilidade(mapa);
      aplicarVisibilidadeSalva();
      popover.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.checked = true;
      });
    });

    popover.querySelector(".btn-resetar-colunas")?.addEventListener("click", () => {
      localStorage.removeItem(storageKeyOrdem);
      localStorage.removeItem(storageKeyVis);
      cabecalhosIniciais.forEach((th) => theadTr.appendChild(th));
      aplicarVisibilidadeSalva();
      atualizarDraggable();
      sincronizarTbodyComThead();
      fecharPopover();
    });

    // Fechar ao clicar fora, respeitando o próprio botão (e seus filhos)
    fecharAoClicarFora = (ev) => {
      if (!popover.contains(ev.target) && !btnElemento.contains(ev.target)) {
        fecharPopover();
      }
    };
    setTimeout(() => {
      document.addEventListener("click", fecharAoClicarFora);
    }, 50);
  }

  function sincronizarTbodyComThead() {
    if (!tbody) return;
    const ths = Array.from(theadTr.children);
    const ordemThead = ths.map((th) => th.dataset.colId);
    const thsOriginais = cabecalhosIniciais.map((th) => th.dataset.colId);
    const mudouOrdem = thsOriginais.some((id, idx) => id !== ordemThead[idx]);
    const mapaDe = mudouOrdem ? ordemThead.map((id) => thsOriginais.indexOf(id)) : null;

    Array.from(tbody.querySelectorAll("tr")).forEach((tr) => {
      const tds = Array.from(tr.children);
      if (tds.length === ths.length && mudouOrdem && !tr.dataset.colsReordenadas) {
        tr.dataset.colsReordenadas = "1";
        const reordenados = mapaDe.map((idx) => tds[idx]);
        reordenados.forEach((td) => {
          if (td) tr.appendChild(td);
        });
      }
    });

    aplicarVisibilidadeSalva();
  }

  // Observa inserções no tbody para reaplicar ordem e visibilidade continuamente
  if (tbody && typeof MutationObserver !== "undefined") {
    let processandoMutacao = false;
    const observer = new MutationObserver(() => {
      if (processandoMutacao) return;
      try {
        processandoMutacao = true;
        sincronizarTbodyComThead();
      } catch (_) {
      } finally {
        processandoMutacao = false;
      }
    });

    observer.observe(tbody, { childList: true });
  }

  return {
    redefinirPadrao() {
      localStorage.removeItem(storageKeyOrdem);
      localStorage.removeItem(storageKeyVis);
      cabecalhosIniciais.forEach((th) => theadTr.appendChild(th));
      aplicarVisibilidadeSalva();
      atualizarDraggable();
    },
  };
}

function obterUsuarioIdAtual() {
  try {
    const raw = localStorage.getItem("workflow_zagonel_usuario");
    if (!raw) return null;
    const u = JSON.parse(raw);
    return u?.id || null;
  } catch (_) {
    return null;
  }
}
