import '../env.js'
import pg from 'pg'
import { AsyncLocalStorage } from 'node:async_hooks'
export const dbConfig = (database = process.env.DB_NAME || 'avagym') => ({
  host: process.env.DB_HOST || 'localhost', port: +(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD || '', database
})
export const pool = new pg.Pool({ ...dbConfig(), max: 10 })
const context = new AsyncLocalStorage()
export const q = (text, params) => (context.getStore() || pool).query(text, params)
export async function transaction(work) {
  if (context.getStore()) return work(context.getStore())
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await context.run(client, () => work(client))
    await client.query('commit')
    return result
  } catch (error) { await client.query('rollback'); throw error }
  finally { client.release() }
}
