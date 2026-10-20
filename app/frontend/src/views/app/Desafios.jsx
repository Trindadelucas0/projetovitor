// V5 · Desafios: Explorar, Participando, Criados por mim, Convites, Histórico, Criar (assistente de 5 etapas que mantém o estado).
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CH, TR, TYPE_PT, METRIC_PT, STATUS_PT, AUD_PT, MEM_PT, spDate, spInput, spEnd, toYmd, addDays } from '../../lib/challenges.js'
import { GR } from '../../lib/groups.js'
import { useStore } from '../../store/useStore.js'
import { ChFeed, ChProofs, ReportBtn } from './DesafioFeed.jsx'
import { ChRanking } from './DesafioRanking.jsx'
import { TrophyPick, ChPrizes } from './Trofeus.jsx'
import { Sheet, Av, Empty, Load, Tabs, useLoad, Err, Field } from './kit.jsx'

const VIEWS = [['explorar', 'Explorar'], ['participando', 'Participando'], ['criados', 'Criados por mim'], ['convites', 'Convites'], ['historico', 'Histórico']]
export function Desafios() {
  const nav = useNavigate(), [view, setView] = useState('explorar'), [f, setF] = useState({ q: '', official: '', public: '', dur: '', team: '' }), [page, setPage] = useState(0)
  const [d, err, reload] = useLoad(() => CH.list({ view, page, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }), [view, page, f.q, f.official, f.public, f.dur, f.team])
  const chip = (k, v, l) => <button className={'g-chipbtn' + (f[k] === v ? ' on' : '')} aria-pressed={f[k] === v} onClick={() => { setF({ ...f, [k]: f[k] === v ? '' : v }); setPage(0) }}>{l}</button>
  return <div data-testid="desafios">
    <div className="g-row" style={{ gap: 8, flexWrap: 'wrap' }}><Tabs cur={view} set={v => { setView(v); setPage(0) }} tabs={VIEWS} /></div>
    <button className="g-btn" style={{ marginTop: 8 }} onClick={() => nav('/desafios/criar')} data-testid="ch-new">+ Criar desafio</button>
    {view === 'explorar' && <><input className="g-in" style={{ marginTop: 8 }} placeholder="Buscar desafios" value={f.q} onChange={e => { setF({ ...f, q: e.target.value }); setPage(0) }} data-testid="ch-q" />
      <div className="g-row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{chip('official', '1', 'Oficiais')}{chip('public', '1', 'Públicos')}{chip('dur', 'semana', 'Da semana')}{chip('dur', 'mes', 'Do mês')}{chip('team', '1', 'Equipes')}</div></>}
    {err ? <Err msg={err} retry={reload} /> : !d ? <Load /> : d.challenges.length ? <div className="g-list" style={{ marginTop: 10 }}>{d.challenges.map(c => <ChCard key={c.id} c={c} onClick={() => nav('/desafio/' + c.id)} />)}</div>
      : <Empty icon="trophy">{{ explorar: 'Nenhum desafio aberto agora.', participando: 'Você não participa de desafios.', criados: 'Você ainda não criou desafios.', convites: 'Nenhum convite pendente.', historico: 'Seu histórico aparece aqui.' }[view]}</Empty>}
    {d && (page > 0 || d.challenges.length === 20) && <div className="g-row" style={{ gap: 8, marginTop: 8 }}><button className="g-btn g-ghost g-sm" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button><button className="g-btn g-ghost g-sm" disabled={d.challenges.length < 20} onClick={() => setPage(page + 1)}>Próxima</button></div>}
  </div>
}
const ChCard = ({ c, onClick }) => <button className="g-card ch-card" onClick={onClick} data-testid="ch-item" style={{ textAlign: 'left', width: '100%', marginBottom: 8 }}>
  {c.cover_url && <img src={c.cover_url} alt="" style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 12 }} />}
  <div className="g-row" style={{ gap: 6, flexWrap: 'wrap' }}>{c.official && <span className="ch-pill lime">Oficial</span>}<span className="ch-pill">{STATUS_PT[c.status]}</span>{c.my_status && <span className="ch-pill">{MEM_PT[c.my_status]}</span>}</div>
  <b style={{ display: 'block', marginTop: 4 }}>{c.name}</b>
  <span className="g-mut g-xs">{TYPE_PT[c.type]} · {spDate(c.starts_at)} – {spDate(c.ends_at)} · {c.participants}{c.max_participants ? '/' + c.max_participants : ''} participantes</span></button>

// ---------- assistente ----------
const STEPS = ['Identidade', 'Tipo e duração', 'Público', 'Comprovação', 'Revisão']
const DRAFT_KEY = 'ch-wizard'
export function ChallengeWizard() {
  const nav = useNavigate(), [sp] = useSearchParams(), editId = sp.get('id')
  const today = toYmd(new Date().toISOString()), start0 = addDays(today, 1)
  const [w, setW] = useState(() => { try { const s = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null'); if (s && (s.id || null) === (editId || null)) return s } catch { /* */ } return { id: editId || null, step: 0, name: '', description: '', cover_url: '', category: 'consistencia', type: 'meta_individual', metric: 'sessoes', goal: 12, weekly_goal: 3, planned_sessions: 12, duration: 30, start: start0, end: addDays(start0, 29), immediate: false, audience: 'aberto', group_id: '', max_participants: '', late_entry: false, proof: 'nenhuma', proof_media: [], manual_validation: true, teams: ['Equipe A', 'Equipe B'], team_min: 2, team_max: '', tie_break: 'primeiro_a_atingir', reason: '' } })
  const isAdmin = !!useStore(s => s.user)?.admin
  const [cats] = useLoad(() => CH.cats()), [groups] = useLoad(() => GR.list({ mine: '1' })), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false)
  useEffect(() => { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(w)) }, [w])
  useEffect(() => { if (editId && !w.loaded) Promise.all([CH.get(editId), TR.ofChallenge(editId).catch(() => ({ trophies: [] }))]).then(([r, tr]) => { const c = r.challenge; setW(x => ({ ...x, ...c, cover_url: c.cover_url || '', group_id: c.group_id || '', max_participants: c.max_participants || '', start: toYmd(c.starts_at), end: toYmd(c.ends_at), duration: 0, teams: r.teams.map(t => t.name), status: c.status, trophies: tr.trophies.map(t => t.id), loaded: true })) }).catch(e => setMsg({ bad: true, t: e.message })) }, [editId]) // eslint-disable-line
  const set = (k, v) => setW(x => ({ ...x, [k]: v })), inp = k => e => set(k, e.target.type === 'checkbox' ? e.target.checked : e.target.value)
  const cat = cats?.categories.find(c => c.id === w.category)
  const setDur = n => setW(x => ({ ...x, duration: n, end: n ? addDays(x.start, n - 1) : x.end }))
  const body = () => ({ id: w.id || undefined, official: isAdmin && !!w.official, name: w.name, description: w.description, cover_url: w.cover_url || null, category: w.category, type: w.type, metric: w.type === 'meta_coletiva' ? 'soma_coletiva' : w.metric,
    goal: ['meta_individual', 'meta_coletiva'].includes(w.type) ? w.goal : null, weekly_goal: w.weekly_goal, planned_sessions: w.planned_sessions,
    starts_at: w.immediate ? new Date(Date.now() + 60e3).toISOString() : spInput(w.start), ends_at: spEnd(w.end), audience: w.audience, group_id: w.group_id || null, max_participants: w.max_participants || null, late_entry: w.late_entry,
    proof: w.proof, proof_media: w.proof === 'nenhuma' ? [] : w.proof_media, manual_validation: true, teams: w.type === 'competicao_equipes' ? w.teams.filter(Boolean) : [], team_min: w.team_min, team_max: w.team_max || null, tie_break: w.tie_break, reason: w.reason })
  const save = async publish => {
    setBusy(true); setMsg(null)
    try { const r = await CH.save(body()); const id = r.id || w.id; set('id', id); if (w.trophies) await TR.set(id, w.trophies).catch(() => {}); if (publish) { const p = await CH.publish(id); sessionStorage.removeItem(DRAFT_KEY); nav('/desafio/' + id + '?publicado=' + p.status) } else setMsg({ t: 'Rascunho salvo. Só você vê.' }) }
    catch (e) { setMsg({ bad: true, t: e.problems ? e.problems.join(' · ') : e.message }) } finally { setBusy(false) }
  }
  const published = w.status && w.status !== 'rascunho'
  const S = w.step
  return <div className="ag" data-testid="ch-wizard">
    <span className="g-eyebrow">{editId ? 'Editar desafio' : 'Criar desafio'} · etapa {S + 1} de 5</span>
    <h1>{STEPS[S]}</h1>
    <div className="g-bar" style={{ marginTop: 6 }}><i style={{ width: (S + 1) * 20 + '%' }} /></div>
    <ol className="ch-steps" aria-label="Etapas">{STEPS.map((l, i) => <li key={l} className={i === S ? 'on' : i < S ? 'ok' : ''}><button onClick={() => set('step', i)} aria-current={i === S ? 'step' : undefined}>{i + 1}</button></li>)}</ol>
    {S === 0 && <>
      <Field label="Nome"><input className="g-in" value={w.name} onChange={inp('name')} maxLength={80} data-testid="cw-name" /></Field>
      <Field label="Descrição"><textarea className="g-in" rows={3} value={w.description || ''} onChange={inp('description')} /></Field>
      <Field label="Capa (link https da imagem)"><input className="g-in" value={w.cover_url} onChange={inp('cover_url')} placeholder="https://…" /></Field>
      {isAdmin && !w.id && <label className="g-chk"><input type="checkbox" checked={!!w.official} onChange={inp('official')} data-testid="cw-official" /> Desafio oficial (campanha do ORNY)</label>}
      <Field label="Categoria"><select className="g-in" value={w.category} onChange={inp('category')} data-testid="cw-cat">{(cats?.categories || []).map(c => <option key={c.id} value={c.id}>{c.name_pt}</option>)}</select></Field></>}
    {S === 1 && <>
      <Field label="Tipo"><select className="g-in" value={w.type} onChange={inp('type')} data-testid="cw-type">{Object.entries(TYPE_PT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      {w.type !== 'meta_coletiva' && <Field label="Métrica"><select className="g-in" value={w.metric} onChange={inp('metric')} data-testid="cw-metric">{Object.entries(METRIC_PT).filter(([k]) => k !== 'soma_coletiva').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>}
      {['meta_individual', 'meta_coletiva'].includes(w.type) && <Field label={w.type === 'meta_coletiva' ? 'Meta do grupo (total de sessões)' : 'Meta'}><input className="g-in" inputMode="numeric" value={w.goal || ''} onChange={inp('goal')} data-testid="cw-goal" /></Field>}
      {w.metric === 'semanas_meta' && <Field label="Treinos por semana para cumprir a meta (1–7)"><input className="g-in" inputMode="numeric" value={w.weekly_goal || ''} onChange={inp('weekly_goal')} /></Field>}
      {w.metric === 'consistencia' && <Field label="Sessões previstas no período"><input className="g-in" inputMode="numeric" value={w.planned_sessions || ''} onChange={inp('planned_sessions')} /></Field>}
      <span className="g-mut g-xs">Duração</span>
      <div className="g-row" style={{ gap: 6, flexWrap: 'wrap' }}>{[7, 15, 30, 90].map(n => <button key={n} className={'g-chipbtn' + (w.duration === n ? ' on' : '')} aria-pressed={w.duration === n} onClick={() => setDur(n)} data-testid={'cw-dur-' + n}>{n} dias</button>)}<button className={'g-chipbtn' + (!w.duration ? ' on' : '')} onClick={() => set('duration', 0)}>Personalizado</button></div>
      <label className="g-chk"><input type="checkbox" checked={w.immediate} onChange={inp('immediate')} /> Começar imediatamente após publicar</label>
      <div className="g-row" style={{ gap: 8 }}>{!w.immediate && <Field label="Início (horário de Brasília)"><input className="g-in" type="date" min={today} value={w.start} onChange={e => setW(x => ({ ...x, start: e.target.value, end: x.duration ? addDays(e.target.value, x.duration - 1) : x.end }))} /></Field>}
        <Field label="Fim"><input className="g-in" type="date" value={w.end} onChange={e => setW(x => ({ ...x, end: e.target.value, duration: 0 }))} /></Field></div>
      {cat && <p className="g-mut g-xs">Nesta categoria: de {cat.min_days} a {cat.max_days} dias. O dia final conta: termina às 23:59 (Brasília).</p>}
      {w.type === 'competicao_equipes' && <div className="g-card"><b className="g-sm">Equipes (fixadas antes do início)</b>
        {w.teams.map((t, i) => <div key={i} className="g-row" style={{ gap: 6, marginTop: 6 }}><input className="g-in" value={t} onChange={e => set('teams', w.teams.map((x, k) => k === i ? e.target.value : x))} aria-label={'Equipe ' + (i + 1)} /><button className="g-btn g-ghost g-sm" style={{ width: 'auto', padding: '0 12px' }} onClick={() => set('teams', w.teams.filter((_, k) => k !== i))} aria-label="Remover equipe">✕</button></div>)}
        <button className="g-btn g-ghost g-sm" style={{ marginTop: 6 }} onClick={() => set('teams', [...w.teams, 'Equipe ' + String.fromCharCode(65 + w.teams.length)])}>+ Equipe</button>
        <div className="g-row" style={{ gap: 8 }}><Field label="Mínimo por equipe"><input className="g-in" inputMode="numeric" value={w.team_min || ''} onChange={inp('team_min')} /></Field><Field label="Máximo por equipe"><input className="g-in" inputMode="numeric" value={w.team_max || ''} onChange={inp('team_max')} placeholder="sem limite" /></Field></div>
        <Field label="Desempate"><select className="g-in" value={w.tie_break} onChange={inp('tie_break')}><option value="primeiro_a_atingir">Quem atingiu primeiro</option><option value="mais_dias_distintos">Mais dias distintos</option></select></Field>
        <p className="g-mut g-xs">A pontuação das equipes é proporcional ao número de membros. Ninguém troca de equipe depois do início.</p></div>}
      <p className="g-note g-xs">Conta 1 sessão válida por dia de calendário. Treinar mais não dá vantagem: descanso faz parte.</p></>}
    {S === 2 && <>
      <Field label="Quem pode entrar"><select className="g-in" value={w.audience} onChange={inp('audience')} data-testid="cw-aud">{Object.entries(AUD_PT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Vincular a um grupo (opcional)"><select className="g-in" value={w.group_id} onChange={inp('group_id')}><option value="">Nenhum</option>{(groups?.groups || []).filter(g => ['dono', 'moderador'].includes(g.my_role)).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
      <Field label="Máximo de participantes"><input className="g-in" inputMode="numeric" value={w.max_participants} onChange={inp('max_participants')} placeholder="sem limite" /></Field>
      <label className="g-chk"><input type="checkbox" checked={w.late_entry} onChange={inp('late_entry')} /> Aceitar entrada depois do início</label></>}
    {S === 3 && <>
      <Field label="Comprovação"><select className="g-in" value={w.proof} onChange={inp('proof')} data-testid="cw-proof"><option value="nenhuma">Nenhuma (vale a sessão registrada)</option><option value="opcional">Opcional</option><option value="obrigatoria">Obrigatória</option></select></Field>
      {w.proof !== 'nenhuma' && <><div className="g-row" style={{ gap: 12 }}>{['foto', 'video'].map(m => <label key={m} className="g-chk"><input type="checkbox" checked={w.proof_media.includes(m)} onChange={e => set('proof_media', e.target.checked ? [...w.proof_media, m] : w.proof_media.filter(x => x !== m))} data-testid={'cw-pm-' + m} /> {m === 'foto' ? 'Foto' : 'Vídeo'}</label>)}</div>
        <p className="g-mut g-xs">Toda comprovação é revisada por uma pessoa (moderador ou admin). Ninguém aprova a própria. Pendente não conta.</p></>}
      <TrophyPick value={w.trophies || []} onChange={v => set('trophies', v)} />
      <p className="g-mut g-xs">Prêmios oficiais são configurados pelo admin no painel.</p></>}
    {S === 4 && <div className="g-card" data-testid="cw-review">
      <b>{w.name || 'Sem nome'}</b><p className="g-mut g-sm">{w.description}</p>
      <p className="g-sm">{TYPE_PT[w.type]} · {METRIC_PT[w.type === 'meta_coletiva' ? 'soma_coletiva' : w.metric]}{w.goal && ['meta_individual', 'meta_coletiva'].includes(w.type) ? ' · meta ' + w.goal : ''}</p>
      <p className="g-sm">{w.immediate ? 'Começa ao publicar' : 'De ' + w.start.split('-').reverse().join('/')} até {w.end.split('-').reverse().join('/')} (inclusive, até 23:59 de Brasília)</p>
      <p className="g-sm">{AUD_PT[w.audience]}{w.max_participants ? ' · até ' + w.max_participants : ''}{w.late_entry ? ' · aceita entrada tardia' : ''} · comprovação {w.proof}</p>
      <p className="g-mut g-xs">Ao publicar, as regras ficam registradas (versão 1). Mudanças depois exigem justificativa e criam nova versão; após o início, a pontuação fica congelada.</p>
      {published && <Field label="Motivo da alteração (obrigatório)"><input className="g-in" value={w.reason} onChange={inp('reason')} data-testid="cw-reason" /></Field>}
    </div>}
    {msg && <p className={msg.bad ? 'g-warn' : 'g-note'} role={msg.bad ? 'alert' : 'status'} data-testid="cw-msg">{msg.t}</p>}
    <div className="g-row" style={{ gap: 8, marginTop: 12 }}>
      <button className="g-btn g-ghost" onClick={() => S ? set('step', S - 1) : nav(-1)}>{S ? 'Voltar' : 'Cancelar'}</button>
      {S < 4 ? <button className="g-btn" onClick={() => set('step', S + 1)} data-testid="cw-next">Continuar</button>
        : <>{!published && <button className="g-btn g-ghost" disabled={busy} onClick={() => save(false)} data-testid="cw-draft">Salvar rascunho</button>}
          <button className="g-btn" disabled={busy} onClick={() => published ? save(false) : save(true)} data-testid="cw-publish">{published ? 'Salvar alterações' : 'Publicar'}</button></>}
    </div>
  </div>
}

// ---------- página do desafio ----------
export function ChallengePage() {
  const { id } = useParams(), [sp] = useSearchParams(), nav = useNavigate(), code = sp.get('convite')
  const [d, err, reload] = useLoad(() => CH.get(id), [id]), [tab, setTab] = useState(sp.get('aba') || 'resumo'), [msg, setMsg] = useState(''), [dlg, setDlg] = useState(null), [team, setTeam] = useState('')
  useEffect(() => { const a = sp.get('aba'); if (a) setTab(a) }, [sp])
  const act = fn => async (...a) => { setMsg(''); try { await fn(...a); reload() } catch (e) { setMsg(e.problems ? e.problems.join(' · ') : e.message) } }
  if (err) return <div className="ag"><Err msg={err} />{code && <button className="g-btn" onClick={act(() => CH.join(id, { code }))}>Entrar com o convite</button>}</div>
  if (!d) return <div className="ag"><Load /></div>
  const c = d.challenge, me = d.me, inIt = me && ['ativo', 'aprovado'].includes(me.status), open = ['inscricoes_abertas', 'em_andamento'].includes(c.status)
  const canFeed = d.manage || inIt || c.audience !== 'convite'
  const tabs = [['resumo', inIt ? 'Meu progresso' : 'Resumo'], ['regras', 'Regras'], ...(canFeed && c.status !== 'rascunho' ? [['feed', 'Feed']] : []), ...(c.status !== 'rascunho' && (canFeed || inIt) ? [['ranking', ['competicao_individual', 'competicao_equipes'].includes(c.type) ? 'Classificação' : 'Progresso']] : []), ...(c.proof !== 'nenhuma' && (inIt || d.manage) && c.status !== 'rascunho' ? [['comprovantes', 'Comprovantes']] : []), ['pessoas', c.type === 'competicao_equipes' ? 'Equipes' : 'Participantes'], ...(d.manage ? [['gestao', 'Gestão']] : [])]
  return <div className="ag" data-testid="desafio">
    {c.cover_url && <img src={c.cover_url} alt="" style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 16 }} />}
    <div className="g-row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{c.official && <span className="ch-pill lime">Oficial</span>}<span className="ch-pill" data-testid="ch-status">{STATUS_PT[c.status]}</span><span className="ch-pill">{AUD_PT[c.audience]}</span></div>
    <h1>{c.name}</h1>
    <p className="g-mut g-sm">{TYPE_PT[c.type]} · {spDate(c.starts_at)} – {spDate(c.ends_at)} · {d.count} participantes{c.creator ? ' · por ' + c.creator : ''}</p>
    {sp.get('publicado') && <p className="g-note" role="status">Desafio publicado: {STATUS_PT[sp.get('publicado')]}.</p>}
    {c.status_reason && ['suspenso', 'cancelado'].includes(c.status) && <p className="g-warn">{c.status_reason}</p>}
    {msg && <p className="g-warn" role="alert">{msg}</p>}
    {!inIt && open && me?.status !== 'solicitado' && !['removido', 'desclassificado'].includes(me?.status) && <>
      {c.type === 'competicao_equipes' && <Field label="Escolha sua equipe"><select className="g-in" value={team} onChange={e => setTeam(e.target.value)} data-testid="ch-team">{[<option key="" value="">Escolha…</option>, ...d.teams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.size})</option>)]}</select></Field>}
      <button className="g-btn" onClick={act(() => CH.join(id, { code: code || undefined, team_id: team || undefined }))} data-testid="ch-join">{me?.status === 'convidado' ? 'Aceitar convite' : c.audience === 'aprovacao' && !code ? 'Pedir para participar' : 'Participar'}</button>
      {me?.status === 'convidado' && <button className="g-btn g-ghost" style={{ marginTop: 6 }} onClick={act(() => CH.leave(id))}>Recusar convite</button>}</>}
    {me?.status === 'solicitado' && <p className="g-note">Pedido enviado ao organizador.</p>}
    {me && ['removido', 'desclassificado', 'rejeitado'].includes(me.status) && <p className="g-warn">Situação: {MEM_PT[me.status]}</p>}
    <Tabs cur={tab} set={setTab} tabs={tabs} />
    {tab === 'ranking' && <><ChRanking c={c} inIt={inIt} /><ChPrizes c={c} /></>}
    {tab === 'feed' && <ChFeed c={c} setDlg={setDlg} />}
    {tab === 'comprovantes' && <ChProofs c={c} me={me} setDlg={setDlg} />}
    {tab === 'resumo' && <div className="g-card"><p className="g-sm" style={{ whiteSpace: 'pre-wrap' }}>{c.description || 'Sem descrição.'}</p>
      <p className="g-sm"><b>Métrica:</b> {METRIC_PT[c.metric]}{c.goal ? ' · meta ' + (+c.goal) : ''}</p>
      {inIt && <><label className="g-chk"><input type="checkbox" checked={!!me.ranking_optout} onChange={e => act(() => CH.optout(id, e.target.checked))()} data-testid="ch-optout" /> Não mostrar meu nome e foto no ranking</label>
        <button className="g-btn g-ghost g-sm" onClick={() => setDlg({ t: 'Sair do desafio', x: 'Seu progresso deixa de contar.', ok: act(() => CH.leave(id)) })} data-testid="ch-leave">Sair do desafio</button></>}
      {!d.manage && <div style={{ marginTop: 8 }}><ReportBtn type="challenge" id={c.id} setDlg={setDlg} /></div>}</div>}
    {tab === 'pessoas' && (c.type === 'competicao_equipes'
      ? <div className="g-card g-list">{d.teams.map(t => <div key={t.id} className="g-li"><b style={{ flex: 1 }}>{t.name}</b><span className="g-mut g-xs">{t.size} membros</span></div>)}</div>
      : <div className="g-card g-list">{d.members.length ? d.members.map(m => <div key={m.user_id} className="g-li"><Av name={m.name} url={m.photo} size={36} /><b className="g-sm" style={{ flex: 1 }}>{m.name}</b>
        {d.manage && <button className="g-btn g-ghost g-sm" style={{ width: 'auto', padding: '0 10px' }} onClick={() => setDlg({ t: 'Remover participante', x: 'Informe o motivo (fica na auditoria).', input: true, ok: r => act(() => CH.remove({ id, user_id: m.user_id, reason: r }))() })}>Remover</button>}</div>) : <Empty>Sem participantes visíveis.</Empty>}</div>)}
    {tab === 'regras' && <div className="g-card"><b className="g-sm">Regras</b>{d.versions.length ? d.versions.map(v => <div key={v.version} style={{ marginBottom: 8 }}><b className="g-sm">Versão {v.version}</b> <span className="g-mut g-xs">{new Date(v.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}{v.reason ? ' · ' + v.reason : ''}</span>
      <p className="g-mut g-xs">{METRIC_PT[v.rules.metric]}{v.rules.goal ? ' · meta ' + v.rules.goal : ''} · {spDate(v.rules.starts_at)}–{spDate(v.rules.ends_at)} · comprovação {v.rules.proof}{v.rules.late_entry ? ' · entrada tardia' : ''}</p></div>) : <p className="g-mut g-sm">As regras são registradas ao publicar.</p>}</div>}
    {tab === 'gestao' && <div className="g-card" data-testid="ch-creator-overview"><b className="g-sm">Visão geral</b>
      <div className="g-row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}><span className="ch-pill">{d.count} participantes</span><span className="ch-pill">{(d.pending || []).length} pedidos</span><span className="ch-pill">{(d.invites || []).length} convites</span><span className="ch-pill">Regras v{c.rules_version || 0}</span></div>
      <div className="g-row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{tabs.filter(([k]) => ['feed', 'comprovantes', 'ranking', 'pessoas'].includes(k)).map(([k, l]) => <button key={k} className="g-btn g-ghost g-sm" style={{ width: 'auto', padding: '0 10px' }} onClick={() => setTab(k)}>{l}</button>)}</div></div>}
    {tab === 'gestao' && <div className="g-card" data-testid="ch-manage">
      <div className="g-row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {!['concluido', 'cancelado', 'apurando'].includes(c.status) && <button className="g-btn g-ghost g-sm" style={{ width: 'auto', padding: '0 12px' }} onClick={() => nav('/desafios/criar?id=' + id)} data-testid="ch-edit">Editar</button>}
        {c.status === 'rascunho' && <button className="g-btn g-sm" style={{ width: 'auto', padding: '0 12px' }} onClick={act(async () => { await CH.publish(id) })} data-testid="ch-publish">Publicar</button>}
        {c.status === 'inscricoes_abertas' && <button className="g-btn g-ghost g-sm" style={{ width: 'auto', padding: '0 12px' }} onClick={act(() => CH.transition({ id, to: 'agendado' }))}>Encerrar inscrições</button>}
        {c.status === 'apurando' && <button className="g-btn g-sm" style={{ width: 'auto', padding: '0 12px' }} onClick={act(() => CH.transition({ id, to: 'concluido' }))}>Concluir</button>}
        {!['concluido', 'cancelado', 'apurando'].includes(c.status) && <button className="g-btn g-ghost g-sm" style={{ width: 'auto', padding: '0 12px', color: '#ff8b8b' }} onClick={() => setDlg({ t: 'Cancelar desafio', x: 'Todos os participantes serão avisados. Informe o motivo.', input: true, ok: r => act(() => CH.transition({ id, to: 'cancelado', reason: r }))() })} data-testid="ch-cancel">Cancelar desafio</button>}
      </div>
      <h3 className="g-sm" style={{ marginTop: 12 }}>Pedidos e convites ({d.pending.length})</h3>
      {d.pending.map(p => <div key={p.user_id} className="g-li"><b className="g-sm" style={{ flex: 1 }}>{p.name}</b><span className="g-mut g-xs">{MEM_PT[p.status]}</span>
        {p.status === 'solicitado' && <><button className="g-btn g-sm" style={{ width: 'auto', padding: '0 10px' }} onClick={act(() => CH.decide({ id, user_id: p.user_id, approve: true }))} data-testid="ch-approve">Aprovar</button>
          <button className="g-btn g-ghost g-sm" style={{ width: 'auto', padding: '0 10px' }} onClick={() => setDlg({ t: 'Recusar pedido', x: 'Informe o motivo.', input: true, ok: r => act(() => CH.decide({ id, user_id: p.user_id, approve: false, reason: r }))() })}>Recusar</button></>}</div>)}
      <h3 className="g-sm" style={{ marginTop: 12 }}>Convites por código</h3>
      <button className="g-btn g-ghost g-sm" onClick={act(() => CH.invite(id, { expires_days: 7 }))} data-testid="ch-invite">Gerar convite (7 dias)</button>
      {d.invites.map(i => <div key={i.id} className="g-li"><b className="g-sm" style={{ flex: 1, fontFamily: 'monospace' }}>{i.code}</b><span className="g-mut g-xs">{i.revoked_at ? 'revogado' : `${i.uses}${i.max_uses ? '/' + i.max_uses : ''} usos`}</span>
        {!i.revoked_at && <button className="g-btn g-ghost g-sm" style={{ width: 'auto', padding: '0 10px' }} onClick={act(() => CH.revoke(id, i.id))}>Revogar</button>}</div>)}
      <h3 className="g-sm" style={{ marginTop: 12 }}>Histórico</h3>
      {d.history.map((h, i) => <p key={i} className="g-mut g-xs">{new Date(h.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · {STATUS_PT[h.from_status] || '—'} → {STATUS_PT[h.to_status]}{h.reason ? ' · ' + h.reason : ''}</p>)}
    </div>}
    {dlg && <ChDialog d={dlg} close={() => setDlg(null)} />}
    <button className="g-btn g-ghost g-sm" style={{ marginTop: 16 }} onClick={() => nav('/comunidade?tab=desafios')}>← Desafios</button>
  </div>
}
export function ChDialog({ d, close }) {
  const [v, setV] = useState('')
  return <Sheet title={d.t} onClose={close}><p className="g-sm">{d.x}</p>{d.input && <input className="g-in" value={v} onChange={e => setV(e.target.value)} placeholder="Motivo" autoFocus data-testid="chdlg-in" />}
    <div className="g-row" style={{ gap: 8, marginTop: 12 }}><button className="g-btn g-ghost" onClick={close}>Voltar</button><button className="g-btn" disabled={d.input && v.trim().length < 5} onClick={() => { d.ok(v); close() }} data-testid="chdlg-ok">Confirmar</button></div></Sheet>
}
