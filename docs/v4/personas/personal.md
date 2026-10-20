# Persona — Personal trainer

**Carlos Mendes**, 34 anos, personal com CREF em São Paulo. Atende ~10 alunos em academia e online.

| Item | Detalhe |
|---|---|
| Objetivo | Cadastrar alunos rápido, montar e publicar fichas, responder dúvidas no celular |
| Aparelho | iPhone (390×844) entre um atendimento e outro |
| Nível técnico | Médio-alto: usa planilhas, Instagram para divulgar |
| Medos | Burocracia na verificação, aluno não conseguir entrar, cobrança travar os alunos |

## Jornadas
1. **Cadastro** como "Sou profissional".
2. **Verificação**: sem verificação não convida (botão desabilitado + API recusa); envia CREF e documento; admin verifica; regra **ativo + verificado** para convidar; admin ativa.
3. **Convites**: link aberto, convite direcionado pelo código do aluno (share_code); popup quando cola um código de aluno no lugar de convite.
4. **Cadastro pelo código do personal**: aluno usa o código dele no cadastro e aparece na lista.
5. **Senha provisória**: cadastra aluno, senha aparece uma vez, aluno troca no 1º login e aceita os termos.
6. **Fichas e Biblioteca**: abre a Biblioteca de exercícios, cria e publica a ficha.
7. **Atendimento**: recebe a dúvida em Atendimentos e responde na conversa.
8. **Comunidade**: publicar só depois que o admin libera "pode publicar".
9. **Mensalidade pendente**: aluno só visualiza com aviso; personal vê aviso.
10. **Tour** do painel.

## Expectativas
- Saber exatamente o que falta para poder convidar.
- Senha provisória fácil de repassar, sem vazar depois.
- Dúvidas dos alunos visíveis no painel em segundos.

Suíte automatizada: `app/frontend/e2e/personas/personal.spec.js`.
