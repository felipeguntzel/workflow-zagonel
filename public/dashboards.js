import { api } from "./api.js";
import { exigirLogin } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { mostrarErro, escaparHtml } from "./ui.js";

const usuario = exigirLogin();
if (usuario) {
  aplicarLayout(usuario);
  const mensagemErro = document.getElementById("mensagem-erro");

  async function carregarDashboard() {
    try {
      const chamados = await api("/chamados");
      
      const total = chamados.length;
      const finalizados = chamados.filter((c) => c.finalizado === 1).length;
      const emAndamento = total - finalizados;

      const hoje = new Date().toISOString().slice(0, 10);
      const atencao = chamados.filter((c) => {
        if (c.finalizado === 1) return false;
        if (!c.prazo) return false;
        return c.prazo <= hoje;
      }).length;

      document.getElementById("metrica-total").textContent = String(total);
      document.getElementById("metrica-andamento").textContent = String(emAndamento);
      document.getElementById("metrica-finalizados").textContent = String(finalizados);
      document.getElementById("metrica-atencao").textContent = String(atencao);

      const porStatus = {};
      for (const c of chamados) {
        const nomeStatus = c.status_nome || "Sem status";
        porStatus[nomeStatus] = (porStatus[nomeStatus] || 0) + 1;
      }

      const tbody = document.getElementById("tabela-distribuicao-status");
      const entradas = Object.entries(porStatus);

      if (entradas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="vazio">Nenhum chamado cadastrado ainda.</td></tr>';
        return;
      }

      tbody.innerHTML = entradas
        .sort((a, b) => b[1] - a[1])
        .map(([status, qtd]) => `
          <tr>
            <td><strong>${escaparHtml(status)}</strong></td>
            <td style="text-align: right;">${qtd}</td>
          </tr>
        `)
        .join("");
    } catch (e) {
      mostrarErro(mensagemErro, e);
    }
  }

  carregarDashboard();
}
