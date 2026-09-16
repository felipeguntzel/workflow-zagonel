import { exigirLogin, permissaoDaTela } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { mostrarErro, escaparAtributo } from "./ui.js";
import { api } from "./api.js";

const usuario = exigirLogin();
if (usuario) {
  aplicarLayout(usuario);
  if (!permissaoDaTela("chamados").inserir) {
    document.getElementById("link-novo-chamado").hidden = true;
  }
  carregarChamados().catch((e) => mostrarErro(document.getElementById("mensagem-erro"), e));
}

function situacaoBadge(prazo, statusNome) {
  if (statusNome === "finalizado") return "";
  const hoje = new Date().toISOString().slice(0, 10);
  const diff = Math.round((new Date(prazo) - new Date(hoje)) / 86400000);
  if (diff < 0) return `<span class="badge badge-vencido">Vencido</span>`;
  if (diff <= 2) return `<span class="badge badge-alerta">Alerta</span>`;
  return `<span class="badge badge-ok">Ok</span>`;
}

async function carregarChamados() {
  const chamados = await api("/chamados");
  document.getElementById("tabela-chamados").innerHTML =
    chamados.length === 0
      ? `<tr><td colspan="4">Nenhum chamado encontrado.</td></tr>`
      : chamados
          .map(
            (c) => `
              <tr>
                <td><a href="chamado.html?id=${c.id}" title="${escaparAtributo(c.titulo)}">#${c.id} - ${c.titulo}</a></td>
                <td>${c.status_nome}</td>
                <td>${c.prazo}</td>
                <td>${situacaoBadge(c.prazo, c.status_nome)}</td>
              </tr>`
          )
          .join("");
}
