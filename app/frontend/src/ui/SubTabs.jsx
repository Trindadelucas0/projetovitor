// Subabas do admin (antd Tabs). items = [[chave, rótulo, ...], ...]. Cada rótulo fica num span com data-testid
// (testids[chave] ou sub-<chave>) para testes e tours. Só as abas: o conteúdo continua fora (renderizado pela tela).
import { Tabs } from 'antd'
export default function SubTabs({ items, current, onChange, testids = {}, className = '' }) {
  return <Tabs className={('adm-subtabs mg-subtabs ' + className).trim()} activeKey={current} onChange={onChange}
    items={items.map(([k, l]) => ({ key: k, label: <span data-testid={testids[k] || 'sub-' + k}>{l}</span> }))} />
}
