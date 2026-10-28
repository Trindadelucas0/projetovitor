// Catálogo do aluno: Básico (mensal) e Completo (pagamento único, 3 meses).
// Preço vem SEMPRE do admin (price_cents); sem preço: "Em breve", nunca vazio.
// Usado em #/precos, #/assinatura, cadastro (etapa 3) e Perfil > Meu plano.
import Icon from '../../components/Icon.jsx'
import './plans.css'
import { STUDENT_PLAN_IDS } from '../../lib/plans.js'

export const SELLABLE = STUDENT_PLAN_IDS   // Básico (individual) e Completo
const AUD_OF = { individual: 'aluno', completo: 'aluno' }
const TAG = { individual: 'Mensal', completo: 'Acompanhamento de 3 meses' }
const PITCH = {
  individual: 'Seu personal, uma ficha nova e uma call por mês, e a comunidade.',
  completo: 'Tudo do Básico, com avaliação postural e ficha e call a cada 15 dias.'
}
// Benefícios do aluno: espelham as regras de app/api/plan-rules.js (migração 079).
// Dieta é futura e não aparece aqui. Sorteios só quando houver regulamento.
const BEN = {
  individual: [
    ['clipboard', '1 ficha de treino nova por mês, montada pelo seu personal', 'receber_ficha_profissional'],
    ['clock', '1 call de 15 min por mês no Zoom', null],
    ['users', 'Comunidade no WhatsApp: grupo geral e avisos', null],
    ['star', '7 dias de Close Friends no Instagram por mês', null],
    ['timer', 'Treino guiado com cronômetro de descanso', 'execucao'],
    ['chart', 'Progresso, histórico e recordes pessoais', 'progresso']
  ],
  completo: [
    ['checkCircle', 'Tudo do Básico, e mais:', null],
    ['figureStrength', 'Avaliação postural', 'avaliacao_postural'],
    ['clipboard', 'Ficha de treino nova a cada 15 dias', 'receber_ficha_profissional'],
    ['clock', 'Call de 15 min no Zoom a cada 15 dias', null],
    ['star', 'Close Friends no Instagram durante os 3 meses', null],
    ['users', 'Grupo exclusivo no WhatsApp', null],
    ['play', 'Live semanal com prioridade nas suas perguntas', null],
    ['trophy', 'Participação nos sorteios', null]
  ]
}
const money = c => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function benefitsOf(p) {
  return (BEN[p.id] || []).filter(([, , f]) => !f || p.features?.[f] !== false).map(([icon, t]) => [icon, typeof t === 'function' ? t(p) : t])
}
export function Price({ p }) {
  if (p.price_cents == null || p.price_cents <= 0) return <div className="pl-price pl-soon" data-testid={'price-' + p.id}><span className="pl-soon-pill">Em breve</span><small>Preço sendo definido.</small></div>
  const [int, dec] = money(p.price_cents).split(',')
  const unico = p.renews === false || p.billing_interval === 'unico'
  return <div className="pl-price" data-testid={'price-' + p.id}>
    <span className="pl-cur">R$</span><b>{int}</b><span className="pl-dec">,{dec}</span>
    <span className="pl-per">{unico ? 'pagamento único · 3 meses' : '/mês'}</span>
    {unico && <small className="pl-inst" data-testid={'installments-' + p.id}>ou em até 4x no cartão</small>}
  </div>
}
export function TrialSeal({ compact }) {
  return <div className={'pl-seal' + (compact ? ' pl-seal-c' : '')} data-testid="trial-seal"><Icon name="check" /><span><b>Pagamento confirmado</b> libera seu plano{compact ? '' : ' · cupons válidos aparecem na revisão'}</span></div>
}
export function PlanCard({ p, cta, current, selected, onSelect, compact, badge, equiv }) {
  const Tag = onSelect ? 'button' : 'article'
  return <Tag type={onSelect ? 'button' : undefined} className={'pl-card' + (current ? ' pl-current' : '') + (selected ? ' pl-sel' : '') + (compact ? ' pl-compact' : '') + (badge ? ' pl-hl' : '')}
    onClick={onSelect} aria-pressed={onSelect ? !!selected : undefined} aria-label={onSelect ? `${selected ? 'Plano selecionado' : 'Selecionar plano'}: ${p.name}` : undefined} data-testid={'plan-card-' + p.id}>
    {current && <span className="pl-badge pl-badge-cur">Seu plano</span>}
    {!current && badge && <span className="pl-badge pl-badge-hl">{badge}</span>}
    <span className="pl-tag">{TAG[p.id]}</span>
    <h3 className="pl-name">{p.name}</h3>
    <p className="pl-pitch">{PITCH[p.id] || p.description}</p>
    <Price p={p} />
    {equiv && p.price_cents > 0 && <p className="pl-equiv">{equiv}</p>}
    <ul className="pl-bens">{benefitsOf(p).slice(0, compact ? 4 : 9).map(([i, t]) => <li key={t}><span className="pl-ico"><Icon name={i} /></span>{t}</li>)}</ul>
    {onSelect && <span className={'pl-select' + (selected ? ' is-selected' : '')} data-testid={'select-plan-' + p.id} aria-hidden="true">
      {selected ? '✓ Plano selecionado' : 'Selecionar plano'}
    </span>}
    {cta && <div className="pl-cta">{cta(p)}</div>}
  </Tag>
}
export function PlanGrid({ plans, cta, current = {}, lockAud, badge, equiv }) {
  const list = SELLABLE.map(id => plans.find(p => p.id === id)).filter(Boolean)
  const shown = lockAud ? list.filter(p => AUD_OF[p.id] === lockAud) : list
  return <div className="pl-wrap" data-testid="plan-grid">
    <div className={'pl-grid' + (shown.length === 1 ? ' pl-one' : '')}>
      {shown.map(p => <div key={p.id} className="pl-slot"><PlanCard p={p} cta={cta} badge={badge?.(p)} equiv={equiv?.(p)} current={current[AUD_OF[p.id]] === p.id} /></div>)}
    </div>
  </div>
}
const FAQ = [
  ['Quando o acesso é liberado?', 'Depois que o pagamento do plano for confirmado pelo provedor. Até lá, sua conta e a tela de assinatura continuam disponíveis.'],
  ['Qual a diferença entre Básico e Completo?', 'O Básico (R$ 49,90/mês) inclui, a cada mês, 1 ficha nova, 1 call de 15 min no Zoom, os grupos do WhatsApp e 7 dias de Close Friends. O Completo (R$ 499 por 3 meses, em até 4x) inclui tudo isso e mais: avaliação postural, ficha e call a cada 15 dias, Close Friends nos 3 meses, grupo exclusivo, prioridade na live semanal e participação nos sorteios.'],
  ['Quem vai me atender?', 'Homens são atendidos por um personal e mulheres por uma personal. Você informa o seu perfil no cadastro.'],
  ['Call não usada acumula?', 'Não. Cada período tem a sua call; se não for usada, não passa para o próximo.'],
  ['O que acontece depois dos 3 meses do Completo?', 'Você sai do grupo exclusivo e do Close Friends. Treino, progresso e avaliação nova ficam bloqueados até você contratar o Básico ou o Completo de novo.'],
  ['Cupom libera o acesso?', 'Não. Cupons podem conceder desconto na contratação, mas somente o pagamento confirmado libera o sistema.'],
  ['Posso cancelar o Básico quando quiser?', 'Sim. O cancelamento é feito no app e o acesso continua até o fim do período já pago. O Completo não renova: o acesso acaba na data indicada.'],
  ['O que acontece com meus dados se eu não assinar?', 'Nada se perde: treinos, histórico e progresso ficam guardados e voltam quando você assinar.']
]
export function Faq() {
  return <section className="pl-faq" data-testid="plans-faq"><h2>Perguntas frequentes</h2>
    {FAQ.map(([q, a]) => <details key={q}><summary>{q}<Icon name="plus" /></summary><p>{a}</p></details>)}</section>
}
