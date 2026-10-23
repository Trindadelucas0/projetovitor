// dayjs configurado uma vez para os componentes antd (DatePicker/TimePicker): pt-BR e fuso de São Paulo.
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import 'dayjs/locale/pt-br'
dayjs.extend(utc); dayjs.extend(timezone); dayjs.extend(customParseFormat)
dayjs.locale('pt-br')
export const TZ = 'America/Sao_Paulo'
dayjs.tz.setDefault(TZ)
// "2026-10-24T19:00" no horário de São Paulo → ISO UTC (antes era manual: -3h)
export const spToISO = (date, time) => dayjs.tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm', TZ).toISOString()
// ISO → dayjs no horário de São Paulo
export const inSP = iso => dayjs(iso).tz(TZ)
export default dayjs
// ISO → dayjs "de parede" (sem fuso) com a hora de São Paulo: é o valor que os pickers mostram e devolvem
export const spWall = iso => dayjs(dayjs(iso).tz(TZ).format('YYYY-MM-DD HH:mm'), 'YYYY-MM-DD HH:mm')
// valor de parede de um picker → ISO UTC, interpretando como horário de São Paulo
export const wallToISO = d => spToISO(d.format('YYYY-MM-DD'), d.format('HH:mm'))
