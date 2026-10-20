// V3 · F7 — importação única de dados antigos do navegador para o PostgreSQL, depois do login.
// O treino livre (gym_state_v1) já sobe pelo pullState/pushState para user_app_state; aqui vão o resto das chaves.
import { api } from './api.js'
import { restoreLiveSession } from './guided.js'
export async function importLegacyLocal() {
  if (localStorage.getItem('ag_onb_skip')) {
    try { await api('/api/me/onboarding/skip', { method: 'POST', body: '{}' }); localStorage.removeItem('ag_onb_skip') } catch { /* tenta no próximo login */ }
  }
  await restoreLiveSession()
}
