// Componentes do módulo renderizados para markup (a suíte roda sem DOM, como em PlansShowcase.test.jsx).
// Verifica o contrato de acessibilidade e as regras que o aluno percebe na tela — em especial que nada é
// apresentado como enviado antes da confirmação do servidor, e que o botão de demonstração só existe
// quando o protocolo tem mídia.
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import WizardShell from '../../components/WizardShell.jsx'
import StepCard from './StepCard.jsx'

const step = (extra = {}) => ({
  id: 'abc', code: 'frontal', position: 1, title: 'Frontal', capture_kind: 'foto',
  camera_position: 'frontal', instructions: ['Tronco ereto.', 'Braços relaxados.'], cautions: [],
  required: true, allow_skip: true, allow_question: true, has_reference: false, has_demo: false, ...extra
})
const render = el => renderToStaticMarkup(el)

describe('moldura do assistente', () => {
  it('anuncia a posição com barra de progresso acessível', () => {
    const html = render(<WizardShell title="Preparo" step={2} total={22} />)
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-valuenow="3"')
    expect(html).toContain('aria-valuemax="22"')
    expect(html).toContain('aria-label="Etapa 3 de 22"')
    expect(html).toContain('3/22')
  })

  it('o total vem da chamada, não de constante no código', () => {
    expect(render(<WizardShell title="x" step={0} total={5} />)).toContain('1/5')
    expect(render(<WizardShell title="x" step={0} total={23} />)).toContain('1/23')
  })

  it('a trilha numerada marca a etapa atual para leitor de tela', () => {
    const html = render(<WizardShell title="x" step={1} total={3} labels={['A', 'B', 'C']} onJump={() => {}} />)
    expect(html).toContain('aria-current="step"')
    expect(html).toContain('aria-label="2. B"')
  })

  it('sem onBack não desenha botão de voltar', () => {
    expect(render(<WizardShell title="x" step={0} total={2} />)).not.toContain('aria-label="Voltar"')
    expect(render(<WizardShell title="x" step={0} total={2} onBack={() => {}} />)).toContain('aria-label="Voltar"')
  })
})

describe('etapa do protocolo', () => {
  it('mostra título, instruções numeradas e a posição da câmera', () => {
    const html = render(<StepCard assessmentId="a1" step={step()} capture={null} />)
    expect(html).toContain('Frontal')
    expect(html).toContain('<ol')
    expect(html).toContain('Tronco ereto.')
    expect(html).toContain('De frente para a câmera')
  })

  it('não oferece demonstração quando o protocolo não tem mídia', () => {
    const html = render(<StepCard assessmentId="a1" step={step()} capture={null} />)
    expect(html).not.toContain('Ver demonstração')
    expect(html).not.toContain('step-ref-frontal')
  })

  it('oferece demonstração quando há mídia cadastrada', () => {
    const html = render(<StepCard assessmentId="a1" step={step({ has_reference: true, has_demo: true })} capture={null} />)
    expect(html).toContain('Ver demonstração')
    expect(html).toContain('data-testid="step-ref-frontal"')
  })

  it('vídeo anuncia o número de repetições', () => {
    const html = render(<StepCard assessmentId="a1" step={step({ capture_kind: 'video', repetitions: 3 })} capture={null} />)
    expect(html).toContain('3 repetições lentas')
    expect(html).toContain('Gravar vídeo')
  })

  it('aceita só os tipos que o servidor aceita', () => {
    const foto = render(<StepCard assessmentId="a1" step={step()} capture={null} />)
    expect(foto).toContain('accept="image/jpeg,image/png,image/webp"')
    expect(foto).toContain('capture="environment"')
    const video = render(<StepCard assessmentId="a1" step={step({ capture_kind: 'video', repetitions: 3 })} capture={null} />)
    expect(video).toContain('accept="video/mp4,video/webm"')
  })

  it('captura confirmada pelo servidor é a única que diz "confirmado"', () => {
    const confirmada = render(<StepCard assessmentId="a1" step={step()} capture={{ id: 'c1', step_id: 'abc', status: 'enviada', media_bytes: 1024 }} />)
    expect(confirmada).toContain('Confirmado pelo servidor')
    const reservada = render(<StepCard assessmentId="a1" step={step()} capture={{ id: 'c1', step_id: 'abc', status: 'reservada' }} />)
    expect(reservada).not.toContain('Confirmado pelo servidor')
  })

  it('mostra ao aluno o motivo da recaptura pedida pelo profissional', () => {
    const html = render(<StepCard assessmentId="a1" step={step()}
      capture={{ id: 'c1', step_id: 'abc', status: 'reservada', correction_reason: 'A foto ficou na diagonal.' }} />)
    expect(html).toContain('A foto ficou na diagonal.')
  })

  it('etapa dispensada mostra a justificativa e não pede arquivo', () => {
    const html = render(<StepCard assessmentId="a1" step={step()}
      capture={{ id: 'c1', step_id: 'abc', status: 'dispensada', skip_reason: 'Dor no ombro.' }} />)
    expect(html).toContain('Dor no ombro.')
    expect(html).not.toContain('Tirar foto')
  })

  it('cuidados importantes aparecem separados das instruções', () => {
    const html = render(<StepCard assessmentId="a1" step={step({ cautions: ['Pare se sentir dor.'] })} capture={null} />)
    expect(html).toContain('Cuidados importantes')
    expect(html).toContain('Pare se sentir dor.')
  })

  it('respeita o protocolo quando a etapa não aceita dúvida nem dispensa', () => {
    const html = render(<StepCard assessmentId="a1" step={step({ allow_question: false, allow_skip: false })} capture={null} />)
    expect(html).not.toContain('Tenho uma dúvida')
    expect(html).not.toContain('Não consigo fazer este movimento')
  })

  it('avaliação encerrada não oferece envio nem dispensa', () => {
    const html = render(<StepCard assessmentId="a1" step={step()} capture={null} disabled />)
    expect(html).not.toContain('Não consigo fazer este movimento')
    expect(html).toContain('g-disabled')
  })
})
