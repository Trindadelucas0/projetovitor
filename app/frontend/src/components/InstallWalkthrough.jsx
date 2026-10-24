import { useMemo, useState } from 'react'
import { INSTALL_GUIDE } from './install-guide.js'
import { installTipKind } from '../lib/installTip.js'

const TABS = [
  { id: 'android', label: 'Android', browser: 'Chrome' },
  { id: 'ios', label: 'iPhone', browser: 'Safari' },
]

function ShareIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m0 0L7 8m5-5 5 5M5 13v7h14v-7" /></svg>
}

function StepArtwork({ platform, step }) {
  const android = platform === 'android'
  const showMenu = android && step === 1
  const showInstall = android && step >= 2
  const showShare = !android && step === 1
  const showAdd = !android && step === 2
  const showIosConfirm = !android && step === 3

  return <div className={`iw-phone-art ${android ? 'is-android' : 'is-ios'}`} aria-hidden="true">
    <div className="iw-phone-frame">
      <div className="iw-screen">
        <div className="iw-statusbar"><span>9:41</span><span className="iw-status-icons">● ▮ ▰</span></div>
        <>
          <div className="iw-browser-bar">
            {android ? <span className="iw-browser-back">‹</span> : <span className="iw-browser-aa">aA</span>}
            <span className="iw-url"><span className="iw-lock">●</span> ornygym.avadesk.com.br</span>
            {android ? <span className={`iw-menu-dots ${step === 0 ? 'is-target' : ''}`}>⋮</span> : <span className="iw-browser-tabs">▢</span>}
          </div>
          <div className="iw-site-preview">
            <img src="/landing/telas/app-hoje.webp" alt="" width="624" height="1309" loading="lazy" decoding="async" />
            <div className="iw-site-scrim" />
            <div className="iw-site-brand"><img src="/brand/orny-symbol.png" alt="" /><span>SEU TREINO, NO SEU RITMO</span></div>
          </div>
          {!android && <div className="iw-safari-toolbar"><span>‹</span><span>›</span><span className={step === 0 ? 'is-target' : ''}><ShareIcon /></span><span>▢</span></div>}
          {showMenu && <div className="iw-menu-panel">
            <div className="iw-menu-title">Menu do navegador</div>
            <div className="iw-menu-row">＋ <span>Nova guia</span></div>
            <div className="iw-menu-row">☆ <span>Favoritos</span></div>
            <div className="iw-menu-row iw-menu-choice">⬇ <span>Instalar app<br /><small>ou Instalar e criar atalho</small></span><i>◉</i></div>
            <div className="iw-menu-row">↗ <span>Compartilhar</span></div>
          </div>}
          {showInstall && <div className="iw-dialog-shade"><div className="iw-install-dialog">
            <span className="iw-app-icon"><img src="/icon-192.png" alt="" /></span>
            <b>Instalar ORNY?</b>
            <span>Adicionar à tela inicial</span>
            <div className="iw-dialog-actions"><span>Cancelar</span><strong className={step === 3 ? 'iw-confirm-target' : ''}>Instalar</strong></div>
          </div></div>}
          {showShare && <div className="iw-share-sheet">
            <div className="iw-sheet-grabber" />
            <div className="iw-share-preview"><span className="iw-share-thumb"><img src="/brand/orny-symbol.png" alt="" /></span><span><b>ORNY</b><small>ornygym.avadesk.com.br</small></span></div>
            <div className="iw-share-apps"><span>AirDrop</span><span>Mensagens</span><span>Mail</span></div>
            <div className="iw-share-row">Copiar</div><div className="iw-share-row">Adicionar aos Favoritos</div>
            <div className={`iw-share-row ${showAdd ? 'iw-menu-choice' : ''}`}><ShareIcon /><span>Adicionar à Tela de Início</span>{showAdd && <i>◉</i>}</div>
          </div>}
          {showIosConfirm && <div className="iw-add-screen">
            <div className="iw-add-nav"><span>Cancelar</span><b>Adicionar à Tela de Início</b><strong className="iw-confirm-target">Adicionar</strong></div>
            <span className="iw-add-preview"><img src="/brand/orny-symbol.png" alt="" /></span>
            <b>ORNY</b><span>ornygym.avadesk.com.br</span>
            <div className="iw-add-field">ORNY</div>
          </div>}
        </>
      </div>
    </div>
    {step > 0 && step < 3 && <span className={`iw-tap-indicator iw-tap-${step}`}><i /></span>}
    {step === 3 && <span className={`iw-tap-indicator ${android ? 'iw-tap-confirm-android' : 'iw-tap-3'}`}><i /></span>}
    <span className="iw-art-step">{String(step + 1).padStart(2, '0')} <span>/ 04</span></span>
  </div>
}

export default function InstallWalkthrough() {
  const detected = useMemo(() => installTipKind(), [])
  const initial = detected === 'ios' || detected === 'ios-other' ? 'ios' : 'android'
  const [platform, setPlatform] = useState(initial)
  const [step, setStep] = useState(0)
  const guide = INSTALL_GUIDE[platform]
  const incompatibleIosBrowser = platform === 'ios' && detected === 'ios-other'

  return <div className="iw-wrap" data-testid="install-walkthrough">
    <div className="iw-tabs" role="group" aria-label="Escolha o tipo de celular">
      {TABS.map(tab => <button key={tab.id} type="button" aria-pressed={platform === tab.id} className={`iw-tab ${platform === tab.id ? 'is-active' : ''}`} onClick={() => { setPlatform(tab.id); setStep(0) }}>
        <span className="iw-tab-device" aria-hidden="true">▯</span><span>{tab.label}<small>{tab.browser}</small></span>
      </button>)}
    </div>
    {incompatibleIosBrowser && <p className="iw-browser-note" role="status">Para adicionar à Tela de Início, copie o endereço desta página, abra o Safari e cole o endereço na barra.</p>}
    <div className="iw-demo" aria-live="polite">
      <StepArtwork platform={platform} step={step} />
      <div className="iw-instructions">
        <span className="lp-kicker">PASSO {step + 1} DE {guide.steps.length}</span>
        <h3>{guide.steps[step]}</h3>
        <p>{step === 0
          ? `Abra a ORNY no ${platform === 'android' ? 'Chrome' : 'Safari'} do seu celular.`
          : step === 1 && platform === 'android'
            ? 'Toque nos três pontinhos no alto da tela e procure a opção para instalar.'
            : step === 1
              ? 'Toque no botão Compartilhar, o quadrado com a seta para cima.'
              : step === 2 && platform === 'android'
                ? 'Na janela que abrir, confirme para adicionar a ORNY.'
                : step === 2
                  ? 'Role as opções até encontrar “Adicionar à Tela de Início”.'
                  : 'Pronto. Toque no ícone ORNY que apareceu na tela inicial.'}</p>
        <div className="iw-controls">
          <button type="button" className="iw-arrow" aria-label="Passo anterior" disabled={step === 0} onClick={() => setStep(n => Math.max(0, n - 1))}>←</button>
          <div className="iw-step-dots" role="group" aria-label="Etapas da instalação">
            {guide.steps.map((label, index) => <button key={label} type="button" aria-label={`Passo ${index + 1}: ${label}`} aria-current={step === index ? 'step' : undefined} className={step === index ? 'is-active' : ''} onClick={() => setStep(index)} />)}
          </div>
          <button type="button" className="iw-arrow iw-next" aria-label={step === guide.steps.length - 1 ? 'Voltar ao começo' : 'Próximo passo'} onClick={() => setStep(n => (n + 1) % guide.steps.length)}>{step === guide.steps.length - 1 ? '↻' : '→'}</button>
        </div>
        <div className="iw-step-labels" aria-hidden="true">
          {['Abrir', platform === 'android' ? 'Menu ⋮' : 'Compartilhar', platform === 'android' ? 'Instalar' : 'Adicionar', 'Concluir'].map((label, index) => <span key={label} className={step === index ? 'is-active' : ''}>{label}</span>)}
        </div>
        <p className="iw-disclaimer">As telas são ilustrativas. Os nomes e a posição dos botões podem variar conforme a versão do navegador.</p>
      </div>
    </div>
  </div>
}
