# Guia de UI — ORNY (antd 6 + identidade própria)

## 1. Identidade (não negociável)
| | Dark | Light |
|---|---|---|
| Fundo | `#000` | `#f5f5f5` |
| Containers | `#1e1e1e` / `#292929` | `#fff` |
| Acento masculino | `#20f51b` | `#176d14` |
| Acento feminino | `#ff4fd8` | `#c2186a` |

- Fontes: **Inter** (texto) e **Montserrat** (títulos `h1–h3`, eyebrows, KPIs).
- Aluno: mobile-first (Capacitor), dark por padrão, cara premium — não "admin genérico".
- As cores vêm das variáveis `--ag-*` / `--orny-*`; o tema antd (`src/ui/antTheme.js`) é derivado delas. Nunca escreva hex novo em componente.

## 2. Onde está cada coisa
| Arquivo | Para quê |
|---|---|
| `src/ui/AntProvider.jsx` | `ConfigProvider` + `App` + host dos diálogos. Desliga motion com `prefers-reduced-motion`. **Só pode ser importado por telas lazy.** |
| `src/ui/kit.jsx` | Primitivas do **admin** (tabelas, drawers, PageHeader, StatusTag). |
| `src/ui/gkit.jsx` | Primitivas do **app/portal** sobre antd: `Btn`, `In`, `Pass`, `TextArea`, `NumberIn`, `Field`, `Pill`, `Note`, `Sheet`, `Tabs`, `Chips`, `Row`/`Rows`, `Av`, `Empty`, `Load`, `Err`. |
| `src/views/app/kit.jsx` | Kit **só CSS** (sem antd) para as telas que entram no carregamento inicial. |
| `src/ui/gkit.css`, `src/ui/antd.css` | Ajustes de tema; sem `@layer` e sem `StyleProvider`. |

## 3. Regra do bundle (importante)
- O carregamento inicial do aluno **não leva antd** (medido: ~363 kB gz; limite 399,9 + 80 kB).
- Telas estáticas (Login, Início, Treinos, Treinar/Concluído/Workout, TabBars, gates, Landing, Wizard,
  Estatísticas-de-treino/Histórico/Biblioteca, Onboarding, ShareCard) usam **`views/app/kit.jsx`** (CSS).
- Telas com antd são registradas em `App.jsx` com `lazyAnt(() => import(...), 'Export')`, que já envolve em
  `<AntProvider className="gk-app">`. `usePrefetch` baixa os chunks no ocioso depois do login.
- Antes de importar `gkit`/`antd` num arquivo, confira se nenhum módulo estático o importa:
  `node /workspace/entregas/antd/scripts/initial-size.mjs dist` deve continuar sem chunk `antd`.
- Componentes compartilhados entre estático e lazy ficam em arquivo próprio com o kit CSS
  (ex.: `app/CareSheets.jsx`, `postural/AvaliacaoHomeCard.jsx`, `Legal.jsx`→`LegalGate`).

## 4. Padrões de tela
- **Cabeçalho**: `span.g-eyebrow` + `h1`. Voltar = `Btn variant="tertiary"` com "← …".
- **Botões**: 1 primário por tela (`Btn`), o resto `secondary`/`tertiary`; destrutivo = `destructive`.
  Primário de tela cheia em celular (`block` automático no tamanho grande).
- **Listas**: `Rows` + `Row` (ícone, título, sub, extra, chevron). Nada de `<li>` com botão solto.
- **Filtros**: `Chips` (Segmented com rolagem horizontal). **Abas de seção**: `Tabs` (role `tab`).
- **Folhas / formulários secundários**: `Sheet` (Drawer de baixo no celular, lateral no desktop).
- **Avisos**: `Note type="info|warning|error|success"`; erro de carga: `Err` com "Tentar novamente".
- **Carregando / vazio**: `Load` (skeleton) e `Empty` com ícone e uma frase do que fazer.
- **Status**: `Pill tone="ok|warn|bad"`.

## 5. Acessibilidade
- Alvo de toque **≥ 40 px** (botões gkit: 44 px; chips: 40–44 px).
- Foco visível: contorno 3 px no acento.
- `prefers-reduced-motion`: duração `.01ms` (não `none`) para `animationend`/`transitionend` continuarem disparando; antd com `motion:false`.
- Mantenha `aria-label` em botões só-ícone e `role="tab"`/`aria-selected` nas abas.

## 6. Testes
- **Não remova `data-testid`** nem as classes usadas pelos e2e: `.g-tabs`, `.g-filters`, `.g-scrollx`, `.wb-days`,
  `.mg-subtabs`, `.chips` (teste de overflow), `.ag .g-btn` (v4-fase1), `.ag-note-error`.
- `<select>` nativo onde o e2e usa `selectOption`; checkbox/radio/file nativos onde usa `.check()`/`setInputFiles`.
- Em `Chips`/`Tabs` o `data-testid` vai no rótulo (`testid={k => 'f-' + k}`) — o clique funciona igual.

## 7. O que fica fora do antd (de propósito)
Landing, `/treinar`, `/concluido`, `/workout`, player, timer de descanso, mapa muscular 3D, pódio,
PlanGrid/PlanCard e as barras de abas inferiores: só polimento CSS, para não pesar o primeiro carregamento
nem mexer em animação crítica. O modal de checkout (`bl-modal`) também continua próprio: o e2e exige o
botão "Pagar" sempre visível no celular e os ids `checkout-*`.

## Polimento das telas estáticas (sem antd)
- `src/styles/polish.css` (import estático, último em `main.jsx`): escala de espaçamento `--pz-s1..6`, raios `--pz-r-sm/--pz-r/--pz-r-lg` (12/16/20, iguais ao tema antd), sombra `--pz-shadow`, títulos Montserrat, alvos ≥ 40px, anel de foco também em Login/Cadastro/vitrine.
- Carregamento: use `<span className="g-skel g-skel-card|g-skel-line|g-skel-h1|g-skel-btn">` dentro de `aria-busy` + texto `sr-only` "Carregando…". A animação some com `prefers-reduced-motion`.
- Só cores existentes (`--ag-*`). Não alterar markup de PlanGrid/PlanCard — as únicas extensões são as props opcionais `badge` e `equiv` (só a landing passa; sem elas o markup é o de antes).
