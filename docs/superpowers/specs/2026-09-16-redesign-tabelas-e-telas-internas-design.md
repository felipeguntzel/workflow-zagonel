# Redesign de tabelas e telas internas: Design

Data: 2026-09-16
Status: aprovado para virar plano de implementação

## Objetivo

As telas internas construídas na fase de layout/temas (2026-09-15) herdaram
um bug sério do componente de tabela genérico: uma única regra CSS
(`td { max-width: 0; overflow: hidden; text-overflow: ellipsis; white-space:
nowrap; }` em `style.css:153`) trata toda coluna igual, sem reservar espaço
pra nenhuma. Em telas com várias colunas isso causa:

- **Matriz de permissões** (`grupos.js`): coluna "Tela" ilegível, mostra só
  a primeira letra/sílaba do nome da tela ("E...", "Se...", "Us...").
- **Etapas do fluxo** (`fluxo.js`): coluna de ações espremida a ~21px,
  cortando os botões "Editar"/"Excluir" quase por completo.
- Botão "Excluir" virando literalmente "..." em várias telas de cadastro
  (Empresas, Fluxos) pelo mesmo motivo.

Esta fase corrige a causa raiz (o componente de tabela) e aproveita pra
elevar o visual geral das telas internas, que hoje usa linhas/texto cru sem
nenhum tratamento visual além do que a fase de layout/temas já deu aos
botões e à sidebar.

## Escopo de telas

Mesmas telas cobertas pela fase de layout/temas: Meus Chamados, Novo
Chamado, Chamado (detalhe), Cadastros, Fluxos, Grupos de Permissão, Chamado
Geral. Cobre tabelas, formulários de "Novo/Editar" e espaçamento/hierarquia
de título e seções.

**Fora de escopo:** cor da marca (continua o verde já usado no
login/sidebar), paleta de cor customizável por status (pendência separada
em `docs/PENDENCIAS.md`), reorganização de menus (spec separado), PWA,
botões (variantes primário/secundário/perigo já aprovadas na fase anterior,
sem mudança).

## A) Componente de tabela

Aplica ao `renderCrud`/`crud-ui.js` (componente genérico usado por
Cadastros, Fluxos, Grupos de Permissão na listagem simples) e às tabelas
feitas à mão que não passam por ele (lista de chamados em `chamados.js`,
matriz de permissões em `grupos.js`, tabela de etapas/ações em `fluxo.js`).

- **Coluna de ações vira ícones**: um ícone de lápis (editar) e um de
  lixeira (excluir) no lugar dos botões de texto "Editar"/"Excluir". Cada
  ícone mantém `aria-label` e `title` com o texto completo ("Editar",
  "Excluir") para acessibilidade e para seguir a regra do `CLAUDE.md` de
  todo elemento relevante ter uma explicação via tooltip. A coluna de ações
  não fica mais sujeita à regra de encolhimento (recebe largura fixa
  baseada no conteúdo, não dividida igualmente com as outras colunas).
- **Colunas de identificação ganham largura mínima**: a primeira coluna de
  cada tabela (nome, tela, título) recebe um `min-width` em `ch` (baseado
  no maior rótulo esperado da tela, não um valor mágico único pra todo o
  sistema) suficiente pra não truncar em uso normal.
- **Truncamento vira exceção, não regra**: a regra hoje universal (`td {
  max-width: 0; ... }`) sai do seletor genérico `td` e passa a valer só
  para `td[title]`, reaproveitando o atributo `title` que já existe nos
  `<td>` com conteúdo potencialmente longo (ex.: observação, comentário,
  nome de fluxo longo), em vez de uma classe nova. Continua mostrando o
  texto completo no hover, como já funciona hoje em `crud-ui.js`. Onde o
  texto precisa ficar sempre legível por completo (nunca truncar), a
  célula não recebe `title` nenhum e quebra linha normalmente em vez de
  reticências (ex.: coluna "Tela" da matriz de permissões, "Nome" das
  Etapas, "Rótulo" das Ações).
- **Tabelas densas ganham scroll horizontal próprio**: um container com
  `overflow-x: auto` em volta da tabela, sem quebrar o layout da página ao
  redor. Cobre principalmente a matriz de permissões (6 colunas de ação +
  "Ver todos os setores") e a tabela de etapas (6 colunas de dados + ações).
- **Estilo visual "elevado"**: cabeçalho da tabela preenchido com a cor
  primária da marca (`var(--cor-primaria)`) e texto branco; container da
  tabela com sombra suave (`box-shadow` leve, mesma escala usada em
  `.card`); linha destaca o fundo ao passar o mouse (`tr:hover`). Tudo via
  variáveis CSS já existentes (`--cor-primaria`, etc.) pra funcionar nos
  dois temas (claro/alto contraste) sem duplicar regra.

## B) Formulários "Novo/Editar" e espaçamento

- O card que envolve cada formulário de cadastro ganha a mesma sombra suave
  do item A (consistência visual com a tabela logo acima dele na mesma
  tela).
- Títulos de página (`h2`) e de seção (`h3`, ex.: "Novo / Editar",
  "Apontamento de horas") ganham mais espaço vertical acima/abaixo pra
  separar melhor os blocos de conteúdo.
- Sem mudança de campos, validação ou comportamento dos formulários, só
  espaçamento/hierarquia visual.

## C) Acessibilidade dos ícones de ação

- Ícone sozinho nunca é o único jeito de entender a ação: `aria-label`
  (leitor de tela) e `title` (tooltip do mouse) sempre presentes com o
  texto por extenso.
- Ícones seguem o padrão de cor já usado hoje: editar usa a cor primária
  (verde), excluir usa a cor de perigo (vermelho), mesmas variáveis CSS
  dos botões atuais, só trocando o formato de texto para ícone.

## Exemplo aplicado

Matriz de permissões (`grupos.js`): coluna "Tela" recebe `min-width`
suficiente pro maior nome de tela cadastrado hoje (ex.: "Grupos de
Permissão"); a tabela toda ganha scroll horizontal se não couber na tela;
cabeçalho fica verde preenchido; cada linha destaca ao passar o mouse.

Etapas do fluxo (`fluxo.js`): coluna "Nome" com largura mínima razoável,
coluna de ações com ícones lápis/lixeira sem risco de espremer, resto das
colunas (Setor, Tipo, Inicial?, Próxima etapa, Vínculo) mantém o
comportamento atual de truncar só se realmente não couber.
