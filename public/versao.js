/**
 * Gerenciamento de Versão, Atualização Automática e Limpeza de Cache (WorkFlow Zagonel)
 */
export const VERSAO_CLIENTE = "2.1.2";
const CHAVE_VERSAO_LOCAL = "workflow_versao_instalada";
const CHAVE_VERSAO_IGNORADA_SESSAO = "workflow_ignorar_versao_sessao";

let modalAtualizacaoAberto = false;
let timerChecagem = null;

/**
 * Força a limpeza completa de todos os caches (Service Worker, caches locais, sessionStorage)
 * e recarrega a aplicação com a versão mais recente do servidor, PERMANECENDO NA MESMA TELA.
 */
export async function forcarAtualizacaoApp() {
  try {
    // 1. Notifica o Service Worker para assumir controle imediatamente e limpar caches
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "SKIP_WAITING" });
      navigator.serviceWorker.controller.postMessage({ type: "LIMPAR_CACHE" });
    }

    // 2. Limpa todos os caches do navegador
    if ("caches" in window) {
      const nomes = await caches.keys();
      await Promise.all(nomes.map((nome) => caches.delete(nome)));
    }

    // 3. Limpa caches de dados em sessionStorage
    sessionStorage.clear();

    // 4. Salva versão atualizada
    localStorage.setItem(CHAVE_VERSAO_LOCAL, VERSAO_CLIENTE);

    // 5. Preserva 100% da URL atual (pathname + todos os query parameters como ?id=18 + hash)
    const urlAtual = new URL(window.location.href);
    urlAtual.searchParams.set("atualizado", Date.now().toString());
    window.location.href = urlAtual.toString();
  } catch (err) {
    console.error("Erro ao forçar atualização:", err);
    window.location.reload();
  }
}

/**
 * Remove qualquer indicador discreto existente
 */
export function removerIndicadorDiscretoNovaVersao() {
  if (typeof document === "undefined") return;
  const existente = document.getElementById("indicador-versao-flutuante");
  if (existente) existente.remove();
}

/**
 * Exibe um botão discreto no canto da tela quando o usuário escolhe atualizar mais tarde
 */
export function exibirIndicadorDiscretoNovaVersao(versaoRemota) {
  if (typeof document === "undefined") return;
  if (document.getElementById("indicador-versao-flutuante") || modalAtualizacaoAberto) {
    return;
  }

  const p = document.createElement("button");
  p.id = "indicador-versao-flutuante";
  p.type = "button";
  p.className = "btn-flutuante-versao";
  p.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 99999;
    background: #1e293b;
    color: #ffffff;
    border: 1px solid #334155;
    padding: 0.65rem 1rem;
    border-radius: 9999px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.2s ease;
  `;
  p.innerHTML = `
    <span style="font-size: 1.1rem; line-height: 1;">⚡</span>
    <span>Nova versão <strong>v${versaoRemota}</strong> disponível</span>
    <span style="background: #2f6f4f; color: #fff; padding: 0.2rem 0.6rem; border-radius: 9999px; font-weight: 700; font-size: 0.76rem;">Atualizar</span>
  `;

  p.addEventListener("click", () => {
    p.remove();
    exibirAvisoNovaVersao(versaoRemota);
  });

  document.body.appendChild(p);
}

/**
 * Exibe modal moderno e destacado informando o usuário sobre a nova versão,
 * com opções de Atualizar Agora ou Lembrar Mais Tarde / Ignorar.
 */
export function exibirAvisoNovaVersao(versaoRemota) {
  if (modalAtualizacaoAberto) return;
  modalAtualizacaoAberto = true;
  removerIndicadorDiscretoNovaVersao();

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
      max-width: 480px;
      width: 100%;
      overflow: hidden;
      position: relative;
      animation: scaleUpModal 0.25s ease-out;
    ">
      <button type="button" id="btn-fechar-aviso-versao-x" style="
        position: absolute;
        top: 14px;
        right: 14px;
        background: rgba(255, 255, 255, 0.2);
        color: #ffffff;
        border: none;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1rem;
        cursor: pointer;
        z-index: 2;
        transition: background 0.15s ease;
      " title="Lembrar mais tarde">✕</button>

      <div style="background: linear-gradient(135deg, #2f6f4f, #1e4d36); padding: 1.75rem 1.5rem; color: #ffffff; text-align: center; position: relative;">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem; line-height: 1;">🚀</div>
        <h3 style="margin: 0; font-size: 1.35rem; font-weight: 700;">Nova Versão Disponível!</h3>
        <p style="margin: 0.4rem 0 0; font-size: 0.88rem; opacity: 0.9;">
          Uma atualização do WorkFlow (v${versaoRemota}) está pronta para uso.
        </p>
      </div>

      <div style="padding: 1.5rem;">
        <p style="margin: 0 0 1rem; font-size: 0.92rem; line-height: 1.5; color: var(--cor-texto-secundario, #475569);">
          Você continuará exatamente na mesma tela e sem perder seu contexto. Se estiver preenchendo algo agora, pode escolher <strong>Lembrar mais tarde</strong> e atualizar quando terminar.
        </p>
        <div style="background: var(--cor-fundo, #f8fafc); border-radius: 6px; padding: 0.75rem 1rem; margin-bottom: 1.5rem; font-size: 0.85rem; border: 1px solid var(--cor-borda, #e2e8f0);">
          ✨ <strong>O que muda ao atualizar:</strong>
          <ul style="margin: 0.5rem 0 0 1.25rem; padding: 0; line-height: 1.4;">
            <li>Carregamento ultra-rápido com cache inteligente</li>
            <li>Layout e botões com alinhamento aprimorado</li>
            <li>Limpeza automática de arquivos antigos do navegador</li>
          </ul>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.65rem;">
          <button type="button" id="btn-atualizar-app-agora" class="btn btn-primario" style="
            width: 100%;
            padding: 0.85rem 1rem;
            font-size: 0.95rem;
            font-weight: 700;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(47, 111, 79, 0.35);
          ">
            <span>⚡</span> Atualizar Agora (Permanece na mesma tela)
          </button>

          <button type="button" id="btn-atualizar-mais-tarde" class="btn btn-secundario" style="
            width: 100%;
            padding: 0.75rem 1rem;
            font-size: 0.88rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.4rem;
            border-radius: 6px;
          ">
            <span>⏱️</span> Lembrar mais tarde / Ignorar agora
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const fecharModal = () => {
    overlay.remove();
    modalAtualizacaoAberto = false;
    try {
      sessionStorage.setItem(CHAVE_VERSAO_IGNORADA_SESSAO, versaoRemota);
    } catch (_) {}
    exibirIndicadorDiscretoNovaVersao(versaoRemota);
  };

  overlay.querySelector("#btn-fechar-aviso-versao-x")?.addEventListener("click", fecharModal);
  overlay.querySelector("#btn-atualizar-mais-tarde")?.addEventListener("click", fecharModal);

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
  let ehPosLogin = false;
  try {
    ehPosLogin = sessionStorage.getItem("workflow_verificar_versao_pos_login") === "1";
  } catch (_) {}

  if (versaoRemota !== versaoLocal) {
    if (ehPosLogin) {
      // Login recente: limpa adiamentos e força a exibição do modal novamente
      try {
        sessionStorage.removeItem("workflow_verificar_versao_pos_login");
        sessionStorage.removeItem(CHAVE_VERSAO_IGNORADA_SESSAO);
      } catch (_) {}
      exibirAvisoNovaVersao(versaoRemota);
    } else {
      let versaoIgnorada = null;
      try {
        versaoIgnorada = sessionStorage.getItem(CHAVE_VERSAO_IGNORADA_SESSAO);
      } catch (_) {}

      if (versaoIgnorada === versaoRemota) {
        // Usuário já optou por lembrar mais tarde nesta sessão
        exibirIndicadorDiscretoNovaVersao(versaoRemota);
      } else {
        exibirAvisoNovaVersao(versaoRemota);
      }
    }
  } else {
    try {
      sessionStorage.removeItem("workflow_verificar_versao_pos_login");
      sessionStorage.removeItem(CHAVE_VERSAO_IGNORADA_SESSAO);
    } catch (_) {}
    removerIndicadorDiscretoNovaVersao();
    if (exibirFeedbackSeAtualizado) {
      alert(`Você já está utilizando a versão mais recente do WorkFlow (v${VERSAO_CLIENTE}).`);
    }
  }
}

/**
 * Inicializa a escuta de versões e service workers
 */
export function inicializarMonitoramentoVersao() {
  if (typeof window === "undefined") return;

  // Salva a versão atual na primeira inicialização caso não exista
  if (!localStorage.getItem(CHAVE_VERSAO_LOCAL)) {
    localStorage.setItem(CHAVE_VERSAO_LOCAL, VERSAO_CLIENTE);
  }

  // Verifica após 1.5s do carregamento da tela
  setTimeout(() => verificarNovaVersao(false), 1500);

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
