import { exigirLogin } from "./auth.js";
import { aplicarLayout } from "./layout.js";
import { api } from "./api.js";

const usuario = exigirLogin();
const id = new URLSearchParams(window.location.search).get("id");

if (usuario && id) {
  aplicarLayout(usuario);
  carregarArvore();
}

function construirArvore(nos) {
  const porId = new Map(nos.map((n) => [n.id, { ...n, filhos: [] }]));
  const raizes = [];
  for (const no of porId.values()) {
    if (no.chamado_pai_id && porId.has(no.chamado_pai_id)) {
      porId.get(no.chamado_pai_id).filhos.push(no);
    } else {
      raizes.push(no);
    }
  }
  return raizes;
}

function nodeHtml(no) {
  return `
    <li>
      <details>
        <summary>
          #${no.id} - ${no.titulo} (${no.setor_nome}) - ${no.status_nome}
          ${no.resultado ? ` - ${no.resultado}` : ""}
          - prazo ${no.prazo}${no.data_finalizacao ? `, finalizado em ${no.data_finalizacao}` : ""}
        </summary>
        <div class="comentarios-no" data-id="${no.id}">Carregando comentários…</div>
        ${no.filhos.length > 0 ? `<ul>${no.filhos.map(nodeHtml).join("")}</ul>` : ""}
      </details>
    </li>
  `;
}

async function carregarArvore() {
  const nos = await api(`/chamados/${id}/arvore`);
  const raizes = construirArvore(nos);
  const container = document.getElementById("arvore");
  container.innerHTML = `<ul>${raizes.map(nodeHtml).join("")}</ul>`;

  container.querySelectorAll("details").forEach((detalhe) => {
    detalhe.addEventListener(
      "toggle",
      async () => {
        if (!detalhe.open) return;
        const divComentarios = detalhe.querySelector(":scope > .comentarios-no");
        const comentarios = await api(`/chamados/${divComentarios.dataset.id}/comentarios`);
        divComentarios.innerHTML =
          comentarios.length === 0
            ? "<em>Sem comentários.</em>"
            : `<ul>${comentarios
                .map(
                  (c) =>
                    `<li><strong>${c.usuario_nome ?? "Sistema"}</strong> (${c.data}): ${c.texto}</li>`
                )
                .join("")}</ul>`;
      },
      { once: true }
    );
  });
}
