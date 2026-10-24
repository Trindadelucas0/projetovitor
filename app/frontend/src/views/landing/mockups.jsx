// Mockups das telas da ORNY para a landing, desenhados em HTML/CSS (nenhuma imagem, nenhuma lib).
// Cada <Phone> é decoração: vai inteiro com aria-hidden, e a informação que importa fica no
// texto da coluna de copy do bloco (ver Landing.jsx). Isso mantém o axe limpo e evita que um
// leitor de tela leia uma tela falsa como se fosse o app.
//
// Os dados abaixo são ilustrativos de interface — exercícios, cargas e horários de exemplo.
// Nada aqui promete resultado, número de usuário ou recurso que o sistema não tenha.
import './mockups.css'

function Phone({ title, tab, children }) {
  return <div className="mk-phone" aria-hidden="true">
    <div className="mk-screen">
      <div className="mk-status"><span>9:41</span><i className="mk-notch" /><span className="mk-sig"><b /><b /><b /></span></div>
      <div className="mk-top"><span className="mk-logo">ORNY</span><span className="mk-top-t">{title}</span></div>
      <div className="mk-body">{children}</div>
      <div className="mk-tabs">
        {['Hoje', 'Treino', 'Progresso', 'Perfil'].map(t =>
          <span key={t} className={t === tab ? 'on' : ''}><i /><em>{t}</em></span>)}
      </div>
    </div>
  </div>
}

const Row = ({ n, name, set, kg, done }) => <div className={'mk-ex' + (done ? ' is-done' : '')}>
  <span className="mk-ex-n">{done ? '✓' : n}</span>
  <span className="mk-ex-i"><b>{name}</b><em>{set}</em></span>
  <span className="mk-ex-kg">{kg}</span>
</div>

export function MkToday() {
  return <Phone title="Treino do dia" tab="Hoje">
    <div className="mk-hd"><span className="mk-kick">Quarta-feira · Treino B</span><b>Costas e bíceps</b></div>
    <div className="mk-bar"><i style={{ width: '45%' }} /></div>
    <div className="mk-meta"><span>4 de 9 exercícios</span><span>32 min</span></div>
    <div className="mk-list">
      <Row n="1" name="Puxada frente" set="4 × 10" kg="45 kg" done />
      <Row n="2" name="Remada curvada" set="4 × 10" kg="40 kg" done />
      <Row n="3" name="Remada unilateral" set="3 × 12" kg="22 kg" done />
      <Row n="4" name="Pulldown corda" set="3 × 15" kg="25 kg" done />
      <Row n="5" name="Rosca direta" set="4 × 12" kg="14 kg" />
      <Row n="6" name="Rosca martelo" set="3 × 12" kg="12 kg" />
    </div>
    <div className="mk-next"><span>Próximo treino</span><b>Quinta · Treino C — Pernas</b></div>
  </Phone>
}

export function MkRun() {
  return <Phone title="Execução" tab="Treino">
    <div className="mk-hd"><span className="mk-kick">Exercício 5 de 9</span><b>Rosca direta</b></div>
    <div className="mk-timer">
      <span className="mk-timer-k">Descanso</span>
      <strong className="mk-clock">00:47</strong>
      <span className="mk-ring" />
    </div>
    <div className="mk-sets">
      <div className="mk-set is-done"><span>1ª série</span><b>12 × 14 kg</b></div>
      <div className="mk-set is-now"><span>2ª série</span><b>em andamento</b></div>
      <div className="mk-set"><span>3ª série</span><b>12 × 14 kg</b></div>
      <div className="mk-set"><span>4ª série</span><b>12 × 14 kg</b></div>
    </div>
    <div className="mk-fields">
      <div className="mk-field"><span>Carga</span><b>14 kg</b></div>
      <div className="mk-field"><span>Reps</span><b>12</b></div>
    </div>
    <div className="mk-cta">Registrar a série</div>
  </Phone>
}

export function MkProgress() {
  const weeks = [48, 62, 55, 74, 69, 88, 96]
  return <Phone title="Progresso" tab="Progresso">
    <div className="mk-hd"><span className="mk-kick">Últimas 7 semanas</span><b>Volume por semana</b></div>
    <div className="mk-chart">
      {weeks.map((h, i) => <span key={i} className={'mk-col' + (i === weeks.length - 1 ? ' on' : '')} style={{ '--h': h + '%' }} />)}
    </div>
    <div className="mk-chart-x"><span>S1</span><span>S7</span></div>
    <div className="mk-cards">
      <div className="mk-mini"><span>Frequência</span><b>4×<em>/semana</em></b></div>
      <div className="mk-mini"><span>Sequência</span><b>11<em> semanas</em></b></div>
    </div>
    <div className="mk-pr"><span className="mk-pr-k">Recorde pessoal</span><b>Agachamento livre</b><em>80 kg × 8 — hoje</em></div>
  </Phone>
}

export function MkHistory() {
  const items = [
    ['24 out', 'Treino B — Costas e bíceps', '58 min', '4.820 kg'],
    ['22 out', 'Treino A — Peito e tríceps', '52 min', '5.140 kg'],
    ['21 out', 'Treino C — Pernas', '64 min', '7.960 kg'],
    ['19 out', 'Treino B — Costas e bíceps', '55 min', '4.610 kg'],
  ]
  return <Phone title="Histórico" tab="Progresso">
    <div className="mk-hd"><span className="mk-kick">Outubro</span><b>12 treinos concluídos</b></div>
    <div className="mk-week">
      {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) =>
        <span key={i} className={'mk-day' + ([0, 2, 4, 5].includes(i) ? ' on' : '')}>{d}</span>)}
    </div>
    <div className="mk-hist">
      {items.map(([d, t, min, kg]) => <div key={d + t} className="mk-h-item">
        <span className="mk-h-d">{d}</span>
        <span className="mk-h-i"><b>{t}</b><em>{min} · {kg} de volume</em></span>
      </div>)}
    </div>
  </Phone>
}

export function MkPrograms() {
  const list = [
    ['Hipertrofia', 'Intermediário · Academia', '4× por semana'],
    ['Emagrecimento', 'Iniciante · Academia', '3× por semana'],
    ['Treino em casa', 'Iniciante · Sem equipamento', '3× por semana'],
    ['Força', 'Avançado · Academia', '4× por semana'],
  ]
  return <Phone title="Programas" tab="Treino">
    <div className="mk-hd"><span className="mk-kick">Catálogo guiado</span><b>Escolha um caminho</b></div>
    <div className="mk-chips">
      {['Objetivo', 'Nível', 'Local', 'Dias'].map((c, i) => <span key={c} className={'mk-chip' + (i === 0 ? ' on' : '')}>{c}</span>)}
    </div>
    <div className="mk-progs">
      {list.map(([t, s, f]) => <div key={t} className="mk-prog">
        <span className="mk-prog-i"><b>{t}</b><em>{s}</em></span>
        <span className="mk-prog-f">{f}</span>
      </div>)}
    </div>
  </Phone>
}

export function MkCall() {
  return <Phone title="Seu personal" tab="Perfil">
    <div className="mk-hd"><span className="mk-kick">Call de acompanhamento</span><b>15 minutos no Zoom</b></div>
    <div className="mk-slots">
      {[['Qui 26', '08:00'], ['Qui 26', '14:30'], ['Sex 27', '09:00'], ['Sex 27', '18:00']].map(([d, h], i) =>
        <span key={d + h} className={'mk-slot' + (i === 1 ? ' on' : '')}><b>{h}</b><em>{d}</em></span>)}
    </div>
    <div className="mk-cta">Confirmar horário</div>
    <div className="mk-eval">
      <span className="mk-kick">Avaliação postural</span>
      <b>Enviada ao seu personal</b>
      <div className="mk-eval-r"><span>Ombros</span><i><em style={{ width: '72%' }} /></i></div>
      <div className="mk-eval-r"><span>Quadril</span><i><em style={{ width: '58%' }} /></i></div>
      <div className="mk-eval-r"><span>Coluna</span><i><em style={{ width: '81%' }} /></i></div>
    </div>
  </Phone>
}

export function MkSignup() {
  return <Phone title="Começar" tab="Perfil">
    <div className="mk-hd"><span className="mk-kick">Etapa 3 de 3</span><b>Revise e confirme</b></div>
    <div className="mk-steps">
      <div className="mk-st is-done"><span>✓</span><b>Conta criada</b></div>
      <div className="mk-st is-done"><span>✓</span><b>Plano escolhido</b></div>
      <div className="mk-st is-now"><span>3</span><b>Pagamento</b></div>
    </div>
    <div className="mk-sum">
      <div className="mk-sum-r"><span>Plano</span><b>Completo</b></div>
      <div className="mk-sum-r"><span>Período</span><b>3 meses</b></div>
      <div className="mk-sum-r mk-sum-t"><span>Valor</span><b>na tela antes de confirmar</b></div>
    </div>
    <div className="mk-cta">Confirmar pagamento</div>
    <p className="mk-fine">O acesso é liberado quando o pagamento é confirmado.</p>
  </Phone>
}
