/**
 * Gerenciamento de Versão, Atualização Automática e Limpeza de Cache (WorkFlow Zagonel)
 */
export const VERSAO_CLIENTE = "2.1.2";
const CHAVE_VERSAO_LOCAL = "workflow_versao_instalada";

let modalAtualizacaoAberto = false;
let timerChecagem = null;

/**
 * Força a limpeza completa de todos os caches (Service Worker, caches locais, sessionStorage)
 * e recarrega a aplicação com a versão mais recente do servidor.
 */
export async function forcarAtualizacaoApp() {
  try {
    // 1. Notifica o Service Worker para assumir controle imediatamente
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "SKIP_WAITING" });
      navigator.serviceWorker.controller.postMessage({ type: "LIMPAR_CACHE" });
    }

    // 2. Limpa todos os caches do navegador
    if ("caches" in window) {
      const nomes = await caches.keys();
      await Promise.all(nomes.map((nome) => caches.delete(nome)));
    }

    // 3. Limpa caches de dados em sessionStorage e memória
    sessionStorage.clear();

    // 4. Salva versão atualizada
    localStorage.setItem(CHAVE_VERSAO_LOCAL, VERSAO_CLIENTE);

    // 5. Redireciona com bypass total de cache
    const rotaLimpa = window.location.pathname;
    window.location.href = `${rotaLimpa}?atualizado=${Date.now()}`;
  } catch (err) {
    console.error("Erro ao forçar atualização:", err);
    window.location.reload();
  }
}

/**
 * Exibe modal moderno e destacado informando o usuário sobre a nova versão
 */
export function exibirAvisoNovaVersao(versaoRemota) {
  if (modalAtualizacaoAberto) return;
  modalAtualizacaoAberto = true;

  const overlay = document.createElement("div");
  overlay.className = "modal-fundo modal-fundo--atualizacao";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.75);
    backdrop-filter: blur(4px);
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    animation: fadeInModal 0.25s ease-out;
  `;

  overlay.innerHTML = `
    <div class="modal-card-atualizacao" style="
      background: var(--cor-fundo-elevado, #ffffff);
      color: var(--cor-texto, #1e293b);
      border-radius: 12px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
      border: 1px solid var(--cor-borda, #cbd5e1);
      max-width: 460px;
      width: 100%;
      overflow: hidden;
      animation: scaleUpModal 0.25s ease-out;
    ">
      <div style="background: linear-gradient(135deg, #2f6f4f, #1e4d36); padding: 1.5rem; color: #ffffff; text-align: center;">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem; line-height: 1;">🚀</div>
        <h3 style="margin: 0; font-size: 1.35rem; font-weight: 700;">Nova Versão Disponível!</h3>
        <p style="margin: 0.4rem 0 0; font-size: 0.88rem; opacity: 0.9;">
          Uma atualização do WorkFlow (v${versaoRemota}) acabou de ser publicada.
        </p>
      </div>

      <div style="padding: 1.5rem;">
        <p style="margin: 0 0 1rem; font-size: 0.92rem; line-height: 1.5; color: var(--cor-texto-secundario, #475569);">
          Esta versão inclui <strong>melhorias de velocidade no carregamento de telas</strong>, correções no fluxo de chamados e novas funcionalidades operacionais.
        </p>
        <div style="background: var(--cor-fundo, #f8fafc); border-radius: 6px; padding: 0.75rem 1rem; margin-bottom: 1.5rem; font-size: 0.85rem; border: 1px solid var(--cor-borda, #e2e8f0);">
          ✨ <strong>O que muda ao atualizar:</strong>
          <ul style="margin: 0.5rem 0 0 1.25rem; padding: 0; line-height: 1.4;">
            <li>Limpeza automática de arquivos antigos em cache</li>
            <li>Layout e novos botões padronizados</li>
            <li>Carregamento instantâneo de dados e tabelas</li>
          </ul>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          <button type="button" id="btn-atualizar-app-agora" class="btn btn-primario" style="
            width: 100%;
            padding: 0.85rem 1rem;
            font-size: 1rem;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            box-shadow: 0 4px 12px rgba(47, 111, 79, 0.35);
          ">
            <span>⚡</span> Atualizar Agora
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const btn = overlay.querySelector("#btn-atualizar-app-agora");
  btn?.addEventListener("click", () => {
    btn.disabled = true;
    btn.innerHTML = `<span>⏳</span> Atualizando e limpando cache...`;
    forcarAtualizacaoApp();
  });
}

/**
 * Consulta a versão ativa no servidor
 */
export async function verificarNovaVersao(exibirFeedbackSeAtualizado = false) {
  try {
    const res = await fetch(`/api/versao?t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });

    if (!res.ok) {
      // Fallback para o arquivo estático versao.json
      const fallback = await fetch(`/versao.json?t=${Date.now()}`, { cache: "no-store" });
      if (fallback.ok) {
        const dados = await fallback.json();
        avaliarVersao(dados.versao, exibirFeedbackSeAtualizado);
      }
      return;
    }

    const info = await res.json();
    if (info && info.versao) {
      avaliarVersao(info.versao, exibirFeedbackSeAtualizado);
    }
  } catch (err) {
    console.debug("Verificação de versão em segundo plano:", err.message);
  }
}

function avaliarVersao(versaoRemota, exibirFeedbackSeAtualizado) {
  const versaoLocal = localStorage.getItem(CHAVE_VERSAO_LOCAL) || VERSAO_CLIENTE;

  if (versaoRemota !== versaoLocal) {
    exibirAvisoNovaVersao(versaoRemota);
  } else if (exibirFeedbackSeAtualizado) {
    alert(`Você já está utilizando a versão mais recente do WorkFlow (v${VERSAO_CLIENTE}).`);
  }
}

/**
 * Inicializa a escuta de versões e service workers
 */
export function inicializarMonitoramentoVersao() {
  if (typeof window === "undefined") return;

  // Salva a versão atual na primeira inicialização
  if (!localStorage.getItem(CHAVE_VERSAO_LOCAL)) {
    localStorage.setItem(CHAVE_VERSAO_LOCAL, VERSAO_CLIENTE);
  }

  // Verifica após 3 segundos do carregamento da tela
  setTimeout(() => verificarNovaVersao(false), 3000);

  // Monitora periodicamente a cada 45 segundos
  clearInterval(timerChecagem);
  timerChecagem = setInterval(() => verificarNovaVersao(false), 45000);

  // Verifica ao focar a aba/janela novamente
  window.addEventListener("focus", () => {
    verificarNovaVersao(false);
  });

  // Escuta se o Service Worker detectou uma nova instalação em espera
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready.then((reg) => {
      reg.addEventListener("updatefound", () => {
        const novoWorker = reg.installing;
        if (novoWorker) {
          novoWorker.addEventListener("statechange", () => {
            if (novoWorker.state === "installed" && navigator.serviceWorker.controller) {
              exibirAvisoNovaVersao("Recente");
            }
          });
        }
      });
    });
  }
}
