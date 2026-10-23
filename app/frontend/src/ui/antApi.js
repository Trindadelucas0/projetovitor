// Referência ao App.useApp() do AntProvider montado (message/modal/notification com o tema certo).
// null quando nenhuma área antd está na tela: quem usa cai no fallback (lib/dialog.js).
let api = null
export const setAntApi = a => { api = a }
export const getAntApi = () => api
