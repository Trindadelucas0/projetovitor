# Projeto Vitor — guia de uso

Este guia descreve as ações do aplicativo de um personal e seus alunos. O nome Projeto Vitor identifica o produto nesta documentação; a marca mostrada nas telas ainda é a anterior nesta cópia. Consulte o [PRD e App Flow](PRD-PROJETO-VITOR.md) para a jornada completa e a [documentação oficial](../app/DOCUMENTACAO-SISTEMA.md) para o comportamento confirmado e os limites de validação.

## Primeiro uso da base local

A base local começa com **zero alunos** e duas contas separadas. O administrador entra com a conta definida em `ADMIN_EMAIL` e abre somente o painel administrativo. O personal principal entra com a conta definida em `PERSONAL_PRINCIPAL_EMAIL`, troca a senha provisória no primeiro acesso e abre a área profissional em `/pro`. Esses valores ficam somente no `.env`. A publicação na VPS e a contratação do plano exigem validação própria antes de receber alunos reais.

## Acesso à instalação na VPS

Abra `https://academia.avadesk.com.br` no navegador. O administrador e o personal usam as credenciais próprias da VPS e criam uma senha nova no primeiro acesso. As credenciais do banco **local** `avagym`, usadas em `http://127.0.0.1:5551`, não são as senhas desta instalação. O responsável pela VPS pode consultar as credenciais provisórias diretamente nos arquivos protegidos `/opt/projetovitor-runtime/credentials/admin.txt` e `/opt/projetovitor-runtime/credentials/personal.txt`, sem enviá-las por chat.

O domínio responde e aceita a origem HTTPS nas requisições de login, mas um login real pelo domínio ainda precisa ser conferido. Esta instalação usa cobrança simulada: cadastro e pagamento de alunos reais dependem de configuração comercial, legal e validação própria antes da liberação.

## Aluno: começar

1. Abra o cadastro, preencha **Acesso**, **Seus dados**, **Assinatura** e **Confirmação** e aceite os documentos obrigatórios.
2. Depois da conta criada, abra **Planos e pagamento** e conclua o checkout. O acesso depende da confirmação de pagamento recebida pelo servidor. Pagamento pendente não libera treino, progresso e comunidade.
3. Ao entrar, abra **Treinos**. Se ainda não houver ficha, aguarde o personal publicar uma; o aplicativo não oferece programa pronto como substituto.
4. Quando a ficha estiver disponível, abra **Organizar semana** para associar os treinos aos dias ou deixar **Livre**. A agenda muda apenas os dias; os exercícios continuam sob responsabilidade do personal.
5. Escolha o treino, confira as cargas em **Defina os pesos** e toque em **Confirmar pesos e iniciar treino**. Durante a sessão, registre séries, use o descanso e veja o vídeo indicado pelo personal.
6. Use **Tenho uma dúvida** para perguntar sobre a execução. Use o relato de dor ou desconforto quando necessário; esse caso pode pausar o exercício até a orientação do personal.
7. Ao concluir, confira **Progresso** e **Estatísticas detalhadas**. Comparação indisponível significa ausência de base suficiente, e não desempenho zero.

## Personal principal: atender

1. Entre com a conta do personal e abra **Alunos**. Use **Adicionar aluno** para cadastrar uma conta nova ou enviar convite para uma conta existente.
2. Abra o aluno e use **Criar treino**. A etapa **Para quem** já vem com o aluno escolhido; dê um nome à ficha, toque no objetivo e, se quiser partir de algo pronto, use **Começar de um modelo** — a lista abre com busca e separa os seus dos compartilhados. Toque em **Dias e exercícios**.
3. Em **Dias e exercícios**, cada dia tem um menu (ícone à direita do nome) com **Renomear**, **Duplicar dia**, **Copiar exercícios de…**, **Limpar** e **Remover**. Marque o dia da semana ou deixe **Livre**. Na biblioteca, um toque na linha põe o exercício no dia; quem já está lá aparece marcado como **no dia**. Abra um exercício para ajustar séries, repetições ou tempo, carga, descanso, vídeo e orientações, e use **Montar bi-set** para juntar 2 ou 3 exercícios em sequência. O limite é 7 dias e 40 exercícios por dia.
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

Em **Perfil**, o aluno consulta assinatura, avisos e documentos. Em **Preferências** ficam o tema, o idioma e as configurações do treino (unidades, descanso, som e lembretes). Para solicitar exportação ou exclusão dos seus dados, use as ações de privacidade disponíveis na conta. Fotos e vídeos da avaliação postural não são publicações da Comunidade.

Na primeira vez em cada tela aparece um guia curto, em passos, explicando o que está ali; use **Pular** para fechar. Para vê-lo de novo, abra **Perfil › Ajuda e suporte › Rever orientações**.

Se o pagamento não liberar acesso, confira o status em **Planos e pagamento**; não repita cobranças sem verificar a anterior. Se a ficha ou uma avaliação não aparecer, informe o personal responsável para conferir vínculo e publicação. A primeira cobrança real e a avaliação postural em aparelho ainda precisam de homologação no ambiente alvo.
