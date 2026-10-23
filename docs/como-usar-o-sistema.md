# Projeto Vitor — guia de uso

Este guia descreve as ações do aplicativo de um personal e seus alunos. O nome Projeto Vitor identifica o produto nesta documentação; a marca mostrada nas telas ainda é a anterior nesta cópia. Consulte o [PRD e App Flow](PRD-PROJETO-VITOR.md) para a jornada completa e a [documentação oficial](../app/DOCUMENTACAO-SISTEMA.md) para o comportamento confirmado e os limites de validação.

## Primeiro uso da base local

A base local começa com **zero alunos** e duas contas separadas. O administrador entra com a conta definida em `ADMIN_EMAIL` e abre somente o painel administrativo. O personal principal entra com a conta definida em `PERSONAL_PRINCIPAL_EMAIL`, troca a senha provisória no primeiro acesso e abre a área profissional em `/pro`. Esses valores ficam somente no `.env`. A publicação na VPS e a contratação do plano exigem validação própria antes de receber alunos reais.

## Acesso à instalação na VPS

Abra `https://academia.avadesk.com.br` no navegador. As três contas solicitadas (administração, personal principal e aluno de teste) foram configuradas na VPS. O responsável pode consultar os arquivos protegidos `/opt/projetovitor-runtime/credentials/admin.txt`, `/opt/projetovitor-runtime/credentials/personal.txt` e `/opt/projetovitor-runtime/credentials/aluno.txt` diretamente na VPS, sem enviar as senhas por chat. Após entrar, aceite os documentos pendentes e troque a senha em **Perfil**.

Se a tela de aceite já estava aberta antes da configuração dos dados da empresa em 22/10/2026, atualize a página uma vez. Marque os documentos obrigatórios e use **Continuar**; o consentimento de dados de saúde continua opcional. Se voltar a aparecer **Aguardando dados da empresa**, o administrador deve conferir **Administração → Empresa / Dados da empresa**, sem contornar o aceite.

O domínio e os três logins foram verificados. O aluno de teste entra com papel de aluno e já está vinculado ao personal principal, mas as áreas internas continuam bloqueadas até um pagamento confirmado; a conta não recebeu cobrança fictícia. Esta instalação usa cobrança simulada: cadastro e pagamento de alunos reais dependem de configuração comercial, legal e validação própria antes da liberação.

## Aluno: começar

1. Abra o cadastro, preencha **Acesso**, **Seus dados**, **Assinatura** e **Confirmação** e aceite os documentos obrigatórios.
2. Depois da conta criada, abra **Planos e pagamento** e conclua o checkout. O acesso depende da confirmação de pagamento recebida pelo servidor. Pagamento pendente não libera treino, progresso e comunidade.
3. Ao entrar, abra **Treinos**. Se ainda não houver ficha, aguarde o personal publicar uma; o aplicativo não oferece programa pronto como substituto.
4. Quando a ficha estiver disponível, abra **Organizar semana** para associar os treinos aos dias ou deixar **Livre**. A agenda muda apenas os dias; os exercícios continuam sob responsabilidade do personal.
5. Escolha o treino, confira as cargas em **Defina os pesos** e toque em **Confirmar pesos e iniciar treino**. Na execução, veja a série atual, ajuste carga e repetições, toque em **Iniciar série** e depois em **Concluir série**. Em exercício por tempo e no descanso, o anel mostra o tempo restante; em exercício por repetições, mostra o tempo decorrido. Para vídeo e instruções, toque em **Como fazer**; para histórico e notas, abra **Séries e última vez**.
6. No descanso, use **−15 s** ou **+15 s** se precisar. Ao chegar a zero, toque em **Iniciar série** para continuar; a série não começa sozinha. Também é possível tocar em **Iniciar próxima série agora** ou **Pular descanso**.
7. Use **Tenho uma dúvida** para perguntar sobre a execução. Use o relato de dor ou desconforto quando necessário; esse caso pode pausar o exercício até a orientação do personal. Depois de **Concluir treino**, consulte **Para a próxima vez** para ler a orientação do personal daquele treino. Se ele não deixou uma orientação, aparece uma mensagem neutra.
   Na mesma confirmação, **Músculos trabalhados neste treino** mostra o mapa de frente e costas e o grupo com mais séries realizadas. Se o treino estiver aguardando conexão, o mapa aparece depois que o servidor confirmar o salvamento.
8. Ao concluir, abra **Progresso**. Em **Destaques recentes**, veja no mapa de frente e costas quais grupos musculares foram trabalhados nos últimos 30 dias e qual recebeu mais séries efetivas; toque em **Ver estatísticas detalhadas** para aprofundar. O mapa também aparece para o aluno vinculado ao personal. Sem treino válido no período, o corpo fica sem áreas coloridas e a tela informa que não há músculos treinados. Comparação indisponível significa ausência de base suficiente, e não desempenho zero.

## Comunidade

Abra **Comunidade → Publicações** para acompanhar o feed. Use **Todos** para ver o feed geral ou **Seguindo** para mostrar somente os perfis acompanhados. O filtro por assunto não faz mais parte da tela. Quando a conta estiver autorizada a publicar, o botão **Nova publicação** continua disponível.

Em **Comunidade → Avisos**, o aluno encontra lives, vídeos, promoções e comunicados enviados pelo próprio personal. Toque em **Abrir live ou conteúdo** para abrir o link HTTPS. O mesmo aviso aparece no sino; quando o aparelho autorizou notificações push, ele também pode aparecer fora do aplicativo. O banner completo permanece disponível no card mesmo quando o sistema do aparelho não mostra imagens em notificações.

Para publicar, o personal ativo ou administrador abre **Comunidade → Avisos → Novo aviso**, informa título, link e mensagem, escolhe a miniatura automática do YouTube, uma imagem PNG/JPEG/WebP de até 2,5 MB ou o banner padrão e, se necessário, marca **Notificar novamente** com data e hora futuras. **Publicar aviso** envia a primeira notificação imediatamente. O personal alcança somente alunos com vínculo ativo; o administrador alcança todos os alunos ativos do ambiente. Em um aviso ativo, **Editar** altera o card e o lembrete ainda não enviado; **Encerrar aviso** interrompe o lembrete pendente.

Para a **Live semanal**, o administrador não precisa repetir esse cadastro. Em **Admin → Comunidade → Live semanal**, informe título e data/hora futura; o link do YouTube é opcional e pode ser acrescentado depois. Ao salvar como **Agendada**, o sistema publica um único card em Avisos, notifica os alunos na hora e agenda outro lembrete para o horário da live. Sem link, o card fica visível sem o botão de acesso; ao editar a live e informar o link, o mesmo card recebe o botão e a miniatura, sem nova notificação inicial. Encerrar ou cancelar a live também encerra o card e o lembrete pendente.

## Personal principal: atender

1. Entre com a conta do personal no contexto **Área profissional**; o painel abre em `/pro`. Mesmo que essa conta também tenha acesso administrativo, use o contexto **Administração** apenas para abrir `/admin/painel`. Em **Alunos**, use **Adicionar aluno** para cadastrar uma conta nova ou enviar convite para uma conta existente.
2. Abra o aluno e use **Criar treino**. A etapa **Para quem** já vem com o aluno escolhido; dê um nome à ficha, toque no objetivo e, se quiser partir de algo pronto, use **Começar de um modelo** — a lista abre com busca e separa os seus dos compartilhados. Toque em **Dias e exercícios**.
3. Em **Dias e exercícios**, cada dia tem um menu (ícone à direita do nome) com **Renomear**, **Duplicar dia**, **Copiar exercícios de…**, **Limpar** e **Remover**. Marque o dia da semana ou deixe **Livre**. Preencha **Para a próxima vez** se quiser orientar o aluno depois que ele concluir esse treino; a orientação de antes de começar continua em campo separado. Na biblioteca, um toque na linha põe o exercício no dia; quem já está lá aparece marcado como **no dia**. Abra um exercício para ajustar séries, repetições ou tempo, carga, descanso, vídeo e orientações, e use **Montar bi-set** para juntar 2 ou 3 exercícios em sequência. O limite é 7 dias e 40 exercícios por dia.
4. Em **Revisar e enviar**, o topo lista o que falta; tocar numa pendência leva direto ao campo que a causou. Abaixo vem a ficha como o aluno vai ver. Quando não houver pendência, use **Enviar para <aluno>** ou **Salvar e enviar nova versão**; **Salvar como modelo** guarda a ficha para reaproveitar (se já existir um modelo com o mesmo nome, o app pergunta se é para atualizar ou criar outro). A ficha anterior do aluno fica no histórico. Confirme na conta do aluno antes de considerar a entrega validada.
5. Saindo no meio, o app pergunta antes de descartar. O que foi digitado fica guardado neste aparelho: ao reabrir, aparece a faixa **Retomar / Descartar** rascunho.
6. Em **Atendimentos**, responda mensagens, ocorrências e propostas. Dor e desconforto exigem orientação antes da retomada do exercício afetado.
7. Em **Avaliações**, abra **Nova solicitação**, escolha aluno e protocolo e defina prazo ou repetição. Depois do envio do aluno, revise cada captura, peça recaptura com motivo quando necessário e publique a devolutiva escrita.
8. O personal não entra nas telas administrativas de usuários, cobrança, configurações ou governança dos protocolos.

## Administrador: governar o sistema

1. Entre com a conta administrativa e abra `/admin/painel`.
2. Use o painel para usuários, assinaturas, configurações, supervisão e auditoria.
3. Em **Avaliação postural**, o administrador pode acompanhar todas as avaliações do ambiente, inclusive mídias, e administrar protocolos, versões, termo e retenção.
4. A conta administrativa não é necessária para cadastrar alunos, montar fichas ou fazer o atendimento diário do personal.
5. Em uma instalação nova, preencha os dados oficiais em **Dados da empresa** antes de liberar cadastros. Os contatos salvos nessa tela continuam editáveis e têm prioridade sobre a configuração inicial do servidor.

## Personal interno e transferência

O administrador pode criar um personal interno e transferir um aluno com motivo registrado. A ficha do responsável anterior fica no histórico; o novo responsável deve publicar a ficha seguinte. O aluno continua sujeito ao próprio pagamento. A transferência não deve ocorrer por edição direta de banco.

## Conta, privacidade e problemas

Quando o personal solicitar uma avaliação postural, o aluno verá **Nova avaliação postural** ao entrar no app. **Iniciar avaliação** abre as etapas; **Agora não** fecha o aviso apenas nesta abertura. A solicitação continua no cartão do **Início** e de **Acompanhamento** e o aviso volta na próxima abertura enquanto a avaliação estiver pendente. Depois do envio, cancelamento ou conclusão, esse aviso de nova solicitação deixa de aparecer. Fotos e vídeos não aparecem no popup.

Na preparação, marque a lista curta e abra **Ver orientações completas** quando precisar de detalhes. Em uma etapa, use as setas em **Exemplo 1 de N** para ver outras demonstrações; **Ver cuidados e detalhes** mostra o restante das instruções. Confira sua foto ou vídeo antes de enviar. Se o armazenamento falhar, o aviso explica o problema e você pode tentar de novo.

Para cadastrar demonstrações gerais, o administrador abre **Avaliação postural → Protocolos e indicadores**, escolhe a versão e a etapa e usa **Adicionar foto ou vídeo** em **Demonstrações para novas avaliações**. Para exemplos próprios, o personal abre **Avaliações posturais → Meus exemplos**, escolhe protocolo e etapa e usa o mesmo botão. As setas de ordem definem o primeiro exemplo. Mudar a lista afeta apenas avaliações solicitadas depois da mudança.

Em **Perfil**, o aluno consulta assinatura, avisos e documentos. Em **Preferências** ficam o tema, o idioma e as configurações do treino (unidades, descanso, som e lembretes). Para solicitar exportação ou exclusão dos seus dados, use as ações de privacidade disponíveis na conta. Fotos e vídeos da avaliação postural não são publicações da Comunidade.

Na primeira vez em cada tela aparece um guia curto, em passos, explicando o que está ali; use **Pular** para fechar. Para vê-lo de novo, abra **Perfil › Ajuda e suporte › Rever orientações**.

Se o pagamento não liberar acesso, confira o status em **Planos e pagamento**; não repita cobranças sem verificar a anterior. Se a ficha ou uma avaliação não aparecer, informe o personal responsável para conferir vínculo e publicação. A primeira cobrança real e a avaliação postural em aparelho ainda precisam de homologação no ambiente alvo.
