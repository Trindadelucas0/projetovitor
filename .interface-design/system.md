# Projeto Vitor — sistema de interface

## Direção

- **Pessoa principal:** aluno usando o celular durante o treino; personal e administração trabalham em fluxos mais densos, mas orientados à próxima ação.
- **Sensação:** direta, confiante, rápida e silenciosa.
- **Assinatura:** o marcador de progresso funcional acompanha a tarefa atual (etapa, exercício, série ou pendência) sem pontos, medalhas, sequências ou celebrações artificiais.
- **Identidade:** grafite, superfícies neutras e limão reservado para ação principal, seleção e estado positivo.

## Hierarquia

1. Cada estado normal tem uma única ação primária.
2. Título e estado atual aparecem antes de explicações.
3. Ações alternativas, histórico e método ficam em `details`, drawer ou sheet.
4. Dor, risco, cobrança e consentimento permanecem visíveis no momento da decisão.
5. Quatro níveis de texto: principal, secundário, metadado e desabilitado.

## Composição

- Grade de 4 px; espaços preferidos: 4, 8, 12, 16, 24, 32 e 48 px.
- Alvos de toque têm no mínimo 44 × 44 px.
- Cards representam unidades independentes ou acionáveis; agrupamentos comuns usam seção e espaço.
- Profundidade por borda discreta e mudança sutil de superfície. Sombras somente em elementos elevados.
- Botões: `primary` para a próxima ação, `secondary` para alternativa segura, `tertiary/ghost` para suporte e `danger` para ação destrutiva.

## Padrões

- **Tela focada:** contexto curto → título → conteúdo necessário → ação primária → suporte curto → mais opções.
- **Mais opções:** resumo com pelo menos 44 px; conteúdo operável por teclado; nunca contém a única forma de relatar dor ou corrigir um erro.
- **Relatórios:** resumo e métricas principais permanecem visíveis; uma navegação por assunto mostra um grupo de gráficos por vez.
- **Formulários:** uma decisão por etapa, label visível, erro junto ao campo e dados preservados.
- **Gestão:** pendências e ações frequentes vêm antes de métricas; filtros avançados ficam recolhidos.
- **Estados:** loading estruturado, vazio com próxima ação, erro com tentativa novamente, sucesso factual e bloqueio com motivo.

## Conteúdo

- Rótulos começam com verbo e evitam frases completas quando a ação já é clara.
- Uma frase curta de apoio por decisão; explicação extensa somente sob demanda.
- Sem gamificação: não usar pontos, medalhas, confete, streaks, rankings artificiais ou linguagem de conquista.
- Recordes e evolução podem aparecer apenas como dados factuais, sem recompensa visual.
- Textos legais, de saúde e segurança não são removidos; são posicionados no ponto de risco.

## Movimento

- Feedback de toque entre 100 e 160 ms; drawers, sheets e modais entre 180 e 250 ms.
- Animar somente `transform` e `opacity`.
- Respeitar `prefers-reduced-motion`.

## Verificação

- Conferir 320, 390, 768, 1280 e 1440 px nos temas claro e escuro.
- Confirmar uma única ação primária por estado, foco visível, navegação por teclado, conteúdo extremo e ausência de overflow horizontal.
- Validar loading, vazio, erro, bloqueio, execução e conclusão nas jornadas alteradas.
