import test from "node:test";
import assert from "node:assert/strict";

const FONTES = ["arial", "times", "verdana", "courier"];
const TAMANHOS = ["p", "m", "g", "gg"];
const TEMAS = ["claro", "escuro", "alto-contraste"];

function validarPreferencias(body) {
  if (!FONTES.includes(body.fonte)) {
    return `Fonte inválida: use uma de ${FONTES.join(", ")}`;
  }
  if (!TAMANHOS.includes(body.tamanho_fonte)) {
    return `Tamanho inválido: use um de ${TAMANHOS.join(", ")}`;
  }
  if (!TEMAS.includes(body.tema)) {
    return `Tema inválido: use um de ${TEMAS.join(", ")}`;
  }
  return null;
}

test("validarPreferencias aceita temas claro, escuro e alto-contraste", () => {
  assert.equal(validarPreferencias({ fonte: "arial", tamanho_fonte: "m", tema: "claro" }), null);
  assert.equal(validarPreferencias({ fonte: "arial", tamanho_fonte: "m", tema: "escuro" }), null);
  assert.equal(validarPreferencias({ fonte: "arial", tamanho_fonte: "m", tema: "alto-contraste" }), null);
});

test("validarPreferencias rejeita temas não suportados", () => {
  assert.match(
    validarPreferencias({ fonte: "arial", tamanho_fonte: "m", tema: "solarizado" }),
    /Tema inválido/
  );
  assert.match(
    validarPreferencias({ fonte: "arial", tamanho_fonte: "m", tema: "" }),
    /Tema inválido/
  );
});
