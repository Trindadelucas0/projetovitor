# Decisão de distribuição e viabilidade comercial — ORNY

Data da revalidação: 18/10/2026  
Código candidato: checkout local em `dcc47a0`, com alterações locais preservadas  
Cobrança avaliada: **simulador/sandbox**; nenhuma cobrança real foi criada

## Resposta executiva

**Decisão: beta controlado, por convite. Não liberar venda pública ampla ainda.**

O produto já tem corpo funcional suficiente para ser apresentado e usado por um grupo pequeno de alunos e profissionais. O build fecha, as dependências de produção auditadas não apresentam vulnerabilidades conhecidas e os testes de API do simulador cobrem contratação, cancelamento e eventos de cobrança. Porém, a liberação comercial ampla permanece bloqueada pelos itens abaixo:

1. a página pública exibe o plano PRO como **“Em breve”**, pois não há preço vendável configurado no laboratório;
2. o provedor real Asaas não foi homologado ponta a ponta; o teste permaneceu intencionalmente em `BILLING_PROVIDER=simulado`;
3. nove jornadas E2E antigas falham: parte por expectativas obsoletas de marca/fluxo e parte por respostas 403 no laboratório. A página pública de planos passou em celular e desktop, mas o fluxo completo navegador → cadastro → assinatura ainda não tem prova atual limpa;
4. os dados jurídicos reais da empresa/controlador precisam estar completos antes de produção;
5. não há evidência de clientes pagantes, retenção ou custo de aquisição. Capacidade de cobrar não é prova de lucro.

## O que está tecnicamente comprovado

- build de produção concluído;
- 0 vulnerabilidades encontradas em dependências de produção da API (`npm audit --omit=dev`);
- 289 testes Vitest aprovados;
- 3 testes unitários da configuração jurídica aprovados;
- 21 testes de API de cobrança simulada aprovados (14 V5 + 7 V6);
- migrations 001–058 aplicadas em banco PostgreSQL exclusivo da auditoria;
- página pública de planos aprovada em 390 px e desktop;
- quatro regressões de navegação/acessibilidade aprovadas em navegador;
- nenhum dado ou pagamento de produção foi alterado.

## O que ainda não pode ser afirmado

- que um pagamento real será liquidado e conciliado corretamente no Asaas;
- que webhooks reais, retentativas e estorno funcionam no ambiente publicado;
- que o funil completo de cadastro e assinatura está aprovado no navegador atual;
- que os preços finais foram definidos e publicados;
- que existe disposição real a pagar;
- que o negócio será lucrativo.

## Potencial de receita (cenários, não promessa)

Como o preço do ORNY não está definido na tela pública, os valores abaixo são hipóteses para decisão. O concorrente brasileiro PersonalGO anuncia em 18/10/2026 PRO mensal de R$ 79,90 e Premium do aluno de R$ 12,90/mês. Isso mostra uma referência, não valida automaticamente o preço do ORNY.

| Cenário hipotético | Clientes pagantes | Preço médio | Receita bruta mensal |
|---|---:|---:|---:|
| Piloto | 5 profissionais | R$ 49,90 | R$ 249,50 |
| Validação inicial | 20 profissionais | R$ 59,90 | R$ 1.198,00 |
| Pequena operação | 50 profissionais | R$ 59,90 | R$ 2.995,00 |
| Tração | 100 profissionais | R$ 79,90 | R$ 7.990,00 |

O lucro líquido será menor após gateway, impostos, hospedagem, suporte, aquisição de clientes e horas operacionais. A tabela oficial do Asaas consultada na data da auditoria anuncia, como taxas padrão, Pix a R$ 1,99 por recebimento e cartão à vista a R$ 0,49 + 2,99%; condições promocionais e contratuais podem ser diferentes.

Fórmula mínima de decisão:

`lucro mensal = receita recebida - gateway - impostos - infraestrutura - suporte - marketing - reembolsos`

Não há dados atuais para preencher todos esses custos. Portanto, a conclusão correta é: **há possibilidade de receita, mas ainda não há prova de lucro**.

## Estratégia recomendada de distribuição

1. manter o sistema em sandbox enquanto corrige e atualiza as jornadas E2E;
2. definir a oferta inicial para um único público: profissionais com poucos alunos;
3. recrutar de 3 a 5 profissionais para beta por convite e acompanhar manualmente;
4. cobrar somente depois da homologação real do Asaas, dados jurídicos completos, backup/restore testado e suporte definido;
5. validar durante 30 dias: ativação, número de alunos convidados, treinos concluídos, chamados, cancelamentos e intenção de renovar;
6. considerar venda pública apenas quando ao menos 3 clientes pagarem e usarem por um ciclo completo sem bloqueio crítico.

## Critérios objetivos para liberar cobrança real

- [ ] preço, limite de alunos e benefícios do PRO aprovados;
- [ ] CTA PRO deixa de mostrar “Em breve”;
- [ ] dados jurídicos obrigatórios preenchidos com dados reais;
- [ ] cadastro → assinatura → webhook → ativação aprovado no navegador;
- [ ] cancelamento, inadimplência, estorno e reconciliação homologados no sandbox do Asaas;
- [ ] backup e restauração executados com sucesso;
- [ ] canal de suporte e responsável operacional definidos;
- [ ] política de privacidade, termos de uso e termos de assinatura revisados juridicamente;
- [ ] nenhuma vulnerabilidade P0/P1 aberta;
- [ ] autorização explícita separada para trocar o provedor do simulador para Asaas.

## Fontes de mercado consultadas

- Asaas — preços e taxas: https://www.asaas.com/precos-e-taxas
- PersonalGO — planos para personal trainer: https://ajuda.personalgo.com.br/planos-para-personal-trainer/
- PersonalGO — plano para aluno: https://www.personalgo.com.br/para-o-seu-treino/

