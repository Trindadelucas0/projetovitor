// Gaveta do admin (antd Drawer). Desktop: à direita, 560 px. Celular (< 640 px): de baixo, 90% da altura.
// Mesma API do Drawer antigo ({ title, onClose, children }) + open/width/extra/footer.
import { Drawer } from 'antd'
import { CloseOutlined } from '@ant-design/icons'
import { useMedia } from './useMedia.js'
export default function AdmDrawer({ title, onClose, children, open = true, width = 560, extra, footer, className = '', ...rest }) {
  const mobile = useMedia('(max-width: 640px)')
  return <Drawer open={open} onClose={onClose} title={title} placement={mobile ? 'bottom' : 'right'} size={mobile ? '90%' : width}
    destroyOnHidden rootClassName={('orny-antd adm-drawer-antd ' + className).trim()} closeIcon={<CloseOutlined aria-hidden="true" />}
    closable={{ 'aria-label': 'Fechar' }} extra={extra} footer={footer} aria-label={typeof title === 'string' ? title : undefined} {...rest}>
    {children}
  </Drawer>
}
