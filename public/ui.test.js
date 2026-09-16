import test from "node:test";
import assert from "node:assert/strict";
import { escaparHtml, botaoIconeEditar, botaoIconeExcluir } from "./ui.js";

test("escaparHtml escapes the characters that break out of an HTML text node", () => {
  assert.equal(
    escaparHtml(`<img src=x onerror=alert(document.cookie)>`),
    "&lt;img src=x onerror=alert(document.cookie)&gt;"
  );
});

test("escaparHtml escapes &, quotes and apostrophes too", () => {
  assert.equal(escaparHtml(`a & b "c" 'd'`), "a &amp; b &quot;c&quot; &#39;d&#39;");
});

test("escaparHtml passes plain text through unchanged", () => {
  assert.equal(escaparHtml("Etapa normal"), "Etapa normal");
});

test("escaparHtml coerces non-string input instead of throwing", () => {
  assert.equal(escaparHtml(null), "");
  assert.equal(escaparHtml(undefined), "");
  assert.equal(escaparHtml(42), "42");
});

test("botaoIconeEditar produces a button with the given class, id and Editar label", () => {
  const html = botaoIconeEditar("btn-editar", 42);
  assert.match(html, /class="btn-icone btn-icone--editar btn-editar"/);
  assert.match(html, /data-id="42"/);
  assert.match(html, /aria-label="Editar"/);
  assert.match(html, /title="Editar"/);
});

test("botaoIconeExcluir produces a button with the given class, id and Excluir label", () => {
  const html = botaoIconeExcluir("btn-excluir", 7);
  assert.match(html, /class="btn-icone btn-icone--excluir btn-excluir"/);
  assert.match(html, /data-id="7"/);
  assert.match(html, /aria-label="Excluir"/);
  assert.match(html, /title="Excluir"/);
});
