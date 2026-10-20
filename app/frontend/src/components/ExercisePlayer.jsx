// Player do vídeo do personal no exercício. O aluno precisa pausar, voltar, avançar e
// diminuir a velocidade para entender o movimento — por isso os controles são botões
// grandes na própria tela, e não só os controles nativos.
//
// Dois caminhos reais:
//   arquivo  <video> do próprio servidor: playbackRate e currentTime diretos
//   youtube  iframe + YouTube IFrame API: setPlaybackRate / seekTo / pauseVideo
// Um endereço externo (ex.: Instagram) não permite esse controle: mostramos um cartão
// que abre fora do app, dizendo isso, em vez de fingir um player.
import { useCallback, useEffect, useRef, useState } from 'react'
import { parseVideo, SPEEDS, SKIP_SEC } from '../lib/video.js'
import './exercisePlayer.css'

const fmt = s => {
  const n = Math.max(0, Math.floor(s || 0))
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`
}

// A API do YouTube é um script global carregado uma vez por página.
let ytReady = null
function loadYT() {
  if (ytReady) return ytReady
  ytReady = new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT)
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { if (typeof prev === 'function') prev(); resolve(window.YT) }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.async = true
    s.onerror = () => reject(new Error('Não foi possível carregar o player do YouTube'))
    document.head.appendChild(s)
  })
  return ytReady
}

export default function ExercisePlayer({ url, title, caption, onTime }) {
  const v = parseVideo(url)
  if (!v) return null
  if (v.kind === 'externo') return <div className="xp xp-ext" data-testid="ex-player-externo">
    <p className="xp-ext-t"><b>Vídeo do seu personal</b></p>
    <p className="xp-ext-c">Este vídeo abre fora do app e, por isso, não tem os controles de velocidade daqui.</p>
    <a className="xp-btn xp-open" href={v.url} target="_blank" rel="noopener noreferrer">Abrir vídeo</a>
  </div>
  return v.kind === 'youtube'
    ? <YouTubePlayer v={v} title={title} caption={caption} onTime={onTime} />
    : <FilePlayer v={v} title={title} caption={caption} onTime={onTime} />
}

// Controles compartilhados: a mesma barra para arquivo e YouTube.
function Controls({ playing, cur, dur, rate, onToggle, onSkip, onRate, onSeek, testid }) {
  return <div className="xp-ctl" data-testid={testid}>
    <div className="xp-row">
      <button type="button" className="xp-btn" onClick={() => onSkip(-SKIP_SEC)} aria-label={`Voltar ${SKIP_SEC} segundos`} data-testid="xp-back">⏮ {SKIP_SEC}s</button>
      <button type="button" className="xp-btn xp-play" onClick={onToggle} aria-label={playing ? 'Pausar' : 'Reproduzir'} data-testid="xp-play">{playing ? '⏸' : '▶'}</button>
      <button type="button" className="xp-btn" onClick={() => onSkip(SKIP_SEC)} aria-label={`Avançar ${SKIP_SEC} segundos`} data-testid="xp-fwd">{SKIP_SEC}s ⏭</button>
      <span className="xp-time" data-testid="xp-time">{fmt(cur)} / {fmt(dur)}</span>
    </div>
    <div className="xp-row xp-speeds" role="group" aria-label="Velocidade do vídeo">
      <span className="xp-lbl">Velocidade</span>
      {SPEEDS.map(s => <button key={s} type="button" className={'xp-btn xp-sp' + (Math.abs(rate - s) < 0.01 ? ' on' : '')}
        aria-pressed={Math.abs(rate - s) < 0.01} onClick={() => onRate(s)} data-testid={'xp-rate-' + String(s).replace('.', '_')}>
        {String(s).replace('.', ',')}×</button>)}
    </div>
    <input className="xp-seek" type="range" min={0} max={Math.max(1, Math.floor(dur))} step={1} value={Math.min(Math.floor(cur), Math.max(1, Math.floor(dur)))}
      onChange={e => onSeek(+e.target.value)} aria-label="Posição do vídeo" data-testid="xp-seek" />
  </div>
}

function Caption({ caption }) {
  return <p className="xp-cap">{caption || 'Vídeo do seu personal'}</p>
}

function FilePlayer({ v, title, caption, onTime }) {
  const ref = useRef(null)
  const [st, setSt] = useState({ playing: false, cur: 0, dur: 0, rate: 1 })
  const report = useCallback(t => { if (onTime) onTime(Math.floor(t || 0)) }, [onTime])
  useEffect(() => { setSt(s => ({ ...s, playing: false, cur: 0 })) }, [v.url])
  const el = () => ref.current
  const onSkip = d => { const e = el(); if (!e) return; e.currentTime = Math.max(0, Math.min(e.duration || 0, e.currentTime + d)); report(e.currentTime) }
  const onRate = r => { const e = el(); if (!e) return; e.playbackRate = r; setSt(s => ({ ...s, rate: r })) }
  const onSeek = t => { const e = el(); if (!e) return; e.currentTime = t; report(t) }
  const onToggle = () => { const e = el(); if (!e) return; e.paused ? e.play().catch(() => {}) : e.pause() }
  return <div className="xp" data-testid="ex-player">
    <video ref={ref} src={v.url} className="xp-video" playsInline preload="metadata" controls={false} title={title || 'Vídeo do exercício'}
      onLoadedMetadata={e => setSt(s => ({ ...s, dur: e.currentTarget.duration || 0, rate: e.currentTarget.playbackRate }))}
      onTimeUpdate={e => { setSt(s => ({ ...s, cur: e.currentTarget.currentTime })); report(e.currentTarget.currentTime) }}
      onPlay={() => setSt(s => ({ ...s, playing: true }))} onPause={() => setSt(s => ({ ...s, playing: false }))}
      onClick={onToggle} data-testid="xp-file" />
    <Controls {...st} onToggle={onToggle} onSkip={onSkip} onRate={onRate} onSeek={onSeek} testid="xp-controls" />
    <Caption caption={caption} />
  </div>
}

function YouTubePlayer({ v, title, caption, onTime }) {
  const host = useRef(null), player = useRef(null), timer = useRef(null)
  const [st, setSt] = useState({ playing: false, cur: 0, dur: 0, rate: 1 })
  const [err, setErr] = useState('')
  const report = useCallback(t => { if (onTime) onTime(Math.floor(t || 0)) }, [onTime])
  useEffect(() => {
    let dead = false
    loadYT().then(YT => {
      if (dead || !host.current) return
      player.current = new YT.Player(host.current, {
        videoId: v.id,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1, controls: 0, disablekb: 0 },
        events: {
          onReady: e => { if (!dead) setSt(s => ({ ...s, dur: e.target.getDuration() || 0, rate: e.target.getPlaybackRate() || 1 })) },
          onStateChange: e => { if (!dead) setSt(s => ({ ...s, playing: e.data === YT.PlayerState.PLAYING })) },
          // 2/5/100/101/150: id inválido, não embutível, removido ou privado.
          onError: () => { if (!dead) setErr('Este vídeo não está disponível agora. Avise o seu personal.') },
        },
      })
    }).catch(() => { if (!dead) setErr('Não foi possível carregar o player do vídeo.') })
    return () => { dead = true; try { player.current?.destroy?.() } catch { /* iframe já removido */ } player.current = null }
  }, [v.id])
  // Posição: a API do YouTube não avisa o tempo, então consultamos enquanto toca.
  useEffect(() => {
    clearInterval(timer.current)
    if (!st.playing) return
    timer.current = setInterval(() => {
      const p = player.current; if (!p?.getCurrentTime) return
      const t = p.getCurrentTime() || 0
      setSt(s => ({ ...s, cur: t, dur: p.getDuration?.() || s.dur }))
      report(t)
    }, 500)
    return () => clearInterval(timer.current)
  }, [st.playing, report])
  const p = () => player.current
  const onToggle = () => { const x = p(); if (!x) return; st.playing ? x.pauseVideo() : x.playVideo() }
  const onSkip = d => { const x = p(); if (!x) return; const t = Math.max(0, Math.min(x.getDuration() || 0, (x.getCurrentTime() || 0) + d)); x.seekTo(t, true); setSt(s => ({ ...s, cur: t })); report(t) }
  const onRate = r => { const x = p(); if (!x) return; x.setPlaybackRate(r); setSt(s => ({ ...s, rate: r })) }
  const onSeek = t => { const x = p(); if (!x) return; x.seekTo(t, true); setSt(s => ({ ...s, cur: t })); report(t) }
  if (err) return <div className="xp xp-ext" data-testid="ex-player-erro">
    <p className="xp-ext-t"><b>Vídeo indisponível</b></p>
    <p className="xp-ext-c">{err}</p>
    <a className="xp-btn xp-open" href={v.url} target="_blank" rel="noopener noreferrer">Tentar abrir fora do app</a>
  </div>
  return <div className="xp" data-testid="ex-player">
    <div className="xp-video xp-yt"><div ref={host} title={title || 'Vídeo do exercício'} /></div>
    <Controls {...st} onToggle={onToggle} onSkip={onSkip} onRate={onRate} onSeek={onSeek} testid="xp-controls" />
    <Caption caption={caption} />
  </div>
}
