// V4.1 — regra pura: está no meio de um treino? (então não recarregar o app)
export const inWorkout = (hash, sess) => /^#\/(treinar|concluido)/.test(hash || '') || !!(sess && !sess.finished_at)
