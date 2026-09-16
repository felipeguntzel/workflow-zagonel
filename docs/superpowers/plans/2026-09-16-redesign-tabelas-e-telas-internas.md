# Redesign de tabelas e telas internas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o bug de truncamento de tabela (causa raiz: `td { max-width: 0; ... }` genérico em `style.css`) e elevar o visual das telas internas (tabelas, formulários, espaçamento), seguindo o spec aprovado em `docs/superpowers/specs/2026-09-16-redesign-tabelas-e-telas-internas-design.md`.

**Architecture:** Sem framework, sem build step. Truncamento passa a ser opt-in via seletor `td[title]` (aproveitando o atributo `title` que já existe nos `<td>` com conteúdo potencialmente longo), em vez de uma regra `td` genérica. Um wrapper `.tabela-wrap` dá o visual elevado (cabeçalho preenchido, sombra, hover) e scroll horizontal a toda tabela do sistema. Botões de ação viram ícones SVG inline reutilizáveis (`botaoIconeEditar`/`botaoIconeExcluir` em `ui.js`). Um `.painel` dá o mesmo tratamento visual aos cards de formulário "Novo/Editar".

**Tech Stack:** HTML/CSS/JS puro (sem framework, sem bundler), `node --test` para os testes unitários existentes.

## Global Constraints

- Sem framework de frontend: HTML + CSS + JS puro, em módulos separados por responsabilidade (regra do `CLAUDE.md`).
- Proibido usar travessão ("—") em qualquer texto: código, copy da UI, documentação, commits (regra do `CLAUDE.md`).
- Todo campo/botão relevante da UI tem uma forma de explicação (tooltip/`aria-label`) - os ícones de ação mantêm `title` e `aria-label` com o texto por extenso.
- Não muda a cor da marca (verde `--cor-primaria` / tema alto contraste existentes), não muda os botões `.btn-primario`/`.btn-secundario`/`.btn-perigo` já aprovados.
- Não adiciona nenhuma dependência nova (ícones são SVG inline, não biblioteca de ícones).
- `node --test` deve continuar com 44/44 testes passando antes de cada commit, mais os novos testes adicionados aqui.
- Largura mínima de coluna é decidida por tela (não um valor único mágico para todo o sistema, ver cada task).

---

### Task 1: Fundação CSS (tabela elevada, truncamento opt-in, ícones, painel, espaçamento)

**Files:**
- Modify: `public/style.css:151-153`
- Modify: `public/componentes.css` (acrescentar ao final, hoje com 88 linhas)

**Interfaces:**
- Produces: classes CSS `.tabela-wrap`, `.td-acoes`, seletor `td[title]`, `.btn-icone`/`.btn-icone--editar`/`.btn-icone--excluir`, `.painel`, regras de espaçamento `main h2`/`main h3, h4, h5`. Todas as tasks seguintes (2 a 6) consomem essas classes.

- [ ] **Step 1: Substituir a regra de truncamento genérica por opt-in + wrapper de tabela elevada**

Em `public/style.css`, substituir as linhas 151-153:

```css
table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
th, td { text-align: left; padding: 0.5rem; border-bottom: var(--cor-borda-largura) solid var(--cor-borda); }
td { max-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
```

por:

```css
table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
th, td { text-align: left; padding: 0.5rem; border-bottom: var(--cor-borda-largura) solid var(--cor-borda); }

/* Truncamento é exceção, não regra: só em <td> com atributo title (conteúdo
   potencialmente longo). Colunas curtas (status, tipo, Sim/Não, ações) nunca
   tiveram title e não são afetadas. */
td[title] { max-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Coluna de ações nunca encolhe, sempre cabe os ícones. */
.td-acoes { white-space: nowrap; width: 1%; }

/* Tabela elevada: container com sombra, cabeçalho preenchido, scroll
   horizontal próprio quando não couber (matriz de permissões, etapas). */
.tabela-wrap {
  overflow-x: auto;
  border-radius: 0.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  background: var(--cor-fundo-elevado);
  margin-top: 1rem;
}
.tabela-wrap table { margin-top: 0; }
.tabela-wrap th { background: var(--cor-primaria); color: var(--cor-primaria-texto); }
.tabela-wrap tbody tr:hover td { background: var(--cor-fundo); }

main h2 { margin-top: 0; margin-bottom: 1rem; }
main h3, main h4, main h5 { margin-top: 2rem; margin-bottom: 0.75rem; }
```

- [ ] **Step 2: Acrescentar os estilos de ícone de ação e do painel de formulário**

Em `public/componentes.css`, acrescentar ao final do arquivo (depois da linha 88):

```css

.btn-icone {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border-radius: 0.35rem;
  border: var(--cor-borda-largura) solid transparent;
  background: transparent;
  cursor: pointer;
}
.btn-icone + .btn-icone { margin-left: 0.35rem; }
.btn-icone--editar { color: var(--cor-primaria); border-color: var(--cor-primaria); }
.btn-icone--editar:hover { background: var(--cor-fundo); }
.btn-icone--excluir { color: var(--cor-vencido); border-color: var(--cor-vencido); }
.btn-icone--excluir:hover { background: var(--cor-fundo); }

.painel {
  background: var(--cor-fundo-elevado);
  border-radius: 0.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 1.25rem 1.5rem;
  margin-top: 1.5rem;
}
```

- [ ] **Step 3: Rodar a suite de testes (não deve mudar nada, é só CSS)**

Run: `node --test`
Expected: `pass 44`, `fail 0` (mesmo resultado de antes, CSS não afeta os testes de lógica)

- [ ] **Step 4: Commit**

```bash
git add public/style.css public/componentes.css
git commit -m "feat: fundação CSS do redesign de tabelas (tabela elevada, truncamento opt-in, ícones, painel)"
```

---

### Task 2: Botões de ação em ícone (`ui.js`)

**Files:**
- Modify: `public/ui.js` (acrescentar ao final, hoje com 29 linhas)
- Modify: `public/ui.test.js` (acrescentar ao final, hoje com 25 linhas)

**Interfaces:**
- Consumes: classes `.btn-icone`, `.btn-icone--editar`, `.btn-icone--excluir` (Task 1).
- Produces: `botaoIconeEditar(classe: string, id: number|string): string` e `botaoIconeExcluir(classe: string, id: number|string): string`, ambas retornando a tag `<button>` completa. Usadas por `crud-ui.js` (Task 3) e `fluxo.js` (Task 6).

- [ ] **Step 1: Escrever os testes que falham**

Em `public/ui.test.js`, acrescentar ao final:

```js

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
```

E atualizar o import no topo do arquivo (linha 3) de:

```js
import { escaparHtml } from "./ui.js";
```

para:

```js
import { escaparHtml, botaoIconeEditar, botaoIconeExcluir } from "./ui.js";
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `node --test public/ui.test.js`
Expected: FAIL com `botaoIconeEditar is not a function` (ou `undefined`)

- [ ] **Step 3: Implementar as funções em `ui.js`**

Em `public/ui.js`, acrescentar ao final (depois da linha 29):

```js

const SVG_ICONE_EDITAR =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M11.5 1.5l3 3-8.5 8.5H3v-3l8.5-8.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
const SVG_ICONE_EXCLUIR =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 4h10M6.5 4V2.5h3V4M4.5 4l.5 9.5a1 1 0 0 0 1 .95h4a1 1 0 0 0 1-.95L11.5 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function botaoIconeEditar(classe, id) {
  return `<button type="button" class="btn-icone btn-icone--editar ${classe}" data-id="${id}" aria-label="Editar" title="Editar">${SVG_ICONE_EDITAR}</button>`;
}

export function botaoIconeExcluir(classe, id) {
  return `<button type="button" class="btn-icone btn-icone--excluir ${classe}" data-id="${id}" aria-label="Excluir" title="Excluir">${SVG_ICONE_EXCLUIR}</button>`;
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test`
Expected: `pass 46`, `fail 0` (44 testes de antes + 2 novos)

- [ ] **Step 5: Commit**

```bash
git add public/ui.js public/ui.test.js
git commit -m "feat: adicionar botaoIconeEditar/botaoIconeExcluir em ui.js"
```

---

### Task 3: Redesenhar o componente de tabela genérico (`crud-ui.js`) e seus usos

**Files:**
- Modify: `public/crud-ui.js:1-2` (import), `:60-92` (cabeçalho e formulário), `:147-163` (linhas da tabela)
- Modify: `public/cadastros.js:11-91` (4 chamadas de `renderCrud`)
- Modify: `public/fluxo.js:16-22` (chamada de `renderCrud` da lista de Fluxos)

**Interfaces:**
- Consumes: `botaoIconeEditar`/`botaoIconeExcluir` (Task 2), classes `.tabela-wrap`/`.td-acoes`/`.painel` (Task 1).
- Produces: `renderCrud` aceita um novo campo opcional `config.larguraColuna1` (número, em `ch`; default `12` se omitido) que define a largura mínima da primeira coluna daquela tela.

- [ ] **Step 1: Atualizar o import em `crud-ui.js`**

Em `public/crud-ui.js`, linha 2, trocar:

```js
import { info, mostrarErro, escaparAtributo, escaparHtml } from "./ui.js";
```

por:

```js
import { info, mostrarErro, escaparAtributo, escaparHtml, botaoIconeEditar, botaoIconeExcluir } from "./ui.js";
```

- [ ] **Step 2: Envolver a tabela num `.tabela-wrap`, dar largura mínima e rótulo à coluna de ações, e envolver o formulário num `.painel`**

Em `public/crud-ui.js`, dentro de `renderCrud`, trocar o bloco `container.innerHTML = ...` (linhas 77-92):

```js
  container.innerHTML = `
    <h2>${config.titulo}</h2>
    <table>
      <thead><tr>${camposTabela.map((c) => `<th>${c.label}</th>`).join("")}<th></th></tr></thead>
      <tbody></tbody>
    </table>
    ${
      podeEscrever
        ? `<h3>Novo / Editar</h3>
           <form class="formulario">
             ${config.campos.map((c) => campoInputHtml(c, opcoesFK)).join("")}
             <button type="submit" class="btn btn-primario">Adicionar</button>
           </form>`
        : ""
    }
  `;
```

por:

```js
  const larguraColuna1 = config.larguraColuna1 ?? 12;
  container.innerHTML = `
    <h2>${config.titulo}</h2>
    <div class="tabela-wrap">
      <table>
        <thead>
          <tr>
            ${camposTabela
              .map((c, i) => (i === 0 ? `<th style="min-width:${larguraColuna1}ch">${c.label}</th>` : `<th>${c.label}</th>`))
              .join("")}
            <th>Ações</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
    ${
      podeEscrever
        ? `<div class="painel">
             <h3>Novo / Editar</h3>
             <form class="formulario">
               ${config.campos.map((c) => campoInputHtml(c, opcoesFK)).join("")}
               <button type="submit" class="btn btn-primario">Adicionar</button>
             </form>
           </div>`
        : ""
    }
  `;
```

- [ ] **Step 3: Trocar os botões de texto por ícones na coluna de ações**

Em `public/crud-ui.js`, dentro de `recarregar()`, trocar a linha da célula de ações (linha 157-160):

```js
                  <td>
                    ${permissao.editar ? `<button type="button" class="btn btn-secundario btn-editar" data-id="${linha.id}">Editar</button>` : ""}
                    ${permissao.excluir ? `<button type="button" class="btn btn-perigo btn-excluir" data-id="${linha.id}">Excluir</button>` : ""}
                  </td>
```

por:

```js
                  <td class="td-acoes">
                    ${permissao.editar ? botaoIconeEditar("btn-editar", linha.id) : ""}
                    ${permissao.excluir ? botaoIconeExcluir("btn-excluir", linha.id) : ""}
                  </td>
```

(As linhas seguintes que fazem `container.querySelectorAll(".btn-editar")`/`.btn-excluir` continuam funcionando sem mudança, pois os ícones mantêm as mesmas classes.)

- [ ] **Step 4: Definir a largura da primeira coluna em cada tela que usa `renderCrud`**

Em `public/cadastros.js`, trocar (linha 11-16):

```js
  renderCrud(document.getElementById("secao-empresas"), {
    titulo: "Empresas",
    endpoint: "/empresas",
    tela: "empresas",
    campos: [{ nome: "nome", label: "Nome", obrigatorio: true }],
  }).catch((e) => mostrarErro(mensagemErro, e));
```

por:

```js
  renderCrud(document.getElementById("secao-empresas"), {
    titulo: "Empresas",
    endpoint: "/empresas",
    tela: "empresas",
    larguraColuna1: 18,
    campos: [{ nome: "nome", label: "Nome", obrigatorio: true }],
  }).catch((e) => mostrarErro(mensagemErro, e));
```

Trocar (linha 18-34):

```js
  renderCrud(document.getElementById("secao-setores"), {
    titulo: "Setores",
    endpoint: "/setores",
    tela: "setores",
    campos: [
```

por:

```js
  renderCrud(document.getElementById("secao-setores"), {
    titulo: "Setores",
    endpoint: "/setores",
    tela: "setores",
    larguraColuna1: 16,
    campos: [
```

Trocar (linha 36-40):

```js
  renderCrud(document.getElementById("secao-usuarios"), {
    titulo: "Usuários",
    endpoint: "/usuarios",
    tela: "usuarios",
    campos: [
```

por:

```js
  renderCrud(document.getElementById("secao-usuarios"), {
    titulo: "Usuários",
    endpoint: "/usuarios",
    tela: "usuarios",
    larguraColuna1: 14,
    campos: [
```

Trocar (linha 86-91):

```js
  renderCrud(document.getElementById("secao-status"), {
    titulo: "Status",
    endpoint: "/status",
    tela: "status",
    campos: [{ nome: "nome", label: "Nome", obrigatorio: true }],
  }).catch((e) => mostrarErro(mensagemErro, e));
```

por:

```js
  renderCrud(document.getElementById("secao-status"), {
    titulo: "Status",
    endpoint: "/status",
    tela: "status",
    larguraColuna1: 20,
    campos: [{ nome: "nome", label: "Nome", obrigatorio: true }],
  }).catch((e) => mostrarErro(mensagemErro, e));
```

Em `public/fluxo.js`, trocar (linha 16-22):

```js
  await renderCrud(document.getElementById("secao-fluxos"), {
    titulo: "Fluxos",
    endpoint: "/fluxos",
    tela: "fluxos",
    campos: [{ nome: "nome", label: "Nome", obrigatorio: true }],
    aoSalvar: () => permissaoFluxos.visualizar && iniciarSelecaoFluxo(),
  }).catch((e) => mostrarErro(mensagemErro, e));
```

por:

```js
  await renderCrud(document.getElementById("secao-fluxos"), {
    titulo: "Fluxos",
    endpoint: "/fluxos",
    tela: "fluxos",
    larguraColuna1: 16,
    campos: [{ nome: "nome", label: "Nome", obrigatorio: true }],
    aoSalvar: () => permissaoFluxos.visualizar && iniciarSelecaoFluxo(),
  }).catch((e) => mostrarErro(mensagemErro, e));
```

- [ ] **Step 5: Verificar no navegador**

Suba o app local (`npm run dev`, ou reaproveite um `wrangler pages dev public` já rodando), faça login e abra `cadastros.html`. Confirme visualmente:
- Cada tabela (Empresas, Setores, Usuários, Status) tem cabeçalho verde preenchido, sombra suave, e a linha destaca ao passar o mouse.
- A coluna de ações mostra dois ícones (lápis e lixeira), não mais botões de texto nem "...".
- Passar o mouse sobre os ícones mostra "Editar"/"Excluir" via tooltip.
- Nenhuma tabela corta o nome da primeira coluna em uso normal.

Abra `fluxo.html` e confirme que a lista de Fluxos (topo da página) tem o mesmo tratamento.

- [ ] **Step 6: Commit**

```bash
git add public/crud-ui.js public/cadastros.js public/fluxo.js
git commit -m "feat: redesenhar tabela genérica (crud-ui.js) com ícones de ação e visual elevado"
```

---

### Task 4: Redesenhar a lista de "Meus Chamados"

**Files:**
- Modify: `public/chamados.html:27-30`
- Modify: `public/chamados.js:24-40`

**Interfaces:**
- Consumes: classes `.tabela-wrap` (Task 1).

- [ ] **Step 1: Envolver a tabela em `.tabela-wrap` e dar largura mínima à primeira coluna**

Em `public/chamados.html`, trocar (linhas 27-30):

```html
  <table>
    <thead><tr><th>Chamado</th><th>Status</th><th>Prazo</th><th>Situação</th></tr></thead>
    <tbody id="tabela-chamados"></tbody>
  </table>
```

por:

```html
  <div class="tabela-wrap">
    <table>
      <thead><tr><th style="min-width:22ch">Chamado</th><th>Status</th><th>Prazo</th><th>Situação</th></tr></thead>
      <tbody id="tabela-chamados"></tbody>
    </table>
  </div>
```

- [ ] **Step 2: Mover o `title` do link para a célula, habilitando o truncamento opt-in**

Em `public/chamados.js`, dentro de `carregarChamados`, trocar a linha da primeira célula (linha 33):

```js
                <td><a href="chamado.html?id=${c.id}" title="${escaparAtributo(c.titulo)}">#${c.id} - ${escaparHtml(c.titulo)}</a></td>
```

por:

```js
                <td title="${escaparAtributo(c.titulo)}"><a href="chamado.html?id=${c.id}">#${c.id} - ${escaparHtml(c.titulo)}</a></td>
```

- [ ] **Step 3: Verificar no navegador**

Abra `chamados.html` logado. Confirme visualmente:
- A tabela tem cabeçalho verde preenchido, sombra, hover na linha.
- Os títulos dos chamados aparecem por completo (ex.: "#1 - Solicitação (editada)"), sem "...", a menos que o título seja realmente muito longo (nesse caso, tooltip mostra o texto completo ao passar o mouse).
- Datas de prazo e status continuam visíveis por completo.

- [ ] **Step 4: Commit**

```bash
git add public/chamados.html public/chamados.js
git commit -m "feat: redesenhar tabela de Meus Chamados com visual elevado"
```

---

### Task 5: Redesenhar a matriz de permissões (`grupos.js`)

**Files:**
- Modify: `public/grupos.js:34-39` (formulário novo grupo), `:97-134` (formulário de renomear + tabela)

**Interfaces:**
- Consumes: classes `.tabela-wrap`, `.painel` (Task 1).

- [ ] **Step 1: Envolver o formulário "Novo grupo" num painel**

Em `public/grupos.js`, dentro de `iniciar`, trocar o bloco do formulário (linhas 34-39):

```js
    <form class="formulario" id="form-novo-grupo">
      <label>Novo grupo
        <input type="text" name="nome" required>
      </label>
      <button type="submit" class="btn btn-primario">Criar</button>
    </form>
```

por:

```js
    <div class="painel">
      <form class="formulario" id="form-novo-grupo">
        <label>Novo grupo
          <input type="text" name="nome" required>
        </label>
        <button type="submit" class="btn btn-primario">Criar</button>
      </form>
    </div>
```

- [ ] **Step 2: Envolver o formulário de renomear num painel, dar título à coluna "Tela" e envolver a matriz em `.tabela-wrap`**

Em `public/grupos.js`, dentro de `abrirGrupo`, trocar o bloco `detalhe.innerHTML = ...` (linhas 97-134):

```js
    detalhe.innerHTML = `
      <h3>${escaparHtml(grupo.nome)}</h3>
      <form class="formulario" id="form-renomear">
        <label>Nome
          <input type="text" name="nome" value="${escaparHtml(grupo.nome)}" required>
        </label>
        <button type="submit" class="btn btn-primario">Salvar nome</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>Tela</th>
            ${ACOES.map((a) => `<th>${a}</th>`).join("")}
            <th>Ver todos os setores ${info("Só relevante para Chamados, e só afeta a listagem 'Meus chamados': sem esta permissão, o usuário só vê ali os chamados do próprio setor. Abrir um chamado específico por link (inclusive de outro setor) e ver a árvore/comentários do chamado mãe sempre funciona para qualquer usuário autenticado, com ou sem esta permissão — isso é proposital.")}</th>
          </tr>
        </thead>
        <tbody>
          ${TELAS.map(
            (t) => `
            <tr data-tela="${t.chave}">
              <td>${t.label}</td>
              ${ACOES.map(
                (a) =>
                  `<td><input type="checkbox" data-acao="${a}" ${grupo.permissoes[t.chave][a] ? "checked" : ""}></td>`
              ).join("")}
              <td>
                ${
                  t.chave === "chamados"
                    ? `<input type="checkbox" data-acao="ver_todos_setores" ${grupo.permissoes.chamados.ver_todos_setores ? "checked" : ""}>`
                    : ""
                }
              </td>
            </tr>`
          ).join("")}
        </tbody>
      </table>
      <button type="button" id="btn-salvar-permissoes" class="btn btn-primario">Salvar permissões</button>
    `;
```

por (nota: o texto do tooltip de "Ver todos os setores" perde o travessão, viram parênteses/dois-pontos, seguindo a regra nova do `CLAUDE.md`):

```js
    detalhe.innerHTML = `
      <div class="painel">
        <h3>${escaparHtml(grupo.nome)}</h3>
        <form class="formulario" id="form-renomear">
          <label>Nome
            <input type="text" name="nome" value="${escaparHtml(grupo.nome)}" required>
          </label>
          <button type="submit" class="btn btn-primario">Salvar nome</button>
        </form>
      </div>
      <div class="tabela-wrap">
        <table>
          <thead>
            <tr>
              <th style="min-width:10ch">Tela</th>
              ${ACOES.map((a) => `<th>${a}</th>`).join("")}
              <th>Ver todos os setores ${info("Só relevante para Chamados, e só afeta a listagem 'Meus chamados': sem esta permissão, o usuário só vê ali os chamados do próprio setor. Abrir um chamado específico por link (inclusive de outro setor) e ver a árvore/comentários do chamado mãe sempre funciona para qualquer usuário autenticado, com ou sem esta permissão, isso é proposital.")}</th>
            </tr>
          </thead>
          <tbody>
            ${TELAS.map(
              (t) => `
              <tr data-tela="${t.chave}">
                <td title="${escaparHtml(t.label)}">${escaparHtml(t.label)}</td>
                ${ACOES.map(
                  (a) =>
                    `<td><input type="checkbox" data-acao="${a}" ${grupo.permissoes[t.chave][a] ? "checked" : ""}></td>`
                ).join("")}
                <td>
                  ${
                    t.chave === "chamados"
                      ? `<input type="checkbox" data-acao="ver_todos_setores" ${grupo.permissoes.chamados.ver_todos_setores ? "checked" : ""}>`
                      : ""
                  }
                </td>
              </tr>`
            ).join("")}
          </tbody>
        </table>
      </div>
      <button type="button" id="btn-salvar-permissoes" class="btn btn-primario">Salvar permissões</button>
    `;
```

- [ ] **Step 3: Verificar no navegador**

Abra `grupos.html` logado como admin, clique num grupo. Confirme visualmente:
- A coluna "Tela" mostra o nome completo de cada tela (Empresas, Setores, Usuários, Status, Fluxos, Chamados), nunca "E...", "Se...", etc.
- A tabela tem cabeçalho verde preenchido e sombra.
- Os formulários "Novo grupo" e "Nome" aparecem dentro de um card com sombra suave.
- Se a tabela não couber na largura da tela (viewport estreito), aparece scroll horizontal só nela, sem quebrar o resto da página.

- [ ] **Step 4: Commit**

```bash
git add public/grupos.js
git commit -m "feat: redesenhar matriz de permissões com visual elevado e coluna Tela legível"
```

---

### Task 6: Redesenhar as tabelas de Etapas e Ações (`fluxo.js`)

**Files:**
- Modify: `public/fluxo.js:1-6` (import), `:55-130` (tabela de etapas + formulário), `:203-265` (tabela de ações + formulário)

**Interfaces:**
- Consumes: `botaoIconeEditar`/`botaoIconeExcluir` (Task 2), classes `.tabela-wrap`/`.td-acoes`/`.painel` (Task 1).

- [ ] **Step 1: Atualizar o import em `fluxo.js`**

Trocar a linha 3:

```js
import { info, mostrarErro, escaparAtributo, escaparHtml } from "./ui.js";
```

por:

```js
import { info, mostrarErro, escaparAtributo, escaparHtml, botaoIconeEditar, botaoIconeExcluir } from "./ui.js";
```

- [ ] **Step 2: Redesenhar a tabela de Etapas e o formulário**

Trocar o bloco `container.innerHTML = ...` de `renderEtapas` (linhas 55-130):

```js
  container.innerHTML = `
    <h3>Etapas</h3>
    <table>
      <thead>
        <tr><th>Nome</th><th>Setor</th><th>Tipo</th><th>Inicial?</th><th>Próxima etapa</th><th>Vínculo</th><th></th></tr>
      </thead>
      <tbody>
        ${
          etapas.length === 0
            ? `<tr><td colspan="7">Nenhuma etapa cadastrada ainda.</td></tr>`
            : etapas
                .map(
                  (e) => `
          <tr>
            <td title="${escaparAtributo(e.nome)}">${escaparHtml(e.nome)}</td>
            <td title="${escaparAtributo(nomeSetor(e.setor_id))}">${escaparHtml(nomeSetor(e.setor_id))}</td>
            <td>${e.tipo}</td>
            <td>${e.eh_inicial ? "Sim" : "Não"}</td>
            <td title="${escaparAtributo(e.etapa_proxima_id ? nomeEtapa(e.etapa_proxima_id) : "-")}">${e.etapa_proxima_id ? escaparHtml(nomeEtapa(e.etapa_proxima_id)) : "-"}</td>
            <td>${e.etapa_proxima_vinculo ?? "-"}</td>
            <td>
              ${e.tipo === "aprovacao" ? `<button type="button" class="btn btn-secundario btn-acoes" data-id="${e.id}">Ações</button>` : ""}
              ${permissaoFluxos.editar ? `<button type="button" class="btn btn-secundario btn-editar-etapa" data-id="${e.id}">Editar</button>` : ""}
              ${permissaoFluxos.excluir ? `<button type="button" class="btn btn-perigo btn-excluir-etapa" data-id="${e.id}">Excluir</button>` : ""}
            </td>
          </tr>`
                )
                .join("")
        }
      </tbody>
    </table>

    ${
      permissaoFluxos.inserir || permissaoFluxos.editar
        ? `
    <h4>Nova / editar etapa</h4>
    <form class="formulario" id="form-etapa">
      <label>Nome <input name="nome" required></label>
      <label>Setor
        <select name="setor_id" required>
          ${setores.map((s) => `<option value="${s.id}">${escaparHtml(s.nome)}</option>`).join("")}
        </select>
      </label>
      <label>Tipo
        <select name="tipo" required>
          <option value="aprovacao">Aprovação</option>
          <option value="tarefa">Tarefa</option>
        </select>
      </label>
      <label><input type="checkbox" name="eh_inicial"> É a etapa inicial? ${info(
        "Marque só na etapa que abre o chamado mãe. O sistema finaliza essa etapa e avança o fluxo automaticamente assim que o chamado é criado."
      )}</label>
      <label>Próxima etapa (opcional - deixe em branco se esta etapa usa Ações) ${info(
        "Quando esta etapa for aprovada/finalizada, cria automaticamente um chamado para a etapa escolhida aqui. Deixe em branco se esta etapa libera uma lista de Ações em vez de uma única próxima etapa."
      )}
        <select name="etapa_proxima_id">
          <option value="">Nenhuma / usar Ações</option>
          ${etapas.map((e) => `<option value="${e.id}">${escaparHtml(e.nome)}</option>`).join("")}
        </select>
      </label>
      <label>Vínculo da próxima etapa ${info(
        "Define a quem o novo chamado fica atrelado na árvore: 'pai' o vincula a esta própria etapa; 'mãe' o vincula direto à raiz, pulando esta etapa."
      )}
        <select name="etapa_proxima_vinculo">
          <option value="pai">Chamado pai (imediato)</option>
          <option value="mae">Chamado mãe (raiz)</option>
        </select>
      </label>
      <button type="submit" class="btn btn-primario">Adicionar etapa</button>
    </form>
    `
        : ""
    }

    <div id="secao-acoes"></div>
  `;
```

por:

```js
  container.innerHTML = `
    <h3>Etapas</h3>
    <div class="tabela-wrap">
      <table>
        <thead>
          <tr><th style="min-width:18ch">Nome</th><th>Setor</th><th>Tipo</th><th>Inicial?</th><th>Próxima etapa</th><th>Vínculo</th><th>Ações</th></tr>
        </thead>
        <tbody>
          ${
            etapas.length === 0
              ? `<tr><td colspan="7">Nenhuma etapa cadastrada ainda.</td></tr>`
              : etapas
                  .map(
                    (e) => `
            <tr>
              <td title="${escaparAtributo(e.nome)}">${escaparHtml(e.nome)}</td>
              <td title="${escaparAtributo(nomeSetor(e.setor_id))}">${escaparHtml(nomeSetor(e.setor_id))}</td>
              <td>${e.tipo}</td>
              <td>${e.eh_inicial ? "Sim" : "Não"}</td>
              <td title="${escaparAtributo(e.etapa_proxima_id ? nomeEtapa(e.etapa_proxima_id) : "-")}">${e.etapa_proxima_id ? escaparHtml(nomeEtapa(e.etapa_proxima_id)) : "-"}</td>
              <td>${e.etapa_proxima_vinculo ?? "-"}</td>
              <td class="td-acoes">
                ${e.tipo === "aprovacao" ? `<button type="button" class="btn btn-secundario btn-acoes" data-id="${e.id}">Ações</button>` : ""}
                ${permissaoFluxos.editar ? botaoIconeEditar("btn-editar-etapa", e.id) : ""}
                ${permissaoFluxos.excluir ? botaoIconeExcluir("btn-excluir-etapa", e.id) : ""}
              </td>
            </tr>`
                  )
                  .join("")
          }
        </tbody>
      </table>
    </div>

    ${
      permissaoFluxos.inserir || permissaoFluxos.editar
        ? `
    <div class="painel">
      <h4>Nova / editar etapa</h4>
      <form class="formulario" id="form-etapa">
        <label>Nome <input name="nome" required></label>
        <label>Setor
          <select name="setor_id" required>
            ${setores.map((s) => `<option value="${s.id}">${escaparHtml(s.nome)}</option>`).join("")}
          </select>
        </label>
        <label>Tipo
          <select name="tipo" required>
            <option value="aprovacao">Aprovação</option>
            <option value="tarefa">Tarefa</option>
          </select>
        </label>
        <label><input type="checkbox" name="eh_inicial"> É a etapa inicial? ${info(
          "Marque só na etapa que abre o chamado mãe. O sistema finaliza essa etapa e avança o fluxo automaticamente assim que o chamado é criado."
        )}</label>
        <label>Próxima etapa (opcional, deixe em branco se esta etapa usa Ações) ${info(
          "Quando esta etapa for aprovada/finalizada, cria automaticamente um chamado para a etapa escolhida aqui. Deixe em branco se esta etapa libera uma lista de Ações em vez de uma única próxima etapa."
        )}
          <select name="etapa_proxima_id">
            <option value="">Nenhuma / usar Ações</option>
            ${etapas.map((e) => `<option value="${e.id}">${escaparHtml(e.nome)}</option>`).join("")}
          </select>
        </label>
        <label>Vínculo da próxima etapa ${info(
          "Define a quem o novo chamado fica atrelado na árvore: 'pai' o vincula a esta própria etapa; 'mãe' o vincula direto à raiz, pulando esta etapa."
        )}
          <select name="etapa_proxima_vinculo">
            <option value="pai">Chamado pai (imediato)</option>
            <option value="mae">Chamado mãe (raiz)</option>
          </select>
        </label>
        <button type="submit" class="btn btn-primario">Adicionar etapa</button>
      </form>
    </div>
    `
        : ""
    }

    <div id="secao-acoes"></div>
  `;
```

(nota: o texto "opcional - deixe em branco" virou "opcional, deixe em branco", removendo o travessão que já existia ali, seguindo a regra nova do `CLAUDE.md`)

- [ ] **Step 3: Redesenhar a tabela de Ações e o formulário**

Trocar o bloco `container.innerHTML = ...` de `renderAcoes` (linhas 203-265):

```js
  container.innerHTML = `
    <h4>Ações de "${escaparHtml(etapa.nome)}"</h4>
    <table>
      <thead><tr><th>Rótulo</th><th>Setor destino</th><th>Vínculo</th><th>Pré-requisito</th><th></th></tr></thead>
      <tbody>
        ${
          etapa.acoes.length === 0
            ? `<tr><td colspan="5">Nenhuma ação cadastrada ainda.</td></tr>`
            : etapa.acoes
                .map(
                  (a) => `
          <tr>
            <td title="${escaparAtributo(a.rotulo)}">${escaparHtml(a.rotulo)}</td>
            <td>${escaparHtml(setores.find((s) => s.id === a.setor_destino_id)?.nome ?? a.setor_destino_id)}</td>
            <td>${a.vinculo}</td>
            <td>${
              a.prerequisito_acao_id
                ? escaparHtml(etapa.acoes.find((x) => x.id === a.prerequisito_acao_id)?.rotulo ?? "-")
                : "-"
            }</td>
            <td>
              ${permissaoFluxos.editar ? `<button type="button" class="btn btn-secundario btn-editar-acao" data-id="${a.id}">Editar</button>` : ""}
              ${permissaoFluxos.excluir ? `<button type="button" class="btn btn-perigo btn-excluir-acao" data-id="${a.id}">Excluir</button>` : ""}
            </td>
          </tr>`
                )
                .join("")
        }
      </tbody>
    </table>
    ${
      permissaoFluxos.inserir || permissaoFluxos.editar
        ? `
    <h5>Nova / editar ação</h5>
    <form class="formulario" id="form-acao">
      <label>Rótulo <input name="rotulo" required></label>
      <label>Setor destino
        <select name="setor_destino_id" required>
          ${setores.map((s) => `<option value="${s.id}">${escaparHtml(s.nome)}</option>`).join("")}
        </select>
      </label>
      <label>Vínculo ${info(
        "Define a quem a tarefa criada fica atrelada na árvore: 'mãe' a vincula direto à raiz; 'pai' a vincula a esta etapa de aprovação."
      )}
        <select name="vinculo" required>
          <option value="mae">Chamado mãe (raiz)</option>
          <option value="pai">Chamado pai (imediato)</option>
        </select>
      </label>
      <label>Pré-requisito (opcional) ${info(
        "Se escolhida, a tarefa desta ação nasce bloqueada até que o chamado da ação pré-requisito seja finalizado."
      )}
        <select name="prerequisito_acao_id">
          <option value="">Nenhum</option>
          ${etapa.acoes.map((a) => `<option value="${a.id}">${escaparHtml(a.rotulo)}</option>`).join("")}
        </select>
      </label>
      <button type="submit" class="btn btn-primario">Adicionar ação</button>
    </form>
    `
        : ""
    }
  `;
```

por:

```js
  container.innerHTML = `
    <h4>Ações de "${escaparHtml(etapa.nome)}"</h4>
    <div class="tabela-wrap">
      <table>
        <thead><tr><th style="min-width:20ch">Rótulo</th><th>Setor destino</th><th>Vínculo</th><th>Pré-requisito</th><th>Ações</th></tr></thead>
        <tbody>
          ${
            etapa.acoes.length === 0
              ? `<tr><td colspan="5">Nenhuma ação cadastrada ainda.</td></tr>`
              : etapa.acoes
                  .map(
                    (a) => `
            <tr>
              <td title="${escaparAtributo(a.rotulo)}">${escaparHtml(a.rotulo)}</td>
              <td>${escaparHtml(setores.find((s) => s.id === a.setor_destino_id)?.nome ?? a.setor_destino_id)}</td>
              <td>${a.vinculo}</td>
              <td>${
                a.prerequisito_acao_id
                  ? escaparHtml(etapa.acoes.find((x) => x.id === a.prerequisito_acao_id)?.rotulo ?? "-")
                  : "-"
              }</td>
              <td class="td-acoes">
                ${permissaoFluxos.editar ? botaoIconeEditar("btn-editar-acao", a.id) : ""}
                ${permissaoFluxos.excluir ? botaoIconeExcluir("btn-excluir-acao", a.id) : ""}
              </td>
            </tr>`
                  )
                  .join("")
          }
        </tbody>
      </table>
    </div>
    ${
      permissaoFluxos.inserir || permissaoFluxos.editar
        ? `
    <div class="painel">
      <h5>Nova / editar ação</h5>
      <form class="formulario" id="form-acao">
        <label>Rótulo <input name="rotulo" required></label>
        <label>Setor destino
          <select name="setor_destino_id" required>
            ${setores.map((s) => `<option value="${s.id}">${escaparHtml(s.nome)}</option>`).join("")}
          </select>
        </label>
        <label>Vínculo ${info(
          "Define a quem a tarefa criada fica atrelada na árvore: 'mãe' a vincula direto à raiz; 'pai' a vincula a esta etapa de aprovação."
        )}
          <select name="vinculo" required>
            <option value="mae">Chamado mãe (raiz)</option>
            <option value="pai">Chamado pai (imediato)</option>
          </select>
        </label>
        <label>Pré-requisito (opcional) ${info(
          "Se escolhida, a tarefa desta ação nasce bloqueada até que o chamado da ação pré-requisito seja finalizado."
        )}
          <select name="prerequisito_acao_id">
            <option value="">Nenhum</option>
            ${etapa.acoes.map((a) => `<option value="${a.id}">${escaparHtml(a.rotulo)}</option>`).join("")}
          </select>
        </label>
        <button type="submit" class="btn btn-primario">Adicionar ação</button>
      </form>
    </div>
    `
        : ""
    }
  `;
```

- [ ] **Step 4: Verificar no navegador**

Abra `fluxo.html` logado, selecione o fluxo "Produto Derivado". Confirme visualmente:
- A tabela de Etapas mostra os ícones de editar/excluir sem cortar, mesmo com 6 colunas de dados; o botão "Ações" (das etapas de aprovação) continua com texto normal.
- Clique em "Ações" de uma etapa de aprovação e confirme que a tabela de Ações mostra rótulos completos (ou truncados com tooltip só se muito longos) e os ícones de ação.
- Os formulários "Nova / editar etapa" e "Nova / editar ação" aparecem dentro de um card com sombra.

- [ ] **Step 5: Commit**

```bash
git add public/fluxo.js
git commit -m "feat: redesenhar tabelas de Etapas e Ações com ícones e visual elevado"
```

---

### Task 7: Regressão final e abertura do PR

**Files:** nenhum (só verificação)

- [ ] **Step 1: Rodar a suite de testes completa**

Run: `node --test`
Expected: `pass 46`, `fail 0`

- [ ] **Step 2: Passada manual em todas as telas tocadas**

Com o app rodando localmente (login como usuário admin), visitar cada tela e confirmar visualmente que nada quebrou e que o visual elevado está consistente:
- `chamados.html` (Meus Chamados)
- `cadastros.html` (Empresas, Setores, Usuários, Status)
- `fluxo.html` (lista de Fluxos, Etapas, Ações)
- `grupos.html` (lista de grupos, matriz de permissões)
- `chamado.html?id=1` (detalhe de um chamado, não foi tocado nesta rodada, só confirmar que não quebrou nada por causa do CSS global)

Trocar o tema para alto contraste (painel de Preferências) e conferir rapidamente que o cabeçalho das tabelas continua legível (amarelo com texto preto) e os ícones de ação continuam visíveis.

- [ ] **Step 3: Push e abertura do PR**

```bash
git push -u origin claude/redesign-tabelas-telas-internas
gh pr create --title "feat: redesenhar tabelas e telas internas" --body "Implementa docs/superpowers/specs/2026-09-16-redesign-tabelas-e-telas-internas-design.md: corrige o truncamento agressivo (causa raiz: td genérico em style.css) e eleva o visual de tabelas e formulários das telas internas."
```

Assim que o PR for criado, habilitar o monitoramento automático (`auto_fix`/`address_comments`) nele antes de encerrar a task.
