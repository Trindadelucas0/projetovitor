// Aviso por acesso: a avaliação continua disponível nos cartões do Início e Acompanhamento.
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../../store/useStore.js'
import { isAdminAccount, isProAccount } from '../../lib/accounts.js'
import { ask, useDialog } from '../../lib/dialog.js'
import { AP } from '../../lib/postural.js'

const busyModal = () => !!document.querySelector('[aria-modal="true"]') || !!useDialog.getState().dlg
const blockedPath = path => path.startsWith('/avaliacao') || ['/treinar', '/concluido', '/workout'].includes(path)

export default function PendingAssessmentNotice() {
  const user = useStore(s => s.user)
  const loc = useLocation(), nav = useNavigate()
  const shown = useRef(new Set())

  useEffect(() => {
    if (!user?.id || user.must_change_password || user.needs_terms || isAdminAccount(user) || isProAccount(user) || blockedPath(loc.pathname)) return
    let live = true
    let timer
    const check = async () => {
      try {
        const assessment = (await AP.mine()).open
        if (!live || useStore.getState().user?.id !== user.id || assessment?.status !== 'solicitada') return
        const key = `${user.id}:${assessment.id}`
        if (shown.current.has(key)) return
        const show = () => {
          if (!live || useStore.getState().user?.id !== user.id) return
          if (blockedPath(window.location.hash.slice(1).split('?')[0])) return
          if (busyModal()) { timer = setTimeout(show, 500); return }
          shown.current.add(key)
          const name = assessment.professional_name || 'Seu profissional'
          const due = assessment.due_at ? `\nPrazo: ${new Date(assessment.due_at).toLocaleDateString('pt-BR')}` : ''
          ask('Nova avaliação postural', {
            text: `${name} solicitou sua avaliação.${due}`,
            cancel: 'Agora não', ok: 'Iniciar avaliação'
          }).then(start => { if (start && useStore.getState().user?.id === user.id) nav(`/avaliacao/${assessment.id}`) })
        }
        show()
      } catch { /* Sem rede ou módulo indisponível: o cartão tenta novamente no próximo acesso. */ }
    }
    check()
    return () => { live = false; clearTimeout(timer) }
  }, [user?.id, user?.must_change_password, user?.needs_terms, loc.pathname, nav])

  return null
}
