/* opengym-api — passkey (WebAuthn) auth + per-user state storage for openGym
   No framework, JSON-file storage, signed session cookies.               */
import { clientIp } from './clientip.js'   // BUG-044
import './env.js';
import http from 'node:http';
import { authRoutes, clearTokenCookie, authUser, pub, requireRole, revokeRequestToken } from './auth.js';
import { guidedRoutes } from './guided.js';
import { activeTrainingRoutes } from './active-training.js';
import { accountRoutes, accessGate } from './accounts-v42.js';
import { tourRoutes } from './tours.js';
import { startMailer } from './mailer.js';
import { sessionsV4Routes, forgottenSweep } from './sessions-v4.js';
import { editorialRoutes } from './programs-editorial.js';
import { proRoutes } from './pro.js';
import { communityRoutes } from './community.js';
import { communityWorkoutRoutes } from './community-workout-post.js';
import { communityEditorialRoutes } from './community-editorial.js';
import { communityNoticeRoutes, startLiveNoticeReconciliation, startNoticeReminderJob } from './community-notices.js';
import { socialRoutes } from './social.js';
import { tapagoRoutes } from './tapago.js';
import { posturalRoutes } from './postural.js';
import { posturalProRoutes } from './postural-pro.js';
import { posturalAdminRoutes } from './postural-adm.js';
import { posturalExampleRoutes } from './postural-examples.js';
import { startPosturalRecurrence } from './postural-job.js';
import { lgpdRoutes, termsStatus } from './lgpd.js';
import { legalRoutes } from './legal.js';
import { exerciseMediaRoutes } from './exmedia.js';
import { portalRoutes } from './portal.js';
import { adminCrudRoutes } from './admcrud.js';
import { identityRoutes } from './identity.js';
import { entitlementRoutes, entitlementGate } from './entitlements.js';
import { monetizationGate, accessRoutes } from './access.js';
import { statsRoutes } from './stats.js';
import { referralRoutes } from './referral.js';
import { monetizationAdminRoutes } from './monetization-admin.js';
import { inviteRoutes } from './invites.js';
import { managementRoutes } from './management.js';
import { saasRoutes } from './saas.js';
import { billingRoutes } from './billing/routes.js';
import { assertBillingConfig } from './billing/providers/index.js';
import { contactRoutes } from './contact.js';   // V5: contato e endereco (cadastro/perfil)
import { personaisRoutes } from './personais.js';   // personais por público (Homem/Mulher)
import { callsRoutes } from './calls.js';   // agenda de calls (Zoom)
import { comunidadeRoutes } from './comunidade-externa.js';   // WhatsApp, Close Friends e live semanal
import { beneficiosRoutes } from './beneficios.js';   // cotas dos planos e início do admin
import { setPush as setBillingPush, startBillingJob } from './billing/core.js';
import { appStateRoutes, readStatePg, eraseStatePg } from './appstate.js';
import { requireAuth } from './auth.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';
import { loadLegacy, persistLegacy, serverKey, importStateFiles } from './legacy-store.js';   // V5-PG-STORE
import { watchResponse, recordRequest, auditRoutes, startAuditPurge } from './audit-log.js';
import { admEmailTestRoutes } from './adm-email-test.js';
import { writeStatePg } from './appstate.js';

// Falha antes de abrir banco, porta ou jobs: Asaas explícito nunca volta ao simulador.
assertBillingConfig();

const PORT = +(process.env.PORT || 3000);
const DATA = process.env.DATA_DIR || '/data';
const ORIGIN = process.env.ORIGIN || 'http://localhost:8080';
// Admin dashboard (issue): admins are matched by uid; INVITE_ONLY gates new signups behind a
// code the admin generates. Both default off so a fresh self-hosted instance stays open.
const ADMIN_UIDS = (process.env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
// 90 days keeps someone who trains a few times a week permanently signed in without a stolen
// cookie staying good for a year. Overridable because a family instance and one on the open
// internet don't want the same number. Only affects cookies minted from now on — the expiry is
// baked into each cookie when it's issued, so lowering this never cuts an existing session short.
const SESSION_DAYS = Math.max(1, +(process.env.SESSION_DAYS || 90) || 90);
const MAX_BODY = 5 * 1024 * 1024;
// Secure cookies require HTTPS; over plain http://localhost the flag would drop the cookie
const SECURE = /^https:/i.test(ORIGIN) ? ' Secure;' : '';

fs.mkdirSync(DATA, { recursive: true });

/* ---------- secret + db ---------- */
const secretFile = path.join(DATA, 'secret');
// V5: segredo no Postgres (server_keys); arquivo antigo importado uma vez. SESSION_SECRET (env) tem prioridade.
const SECRET = String(await serverKey('session_secret', { envValue: process.env.SESSION_SECRET, file: secretFile, parse: v => v.trim() || null, gen: () => crypto.randomBytes(32).toString('hex') })).trim();

const dbFile = path.join(DATA, 'db.json');
// V5: o `db` legado (ponte gymsid, passkeys, push, convites) vive no Postgres; db.json e importado uma vez e renomeado
let db = await loadLegacy(DATA);
void dbFile;
db.subs = db.subs || [];
db.invites = db.invites || [];
const isAdmin = user => !!user && (user.admin === true || ADMIN_UIDS.includes(user.id));
function saveDb() { persistLegacy(db); }
function atomicWrite(file, content) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}
const stateFile = uid => path.join(DATA, 'state-' + uid.replace(/[^a-zA-Z0-9_-]/g, '') + '.json');
// V3 F7: estado do treino livre no Postgres (user_app_state); o arquivo state-<id>.json só é lido para importar
const readState = uid => readStatePg(uid);

/* ---------- push notifications (Web Push / VAPID) ---------- */
const vapidFile = path.join(DATA, 'vapid.json');
let vapid;
// V5: chaves VAPID no Postgres (server_keys); VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY (env) tem prioridade; vapid.json importado uma vez
vapid = await serverKey('vapid', { envValue: process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY } : null, file: vapidFile, parse: v => { const j = JSON.parse(v); return j.publicKey && j.privateKey ? j : null }, gen: () => webpush.generateVAPIDKeys() });
await importStateFiles(DATA, writeStatePg).catch(e => console.error('[legacy] importacao de state-*.json:', e.message));
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || (SECURE ? ORIGIN : ['mailto:admin', 'localhost'].join(String.fromCharCode(64)));
webpush.setVapidDetails(VAPID_SUBJECT, vapid.publicKey, vapid.privateKey);

async function sendPush(userId, payload) {
  const subs = db.subs.filter(s => s.userId === userId);
  if (!subs.length) return;
  const body = JSON.stringify(payload);
  let dirty = false;
  await Promise.all(subs.map(async sub => {
    // urgency 'high' is the one lever we have over delivery speed — iOS/Android throttle
    // low-urgency background push more aggressively under battery-saving modes. TTL is left
    // at the library default (long) so a briefly-offline device still gets it once reconnected,
    // rather than risking it being dropped for the sake of shaving off latency that TTL doesn't
    // actually control anyway.
    try { await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body, { urgency: 'high' }); }
    catch (e) {
      console.error('push send failed', userId, e.statusCode, e.statusCode ? '' : e.message);   // sem corpo da resposta (endpoint/token)
      if (e.statusCode === 404 || e.statusCode === 410) {
        db.subs = db.subs.filter(s => s.endpoint !== sub.endpoint); dirty = true;
      }
    }
  }));
  if (dirty) saveDb();
}

// Rest-timer alerts: client schedules on start/extend, cancels on skip or on-screen completion —
// this only fires when the tab was backgrounded/suspended and never got to cancel it itself.
const restTimers = new Map(); // userId -> Timeout
function scheduleRestTimer(userId, sec) {
  const t = restTimers.get(userId);
  if (t) clearTimeout(t);
  restTimers.set(userId, setTimeout(() => {
    restTimers.delete(userId);
    sendPush(userId, { title: 'Descanso concluído 💪', body: 'Hora da próxima série.', tag: 'rest-timer' });
  }, sec * 1000));
}
function cancelRestTimer(userId) {
  const t = restTimers.get(userId);
  if (t) { clearTimeout(t); restTimers.delete(userId); }
}

// "Workout planned today" reminder — one per user per day, at their chosen time.
// Duplicated (not imported) from frontend/src/lib/history.js effectiveRoutineId — tiny pure helper, not worth sharing across the two runtimes.
function effectiveRoutineId(S, iso) {
  const ov = S.dayPlan?.[iso];
  if (ov === 'rest') return null;
  if (ov && S.routines?.some(r => r.id === ov)) return ov;
  const wd = new Date(iso + 'T12:00:00').getDay();
  return S.week?.[wd] || null;
}
// Computes "now" in an arbitrary IANA zone (e.g. "Europe/Lisbon") instead of the server's own —
// each user's reminder fires by their own clock, wherever they and their phone actually are.
function userNow(tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }).formatToParts(new Date());
    const g = t => parts.find(p => p.type === t)?.value;
    return { date: `${g('year')}-${g('month')}-${g('day')}`, hhmm: `${g('hour')}:${g('minute')}` };
  } catch { return null; } // unknown/invalid tz string — skip this user rather than guess
}
setInterval(async () => {
  for (const user of db.users) {
    if (!db.subs.some(s => s.userId === user.id)) continue;
    const S = await readState(user.id).catch(() => null);
    if (!S?.reminder?.on) continue;
    const now = userNow(S.reminder.tz || 'UTC');
    if (!now || S.reminder.time !== now.hhmm) continue;
    if (user.lastReminder === now.date) continue;
    if ((S.workouts || []).some(w => w.d === now.date)) continue;
    const rid = effectiveRoutineId(S, now.date);
    if (!rid) continue; // rest day — nothing planned
    const routine = (S.routines || []).find(r => r.id === rid);
    console.log('reminder firing', user.id, rid);
    user.lastReminder = now.date;
    saveDb();
    sendPush(user.id, {
      title: routine ? `${routine.emoji || '🏋️'} ${routine.name} hoje` : 'Treino planejado para hoje',
      body: 'Seu treino de hoje está previsto. Acesse o aplicativo para começar.',
      tag: 'day-reminder'
    });
  }
// Checked every 10s (not 60s) — ticks aren't aligned to the top of the minute, so a 60s
// interval could sit on your target minute for up to 59s before noticing. 10s caps that at ~9s.
}, 10000).unref();

/* ---------- sessions (signed cookie) ---------- */
function sign(payload) {
  const mac = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return payload + '.' + mac;
}
function verifySig(token) {
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const payload = token.slice(0, i), mac = token.slice(i + 1);
  const expect = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null;
  } catch { return null; }
  return payload;
}
// Session payload is `<uid>:<expiry>:<version>`, where the version is the user's `sv` counter.
// Bumping `sv` (POST /api/logout/all) makes every cookie ever handed out for that account stop
// verifying, which is the only revocation there was before short of deleting ./data/secret and
// signing out the whole instance. Cookies minted before `sv` existed have no third field and are
// read as version 0, matching a user who has never bumped — they stay valid until they expire.
const sessionVersion = user => user.sv || 0;
function makeSession(user) {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  return sign(user.id + ':' + exp + ':' + sessionVersion(user));
}
function readSession(req) {
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(c => {
    const i = c.indexOf('='); return i < 0 ? ['', ''] : [c.slice(0, i).trim(), c.slice(i + 1).trim()];
  }));
  const tok = cookies.gymsid;
  if (!tok) return null;
  const payload = verifySig(tok);
  if (!payload) return null;
  const [uid, exp, ver] = payload.split(':');
  if (!uid || +exp < Date.now()) return null;
  const user = db.users.find(u => u.id === uid) || null;
  if (!user) return null;
  if (user.disabled) return null;           // disabled accounts are locked out everywhere
  // Missing third field = pre-versioning cookie = version 0. Anything non-numeric is a malformed
  // payload (it still had to pass the HMAC, so this is belt-and-braces) and is refused outright.
  const claimed = ver === undefined ? 0 : Number(ver);
  if (!Number.isInteger(claimed) || claimed !== sessionVersion(user)) return null;
  return user;
}
function sessionCookie(user) {
  return `gymsid=${makeSession(user)}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly;${SECURE} SameSite=Lax`;
}
const clearCookie = `gymsid=; Path=/; Max-Age=0; HttpOnly;${SECURE} SameSite=Lax`;

/* ---------- helpers ---------- */
function json(res, code, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(extraHeaders || {}) });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', d => {
      size += d.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Conteúdo grande demais'), { status: 413 })); req.destroy(); return; }
      chunks.push(d);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(Object.assign(new Error('Requisição inválida: JSON malformado'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

/* ---------- live presence (in-memory) ---------- */
// Clients heartbeat /api/activity while a workout is on screen; the admin dashboard reads who's
// live. Purely ephemeral — never persisted. Expires shortly after the last ping.
const presence = new Map();               // uid -> { name, exIdx, exTotal, setsDone, setsTotal, startedAt, updatedAt }
const PRESENCE_TTL = 70000;               // ~3.5× the 20s client heartbeat
function livePresence(uid) {
  const p = presence.get(uid);
  if (!p) return null;
  if (Date.now() - p.updatedAt > PRESENCE_TTL) { presence.delete(uid); return null; }
  return p;
}
setInterval(() => { for (const [k, v] of presence) if (Date.now() - v.updatedAt > PRESENCE_TTL) presence.delete(k); }, 30000).unref();

/* ---------- routes ---------- */
const routes = {
  // QA prod: health publico nao expoe contagem de usuarios; HEAD tambem responde 200 (monitores)
  'GET /api/health': async (req, res) => json(res, 200, { ok: true }),
  'HEAD /api/health': async (req, res) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end() },

  // Public config the login screen needs before anyone is signed in.
  'GET /api/config': async (req, res) => json(res, 200, { auth: 'email' }),

  'GET /api/me': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    // conta Postgres: devolve papéis/status reais (o JWT é a fonte da verdade)
    if (user.pg) { const u = await authUser(req).catch(() => null); if (!u) return json(res, 401, { error: 'not signed in' }); return json(res, 200, { user: { ...pub(u), ...(await termsStatus(u.id)) } }) }
    json(res, 200, { user: { id: user.id, name: user.name, admin: isAdmin(user) } });
  },

  // BUG-039: o botao Sair usa esta rota; ela tem de revogar o token igual a /api/auth/logout (antes so limpava o cookie)
  'POST /api/logout': async (req, res) => { await revokeRequestToken(req).catch(e => console.error('logout revoke', e.message)); json(res, 200, { ok: true }, { 'Set-Cookie': [clearCookie, clearTokenCookie] }) },

  // "Sign out everywhere" — bumps this user's session version, which invalidates every cookie
  // ever issued for the account, on every device, including a copy someone else walked off with.
  // The caller's own cookie is cleared here too, so the browser doing it doesn't sit on a token
  // it no longer accepts. Signing back in with e-mail and senha works immediately.
  'POST /api/logout/all': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    user.sv = sessionVersion(user) + 1;
    saveDb();
    json(res, 200, { ok: true }, { 'Set-Cookie': clearCookie });
  },

  // GET/PUT /api/data: ver appstate.js (Postgres)
  'GET /api/push/public-key': async (req, res) => json(res, 200, { key: vapid.publicKey }),

  'POST /api/push/subscribe': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    const body = await readBody(req);
    const sub = body.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return json(res, 400, { error: 'invalid subscription' });
    db.subs = db.subs.filter(s => s.endpoint !== sub.endpoint);
    db.subs.push({ userId: user.id, endpoint: sub.endpoint, keys: sub.keys, created: new Date().toISOString() });
    saveDb();
    json(res, 200, { ok: true });
  },

  'POST /api/push/unsubscribe': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    const body = await readBody(req);
    db.subs = db.subs.filter(s => !(s.userId === user.id && s.endpoint === body.endpoint));
    saveDb();
    json(res, 200, { ok: true });
  },

  'POST /api/push/test': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    await sendPush(user.id, { title: 'AVAGYM', body: 'Notificação de teste ✅: é assim que os avisos aparecem.', tag: 'test' });
    json(res, 200, { ok: true });
  },

  'POST /api/push/rest-timer': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    const body = await readBody(req);
    const sec = Math.max(1, Math.min(3600, Math.round(+body.seconds || 0)));
    if (!sec) return json(res, 400, { error: 'seconds required' });
    scheduleRestTimer(user.id, sec);
    json(res, 200, { ok: true });
  },

  'POST /api/push/rest-timer/cancel': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    cancelRestTimer(user.id);
    json(res, 200, { ok: true });
  },

  // Live-workout heartbeat: client pings while a workout is on screen; { active:false } drops it.
  'POST /api/activity': async (req, res) => {
    const user = readSession(req);
    if (!user) return json(res, 401, { error: 'not signed in' });
    const body = await readBody(req);
    if (body.active) {
      presence.set(user.id, {
        name: String(body.name || '').slice(0, 60),
        exIdx: +body.exIdx || 0, exTotal: +body.exTotal || 0,
        setsDone: +body.setsDone || 0, setsTotal: +body.setsTotal || 0,
        startedAt: +body.startedAt || Date.now(),
        updatedAt: Date.now()
      });
    } else presence.delete(user.id);
    json(res, 200, { ok: true });
  },

  /* ---------- admin: legado do openGym incorporado ao painel novo (/api/adm) ---------- */
  // Quem está treinando agora (heartbeat do treino) e histórico local sincronizado de um usuário.
  'GET /api/adm/live': async (req, res) => {
    const a = await requireRole('admin')(req, res, json); if (!a) return;
    const live = []; for (const [uid] of presence) { const p = livePresence(uid); if (p) live.push({ user_id: uid, name: (db.users.find(u => u.id === uid) || {}).name || p.name, ...p }); }
    json(res, 200, { live, now: Date.now() });
  },
  'GET /api/adm/users/workouts': async (req, res) => {
    const a = await requireRole('admin')(req, res, json); if (!a) return;
    const id = new URL(req.url, 'http://x').searchParams.get('id') || '';
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json(res, 400, { error: 'id inválido' });
    const S = (await readState(id)) || {};
    json(res, 200, { unit: S.unit || 'kg', lastSync: S._ts || null, bodyweight: S.bodyweight || [], workouts: (S.workouts || []).slice().reverse(), routines: (S.routines || []).map(r => ({ id: r.id, name: r.name, count: (r.ex || []).length })) });
  }
};

/* ---------- AVAGYM: login email+senha (Postgres + JWT) ---------- */
// Ponte: quem entra por e-mail/senha ganha também uma entrada em db.json (id = uuid do Postgres)
// e o cookie gymsid, para que /api/data, push, admin etc. (ainda em JSON) continuem funcionando.
function pgBridge(u) {
  let x = db.users.find(v => v.id === u.id);
  if (!x) { x = { id: u.id, name: u.name, created: Date.now(), pg: true }; db.users.push(x); }
  x.name = u.name; x.email = u.email; x.admin = u.roles.includes('admin');
  saveDb();
  return [sessionCookie(x)];
}
Object.assign(routes, auditRoutes({ json, readBody, requireRole }));
Object.assign(routes, admEmailTestRoutes({ json, readBody, requireRole }));   // BUG-026: envio de teste de e-mail (admin)   // V5: tela de logs e auditoria do admin
Object.assign(routes, authRoutes({ json, readBody, bridge: pgBridge, clearCookies: [clearCookie] }));
Object.assign(routes, guidedRoutes({ json, readBody }));
Object.assign(routes, activeTrainingRoutes({ json, readBody }));
Object.assign(routes, accountRoutes({ json, readBody }));
Object.assign(routes, tourRoutes({ json, readBody }));  // V4.3: guided tours  // V4.2: aluno do personal, suspensão excepcional e exportação LGPD por e-mail  // V4.1: treino ativo único + tema
Object.assign(routes, sessionsV4Routes({ json, readBody }));
Object.assign(routes, editorialRoutes({ json, readBody }));  // V4 F3: fluxo editorial de programas
// V4: treino esquecido — varredura a cada 5 min; lembrete a cada SESSION_REMINDER_MIN (padrão 60) até finalizar/corrigir/descartar
if (process.env.SESSION_SWEEP !== 'off') setInterval(() => {
  forgottenSweep({ minutes: +process.env.SESSION_REMINDER_MIN || 60, push: sendPush }).catch(e => console.error('[sessions] sweep', e.message));
}, 5 * 60 * 1000).unref();
Object.assign(routes, proRoutes({ json, readBody }));
Object.assign(routes, communityRoutes({ json, readBody }));  // feed, curtidas, comentários, denúncias, moderação
Object.assign(routes, communityWorkoutRoutes({ json, readBody }));  // publicação opcional do #TáPago pelo dono do treino
Object.assign(routes, communityEditorialRoutes({ json, readBody }));  // calendário oficial da Comunidade
Object.assign(routes, communityNoticeRoutes({ json, readBody }, { push: sendPush }));  // avisos com banner e lembrete
Object.assign(routes, socialRoutes({ json, readBody }));  // V5 E1: perfil social, foto, seguidores, cartões #TáPago
Object.assign(routes, tapagoRoutes({ json, readBody }));  // #TáPago 2.0: editor, campanha e recompensa de 30 dias
Object.assign(routes, posturalRoutes({ json, readBody }));  // Avaliação Postural: wizard do aluno, capturas privadas e devolutiva
Object.assign(routes, posturalProRoutes({ json, readBody }));  // Avaliação Postural: fila do profissional, análise por etapa, recaptura e recorrência
Object.assign(routes, posturalAdminRoutes({ json, readBody }));  // Avaliação Postural: catálogo, versões, termo, indicadores e retenção
Object.assign(routes, posturalExampleRoutes({ json, readBody }));
Object.assign(routes, lgpdRoutes({ json, readBody, legacyState: readState, legacyErase: uid => { eraseStatePg(uid).catch(() => {}); try { fs.unlinkSync(stateFile(uid)) } catch {} db.users = db.users.filter(x => x.id !== uid); saveDb() } }));
Object.assign(routes, legalRoutes({ json, readBody }));  // dados da empresa + aceite dos documentos legais
Object.assign(routes, exerciseMediaRoutes({ json, readBody }));
Object.assign(routes, portalRoutes({ json, readBody }));   // central de solicitações, KPIs, profissionais, vínculos e atendimento
Object.assign(routes, adminCrudRoutes({ json, readBody }));  // admin gestor: editar/excluir tudo
Object.assign(routes, identityRoutes({ json, readBody }));  // V3 F2: identidade global, contexto, verificação profissional
Object.assign(routes, entitlementRoutes({ json, readBody, requireAuth, requireRole }));
Object.assign(routes, accessRoutes({ json, requireAuth, readBody }));
Object.assign(routes, statsRoutes({ json }));   // lote 7: estatisticas e widgets do Inicio
Object.assign(routes, referralRoutes({ json, requireAuth }));
Object.assign(routes, monetizationAdminRoutes({ json, readBody, requireRole }));  // Monetizacao F7: Admin > Monetizacao  // Monetizacao F5: /convite/CODIGO e painel de indicacoes  // Monetizacao F3: GET /api/access/me  // V3 F3: motor de planos
Object.assign(routes, inviteRoutes({ json, readBody }));  // V3 F4: convites do profissional (Profissional Free)
Object.assign(routes, saasRoutes({ json }));
Object.assign(routes, managementRoutes({ json }));
Object.assign(routes, billingRoutes({ json, readBody }));
Object.assign(routes, contactRoutes({ json, readBody }));  // V5: monetizacao (planos, cupons, cobranca, parceiros, webhooks)
Object.assign(routes, personaisRoutes({ json, readBody }));
Object.assign(routes, callsRoutes({ json, readBody }));
Object.assign(routes, comunidadeRoutes({ json, readBody }, { push: sendPush }));
Object.assign(routes, beneficiosRoutes({ json, readBody }));
Object.assign(routes, appStateRoutes({ json, readBody, readSession, dataDir: DATA }));  // V3 F7: estado do usuário no Postgres  // V3 F5: código público do aluno + visão 360° do admin

/* ---------- segurança: headers + rate limit (auditoria 2026-10) ---------- */
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  // API só devolve JSON e mídia: nenhum documento dela pode rodar script ou ser emoldurado
  'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  ...(SECURE ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {})
};
// IP real: ver clientip.js (BUG-044: cf-connecting-ip so vale vindo do gateway local; X-Forwarded-For ignorado).
// Janela fixa em memória. Rotas sensíveis (login, cadastro, recuperação) por IP; RATE_LIMIT=off desliga (testes locais).
const RL_RULES = {
  'POST /api/auth/login': [20, 15 * 60e3],
  'POST /api/me/calls/reservar': [20, 60 * 60e3], 'POST /api/lives/perguntas': [20, 60 * 60e3],
  'POST /api/auth/register': [10, 60 * 60e3], 'GET /api/cep': [+process.env.CEP_IP_LIMIT || 10, 60e3], 'GET /api/convite': [60, 10 * 60e3],
  'POST /api/auth/forgot': [5, 15 * 60e3],
  'POST /api/auth/reset': [10, 15 * 60e3],
  'POST /api/auth/password': [10, 15 * 60e3],
  // Segurança: ações de escrita sensíveis (por sessão quando autenticado; academia com Wi-Fi compartilhado não trava todos)
  'POST /api/posts': [30, 10 * 60e3], 'POST /api/comments': [60, 10 * 60e3], 'POST /api/messages': [60, 10 * 60e3],
  'POST /api/posts/like': [300, 10 * 60e3], 'POST /api/comments/like': [300, 10 * 60e3],
  'POST /api/reports': [20, 60 * 60e3], 'POST /api/follows': [60, 10 * 60e3], 'POST /api/social/follow': [60, 10 * 60e3],
  'POST /api/uploads': [30, 10 * 60e3], 'POST /api/me/avatar': [20, 60 * 60e3],
  'POST /api/pro/verification/document': [20, 60 * 60e3],
  // Avaliacao postural: 18 etapas com retentativa por arquivo, entao o teto do upload e generoso de proposito
  'POST /api/avaliacao-postural/captura/init': [200, 60 * 60e3], 'POST /api/avaliacao-postural/captura/upload': [120, 60 * 60e3],
  'POST /api/avaliacao-postural/captura/confirm': [120, 60 * 60e3], 'POST /api/avaliacao-postural/submit': [20, 60 * 60e3],
  'POST /api/avaliacao-postural/duvida': [40, 60 * 60e3], 'POST /api/pro/avaliacoes/solicitar': [60, 60 * 60e3],
  'POST /api/adm/avaliacao/etapas/midia': [60, 60 * 60e3],
  'GET /api/social/handle-check': [120, 60e3],
  // V5 monetizacao: cupom (validacao/resgate), cartao e checkout por sessao
  'POST /api/billing/coupon/validate': [30, 10 * 60e3], 'POST /api/billing/coupon/redeem': [10, 60 * 60e3], 'POST /api/billing/cards': [10, 60 * 60e3],
  'POST /api/billing/subscribe': [10, 60 * 60e3], 'POST /api/billing/pay-now': [10, 60 * 60e3], 'POST /api/billing/change-card': [10, 60 * 60e3],
  'POST /api/billing/infinitepay/confirm': [30, 10 * 60e3],
  'POST /api/billing/pix/regenerate': [10, 60 * 60e3], 'POST /api/billing/pix/confirm-test': [10, 60 * 60e3],
  'POST /api/billing/webhook/asaas': [600, 60e3], 'POST /api/billing/webhook/infinitepay': [600, 60e3],
  'POST /api/me/export-request': [5, 60 * 60e3], 'POST /api/me/delete-request': [5, 60 * 60e3], 'POST /api/me/social': [30, 10 * 60e3],
};
const RL_PER_SESSION = key => !key.startsWith('POST /api/auth/');
function rlSubject(key, req) {
  if (RL_PER_SESSION(key)) {
    const tok = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || (/(?:^|;\s*)avagym_token=([^;]+)/.exec(req.headers.cookie || '') || [])[1];
    if (tok) return 's:' + crypto.createHash('sha256').update(tok).digest('hex').slice(0, 24);
  }
  return 'ip:' + clientIp(req);
}
const ALLOWED_ORIGINS = new Set([ORIGIN, ...String(process.env.CSRF_ALLOWED_ORIGINS || '').split(',')].map(o => o.trim().replace(/\/+$/, '')).filter(Boolean));
// QA prod (CSRF): escrita sem Origin/Referer so passa para cliente com token Bearer (nao e navegador, imune a CSRF)
// ou webhook de pagamento (servidor-a-servidor). Navegadores sempre mandam Origin em POST. Roda ANTES da validacao do corpo.
function originAllowed(req, key = '') {
  let o = req.headers.origin;
  if (!o && req.headers.referer) { try { o = new URL(req.headers.referer).origin } catch { return false } }
  if (!o) return /^POST \/api\/billing\/webhook\//.test(key) || /^Bearer\s/i.test(String(req.headers.authorization || ''));
  return ALLOWED_ORIGINS.has(String(o).replace(/\/+$/, ''));
}
const rlHits = new Map();
const RL_GLOBAL = { 'GET /api/cep': [+process.env.CEP_GLOBAL_LIMIT || 600, 10 * 60e3] };
function rateLimited(key, req) {
  const rule = RL_RULES[key]; if (!rule || process.env.RATE_LIMIT === 'off') return 0;
  // QA: teto GLOBAL alem do por IP (rota publica que chama servico externo: IPs rotativos nao burlam o limite)
  const g = RL_GLOBAL[key]; if (g) { const now = Date.now(); let e = rlHits.get('global|' + key); if (!e || e.reset < now) { e = { n: 0, reset: now + g[1] }; rlHits.set('global|' + key, e); } if (++e.n > g[0]) return Math.ceil((e.reset - now) / 1000); }
  const k = key + '|' + rlSubject(key, req), now = Date.now();
  let e = rlHits.get(k); if (!e || e.reset < now) { e = { n: 0, reset: now + rule[1] }; rlHits.set(k, e); }
  e.n++
  // BUG-046: cabecalhos padrao (draft IETF RateLimit) em toda resposta de rota limitada
  req.rl = { limit: rule[0], remaining: Math.max(0, rule[0] - e.n), reset: Math.ceil((e.reset - now) / 1000) }
  return e.n > rule[0] ? Math.ceil((e.reset - now) / 1000) : 0;
}
setInterval(() => { const now = Date.now(); for (const [k, e] of rlHits) if (e.reset < now) rlHits.delete(k); }, 60e3).unref();

// rotas sem login (todas as outras exigem sessao no middleware central)
// QA: reset do rate limit so para suites de teste. Existe apenas fora de producao, com DB_NAME *_test e TEST_RL_RESET=1; senao a rota nem e registrada (404).
const TEST_RL_RESET = process.env.NODE_ENV !== 'production' && /_test$/.test(process.env.DB_NAME || '') && process.env.TEST_RL_RESET === '1';
if (TEST_RL_RESET) routes['POST /api/test/rate-limit/reset'] = async (req, res) => { const n = rlHits.size; rlHits.clear(); json(res, 200, { ok: true, cleared: n }) };
const PUBLIC_ROUTES = new Set(['GET /api/public/plans', 'GET /api/public/stats', 'GET /api/cep', 'GET /api/convite', 'GET /api/config', 'GET /api/health', 'HEAD /api/health', 'GET /api/media', 'GET /api/media/pub', 'GET /api/media/private', 'GET /api/push/public-key', 'GET /api/terms',
  'GET /api/legal/company', 'POST /api/auth/forgot', 'POST /api/auth/login', 'POST /api/auth/logout', 'POST /api/auth/register', 'POST /api/auth/reset', 'POST /api/logout',
  'POST /api/billing/webhook/asaas', 'POST /api/billing/webhook/simulado', 'POST /api/billing/webhook/infinitepay']);
const decodeURIComponentSafe = v => { try { return decodeURIComponent(v) } catch { return '\u0000' } };
const server = http.createServer(async (req, res) => {
  const t0 = performance.now(), audit = watchResponse(res);
  res.on('finish', () => recordRequest({ method: req.method, key: req.method + ' ' + new URL(req.url, 'http://x').pathname, path: new URL(req.url, 'http://x').pathname, status: audit.status, code: audit.code,
    ms: performance.now() - t0, ip: clientIp(req), ua: req.headers['user-agent'], user: req.auditUser, legacyUser: req.auditLegacy, routeKnown: !!routes[req.method + ' ' + new URL(req.url, 'http://x').pathname] }));
  for (const [h, v] of Object.entries(SEC_HEADERS)) res.setHeader(h, v);
  const url = new URL(req.url, 'http://x');
  const key = req.method + ' ' + url.pathname;
  // CSRF (sessão por cookie, SameSite=Lax): escrita vinda de outra origem é recusada. Navegadores sempre mandam Origin
  // em POST cross-site; chamadas servidor-a-servidor (sem Origin/Referer) seguem normalmente.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !originAllowed(req, key)) return json(res, 403, { error: 'Origem não permitida', code: 'CSRF_ORIGIN' });
  const retry = rateLimited(key, req);
  if (req.rl) { res.setHeader('RateLimit-Limit', String(req.rl.limit)); res.setHeader('RateLimit-Remaining', String(req.rl.remaining)); res.setHeader('RateLimit-Reset', String(req.rl.reset)); }
  if (retry) return json(res, 429, { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' }, { 'Retry-After': String(retry) });
  const handler = routes[key];
  if (!handler) return json(res, 404, { error: 'Endereço não encontrado', code: 'NOT_FOUND' });
  // V5 middleware central: validacao basica da URL, autenticacao e autorizacao antes de qualquer rota (defesa em profundidade;
  // as rotas continuam conferindo papel/escopo). Auditoria de cada acao em request_audit (audit-log.js).
  if (url.pathname.length > 512 || url.search.length > 4096 || /[\u0000-\u001f\u007f]/.test(decodeURIComponentSafe(url.pathname + url.search))) return json(res, 400, { error: 'Requisição inválida', code: 'INVALID_INPUT' });
  try {
    // V3: checagem central de entitlements (recurso, assinatura ativa, verificação) antes da rota
    const gu = await authUser(req).catch(() => null);
    const lu = gu ? null : readSession(req);
    req.auditUser = gu; req.auditLegacy = lu;
    if (!PUBLIC_ROUTES.has(key) && !(TEST_RL_RESET && key === 'POST /api/test/rate-limit/reset') && !gu && !lu) return json(res, 401, { error: 'Não autenticado', code: 'AUTH_REQUIRED' });
    if (url.pathname.startsWith('/api/adm/') && !(gu && Array.isArray(gu.roles) && gu.roles.includes('admin'))) return json(res, 403, { error: 'Somente administradores', code: 'PERMISSION_DENIED' });
    if (!(await entitlementGate(key, gu, res, json))) return;
    if (!(await accessGate(key, gu, res, json))) return;
    if (!(await monetizationGate(key, gu, res, json))) return;   // Sem assinatura, teste ou cobertura pelo personal: 402 quando a monetizacao esta ativa.
    await handler(req, res);
  }
  catch (e) {
    // limite estourado dentro de uma transação (corrida pelo último lugar): resposta padronizada
    if (e && (e.code === 'LIMIT_REACHED' || e.code === 'SUBSCRIPTION_INACTIVE') && !res.headersSent) return json(res, e.code === 'LIMIT_REACHED' ? 409 : 402, { error: e.message, code: e.code, metric: e.metric, used: e.used, limit: e.limit, plan: e.plan });
    // log sem corpo da requisição nem "detail" do Postgres (pode conter e-mail/valores)
    console.error(key, e && e.code ? '[' + e.code + ']' : '', e && e.message, e && e.stack ? '\n' + String(e.stack).split('\n').slice(1, 6).join('\n') : '');
    if (e && (e.status === 400 || e.status === 413) && !res.headersSent) return json(res, e.status, { error: e.message, code: e.status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_INPUT' });
    if (!res.headersSent) json(res, 500, { error: 'Erro interno. Tente de novo em instantes.', code: 'SERVER_ERROR' });
  }
// HOST: em produção use 127.0.0.1 (só o gateway/túnel acessa). Padrão 0.0.0.0 mantém o docker-compose funcionando.
});
server.listen(PORT, process.env.HOST || '0.0.0.0', () => console.log(`gym-api on ${process.env.HOST || '0.0.0.0'}:${PORT} (origin=${ORIGIN})`));
startMailer();
startAuditPurge();   // V5: retencao da auditoria (app_settings auditoria_retencao_dias; padrao AUDIT_RETENTION_DAYS ou 180)
setBillingPush(sendPush);   // V5: eventos de cobranca tambem saem por push
startNoticeReminderJob(sendPush);   // lembrete persistido dos avisos da Comunidade
startLiveNoticeReconciliation(sendPush); // publica cards das lives futuras anteriores a integracao
startPosturalRecurrence();   // Avaliação Postural: recorrência mensal idempotente e retenção da mídia (POSTURAL_RECURRENCE=off desliga)
startBillingJob();          // V5: renovacao, retentativa, carencia, suspensao e reconciliacao (BILLING_TICK=off desliga)   // V4.2: fila de e-mail (só envia com SMTP configurado)
