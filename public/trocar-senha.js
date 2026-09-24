import { exigirLogin, getUsuarioLogado, setUsuarioLogado } from "./auth.js";
import { api } from "./api.js";
import { mostrarErro, alternarVisualizacaoSenha } from "./ui.js";
import { gerarSenhaAleatoria, validarComplexidadeSenhaCliente, calcularSha256 } from "./crud-ui.js";

const usuario = exigirLogin();
if (usuario) {
  const form = document.getElementById("form-trocar-senha");
  const mensagemErro = document.getElementById("mensagem-erro");
  const inputNova = document.getElementById("input-nova-senha");
  const inputConfirmar = document.getElementById("input-confirmar-senha");
  const btnGerar = document.getElementById("btn-gerar-senha-troca");
  const painelGerada = document.getElementById("painel-senha-gerada");
  const textoGerada = document.getElementById("texto-senha-gerada");
  const btnCopiar = document.getElementById("btn-copiar-senha-gerada");
  const avisoCaps = document.getElementById("aviso-capslock-troca");

  let senhaGeradaAtual = "";

  // Gerar senha aleatória
  btnGerar?.addEventListener("click", () => {
    const nova = gerarSenhaAleatoria(6);
    senhaGeradaAtual = nova;
    inputNova.value = nova;
    inputConfirmar.value = nova;
    textoGerada.textContent = nova;
    painelGerada.hidden = false;

    navigator.clipboard?.writeText(nova).catch(() => {});
    btnCopiar.textContent = "✓ Copiada!";
    setTimeout(() => {
      if (btnCopiar) btnCopiar.textContent = "Copiar";
    }, 3000);
  });

  btnCopiar?.addEventListener("click", () => {
    if (senhaGeradaAtual) {
      navigator.clipboard?.writeText(senhaGeradaAtual).catch(() => {});
      btnCopiar.textContent = "✓ Copiada!";
      setTimeout(() => {
        if (btnCopiar) btnCopiar.textContent = "Copiar";
      }, 3000);
    }
  });

  // Botões de alternar visualização de senha
  document.querySelectorAll(".btn-toggle-senha").forEach((btn) => {
    btn.addEventListener("click", () => {
      const alvoId = btn.dataset.alvo;
      const input = document.getElementById(alvoId);
      if (!input) return;
      alternarVisualizacaoSenha(input, btn);
    });
  });

  // Detecção de Caps Lock
  const checarCaps = (ev) => {
    if (!avisoCaps) return;
    if (ev.getModifierState && ev.getModifierState("CapsLock")) {
      avisoCaps.hidden = false;
      avisoCaps.style.display = "flex";
    } else {
      avisoCaps.hidden = true;
      avisoCaps.style.display = "none";
    }
  };

  [inputNova, inputConfirmar].forEach((inp) => {
    inp?.addEventListener("keydown", checarCaps);
    inp?.addEventListener("keyup", checarCaps);
    inp?.addEventListener("blur", () => {
      if (avisoCaps) {
        avisoCaps.hidden = true;
        avisoCaps.style.display = "none";
      }
    });
  });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    mensagemErro.hidden = true;
    const novaSenha = inputNova.value;
    const confirmarSenha = inputConfirmar.value;

    if (novaSenha !== confirmarSenha) {
      mensagemErro.textContent = "As senhas digitadas não coincidem. Repita a mesma senha nos dois campos.";
      mensagemErro.hidden = false;
      inputConfirmar.focus();
      return;
    }

    const checagem = validarComplexidadeSenhaCliente(novaSenha);
    if (!checagem.valido) {
      mensagemErro.textContent = checagem.mensagem;
      mensagemErro.hidden = false;
      inputNova.focus();
      return;
    }

    try {
      const senhaHash = await calcularSha256(novaSenha);
      await api("/trocar-senha", { method: "POST", body: { nova_senha: senhaHash } });
      setUsuarioLogado({ ...getUsuarioLogado(), deve_trocar_senha: false });
      window.location.href = "/chamados";
    } catch (e) {
      mostrarErro(mensagemErro, e);
    }
  });
}
