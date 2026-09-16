import test from "node:test";
import assert from "node:assert/strict";
import { escaparHtml } from "./ui.js";

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
