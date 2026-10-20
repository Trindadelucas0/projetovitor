// Pagina de planos (redesenho 16/10, feedback do Lucas): cards com preco grande/mes, badge "Mais escolhido" no PRO,
// beneficios com icones, CTA claro, alternancia aluno/personal e FAQ curto.
// Preco vem SEMPRE do admin (price_cents); sem preco: "Em breve", nunca vazio. Usado em #/precos, #/assinatura,
// cadastro (etapa 3) e Perfil > Meu plano.
import { useState } from 'react'
import Icon from '../../components/Icon.jsx'
import './plans.css'

export const SELLABLE = ['individual', 'pro', 'pro_ilimitado']
const AUD_OF = { individual: 'aluno', pro: 'profissional', pro_ilimitado: 'profissional' }
const TAG = { individual: 'Para quem treina', pro: 'Para personal trainers', pro_ilimitado: 'Para personal trainers' }
const PITCH = { individual: 'Seu treino com método, do primeiro dia ao recorde.', pro: 'Prescreva, acompanhe e faça seus alunos evoluírem.', pro_ilimitado: 'Atenda sem limite de alunos, com toda a estrutura profissional.' }
// beneficios reais do produto; `f` = recurso do plano que precisa estar ligado para o item aparecer (null = sempre)
const BEN = {
  individual: [['dumbbell', 'Programas guiados para o seu objetivo', 'programas_guiados'], ['timer', 'Execução guiada com cronômetro de descanso', 'execucao'],
    ['chart', 'Progresso, histórico e recordes pessoais', 'progresso'], ['clipboard', 'Treinos enviados pelo seu personal', 'receber_ficha_profissional'],
    ['trophy', 'Comunidade, desafios e ranking', null], ['heart', 'Treino adaptado a dores e restrições', null]],
  pro: [['users', p => `Até ${p.limits?.alunos_ativos ?? '—'} alunos ativos`, null], ['pencil', 'Construtor de treinos e fichas', 'construtor_treino'],
    ['clipboard', 'Prescrição e acompanhamento dos alunos', 'prescrever'], ['globe', 'Publicação de fichas na biblioteca pública', 'fichas_publicas'],
    ['chat', 'Conversas e ocorrências com cada aluno', null], ['dumbbell', 'Seu próprio treino incluído', null]]
}
BEN.pro_ilimitado = [['users', 'Alunos ativos ilimitados', null], ...BEN.pro.slice(1)]
const money = c => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function benefitsOf(p) {
  return (BEN[p.id] || []).filter(([, , f]) => !f || p.features?.[f] !== false).map(([icon, t]) => [icon, typeof t === 'function' ? t(p) : t])
}
export function Price({ p }) {
  if (p.price_cents == null || p.price_cents <= 0) return <div className="pl-price pl-soon" data-testid={'price-' + p.id}><span className="pl-soon-pill">Em breve</span><small>Preço sendo definido.</small></div>
  const [int, dec] = money(p.price_cents).split(',')
  return <div className="pl-price" data-testid={'price-' + p.id}><span className="pl-cur">R$</span><b>{int}</b><span className="pl-dec">,{dec}</span><span className="pl-per">/mês</span></div>
}
export function TrialSeal({ compact }) {
  return <div className={'pl-seal' + (compact ? ' pl-seal-c' : '')} data-testid="trial-seal"><Icon name="sparkles" /><span><b>Pagamento confirmado</b> libera seu plano{compact ? '' : ' · cupons válidos podem dar desconto na contratação'}</span></div>
}
export function PlanCard({ p, cta, current, selected, onSelect, compact }) {
  const best = p.id === 'pro'
  const Tag = onSelect ? 'button' : 'article'
  return <Tag type={onSelect ? 'button' : undefined} className={'pl-card' + (best ? ' pl-best' : '') + (current ? ' pl-current' : '') + (selected ? ' pl-sel' : '') + (compact ? ' pl-compact' : '')}
    onClick={onSelect} aria-pressed={onSelect ? !!selected : undefined} aria-label={onSelect ? `${selected ? 'Plano selecionado' : 'Selecionar plano'}: ${p.name}` : undefined} data-testid={'plan-card-' + p.id}>
    {best && <span className="pl-badge" data-testid="badge-best">Mais escolhido</span>}
    {current && <span className="pl-badge pl-badge-cur">Seu plano</span>}
    <span className="pl-tag">{TAG[p.id]}</span>
    <h3 className="pl-name">{p.name}</h3>
    <p className="pl-pitch">{PITCH[p.id] || p.description}</p>
    <Price p={p} />
    <ul className="pl-bens">{benefitsOf(p).slice(0, compact ? 4 : 9).map(([i, t]) => <li key={t}><span className="pl-ico"><Icon name={i} /></span>{t}</li>)}</ul>
    {onSelect && <span className={'pl-select' + (selected ? ' is-selected' : '')} data-testid={'select-plan-' + p.id} aria-hidden="true">
      {selected ? '✓ Plano selecionado' : 'Selecionar plano'}
    </span>}
    {cta && <div className="pl-cta">{cta(p)}</div>}
  </Tag>
}
export function AudienceToggle({ aud, setAud }) {
  return <div className="pl-toggle" role="tablist" aria-label="Tipo de conta">
    {[['aluno', 'Quero treinar'], ['profissional', 'Sou personal']].map(([k, t]) => <button key={k} role="tab" aria-selected={aud === k} className={aud === k ? 'on' : ''} onClick={() => setAud(k)} data-testid={'aud-' + k}>{t}</button>)}
  </div>
}
// grade: os dois planos; a alternancia destaca e ordena o plano do perfil escolhido (no celular ele vem primeiro)
export function PlanGrid({ plans, cta, current = {}, initialAud = 'aluno', lockAud }) {
  const [aud, setAud] = useState(initialAud)
  const list = SELLABLE.map(id => plans.find(p => p.id === id)).filter(Boolean)
  const shown = lockAud ? list.filter(p => AUD_OF[p.id] === lockAud) : [...list].sort((a, b) => (AUD_OF[b.id] === aud) - (AUD_OF[a.id] === aud))
  return <div className="pl-wrap" data-testid="plan-grid">
    {!lockAud && <AudienceToggle aud={aud} setAud={setAud} />}
    <div className={'pl-grid' + (shown.length === 1 ? ' pl-one' : '')}>
      {shown.map(p => <div key={p.id} className={'pl-slot' + (!lockAud && AUD_OF[p.id] !== aud ? ' pl-dim' : '')}><PlanCard p={p} cta={cta} current={current[AUD_OF[p.id]] === p.id} /></div>)}
    </div>
  </div>
}
const FAQ = [
  ['Quando o acesso é liberado?', 'Depois que o pagamento do plano for confirmado pelo provedor. Até lá, sua conta e a tela de assinatura continuam disponíveis.'],
  ['Cupom libera o acesso?', 'Não. Cupons podem conceder desconto na contratação, mas somente o pagamento confirmado libera o sistema.'],
  ['Posso cancelar quando quiser?', 'Sim. O cancelamento é feito no app e o acesso continua até o fim do período já pago.'],
  ['O que acontece com meus dados se eu não assinar?', 'Nada se perde: treinos, histórico e progresso ficam guardados e voltam quando você assinar.'],
  ['Sou aluno de um personal PRO. Preciso pagar?', 'Não para os treinos dele: o plano PRO do seu personal cobre as fichas e os programas que ele libera para você.']
]
export function Faq() {
  return <section className="pl-faq" data-testid="plans-faq"><h2>Perguntas frequentes</h2>
    {FAQ.map(([q, a]) => <details key={q}><summary>{q}<Icon name="plus" /></summary><p>{a}</p></details>)}</section>
}
