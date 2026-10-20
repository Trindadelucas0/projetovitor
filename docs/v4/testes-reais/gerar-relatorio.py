# Gera RELATORIO-TESTES-AVAGYM.pdf + INDICE.md a partir de docs/v4/testes-reais/resultados.json (testes locais).
import json, os, sys, datetime
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
from reportlab.lib.units import cm
D = sys.argv[1]; out = sys.argv[2]
a = json.load(open(D + '/resultados.json'))
FL = {'normal': '1) Usuário normal', 'personal': '2) Personal e aluno cadastrado por ele', 'codigo': '3) Aluno pelo código do personal', 'pendente': '4) Personal com mensalidade pendente', 'admin': '5) Administração', 'codigo-aluno': '6) Código de aluno no lugar de convite'}
ss = getSampleStyleSheet(); st = []
ok = sum(x['ok'] for x in a)
st += [Paragraph('AVAGYM — Relatório de testes como cliente real', ss['Title']),
  Paragraph(f'Ambiente: LOCAL (box, localhost:4449 + API local). Nenhum dado criado em produção. Data: {datetime.datetime.now():%d/%m/%Y %H:%M} (BRT). Celular 390px, tema claro (admin em 1280px). Contas fictícias de teste; e-mails e senhas borrados nos prints.', ss['Normal']),
  Spacer(1, 8), Paragraph(f'<b>Resultado: {ok} de {len(a)} passos OK.</b>', ss['Heading3'])]
rows = [['Fluxo', 'Passos', 'OK', 'Falhas']]
for k, l in FL.items():
  xs = [x for x in a if x['flow'] == k]
  if xs: rows.append([l, len(xs), sum(x['ok'] for x in xs), len(xs) - sum(x['ok'] for x in xs)])
t = Table(rows, colWidths=[9*cm, 2*cm, 2*cm, 2*cm]); t.setStyle(TableStyle([('GRID', (0,0), (-1,-1), .4, colors.grey), ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#d9f99d'))])); st += [t]
fails = [x for x in a if not x['ok']]
if fails:
  st += [Spacer(1, 8), Paragraph('Falhas', ss['Heading3'])] + [Paragraph(f"• {FL.get(x['flow'],x['flow'])} — {x['step']}: {x['err']}", ss['Normal']) for x in fails]
idx = ['# Testes reais (local) — índice', '', f'{ok}/{len(a)} passos OK. PDF: RELATORIO-TESTES-AVAGYM.pdf', '', '| # | Fluxo | Passo | Resultado | Print |', '|---|---|---|---|---|']
cur = None
for i, x in enumerate(a, 1):
  if x['flow'] != cur: cur = x['flow']; st += [PageBreak(), Paragraph(FL.get(cur, cur), ss['Heading1'])]
  res = 'OK' if x['ok'] else 'FALHA'
  block = [Paragraph(f"<b>{i}. {x['step']}</b> — <font color='{'#15803d' if x['ok'] else '#b91c1c'}'>{res}</font>" + (f"<br/><font size=8>{x['err']}</font>" if x['err'] else ''), ss['Normal'])]
  p = D + '/' + x['shot']
  if os.path.exists(p):
    from PIL import Image as PI
    w, h = PI.open(p).size; W = 7.5*cm if w < 600 else 15*cm; H = W * h / w
    if H > 15*cm: W, H = W * 15*cm / H, 15*cm
    block.append(Image(p, W, H))
  st.append(KeepTogether(block + [Spacer(1, 10)]))
  idx.append(f"| {i} | {FL.get(x['flow'],x['flow'])} | {x['step']} | {res} | [{os.path.basename(x['shot'])}]({x['shot']}) |")
SimpleDocTemplate(out, pagesize=A4, leftMargin=1.5*cm, rightMargin=1.5*cm, topMargin=1.5*cm, bottomMargin=1.5*cm).build(st)
open(D + '/INDICE.md', 'w').write('\n'.join(idx) + '\n')
print('ok', out)
