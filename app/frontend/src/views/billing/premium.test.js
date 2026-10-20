import { beforeEach, describe, expect, it, vi } from 'vitest'
const fixture=vi.hoisted(()=>({user:{id:'a'},api:vi.fn()}))
vi.mock('../../lib/api.js',()=>({api:fixture.api}))
vi.mock('../../store/useStore.js',()=>({useStore:Object.assign(fn=>fn({user:fixture.user}),{getState:()=>({user:fixture.user})})}))
vi.mock('../../components/Icon.jsx',()=>({default:()=>null}))
import { usePremiumStore } from './Premium.jsx'
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}
beforeEach(()=>{fixture.user={id:'a'};fixture.api.mockReset();usePremiumStore.getState().reset()})
describe('isolamento do estado premium',()=>{
 it('ignora resposta da conta anterior após trocar de usuário',async()=>{
  const old=deferred();fixture.api.mockReturnValueOnce(old.promise)
  const a=usePremiumStore.getState().load();fixture.user={id:'b'};usePremiumStore.getState().reset()
  fixture.api.mockResolvedValueOnce({monetized:true,has_any:false});await usePremiumStore.getState().load()
  old.resolve({monetized:true,has_any:true});await a
  expect(usePremiumStore.getState().owner).toBe('b');expect(usePremiumStore.getState().acc.has_any).toBe(false)
 })
 it('não recupera acesso de resposta antiga após logout',async()=>{
  const old=deferred();fixture.api.mockReturnValueOnce(old.promise)
  const a=usePremiumStore.getState().load();fixture.user=null;usePremiumStore.getState().reset()
  old.resolve({has_any:true});await a;expect(usePremiumStore.getState().acc).toBe(null)
 })
 it('resposta anterior não substitui acesso atualizado pela ativação',async()=>{
  const old=deferred();fixture.api.mockReturnValueOnce(old.promise)
  const first=usePremiumStore.getState().load();fixture.api.mockResolvedValueOnce({has_any:true})
  await usePremiumStore.getState().load();old.resolve({has_any:false});await first
  expect(usePremiumStore.getState().acc.has_any).toBe(true)
 })
 it('falha inicial informa erro sem conceder acesso',async()=>{
  fixture.api.mockRejectedValueOnce(Error('offline'));await usePremiumStore.getState().load()
  expect(usePremiumStore.getState().acc).toBe(null);expect(usePremiumStore.getState().error).toBe(true)
 })
})
