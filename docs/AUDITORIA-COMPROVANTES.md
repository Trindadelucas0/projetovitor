# Auditoria de comprovantes

## Princípios
- **Manual, sem IA.** Revisão por pessoa: organizador (amador) ou revisores designados + admin (oficial).
- **Ninguém revisa o próprio** (403). Se o único revisor possível é o dono do comprovante (ex.: organizador participando), o comprovante vai para o **admin** (`routed_to_admin`). **Nunca há aprovação automática.**
- Recurso: um por comprovante, decidido pelo **admin**, que não pode ser o mesmo revisor da rejeição.
- **Pendente nunca conta**; só `aprovado` entra na pontuação. Foto aprovada sem sessão elegível não conta — o servidor recusa aprovar se o treino foi anulado ou está fora do período.

## Estados
`enviado → em_analise → aprovado | rejeitado | substituicao`; `substituicao → enviado` (novo arquivo); `rejeitado → recurso → aprovado | rejeitado`; `aprovado → invalidado` (admin, justificativa).
Cada mudança grava `challenge_proof_log` (de, para, quem, motivo) e `audit_log`.

## Integridade do arquivo
- Upload só por participantes (`POST /api/challenges/media`); tipo conferido pela **assinatura** (PNG, JPEG, WEBP, MP4, WEBM), não pela extensão.
- Limites: foto 2,5 MB; vídeo 3,5 MB (o corpo da requisição tem limite de 5 MB).
- `sha256` calculado no servidor; arquivo repetido (mesmo hash em comprovante vivo) é recusado.
- Cada arquivo tem dono (`challenge_media`): ninguém usa o arquivo de outra pessoa.
- Ligação obrigatória a uma sessão **própria**, concluída, não anulada/invalidada, dentro do período; uma sessão → um comprovante por desafio.

## Filas
- Organizador: aba Comprovantes do desafio.
- Admin: Admin › Desafios › Comprovantes pendentes (oficiais, encaminhados e recursos) + designação de revisores.
