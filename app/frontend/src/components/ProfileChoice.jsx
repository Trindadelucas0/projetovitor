import { Checkbox, Radio } from 'antd'
import './profile-choice.css'
import AntProvider from '../ui/AntProvider.jsx'
import { PROFILE_LABELS, PALETTE_LABELS, emptyProfileChoice } from './profileChoiceData.js'
export { PROFILE_LABELS, PALETTE_LABELS, emptyProfileChoice }



export default function ProfileChoice({ value = emptyProfileChoice, onChange, error, testId = 'profile-choice' }) {
  const pick = profile_kind => onChange({
    profile_kind,
    accent_palette: profile_kind === 'menino' ? 'verde' : profile_kind === 'menina' ? 'rosa' : (['roxo', 'azul', 'laranja'].includes(value.accent_palette) ? value.accent_palette : 'roxo'),
    prefers_female_coach: profile_kind === 'menina' ? value.prefers_female_coach : false
  })
  return <div className="profile-choice" data-testid={testId}>
      <Radio.Group value={value.profile_kind} onChange={e => pick(e.target.value)} aria-label="Escolha seu perfil">
        {Object.entries(PROFILE_LABELS).map(([key, label]) => <Radio key={key} value={key} data-testid={`${testId}-${key}`}>
          <span className="profile-choice-title">{label}</span>
          <small>{key === 'menino' ? 'Tema verde' : key === 'menina' ? 'Tema rosa' : 'Você escolhe a cor'}</small>
        </Radio>)}
      </Radio.Group>
      {value.profile_kind === 'outro' && <fieldset className="profile-palettes">
        <legend>Escolha a cor do sistema</legend>
        {['roxo', 'azul', 'laranja'].map(color => <button type="button" key={color} className={value.accent_palette === color ? 'on' : ''}
          onClick={() => onChange({ ...value, accent_palette: color })} aria-pressed={value.accent_palette === color} data-color={color}>
          <i />{PALETTE_LABELS[color]}
        </button>)}
      </fieldset>}
      {value.profile_kind === 'menina' && <Checkbox checked={value.prefers_female_coach}
        onChange={e => onChange({ ...value, prefers_female_coach: e.target.checked })}>
        Prefiro ser atendida por uma personal mulher
      </Checkbox>}
      <p className="profile-choice-note">A preferência orienta a equipe. O administrador escolhe o personal depois do cadastro.</p>
      {error && <p className="profile-choice-error" role="alert">{error}</p>}
    </div>
}

// Para telas estáticas (Login): carregado sob demanda junto com o provedor do antd, fora do bundle inicial.
export function ProfileChoiceAnt(props) {
  return <AntProvider className="profile-choice-provider"><ProfileChoice {...props} /></AntProvider>
}
