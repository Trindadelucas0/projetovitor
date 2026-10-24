// Telas da ORNY na landing: prints reais do app (contas de demonstração, sem dados pessoais),
// dentro da moldura de celular em CSS. Cada print é <img> com alt em pt-BR descrevendo a tela;
// o texto que importa continua na coluna de copy do bloco (ver Landing.jsx).
//
// Arquivos em public/landing/telas/ (WebP 624×1309 = 2× da tela da moldura). Todos ficam abaixo
// da dobra: loading="lazy" + width/height explícitos, para não entrar no LCP nem mexer no layout.
import './mockups.css'

export const SHOT_W = 624, SHOT_H = 1309

function Phone({ src, alt }) {
  return <div className="mk-phone">
    <div className="mk-screen">
      <img src={src} alt={alt} width={SHOT_W} height={SHOT_H} loading="lazy" decoding="async" />
    </div>
  </div>
}

const shot = (file, alt) => function Shot() { return <Phone src={'/landing/telas/' + file} alt={alt} /> }

export const MkToday = shot('app-hoje.webp', 'Tela Início do app ORNY: meta da semana, treino ativo da ficha do personal e botão para escolher o treino do dia')
export const MkRun = shot('app-execucao.webp', 'Tela de execução do treino no app ORNY: cronômetro de descanso entre séries e a próxima série indicada')
export const MkProgress = shot('app-estatisticas.webp', 'Tela Estatísticas detalhadas do app ORNY: treinos, consistência, volume e recordes do período')
export const MkHistory = shot('app-historico.webp', 'Tela Progresso do app ORNY: treinos recentes com data, duração, séries e volume')
export const MkPrograms = shot('app-treinos.webp', 'Tela Treinos do app ORNY: ficha ativa montada pelo personal, com os treinos A, B, C e D da semana')
export const MkCall = shot('app-calls.webp', 'Tela Benefícios do app ORNY: agenda de calls com a personal, com os dias e horários livres')
export const MkSignup = shot('app-cadastro.webp', 'Tela de cadastro do app ORNY: primeira etapa, escolha do perfil')
