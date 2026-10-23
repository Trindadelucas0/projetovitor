// Tema do Ant Design derivado das cores atuais do app (orny.css / avadesk.css / v41.css).
// Sem React e sem antd aqui: é testável e não entra no bundle do aluno.
// Regra: NÃO inventar cores. Cada valor abaixo existe hoje no CSS (comentário = origem).
export const PALETTE = {
  dark: {
    bg: '#000', card: '#1e1e1e', card2: '#292929', line: '#ffffff26', // orny.css --ag-bg/--ag-card/--ag-card-2/--ag-line
    txt: '#fff', mut: '#bdbdbd', dim: '#aaa',                           // --ag-txt/--ag-mut/--ag-dim
    warn: '#ffb547', bad: '#ff6b6b',                                     // avadesk.css --ag-warn/--ag-bad
    side: '#0f0f11', drawer: '#111113', hover: '#ffffff08', rowHover: '#ffffff05', mtop: '#0b0b0cf0' // avadesk.css .adm-side/.adm-drawer
  },
  light: {
    bg: '#f5f5f5', card: '#fff', card2: '#eaeaea', line: '#00000030',
    txt: '#171717', mut: '#525252', dim: '#626262',
    warn: '#8a4b00', bad: '#c0262d',                                     // v41.css tema claro
    side: '#fff', drawer: '#fff', hover: '#14160f0a', rowHover: '#14160f0a', mtop: '#f4f5f0f0'
  }
}
// acc = cor de destaque em texto/links; fill = superfície preenchida (botão principal, badge); on = texto sobre fill;
// sel = item ativo do menu (avadesk.css .adm-side button.on / v41.css claro).
export const ACCENT = {
  masculino: {
    dark: { acc: '#20f51b', fill: '#20f51b', fillHover: '#19cb16', on: '#000', selBg: '#20f51b1a', selTxt: '#20f51b' },
    light: { acc: '#176d14', fill: '#20f51b', fillHover: '#19cb16', on: '#11140a', selBg: '#20f51b44', selTxt: '#2f4a00' }
  },
  feminino: {
    dark: { acc: '#ff4fd8', fill: '#ff4fd8', fillHover: '#e13bc4', on: '#000', selBg: '#ff4fd818', selTxt: '#ff4fd8' },
    light: { acc: '#c2186a', fill: '#ff4fd8', fillHover: '#e13bc4', on: '#11140a', selBg: '#ff4fd844', selTxt: '#7a1458' }
  },
  roxo: { dark: { acc: '#a855f7', fill: '#a855f7', fillHover: '#9333ea', on: '#fff', selBg: '#a855f71f', selTxt: '#c084fc' }, light: { acc: '#7e22ce', fill: '#9333ea', fillHover: '#7e22ce', on: '#fff', selBg: '#a855f72b', selTxt: '#6b21a8' } },
  azul: { dark: { acc: '#38bdf8', fill: '#38bdf8', fillHover: '#0ea5e9', on: '#001018', selBg: '#38bdf81f', selTxt: '#7dd3fc' }, light: { acc: '#0369a1', fill: '#0ea5e9', fillHover: '#0284c7', on: '#fff', selBg: '#38bdf82b', selTxt: '#075985' } },
  laranja: { dark: { acc: '#fb923c', fill: '#fb923c', fillHover: '#f97316', on: '#1b0900', selBg: '#fb923c1f', selTxt: '#fdba74' }, light: { acc: '#c2410c', fill: '#f97316', fillHover: '#ea580c', on: '#fff', selBg: '#fb923c2b', selTxt: '#9a3412' } }
}
export const FONT_BODY = "'Inter Variable', Inter, system-ui, sans-serif"
export const FONT_HEAD = "'Montserrat Variable', Montserrat, system-ui, sans-serif"
export const normMode = m => (m === 'light' ? 'light' : 'dark')
export const normPalette = p => ({ rosa: 'feminino', feminino: 'feminino', roxo: 'roxo', azul: 'azul', laranja: 'laranja' }[p] || 'masculino')

// algorithms: { dark, light } vem do antd (injetado para manter este arquivo sem dependência do antd).
export function buildTheme(mode, palette, algorithms = {}) {
  const m = normMode(mode), p = PALETTE[m], a = ACCENT[normPalette(palette)][m], dark = m === 'dark'
  const field = { colorBgContainer: p.card2, activeBorderColor: a.acc, hoverBorderColor: a.acc, activeShadow: 'none' }
  return {
    ...(algorithms[m] ? { algorithm: algorithms[m] } : {}),
    cssVar: { key: 'orny' },
    token: {
      colorPrimary: a.acc, colorInfo: a.acc, colorSuccess: a.acc, colorWarning: p.warn, colorError: p.bad,
      colorLink: a.acc, colorLinkHover: a.acc, colorLinkActive: a.acc,
      colorBgBase: p.bg, colorBgLayout: p.bg, colorBgContainer: p.card, colorBgElevated: dark ? p.card2 : p.card,
      colorBorder: p.line, colorBorderSecondary: p.line, colorSplit: p.line,
      colorTextBase: p.txt, colorText: p.txt, colorTextHeading: p.txt, colorTextSecondary: p.mut, colorTextTertiary: p.dim, colorTextDescription: p.mut,
      colorTextPlaceholder: p.dim, colorIcon: p.mut, colorIconHover: p.txt,
      fontFamily: FONT_BODY, fontSize: 14, borderRadius: 12, borderRadiusLG: 16, borderRadiusSM: 10, borderRadiusXS: 6,
      controlHeight: 40, controlHeightLG: 44, controlHeightSM: 32, controlOutline: a.selBg, wireframe: false,
      motionDurationMid: '0.15s', motionDurationSlow: '0.2s'
    },
    components: {
      Button: { colorPrimary: a.fill, colorPrimaryHover: a.fillHover, colorPrimaryActive: a.fillHover, primaryColor: a.on, fontWeight: 700,
        defaultBg: p.card2, defaultColor: p.txt, defaultBorderColor: p.line, defaultHoverBg: p.card2, defaultHoverColor: p.txt,
        defaultHoverBorderColor: a.acc, defaultActiveBg: p.card2, defaultActiveColor: p.txt, defaultActiveBorderColor: a.acc,
        textHoverBg: p.hover, primaryShadow: 'none', defaultShadow: 'none', dangerShadow: 'none', colorLink: a.acc, colorLinkHover: a.acc },
      Layout: { siderBg: p.side, lightSiderBg: p.side, headerBg: 'transparent', bodyBg: p.bg, headerPadding: 0 },
      Menu: { itemBg: 'transparent', subMenuItemBg: 'transparent', popupBg: p.side, itemColor: p.mut, itemHoverColor: p.txt, itemHoverBg: p.hover,
        itemSelectedBg: a.selBg, itemSelectedColor: a.selTxt, itemActiveBg: a.selBg, itemBorderRadius: 12, itemHeight: 42, itemMarginInline: 0, itemMarginBlock: 2,
        itemPaddingInline: 12, groupTitleColor: p.dim, groupTitleFontSize: 10.5, activeBarBorderWidth: 0, activeBarWidth: 0, iconSize: 16, collapsedIconSize: 16 },
      Table: { headerBg: p.card2, headerColor: p.dim, headerSortActiveBg: p.card2, headerSortHoverBg: p.card2, headerSplitColor: 'transparent',
        bodySortBg: 'transparent', rowHoverBg: p.rowHover, rowSelectedBg: a.selBg, rowSelectedHoverBg: a.selBg, borderColor: p.line, colorBgContainer: p.card,
        cellPaddingBlock: 10, cellPaddingInline: 12, cellFontSize: 14, headerBorderRadius: 14, footerBg: p.card },
      Drawer: { colorBgElevated: p.drawer, footerPaddingBlock: 12 },
      Modal: { contentBg: dark ? p.card : p.card, headerBg: dark ? p.card : p.card },
      Tabs: { itemColor: p.mut, itemHoverColor: p.txt, itemSelectedColor: a.acc, itemActiveColor: a.acc, inkBarColor: a.acc, horizontalMargin: '0 0 16px' },
      Card: { colorBgContainer: p.card, colorBorderSecondary: p.line, headerFontSize: 14, bodyPadding: 16, headerHeight: 46 },
      Breadcrumb: { itemColor: p.dim, lastItemColor: p.mut, linkColor: p.mut, linkHoverColor: a.acc, separatorColor: p.dim, separatorMargin: 6, fontSize: 12 },
      Input: field, InputNumber: field, Select: { ...field, selectorBg: p.card2, optionSelectedBg: a.selBg, optionSelectedColor: p.txt, optionActiveBg: p.hover },
      DatePicker: field, TimePicker: field, Mentions: field,
      Segmented: { itemSelectedBg: a.fill, itemSelectedColor: a.on, trackBg: p.card2, itemColor: p.mut, itemHoverColor: p.txt },
      Switch: { colorPrimary: a.fill, colorPrimaryHover: a.fillHover },
      Badge: { colorError: a.fill, colorTextLightSolid: a.on, textFontWeight: 800 },
      Tag: { defaultBg: dark ? '#ffffff10' : '#14160f10', defaultColor: p.mut },
      Statistic: { contentFontSize: 28, titleFontSize: 12.5 },
      Typography: { titleMarginBottom: 0, titleMarginTop: 0 },
      List: { itemPadding: '10px 0' },
      Empty: { colorTextDescription: p.dim },
      Alert: { withDescriptionPadding: '12px 14px' }
    }
  }
}
// tom do StatusTag → cores (as mesmas do .adm-pill de hoje)
export const STATUS_TONE = { ativo: 'ok', pendente: 'warn', bloqueado: 'bad', em_analise: 'warn', suspenso: 'bad', encerrado: '', aprovada: 'ok', rejeitada: 'bad', aguardando_info: 'warn', cancelada: '', concluida: 'ok', recusada: 'bad', rascunho: 'warn', arquivado: '',
  marcada: 'ok', confirmada: 'ok', realizada: 'ok', cancelada_aluno: '', cancelada_personal: 'bad', faltou: 'warn', aberta: 'warn', respondida: 'ok', ignorada: '' }
export const toneOf = (v, map) => (map && Object.hasOwn(map, v) ? map[v] : Object.hasOwn(STATUS_TONE, v) ? STATUS_TONE[v] : '')
