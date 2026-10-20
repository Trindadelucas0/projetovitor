// AVAGYM V4 — fila offline temporária (IndexedDB). NÃO é fonte da verdade: só guarda o que ainda não chegou ao servidor.
// Nada sai daqui sem confirmação do servidor; item recusado (4xx) fica marcado como "recusado" e visível — nunca é descartado.
// Sem IndexedDB (navegador antigo/privado, testes): cai para memória + localStorage como espelho.
const DB = 'avagym_v4', STORE = 'outbox', LS = 'avagym_outbox_mirror_v1', OLD_QUEUE = 'avagym_guided_queue_v1'
let dbp = null
const hasIDB = () => typeof indexedDB !== 'undefined'
function db() {
  if (!hasIDB()) return null
  dbp ||= new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'key' })
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error)
  }).catch(() => null)
  return dbp
}
const lsRead = () => { try { return JSON.parse(localStorage.getItem(LS)) || [] } catch { return [] } }
const lsWrite = a => { try { localStorage.setItem(LS, JSON.stringify(a)) } catch { /* cheio */ } }
async function tx(mode, fn) {
  const d = await db()
  if (!d) return null
  return new Promise((ok, no) => { const t = d.transaction(STORE, mode), st = t.objectStore(STORE); const r = fn(st); t.oncomplete = () => ok(r?.result); t.onerror = () => no(t.error) })
}
let cache = null
const listeners = new Set()
const emit = () => listeners.forEach(f => { try { f(cache?.length || 0) } catch { /* */ } })
export const onOutboxChange = f => { listeners.add(f); return () => listeners.delete(f) }

export async function all() {
  const d = await db()
  cache = d ? await tx('readonly', st => st.getAll()) : lsRead()
  cache.sort((a, b) => a.seq - b.seq)
  return cache
}
export async function put(item) {
  const it = { tries: 0, rejected: null, ...item, seq: item.seq || Date.now() + Math.random() }
  const d = await db()
  if (d) await tx('readwrite', st => st.put(it)); else lsWrite([...lsRead().filter(x => x.key !== it.key), it])
  await all(); emit(); return it
}
// só remove depois que o servidor confirmou (chamado por quem enviou)
export async function ack(key) {
  const d = await db()
  if (d) await tx('readwrite', st => st.delete(key)); else lsWrite(lsRead().filter(x => x.key !== key))
  await all(); emit()
}
export const count = () => cache?.length || 0
export const rejectedCount = () => (cache || []).filter(x => x.rejected).length

// migração única: a fila antiga do localStorage vai para o IndexedDB; a chave antiga só sai depois de gravada
export async function migrateOldQueue() {
  let old = []; try { old = JSON.parse(localStorage.getItem(OLD_QUEUE)) || [] } catch { /* */ }
  for (const p of old) if (p?.client_id) await put({ key: 'session:' + p.client_id, kind: 'session', client_id: p.client_id, payload: p })
  if (old.length && (await all()).length >= old.length) localStorage.removeItem(OLD_QUEUE)
  return old.length
}
