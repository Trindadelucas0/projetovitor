import { test, expect } from '@playwright/test'

const paths = {
  aluno: ['/hoje', '/treinos', '/comunidade', '/progresso', '/perfil', '/acompanhamento', '/avaliacao'],
  profissional: ['/pro', '/pro/treino', '/comunidade', '/perfil'],
  admin: ['/admin/painel', '/pro/treino', '/settings']
}

for (const [role, routes] of Object.entries(paths)) for (const width of [320, 390]) {
  test(`${role}: telas principais cabem em ${width}px`, async ({ page }) => {
    const user = { id: `mobile-${role}`, name: 'Teste Mobile', status: 'ativo', roles: [role], context: role,
      admin: role === 'admin', pro: role === 'profissional', access_locked: false }
    await page.setViewportSize({ width, height: 700 })
    await page.addInitScript(user => localStorage.setItem('gym_user', JSON.stringify(user)), user)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error' && message.text().includes('render error')) errors.push(message.text()) })
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname
      const data = path === '/api/me' ? { user }
        : path === '/api/data' ? { state: null }
          : path === '/api/guided/state' ? { week: { done: 0, target: 3, sessions: [] }, active: null, streak_weeks: 0, profile: null }
            : path === '/api/guided/home' ? { week: { n: 0, secs: 0, vol: 0 }, prev_week: { n: 0, secs: 0, vol: 0 }, streak_days: 0, best_streak_days: 0, recent_records: [], next: null }
              : path.startsWith('/api/guided/stats') ? { target_per_week: 3, records: [], exercises: [], groups: [] }
                : path === '/api/care' ? { plans: [], occurrences: [], threads: [], professionals: [], blocks: [] }
                  : path === '/api/feed' ? { posts: [] }
                    : path === '/api/professionals' ? { professionals: [] }
                    : path === '/api/pro/home' ? { kpis: { students: 0 }, activity: [], state: 'ativo' }
                  : path === '/api/pro/students' ? { students: [] }
                    : path === '/api/adm/users' ? { users: [] }
                      : path === '/api/pro/templates' || path === '/api/adm/templates' ? { templates: [] }
          : path.includes('subscriptions') ? { subscriptions: { aluno: { active: true, features: { progresso: true, programas_guiados: true } } } }
            : path === '/api/guided/progress' ? { history: [] }
              : path === '/api/feed/categories' ? { categories: [], can_publish: role !== 'aluno', can_comment: true }
                : {}
      return route.fulfill({ json: data })
    })
    for (const route of routes) {
      await page.goto('/#' + route)
      await expect(page.locator('#app')).toBeVisible()
      await page.waitForTimeout(150)
      expect(errors.splice(0), `${role} ${route} renderizou sem erro`).toEqual([])
      const metrics = await page.evaluate(() => {
        const doc = document.documentElement
        const tabs = [...document.querySelectorAll('#agtab button')].map(el => el.getBoundingClientRect())
        return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth,
          badTabs: tabs.filter(r => r.width < 44 || r.height < 44 || r.left < -1 || r.right > innerWidth + 1).length }
      })
      expect(metrics.scrollWidth, `${role} ${route} @${width}px`).toBeLessThanOrEqual(metrics.clientWidth + 1)
      expect(metrics.badTabs, `${role} ${route} @${width}px`).toBe(0)
      if (width === 390 && ['/hoje', '/treinos', '/progresso', '/pro', '/pro/treino', '/admin/painel'].includes(route)) {
        await page.screenshot({ path: `test-artifacts/mobile-${role}-${route.slice(1).replaceAll('/', '-')}.png` })
      }
    }
  })
}
