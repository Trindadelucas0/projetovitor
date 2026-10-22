// Moldura de assistente (não existia no projeto): cabeçalho com voltar, barra de progresso e contador,
// mais a trilha numerada opcional. O app já tinha quatro assistentes repetindo esse cabeçalho à mão
// (Onboarding, ChallengeWizard, cadastro do Login e o construtor do personal); este componente é o
// primeiro passo para parar de repetir. Os quatro NÃO foram refatorados agora, de propósito: cada um tem
// detalhe visual próprio e mexer neles sairia do escopo da avaliação postural.
import Icon from './Icon.jsx'

export default function WizardShell({
  eyebrow, title, step = 0, total = 1, onBack, onJump, labels = null,
  footer = null, children, testid = 'wizard', className = ''
}) {
  const pos = Math.min(step + 1, total)
  const pct = total ? Math.round(pos / total * 100) : 0
  return (
    <div className={'ag ap-wizard ' + className} data-testid={testid}>
      <div className="g-ob-top">
        {onBack
          ? <button className="g-icbtn" onClick={onBack} aria-label="Voltar" data-testid={testid + '-back'}><Icon name="chevronLeft" /></button>
          : <span style={{ width: 44 }} />}
        <div className="g-bar" role="progressbar" aria-valuenow={pos} aria-valuemin={1} aria-valuemax={total}
          aria-label={`Etapa ${pos} de ${total}`}><i style={{ width: pct + '%' }} /></div>
        <span className="g-dim g-sm" data-testid={testid + '-counter'}>{pos}/{total}</span>
      </div>

      {eyebrow ? <span className="g-eyebrow">{eyebrow}</span> : null}
      {title ? <h1 data-testid={testid + '-title'}>{title}</h1> : null}

      {labels && labels.length > 1 && <ol className="ch-steps" aria-label="Etapas">
        {labels.map((l, i) => (
          <li key={l + i} className={i === step ? 'on' : i < step ? 'ok' : ''}>
            <button onClick={() => onJump && onJump(i)} disabled={!onJump} aria-current={i === step ? 'step' : undefined}
              aria-label={`${i + 1}. ${l}`}>{i + 1}</button>
          </li>
        ))}
      </ol>}

      {children}
      {footer ? <div className="ap-wizard-footer">{footer}</div> : null}
    </div>
  )
}
