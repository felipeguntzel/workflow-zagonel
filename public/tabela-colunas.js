/**
 * Módulo de Reordenação e Persistência de Colunas de Tabelas por Usuário
 * Permite arrastar os cabeçalhos das colunas (drag-and-drop) e salva
 * as preferências do usuário no localStorage.
 */

export function tornarTabelaReordenavel(tabela, chaveIdentificador, usuarioId = null) {
  if (!tabela) return;

  const theadTr = tabela.querySelector("thead tr");
  const tbody = tabela.querySelector("tbody");
  if (!theadTr) return;

  const uid = usuarioId || obterUsuarioIdAtual() || "anon";
  const storageKey = `workflow_cols_${uid}_${chaveIdentificador}`;

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

  // Configura identificadores fixos nos th
  const cabecalhosIniciais = Array.from(theadTr.children);
  cabecalhosIniciais.forEach((th, idx) => {
    if (!th.dataset.colId) {
      th.dataset.colId = obterIdColuna(th, idx);
    }
  });

  // Aplica ordem salva anteriormente, se existir
  aplicarOrdemSalva();

  // Ativa eventos de drag-and-drop em cada th
  let arrastandoIdx = null;

  function atualizarDraggable() {
    Array.from(theadTr.children).forEach((th, idx) => {
      // Não permite arrastar colunas de ações puras se explicitamente marcado
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
    atualizarDraggable();
  }

  function salvarOrdemAtual() {
    try {
      const ids = Array.from(theadTr.children).map((th) => th.dataset.colId);
      localStorage.setItem(storageKey, JSON.stringify(ids));
    } catch (_) {}
  }

  function aplicarOrdemSalva() {
    try {
      const salva = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (!Array.isArray(salva) || salva.length === 0) return;

      const thsAtuais = Array.from(theadTr.children);
      const mapaThs = new Map(thsAtuais.map((th) => [th.dataset.colId, th]));

      // Verifica se todos ou maioria dos itens coincidem
      const reordenados = [];
      salva.forEach((id) => {
        if (mapaThs.has(id)) {
          reordenados.push(mapaThs.get(id));
          mapaThs.delete(id);
        }
      });
      // Adiciona quaisquer colunas novas que não estavam salvas
      mapaThs.forEach((th) => reordenados.push(th));

      // Mapeia índices antigos para os novos
      const mapaIndices = reordenados.map((th) => thsAtuais.indexOf(th));

      // Aplica no thead
      reordenados.forEach((th) => theadTr.appendChild(th));

      // Aplica no tbody caso já haja linhas renderizadas
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

  // Observa inserções no tbody para reaplicar a ordem salva automaticamente
  // quando novos dados são carregados via AJAX / paginação
  if (tbody && typeof MutationObserver !== "undefined") {
    let processandoMutacao = false;
    const observer = new MutationObserver(() => {
      if (processandoMutacao) return;
      try {
        const salva = JSON.parse(localStorage.getItem(storageKey) || "null");
        if (!Array.isArray(salva) || salva.length === 0) return;

        processandoMutacao = true;
        // Obter ordem atual do thead
        const ths = Array.from(theadTr.children);
        const ordemThead = ths.map((th) => th.dataset.colId);

        // Se o thead já está na ordem certa, garante que linhas adicionadas sigam
        // Caso as linhas tenham vindo com a ordem original do template HTML:
        const thsOriginais = cabecalhosIniciais.map((th) => th.dataset.colId);
        const mudou = thsOriginais.some((id, idx) => id !== ordemThead[idx]);

        if (mudou) {
          const mapaDe = ordemThead.map((id) => thsOriginais.indexOf(id));
          Array.from(tbody.querySelectorAll("tr")).forEach((tr) => {
            const tds = Array.from(tr.children);
            // Verifica se precisa de reordenação (tamanho igual ao cabeçalho e ainda na ordem original)
            if (tds.length === ths.length && !tr.dataset.reordenado) {
              tr.dataset.reordenado = "1";
              const reordenados = mapaDe.map((idx) => tds[idx]);
              reordenados.forEach((td) => {
                if (td) tr.appendChild(td);
              });
            }
          });
        }
      } catch (_) {
      } finally {
        processandoMutacao = false;
      }
    });

    observer.observe(tbody, { childList: true });
  }

  return {
    redefinirPadrao() {
      localStorage.removeItem(storageKey);
      cabecalhosIniciais.forEach((th) => theadTr.appendChild(th));
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
