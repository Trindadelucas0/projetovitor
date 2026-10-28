// Landing pública da ORNY (rota "/" e "/conheca"). É a página que recebe o tráfego pago do Meta,
// então ela segue o visual dos criativos (preto + verde neon #20f51b, Montserrat em caixa alta).
//
// Regras que NÃO podem ser quebradas aqui (marketing/ORNY-CAMPANHA-META-V2/MAPA-REAL-DE-FUNCOES-ORNY.md):
// nada de número de usuários, depoimento, nota, "IA monta seu treino", dieta, resultado garantido
// ou teste grátis. Todo recurso citado abaixo existe no sistema.
//
// O acesso só é liberado após a confirmação do pagamento (api/auth.js exige um plano vendável),
// por isso não há CTA de "começar grátis" em lugar nenhum.
//
// Formato enxuto: hero → números reais → três telas essenciais → como funciona → planos → dúvidas.
// Os números da faixa vêm de GET /api/public/stats (contagem real do catálogo); se a API falhar
// ou vier zero, a faixa simplesmente não aparece — nenhum número é inventado.
import { useEffect, useMemo, useRef, useState } from 'react'
import Brand from '../../components/Brand.jsx'
import Icon from '../../components/Icon.jsx'
import { api } from '../../lib/api.js'
import { useStore } from '../../store/useStore.js'
import { parseEntry, signupHref, rememberEntry } from '../../lib/landingParams.js'
import { PlanGrid, TrialSeal } from '../billing/PlansShowcase.jsx'
import { MkToday, MkRun, MkProgress, MkSignup } from './mockups.jsx'
import './landing.css'

const AUDIENCE = {
  aluno: {
    tab: 'Quero treinar',
    kicker: 'Sistema de treino para alunos',
    h1: ['Pare de treinar', 'no improviso.'],
    lead: 'Veja o treino do dia, registre séries e cargas e acompanhe seu histórico.',
    bullets: ['Treino guiado', 'Cargas e repetições', 'Histórico e progresso'],
  },
}

const NAV = [['telas', 'Por dentro'], ['como-funciona', 'Como funciona'], ['planos', 'Planos'], ['duvidas', 'Dúvidas']]

const PILLARS = [
  ['01', 'clipboard', 'Treino do dia', 'treino-do-dia'],
  ['02', 'timer', 'Execução guiada', 'execucao'],
  ['03', 'chart', 'Progresso real', 'progresso'],
]

// Três decisões essenciais; detalhes ficam no próprio produto.
const DEEP = [
  ['treino-do-dia', 'Treino do dia', 'Abra e saiba o que fazer',
    'Seu treino aparece na ordem, com séries, repetições e a carga anterior.',
    ['Exercícios na ordem', 'Séries e cargas à mão', 'Próximo treino indicado'], MkToday, false],
  ['execucao', 'Execução', 'Uma série por vez',
    'O app mostra a próxima ação e registra cada série sem tirar o foco do treino.',
    ['Cronômetro de série e descanso', 'Carga e repetições por série', 'Retomada de onde parou'], MkRun, true],
  ['progresso', 'Progresso', 'Veja o que realmente mudou',
    'Frequência, volume e histórico são calculados a partir do que você registrou.',
    ['Resumo semanal', 'Comparação por período', 'Histórico completo'], MkProgress, false],
]

const STEPS = [
  ['01', 'Crie a sua conta', 'Seus dados de acesso, data de nascimento e contato.'],
  ['02', 'Escolha o seu plano', 'Básico mensal ou Completo por 3 meses, com o valor na tela e a revisão antes de confirmar.'],
  ['03', 'Confirme o pagamento e comece', 'O acesso é liberado assim que o pagamento é confirmado. Seu personal recebe você e monta a sua ficha.'],
]

const FAQ_LANDING = [
  ['Preciso instalar alguma coisa?', 'Não. A ORNY funciona no navegador do celular ou do computador. Adicionar à tela inicial é opcional e pode ser feito depois do cadastro.'],
  ['Quem monta o meu treino?', 'O seu personal. Homens são atendidos por um personal e mulheres por uma personal. A ficha vem com os exercícios, as séries, as cargas, os dias da semana e os vídeos de execução, e aparece no seu app.'],
  ['Funciona no computador também?', 'Sim. É a mesma ORNY no navegador do computador, com os mesmos dados: você pode registrar o treino no celular na academia e olhar o progresso no computador depois.'],
  ['Preciso de academia para usar?', 'Não necessariamente. O seu personal monta a ficha para a academia ou para treinar em casa, com pouco ou nenhum equipamento, de acordo com o que você tem disponível.'],
  ['Como funciona a call com o personal?', 'Você escolhe no app um horário livre do seu personal, com pelo menos 12 horas de antecedência, e recebe o link do Zoom. A call dura 15 minutos: 1 por mês no Básico e 1 a cada 15 dias no Completo.'],
  ['O que acontece se eu cancelar?', 'No Básico o acesso continua até o fim do período já pago. O Completo não renova: o acesso acaba na data indicada. Em qualquer caso os seus treinos, histórico e progresso ficam guardados e voltam quando você assinar de novo.'],
  ['Como funcionam as notificações?', 'Você escolhe se quer ativar. A ORNY explica antes de pedir a permissão do aparelho, e isso nunca bloqueia o seu acesso.'],
]

// Vídeo de fundo no hero. Desligado porque o único material disponível hoje é o
// /video/landing-hero.* gerado a partir do login-bg (academia de garagem, luz azul
// virada para verde): ao lado da foto do hero ele fica visivelmente pior e derruba o
// contraste do título. O caminho está pronto — basta trocar para true quando existir
// um b-roll decente (preto/verde, 6-8s, lado esquerdo escuro para o texto respirar).
const HERO_VIDEO = false

// Âncora interna: o app usa HashRouter, então <a href="#secao"> troca a rota e desmonta a landing.
// A correção depois de 650ms não é enfeite: o ScrollTrigger.refresh() que roda quando os planos
// e os números chegam da API reposiciona o scroll e cancela o scroll suave do navegador no meio
// do caminho — quem clica no menu no primeiro segundo parava antes da seção.
const goTo = id => {
  const el = document.getElementById(id)
  if (!el) return
  const go = () => el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  go()
  setTimeout(() => { if (Math.abs(el.getBoundingClientRect().top) > 40) go() }, 650)
}
const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })
const money = c => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function Landing() {
  const root = useRef(null)
  const heroRef = useRef(null)
  const user = useStore(s => s.user)
  const entry = useMemo(() => parseEntry(window.location.search, window.location.hash), [])
  const [plans, setPlans] = useState(null)
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  // Plano único: a landing fala com uma pessoa só, o aluno. Não há mais área de personal
  // para visitante conhecer nem seletor de perfil.
  const aud = 'aluno'
  const sel = AUDIENCE[aud]
  const href = plano => signupHref(entry, { perfil: aud, plano, authed: !!user })

  useEffect(() => { rememberEntry(entry) }, [entry])

  useEffect(() => { api('/api/public/plans').then(setPlans).catch(e => setError(e.message || 'Não foi possível carregar os planos.')) }, [])
  // Falhar aqui não é erro de página: a faixa de números simplesmente não aparece.
  useEffect(() => { api('/api/public/stats').then(setStats).catch(() => setStats(null)) }, [])

  // Números da faixa: só o que é verdade e verificável. Os dois primeiros vêm do banco.
  const facts = useMemo(() => [
    // sem "+": a contagem e exata, e "63+" seria falso
    stats?.exercises > 0 && [stats.exercises, '', 'exercícios no catálogo'],
    [15, ' min', 'de call no Zoom com o seu personal'],
    [2, '', 'planos: Básico mensal ou Completo de 3 meses'],
  ].filter(Boolean), [stats])

  // Destaque do Completo. O selo é fixo porque o Completo não é o plano mais barato: ele é o
  // mais perto (ficha e call a cada 15 dias, avaliação postural). A equivalência mensal é
  // calculada do price_cents que a API devolveu — sem preço, a linha não aparece.
  const highlight = useMemo(() => {
    const com = (plans?.plans || []).find(p => p.id === 'completo')?.price_cents
    if (!(com > 0)) return {}
    return { badge: 'Acompanhamento mais perto', equiv: 'Equivale a R$ ' + money(Math.round(com / 3)) + '/mês' }
  }, [plans])

  // A landing é preta mesmo quando o visitante usa o tema claro: html/body e a cor da barra
  // do navegador vivem fora deste componente, por isso a marcação vai no <html>.
  useEffect(() => {
    const html = document.documentElement
    const meta = document.querySelector('meta[name="theme-color"]')
    const prev = meta?.getAttribute('content')
    html.setAttribute('data-lp', '1')
    meta?.setAttribute('content', '#000000')
    // O fundo também vai inline com prioridade: no build de produção o minificador junta a
    // regra de tema claro em :is(:root[data-theme="light"] body, … body:has(.ag)), e :is()
    // herda a especificidade do argumento mais específico — o :has() faz ela passar por
    // cima de qualquer seletor razoável no CSS. Inline + important não depende disso.
    for (const el of [html, document.body]) el.style.setProperty('background', '#000', 'important')
    return () => {
      html.removeAttribute('data-lp')
      for (const el of [html, document.body]) el.style.removeProperty('background')
      if (prev != null) meta?.setAttribute('content', prev)
    }
  }, [])

  useGsap(root, heroRef, [plans, stats, aud])
  useHeroVideo(heroRef)

  return <main ref={root} className="orny-landing" data-testid="landing">
    <header className="lp-header">
      <div className="lp-shell lp-header-inner">
        <button type="button" className="lp-brand" onClick={toTop} aria-label="Início da página"><Brand /></button>
        <nav aria-label="Seções da página" className="lp-nav">
          {NAV.map(([id, label]) => <button key={id} type="button" onClick={() => goTo(id)}>{label}</button>)}
        </nav>
        <div className="lp-header-cta">
          <a href={user ? '#/hoje' : '#/entrar'} className="lp-btn lp-btn-ghost lp-header-login">{user ? 'Minha conta' : 'Entrar'}</a>
          <a href={href()} className="lp-btn lp-btn-primary lp-header-signup" data-testid="landing-cta-header">Criar minha conta</a>
        </div>
      </div>
    </header>

    <section className="lp-hero" ref={heroRef} data-testid="landing-hero">
      <div className="lp-hero-bg">
        <img src="/landing/hero-orny.webp" alt="" width="1672" height="941" fetchPriority="high" decoding="async" className="lp-hero-still" />
      </div>
      <div className="lp-hero-shade" aria-hidden="true" />
      <div className="lp-shell lp-hero-inner">
        <span className="lp-kicker" data-hero>{sel.kicker}</span>
        <h1 className="lp-h1" data-aud={aud}>
          {sel.h1.map((line, i) => <span className="lp-h1-line" key={line}><span className={i ? 'lp-accent' : ''}>{line}</span></span>)}
        </h1>
        <p className="lp-lead" data-hero>{sel.lead}</p>
        <ul className="lp-bullets" data-hero>
          {sel.bullets.map(b => <li key={b}><span className="lp-dot" aria-hidden="true" />{b}</li>)}
        </ul>
        <div className="lp-actions" data-hero>
          <a href={href()} className="lp-btn lp-btn-primary lp-btn-lg" data-testid="landing-cta-primary">Criar minha conta<Icon name="chevronRight" /></a>
          <button type="button" className="lp-btn lp-btn-ghost lp-btn-lg" onClick={() => goTo('planos')}>Ver os planos</button>
        </div>
        <p className="lp-trust" data-hero>
          <span>Funciona no navegador</span><span>Instalação opcional</span><span>Personal homem para homens, personal mulher para mulheres</span><span>Acesso liberado após a confirmação do pagamento</span>
        </p>
      </div>
    </section>

    {facts.length > 0 && <section className="lp-numbers" aria-label="A ORNY em números" data-testid="landing-numbers">
      <div className="lp-shell lp-numbers-grid">
        {facts.map(([n, suf, label]) => <div key={label} data-reveal className="lp-num">
          <b><span data-count={n}>{n}</span>{suf}</b>
          <span>{label}</span>
        </div>)}
      </div>
    </section>}

    <section className="lp-section" data-testid="landing-pillars">
      <div className="lp-shell">
        <div data-reveal className="lp-head">
          <span className="lp-kicker">O que a ORNY faz hoje</span>
          <h2>Treine sem se perder</h2>
        </div>
        <div className="lp-grid lp-grid-4">
          {PILLARS.map(([n, icon, title, target]) =>
            <article key={n} data-card data-n={n} className="lp-card lp-pillar">
              <span className="lp-card-ico"><Icon name={icon} /></span>
              <h3>{title}</h3>
              <button type="button" className="lp-link" onClick={() => goTo(target)}>Ver a tela<Icon name="chevronRight" /></button>
            </article>)}
        </div>
      </div>
    </section>

    <div id="telas">
      {DEEP.map(([id, kicker, title, copy, items, Mock, flip], i) =>
        <section key={id} id={id} className={'lp-section lp-deep' + (i % 2 ? ' lp-section-alt' : '')} data-testid={'deep-' + id}>
          <div className={'lp-shell lp-deep-inner' + (flip ? ' is-flip' : '')}>
            <div data-reveal className="lp-deep-copy">
              <span className="lp-kicker">{kicker}</span>
              <h2>{title}</h2>
              <p className="lp-copy">{copy}</p>
              <ul className="lp-ticks lp-ticks-lg">{items.map(t => <li key={t}><Icon name="check" />{t}</li>)}</ul>
              <a href={href()} className="lp-btn lp-btn-primary">Criar minha conta<Icon name="chevronRight" /></a>
            </div>
            <div data-reveal className="lp-deep-art"><Mock /></div>
          </div>
        </section>)}
    </div>

    <section id="como-funciona" className="lp-section lp-section-alt">
      <div className="lp-shell lp-how">
        <div data-reveal className="lp-phone"><MkSignup /></div>
        <div>
          <div data-reveal className="lp-head lp-head-left">
            <span className="lp-kicker">Simples desde o primeiro acesso</span>
            <h2>Cadastre. Assine. Comece.</h2>
          </div>
          <div className="lp-steps">
            <span className="lp-steps-rail" aria-hidden="true"><i data-progress-line /></span>
            {STEPS.map(([n, t, c]) =>
              <div key={n} data-reveal className="lp-step">
                <b>{n}</b>
                <div><h3>{t}</h3><p className="lp-copy">{c}</p></div>
              </div>)}
          </div>
        </div>
      </div>
    </section>

    <section id="planos" className="lp-section" data-testid="landing-plans">
      <div className="lp-shell">
        <div data-reveal className="lp-head">
          <span className="lp-kicker">Planos e valores</span>
          <h2>Básico ou Completo</h2>
          <p className="lp-copy">Veja o valor e revise antes de pagar. Homens com um personal, mulheres com uma personal. O acesso começa após a confirmação.</p>
        </div>
        {plans?.test_mode && <p className="lp-status" role="status">Ambiente de teste: os pagamentos desta versão não geram cobrança real.</p>}
        {error ? <p className="lp-error" role="alert">{error}</p>
          : !plans ? <p className="lp-loading">Carregando planos…</p>
            // sem data-reveal: este bloco so existe depois da resposta da API, e o
            // ScrollTrigger.batch so enxerga o que ja estava no DOM quando foi criado
            : <div className="lp-plans">
              <PlanGrid plans={plans.plans} lockAud={aud}
                badge={p => p.id === 'completo' ? highlight.badge : null}
                equiv={p => p.id === 'completo' ? highlight.equiv : null}
                cta={p => !p.purchasable
                  ? <span className="pl-btn" aria-disabled="true" data-testid={'cta-' + p.id}>Em breve</span>
                  : <a className="pl-btn" href={href(p.id)} data-testid={'cta-' + p.id}>{user ? 'Assinar o ' + p.name : 'Começar com o ' + p.name}<Icon name="bolt" /></a>} />
              <TrialSeal />
              <p className="lp-note">Básico: cobrança mensal no cartão de crédito; cancele quando quiser e o acesso continua até o fim do período pago. Completo: pagamento único por 3 meses, em até 4x no cartão, sem renovação automática. Seus dados ficam salvos.</p>
            </div>}
      </div>
    </section>

    <section id="duvidas" className="lp-section" data-testid="landing-faq">
      <div className="lp-shell lp-narrow">
        <div data-reveal className="lp-head">
          <span className="lp-kicker">Dúvidas frequentes</span>
          <h2>Antes de começar</h2>
        </div>
        <div data-reveal className="lp-faq">
          {FAQ_LANDING.map(([q, a]) => <details key={q}><summary>{q}<Icon name="plus" /></summary><p>{a}</p></details>)}
        </div>
      </div>
    </section>

    <section className="lp-final">
      <div data-reveal className="lp-shell lp-final-box">
        <span className="lp-kicker">Seu próximo passo</span>
        <h2>Pare de treinar no improviso.</h2>
        <p className="lp-copy">Crie a sua conta e comece a usar a ORNY hoje.</p>
        <div className="lp-actions">
          <a href={href()} className="lp-btn lp-btn-primary lp-btn-lg">Criar minha conta<Icon name="chevronRight" /></a>
          <a href="#/precos" className="lp-btn lp-btn-ghost lp-btn-lg">Ver os planos</a>
        </div>
      </div>
    </section>

    <footer className="lp-footer" aria-label="Rodapé da ORNY">
      <div className="lp-shell">
        <div className="lp-footer-grid">
          <div className="lp-footer-brand">
            <button type="button" className="lp-footer-logo" onClick={toTop} aria-label="Voltar ao início da página"><Brand /></button>
            <p>Seu progresso começa aqui.</p>
          </div>
          <nav className="lp-footer-group" aria-labelledby="lp-footer-conheca">
            <h2 id="lp-footer-conheca">Conheça</h2>
            {NAV.map(([id, label]) => <button key={id} type="button" onClick={() => goTo(id)}>{label}</button>)}
          </nav>
          <nav className="lp-footer-group" aria-labelledby="lp-footer-acesso">
            <h2 id="lp-footer-acesso">Acesso</h2>
            <a href="#/entrar">Entrar</a>
            <a href={href()}>Criar conta</a>
            <a href="#/precos">Planos e preços</a>
          </nav>
          <nav className="lp-footer-group" aria-labelledby="lp-footer-legal">
            <h2 id="lp-footer-legal">Legal</h2>
            <a href="#/legal/termos">Termos de Uso</a>
            <a href="#/legal/privacidade">Privacidade</a>
            <a href="#/legal/assinatura">Assinatura</a>
          </nav>
        </div>
        <div className="lp-footer-bottom">
          <span>© {new Date().getFullYear()} ORNY</span>
          <span>Todos os direitos reservados.</span>
        </div>
      </div>
    </footer>

    <div className="lp-mobile-cta">
      <a href={href()} className="lp-btn lp-btn-primary">Criar conta e treinar</a>
    </div>
  </main>
}

// ---------- movimento ----------
// Um único contexto GSAP escopado na raiz. gsap.matchMedia separa o que roda com e sem
// prefers-reduced-motion, e uma faixa extra encurta tudo no celular.
function useGsap(root, heroRef, deps) {
  const st = useRef(null)

  useEffect(() => {
    let cancelled = false, ctx, mm
    Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(([g, s]) => {
      if (cancelled) return   // StrictMode: a limpeza roda antes do import resolver
      const gsap = g.default || g.gsap
      const { ScrollTrigger } = s
      gsap.registerPlugin(ScrollTrigger)
      ScrollTrigger.config({ ignoreMobileResize: true })   // a barra de URL do iOS não conta como resize
      st.current = ScrollTrigger

      // gsap.from: o estado inicial e aplicado pelo proprio ScrollTrigger, e so no que
      // ainda nao entrou na tela. Nada depende de CSS para ficar escondido.
      const rise = (t, o) => gsap.from(t, { opacity: 0, ...o.from, ...o.to })

      ctx = gsap.context(() => {
        mm = gsap.matchMedia()

        mm.add({ motion: '(prefers-reduced-motion: no-preference)', small: '(max-width: 760px)' }, c => {
          const { motion, small } = c.conditions
          if (!motion) return

          // A entrada do hero (título, apoio, CTAs) é feita em CSS — ver landing.css.
          // O topo da página não pode ficar invisível esperando este chunk baixar.
          gsap.fromTo('.lp-hero-still', { scale: 1.12 }, { scale: 1, duration: 1.8, ease: 'power2.out' })
          // deriva lenta e contínua: o hero nunca fica parado, sem custo de rede
          gsap.to('.lp-hero-still', { scale: 1.07, xPercent: -1.5, duration: 16, ease: 'sine.inOut', repeat: -1, yoyo: true, delay: 1.8 })
          // o fundo do hero acompanha a rolagem (parallax curto)
          gsap.to('.lp-hero-bg', { yPercent: 12, ease: 'none', scrollTrigger: { trigger: '.lp-hero', start: 'top top', end: 'bottom top', scrub: .5 } })

          // um único batch em vez de um ScrollTrigger por elemento (Android fraco agradece)
          ScrollTrigger.batch('[data-reveal]', {
            start: small ? 'top 92%' : 'top 86%', once: true,
            onEnter: b => rise(b, { from: { y: small ? 20 : 34 }, to: { y: 0, duration: small ? .5 : .7, stagger: .08, ease: 'power3.out', overwrite: true } }),
          })
          ScrollTrigger.batch('[data-card]', {
            start: small ? 'top 94%' : 'top 88%', once: true,
            onEnter: b => rise(b, {
              from: { y: small ? 22 : 44, ...(small ? {} : { rotateX: -8 }) },
              to: { y: 0, rotateX: 0, duration: small ? .5 : .75, stagger: .07, ease: 'power3.out', overwrite: true, ...(small ? {} : { transformPerspective: 800, transformOrigin: 'center top' }) },
            }),
          })
          // contadores da faixa de números: o valor final já está no HTML, então quem não
          // tem animação (ou perde o chunk do GSAP) lê o número certo de qualquer forma.
          for (const el of document.querySelectorAll('.orny-landing [data-count]')) {
            const to = Number(el.dataset.count)
            if (!(to > 0)) continue
            // immediateRender: false e obrigatorio aqui. Com o padrao do fromTo o GSAP
            // escreveria 0 no DOM na criacao do tween e a faixa ficaria em "0" ate o
            // visitante rolar ate ela — quem nao rola (ou perde a animacao) leria zero.
            gsap.fromTo(el, { innerText: 0 }, {
              innerText: to, duration: 1.4, ease: 'power2.out', snap: { innerText: 1 }, immediateRender: false,
              scrollTrigger: { trigger: el, start: 'top 95%', once: true },
            })
          }
          gsap.fromTo('[data-progress-line]', { scaleY: 0 }, {
            scaleY: 1, transformOrigin: 'top', ease: 'none',
            scrollTrigger: { trigger: '.lp-steps', start: 'top 72%', end: 'bottom 70%', scrub: .4 },
          })
        })
        // Com prefers-reduced-motion: reduce nenhuma animação é registrada, e nada esconde
        // os elementos — a página aparece inteira e estática. A força vem do design.
      }, root)
    }).catch(() => { /* sem animação: a página continua legível */ })

    return () => { cancelled = true; mm?.kill(); ctx?.revert(); st.current = null }
  }, [root, heroRef])

  // os planos e os números chegam da API depois dos gatilhos e mudam a altura da página
  useEffect(() => { const id = setTimeout(() => st.current?.refresh(), 120); return () => clearTimeout(id) }, deps)   // eslint-disable-line react-hooks/exhaustive-deps
}

// ---------- vídeo do hero ----------
// A imagem é sempre o elemento de LCP. O vídeo é montado por JS depois do load, só quando a
// conexão e o aparelho aguentam, e entra com fade por cima da imagem (que fica embaixo para sempre).
function useHeroVideo(heroRef) {
  useEffect(() => {
    if (!HERO_VIDEO) return
    const host = heroRef.current?.querySelector('.lp-hero-bg')
    if (!host) return
    const c = navigator.connection || {}
    const ok = !matchMedia('(prefers-reduced-motion: reduce)').matches
      && !c.saveData
      && !/^(slow-2g|2g|3g)$/.test(c.effectiveType || '')
      && (navigator.deviceMemory ?? 4) >= 3
    if (!ok) return

    let v, idle
    const mount = () => {
      v = document.createElement('video')
      v.className = 'lp-hero-video'
      Object.assign(v, { muted: true, loop: true, autoplay: true, playsInline: true, preload: 'none', disableRemotePlayback: true })
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true')
      // mp4 primeiro: nesta codificacao ficou menor que o webm e toca em todo lugar
      for (const [src, type] of [['/video/landing-hero.mp4', 'video/mp4'], ['/video/landing-hero.webm', 'video/webm']]) {
        const s = document.createElement('source'); s.src = src; s.type = type; v.appendChild(s)
      }
      v.addEventListener('playing', () => v.classList.add('on'), { once: true })
      host.appendChild(v)
      v.load()
      v.play().catch(() => { v?.remove(); v = null })   // autoplay recusado: fica só a imagem
    }
    // requestIdleCallback recebe { timeout }, nao um numero: passar 300 direto lanca TypeError
    const ric = window.requestIdleCallback
    const start = () => { idle = ric ? ric(mount, { timeout: 1200 }) : setTimeout(mount, 300) }
    if (document.readyState === 'complete') start()
    else window.addEventListener('load', start, { once: true })

    return () => {
      window.removeEventListener('load', start)
      if (idle) (ric ? window.cancelIdleCallback : clearTimeout)(idle)
      if (v) { v.pause(); v.removeAttribute('src'); v.load(); v.remove() }
    }
  }, [heroRef])
}
