#!/usr/bin/env python3
# Gera CASOS-DE-TESTE-AVAGYM.md e um .md por perfil a partir de resultados-<perfil>.json (suítes e2e/personas).
import json, os, datetime
D = os.path.dirname(os.path.abspath(__file__))
PERFIS = [
 ('aluno-cliente', 'Aluno (usuário normal)', 'Marina Souza', 'Celular 390×844, tema claro. Conta nova criada pela própria suíte (e-mail fictício @lock.test, que nasce travada). Admin de teste local disponível para liberar.'),
 ('aluno-do-personal', 'Aluno do personal', 'Juliana Alves (e Lia, conta criada pelo personal)', 'Celular 390×844. Personal fictício novo, verificado e ativo (preparado pela suíte). Juliana com conta própria; Lia criada pelo personal com senha provisória.'),
 ('personal', 'Personal', 'Carlos Mendes', 'Celular 390×844. Conta profissional nova criada pela suíte. Admin de teste local para verificar/ativar/liberar publicação.'),
 ('admin', 'Admin', 'Lucas (admin)', 'Notebook 1280×860, conta admin.e2e@avadesk.local (local). Suíte cria um pedido de liberação e um personal com verificação pendente.'),
]
UX = {
 'aluno-cliente': (8.0,
  ['Aviso de conta travada e botão "Pedir liberação" claros; o pedido fica visível como pendente.',
   'Fluxo de treino excelente: preparação de cargas, cronômetro, descanso, "Relatar dor" sempre à vista e conclusão em 3 etapas.',
   'Regra de um único treino ativo fica evidente; nada de Biblioteca ou telas de profissional.',
   'Tema claro/escuro e tour de boas-vindas funcionam e podem ser revistos em Perfil › Ajuda.'],
  ['Depois do cadastro a pessoa fica travada até um admin aprovar — para cliente real isso é atrito alto e sem prazo informado.',
   '"Meu código" fica escondido em Perfil › Meus dados; não está claro para que serve até alguém pedir.',
   'Exportação LGPD só por e-mail, limite de 1 por 24 h, e sem e-mail configurado o pedido fica "na fila" — pode parecer que não funcionou.'],
  ['(Alta) Mostrar prazo/expectativa na tela de conta travada ("em até X horas") e notificar quando liberar.',
   '(Média) Trazer "Meu código" para o topo do Perfil com explicação curta ("envie ao seu personal").',
   '(Baixa) Na LGPD, deixar explícito quando o e-mail ainda não está configurado no servidor.']),
 'aluno-do-personal': (7.5,
  ['Popup quando um código de aluno é digitado no campo de convite é ótimo: explica, não vaza o nome de ninguém.',
   'Aceitar convite é simples e mostra "Verificado" no personal; convite usado não pode ser reaceito.',
   'Card "Meus profissionais" e página do profissional dão segurança; a ficha vira o treino ativo sozinha.',
   'Áreas travadas da conta do plano do personal explicam o motivo e oferecem "Ver minhas fichas".'],
  ['Sem ficha, a tela Treinos repete "Você está vinculado a…" em dois cartões seguidos.',
   'Mesmo tendo personal, o Início manda para o questionário inicial (objetivo/nível) dos programas do sistema.',
   'Diferença entre aluno convidado (pode "Desvincular ficha de personal") e conta do plano do personal (não pode) não é explicada na tela.'],
  ['(Alta) Pular ou encurtar o questionário inicial quando já existe personal vinculado.',
   '(Média) Unificar a mensagem "Você está vinculado a…" num único cartão com o botão "Ver profissional".',
   '(Média) Confirmar com texto claro o que acontece ao desvincular (o personal deixa de ver os treinos?).']),
 'personal': (7.0,
  ['Bloqueio de convites antes da verificação é claro (botão desabilitado + aviso) e garantido pela API.',
   'Senha provisória exibida uma única vez, troca obrigatória no 1º login do aluno.',
   'Convite direcionado pelo código do aluno e popup do código de aluno colado como convite funcionam bem.',
   'Dúvida do aluno chega em Atendimentos e a resposta é rápida pela conversa.'],
  ['São três liberações separadas do admin (verificar, ativar, "pode publicar") e o personal não vê qual falta: o botão "Nova publicação" simplesmente não aparece.',
   'A Biblioteca de exercícios (/library) era inacessível para personal e admin (redirecionava para o painel) — corrigido nesta rodada.',
   'Muitos atalhos parecidos ("Adicionar aluno", "Cadastrar", "Convites pendentes") na aba Alunos.'],
  ['(Alta) Checklist no painel: "Verificação ✔ · Perfil ativo ✔ · Publicação liberada ✖" com o que fazer.',
   '(Alta) Ativar automaticamente (ou sugerir ao admin) quando a verificação for aprovada.',
   '(Média) Explicar no feed por que ainda não pode publicar.',
   '(Baixa) Agrupar "Adicionar aluno" num único menu: convidar por código, link, ou criar conta.']),
 'admin': (8.0,
  ['Todas as 24 áreas abriram sem erro; painel do usuário com mensalidade e assinatura num lugar só.',
   'Ações críticas pedem motivo (ativar profissional) e aparecem na Auditoria.',
   'Permissões garantidas no servidor: 401 sem login, 403 para aluno e personal, redirecionamento das telas.',
   'Tour do admin e layout no celular funcionam.'],
  ['Menu lateral muito longo; áreas parecidas (Pendências x Liberação x Solicitações) confundem.',
   'Para deixar um personal 100% operante são 3 telas diferentes (Verificação, Profissionais, permissão de publicar).'],
  ['(Alta) Ação única "Aprovar profissional" que verifica, ativa e libera publicação (com motivo).',
   '(Média) Agrupar Pendências/Liberação/Solicitações numa caixa de entrada única com contadores.',
   '(Baixa) Busca global por nome/e-mail no topo do painel.']),
}
def load(p):
    f = f'{D}/resultados-{p}.json'
    return json.load(open(f)) if os.path.exists(f) else []
def passos(r, persona):
    obj = r['objetivo']; apoio = obj.startswith('[apoio')
    quem = 'o admin de teste' if 'apoio admin' in obj else 'o personal de teste' if 'apoio personal' in obj else 'o aluno de teste' if 'apoio aluno' in obj else persona
    return f"1. Entrar como {quem}. 2. Abrir `{r.get('url') or '/'}` no app local. 3. Executar: {obj.split('] ',1)[-1]}."
def tabela(p, persona, pre):
    rs = load(p); out = []
    ok = sum(r['ok'] for r in rs)
    out.append(f'**Pré-condições gerais:** {pre}\n\n**Resultado:** {ok} PASS / {len(rs)-ok} FAIL de {len(rs)} casos.\n')
    out.append('| ID | Objetivo | Pré-condições | Passos | Resultado esperado | Obtido | Print |\n|---|---|---|---|---|---|---|')
    for r in rs:
        o = r['objetivo'].replace('|', '/'); pc = 'Passos anteriores concluídos' + (' (ação de apoio de outro perfil)' if o.startswith('[apoio') else '')
        esp = 'O sistema cumpre: ' + o.split('] ',1)[-1]
        res = 'PASS' if r['ok'] else 'FAIL — ' + r['err'].replace('|', '/')[:140]
        out.append(f"| {r['id']} | {o} | {pc} | {passos(r, persona)} | {esp} | {res} | [print]({r['shot']}) |")
    return '\n'.join(out), ok, len(rs)
def ux(p):
    n, bom, conf, sug = UX[p]
    return (f'**Nota UX/UI: {n:.1f}/10**\n\n**O que está bom**\n' + '\n'.join('- ' + x for x in bom) +
            '\n\n**O que confunde**\n' + '\n'.join('- ' + x for x in conf) + '\n\n**Sugestões (por prioridade)**\n' + '\n'.join(f'{i}. {x}' for i, x in enumerate(sug, 1)))
hoje = datetime.date.today().strftime('%d/%m/%Y')
cab = f'_Gerado em {hoje} por `gerar-casos.py` a partir das suítes `app/frontend/e2e/personas/*.spec.js`, executadas **somente localmente** (API :8787 + Postgres local, contas fictícias, sem e-mail real). Prints com e-mails, senhas, senha provisória e "Meu código" borrados (códigos de convite visíveis são fictícios e locais)._\n'
main = ['# Casos de teste AVAGYM V4 — por perfil (personas)\n', cab, '| Perfil | Persona | PASS | FAIL | Nota UX |', '|---|---|---|---|---|']
secs, tot = [], [0, 0]
for p, nome, persona, pre in PERFIS:
    t, ok, n = tabela(p, persona, pre); tot[0] += ok; tot[1] += n
    main.append(f'| {nome} | {persona} | {ok} | {n-ok} | {UX[p][0]:.1f} |')
    body = f'## {nome} — {persona}\n\nPersona: [`docs/v4/personas/{p}.md`](../personas/{p}.md)\n\n### Casos de teste\n\n{t}\n\n### Avaliação UX/UI\n\n{ux(p)}\n'
    secs.append(body)
    open(f'{D}/{p}.md', 'w').write(f'# Casos de teste — {nome}\n\n{cab}\n' + body.split('\n', 1)[1])
main.append(f'| **Total** | | **{tot[0]}** | **{tot[1]-tot[0]}** | |\n')
main += secs
main.append(open(f'{D}/_veredito.md').read() if os.path.exists(f'{D}/_veredito.md') else '')
open(f'{D}/CASOS-DE-TESTE-AVAGYM.md', 'w').write('\n'.join(main))
print('ok', tot)
