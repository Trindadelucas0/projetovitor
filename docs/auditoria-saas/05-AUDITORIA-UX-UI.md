# Auditoria de UX e interface

## Pontos fortes

- Navegação separada por aluno, profissional e administrador.
- Treino orientado por etapas e com preparação de pesos antes do cronômetro.
- Estados de conta e vínculo possuem mensagens próprias.
- Tema, tours, progresso, comunidade e acompanhamento já formam produto reconhecível.
- Foram capturadas 86 telas/estados em desktop; 24 tiveram assertiva concluída.

## Problemas comprovados

1. O fluxo comercial não explica/resolve a circularidade “pague para liberar” versus “ação bloqueada até liberar”.
2. Uma base limpa pode levar o administrador ao aceite legal com placeholders institucionais, bloqueando o painel e tornando o primeiro uso inseguro.
3. Seletores e expectativas da jornada E2E não acompanharam mudanças recentes; isso reduz confiança para lançar sem regressão manual extensa.
4. O bundle inicial grande aumenta o risco em celulares e redes móveis.

## Pontos não concluídos

- WCAG por teclado/leitor de tela e contraste completo.
- Jornada mobile real em Android/iOS e retomada offline durante treino.
- Estados vazios/erro de todos os módulos administrativos.

Recomendação: após os bloqueadores, executar uma rodada curta com 5–8 usuários reais (aluno e personal), medindo cadastro, primeiro treino, primeiro aluno criado e compreensão de cobrança.

