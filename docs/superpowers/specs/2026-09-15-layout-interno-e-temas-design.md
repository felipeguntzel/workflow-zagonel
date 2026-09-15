# Layout interno, sistema de design e temas — Design

Data: 2026-09-15
Status: aprovado para virar plano de implementação

## Objetivo

Padronizar o visual de todas as telas internas (operacionais) do WorkFlow
Zagonel — hoje só a tela de login e a de troca de senha têm um layout
profissional; o resto (Meus Chamados, Cadastros, Fluxos, Grupos de
Permissão, detalhe de chamado, chamado geral) ainda usa o HTML/CSS cru do
protótipo original. Isso cobre: layout de tela cheia com menu lateral,
biblioteca de CSS reutilizável (botões, cards, mensagens, modal), paleta de
status única, tipografia escolhível pelo usuário (fonte + tamanho) e dois
temas (claro / alto contraste), com a preferência salva por usuário.

Esta é a **Fase 1** de um projeto maior anotado em `docs/PENDENCIAS.md`
("Layout padrão para as telas internas + PWA"). PWA (manifest, service
worker, instalável) fica para uma Fase 2 separada, construída em cima
deste sistema de design.

## A) Layout base

- **Menu lateral fixo (sidebar)**, não mais barra horizontal no topo.
  Gradiente verde escuro (`#2f6f4f` → `#1d4a35`), mesma identidade da tela
  de login. Contém: logo/nome do sistema, os mesmos links já controlados
  por permissão em `montarNav` (Meus Chamados, Cadastros, Fluxos, Grupos de
  Permissão — a lógica de esconder por permissão não muda, só o visual).
- **Colapsável**: um botão "«"/"»" no topo da sidebar reduz ela para 52px
  (só ícones) ou expande de volta para a largura normal (~190-200px). Esse
  estado é uma preferência só do navegador (`localStorage`), não precisa
  seguir o usuário entre dispositivos — diferente das preferências de tema/
  fonte/tamanho (seção D), que são salvas no banco.
- **Topbar**: uma faixa fina no topo da área de conteúdo (não da sidebar)
  com o nome do usuário logado e "Sair" à direita, e um jeito de abrir o
  painel de preferências (clicar no nome do usuário abre um menu com
  "Preferências" e "Sair").
- **Conteúdo ocupa a largura toda** disponível (remove o `max-width: 960px`
  centralizado que existe hoje em `main`).
- **Responsivo desde já** (não esperar a Fase 2/PWA): em telas estreitas
  (breakpoint a definir no plano, algo como `max-width: 768px`), a sidebar
  vira um menu "☰" no topo da topbar — clicar abre a lista de links por
  cima do conteúdo (overlay), clicar fora ou num link fecha.

## B) Temas: Claro e Alto Contraste

- Mecanismo técnico: variáveis CSS (`:root { --cor-fundo, --cor-texto, ... }`
  — já existem parcialmente em `style.css`) mais um atributo
  `data-tema="claro"` / `data-tema="alto-contraste"` no `<html>`, que troca
  os valores dessas variáveis. Sem duplicar CSS por seletor — todo
  componente usa as variáveis, o tema só redefine os valores delas.
- **Claro**: o visual atual (fundo `#f7f7f5`, texto escuro, verde
  `#2f6f4f` como cor primária).
- **Alto contraste**: fundo preto (`#000`), texto branco, bordas de 2px
  (em vez de 1px) em todo componente com borda, destaque em amarelo
  (`#ffcc00`) para links ativos, botões primários e itens selecionados.
- Aplicado o mais cedo possível no carregamento da página (antes do
  primeiro paint, se der, para não ter "flash" do tema errado) lendo a
  preferência do usuário já carregada em `getUsuarioLogado()`.
- Tema é sempre **claro por padrão** para quem ainda não escolheu nada
  (inclusive nas telas de login/troca de senha, que não entram nesse
  sistema — ver seção H).

## C) Paleta de status padronizada

Hoje `situacaoClasse` (`ui.js`) já define badges `vencido`/`alerta`/`ok`,
mas as cores estão hardcoded em `style.css` sem uma versão para o tema de
alto contraste. Esta fase:

- Fixa as 3 cores de status (Ok = verde, Alerta = dourado, Vencido =
  vermelho) como variáveis CSS (`--cor-ok`, `--cor-alerta`,
  `--cor-vencido` — já existem os nomes, só precisam de uma segunda
  definição para o tema de alto contraste).
- Alto contraste usa versões mais vivas/saturadas das mesmas 3 cores
  (verde `#3fdb7f`, dourado `#ffcc00`, vermelho `#ff4d4d`), sempre com
  borda de 1-2px e texto preto sobre elas (mantém contraste mesmo sobre
  fundo preto).
- Essas variáveis são usadas em TODA badge/status do sistema — chamados,
  e qualquer indicador futuro — nunca uma cor solta hardcoded numa tela
  específica.

## D) Tipografia

- **Fonte**: o usuário escolhe entre 4 fontes de sistema (nenhuma
  carregada da internet — zero dependência de rede, zero risco de FOUT):
  Arial, Times New Roman, Verdana, Courier New. Aplicada via variável CSS
  (`--fonte-corpo`) redefinida por um atributo `data-fonte` no `<html>`.
- **Tamanho**: 4 tamanhos fixos — Pequeno, Médio (padrão atual), Grande,
  Extra grande — escalando o `font-size` da raiz (`html`) via
  `data-tamanho`, de forma que todo `rem` no CSS escale proporcionalmente
  junto (não precisa redefinir tamanho em cada componente individualmente).
  Valores exatos de cada tamanho ficam para o plano de implementação.
- Nenhuma das duas depende de fonte web nem de qualquer requisição de
  rede — só fontes já instaladas em qualquer computador.

## E) Painel de preferências

- Novo painel (modal ou página própria — detalhe de implementação, decidir
  no plano) acessível pelo menu do nome do usuário na topbar. Contém os 3
  seletores: Fonte (4 opções), Tamanho (4 opções), Tema (2 opções).
- **Persistência**: 3 colunas novas em `usuarios` (`fonte`, `tamanho_fonte`,
  `tema`), cada uma com um valor padrão sensato (`arial`/`m`/`claro`) para
  quem nunca configurou nada — mesmo padrão de coluna simples já usado
  para `admin`/`deve_trocar_senha`, sem precisar de tabela nova nem JSON.
  A preferência viaja com o usuário para qualquer computador/navegador.
- Salvar as 3 de uma vez com um botão "Salvar preferências" (não precisa
  aplicar em tempo real enquanto o usuário só está olhando as opções,
  mas a UI já reflete a prévia da escolha antes de salvar — como mostrado
  no mockup).
- Requer um novo endpoint (`PUT /api/preferencias` ou similar — nome exato
  fica para o plano) autenticado pela sessão normal, sem permissão de tela
  específica (qualquer usuário logado edita só as próprias preferências).

## F) Componentes padrão (biblioteca CSS reutilizável)

- **Botões**: 4 variantes — primário (verde, ação principal), secundário
  (contorno, ação alternativa), perigo (vermelho, ações destrutivas tipo
  excluir), desabilitado (cinza, sem interação). Substituem os `<button>`
  sem classe usados hoje em quase toda tela.
- **Modal de confirmação customizado**: substitui todo `window.confirm(...)`
  nativo do navegador (usado hoje em `chamado.js` e `grupos.js`) por um
  componente com o visual do sistema — título, mensagem, botões
  Cancelar/Confirmar (o de confirmar usa a variante "perigo" quando a ação
  é destrutiva). Interface: uma função assíncrona reutilizável (algo como
  `confirmarAcao(titulo, mensagem) -> Promise<boolean>`) que todo código
  que hoje chama `confirm(...)` passa a chamar no lugar — decisão de onde
  colocar essa função (`ui.js` ou um módulo novo) fica para o plano.
- **Mensagens inline**: 3 variantes — erro (vermelho), aviso (dourado),
  sucesso (verde) — todas com uma barra lateral colorida, substituindo o
  parágrafo `.erro` genérico usado hoje. `mostrarErro` (já existe em
  `ui.js`) continua funcionando como está (usada em muitos lugares); a
  variante de aviso/sucesso é uma função nova complementar, não uma
  reescrita da existente.
- **Cards**: container com borda leve + sombra sutil + padding padrão,
  usado para agrupar conteúdo (já aparece informalmente em vários lugares
  como `<div>` com borda inline — vira uma classe `.card` reutilizável).

Organização dos arquivos CSS: `style.css` mantém variáveis/reset/tipografia
/layout da sidebar; um novo `componentes.css` reúne botões, modal, badges,
mensagens e cards — dois arquivos carregados via `<link>` em toda tela
interna, seguindo a mesma separação por responsabilidade que já existe no
JS (`api.js`/`auth.js`/`ui.js`/`crud-ui.js`). Sem bundler/build step, como
já é o padrão do projeto.

## G) Padronização de texto e conteúdo

- **Nomes de coluna/campo**: um glossário fixo em português, Title Case
  curto (ex.: "Status", "Prazo", "Situação"), sem abreviação salvo
  convenção já estabelecida. Nesta fase, auditar as telas existentes e
  corrigir onde o mesmo conceito tem nomes diferentes em telas diferentes.
- **Quebra de linha em tabela**: texto longo trunca com reticências
  (`text-overflow: ellipsis`) + atributo `title` com o texto completo —
  nunca quebra linha dentro de uma célula de tabela (mantém altura de
  linha consistente). Em cards (fora de tabela) pode quebrar até 2 linhas.
- **Botões**: sempre "Ação + complemento" (ex.: "Abrir novo chamado",
  "Salvar nova senha"), só a primeira palavra maiúscula — sem CAPS LOCK
  nem Title Case Em Cada Palavra.
- **Estados vazios**: uma mensagem padrão ("Nenhum registro encontrado" ou
  similar) reaproveitada em toda tabela/lista vazia do sistema, em vez de
  cada tela inventar a própria frase.

## H) Escopo de telas

Recebem o novo layout (sidebar, temas, tipografia, componentes): Meus
Chamados, Novo Chamado, Chamado (detalhe), Cadastros, Fluxos, Grupos de
Permissão, Chamado Geral (`geral.html`).

**Fora desta fase, ficam como estão:** `index.html` (login) e
`trocar-senha.html` — ambas usam o layout split-card já aprovado numa
leva anterior, são telas de pré-/imediatamente-pós-autenticação sem
sidebar (não faz sentido mostrar navegação antes do usuário estar
autenticado), e o tema/fonte/tamanho são preferências por usuário que só
existem depois do login.

## Fora de escopo (ver `docs/PENDENCIAS.md`)

- **PWA** (manifest, service worker, instalável, funcionamento offline) —
  Fase 2 separada, construída em cima deste sistema de design.
- **Editor visual de fluxo, relatórios agregados, integração com outros
  sistemas** — já listados em `docs/PENDENCIAS.md`, sem relação com esta
  fase.
