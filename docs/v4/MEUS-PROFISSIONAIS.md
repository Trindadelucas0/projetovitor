# V4.3 — Meus profissionais (lado do aluno)

Objetivo: o aluno vê com quem está vinculado e entende por que ainda não tem ficha.

## API
`GET /api/me/coaches` (logado) → `{ coaches: [{ id, name, photo_url, specialties[], since, has_active_plan }] }`
Só vínculos `coach_students.status='ativo'` do próprio aluno e do mesmo tenant; só campos públicos (sem e-mail, telefone ou código).
Ordem: vínculo mais recente primeiro.

## Perfil (aluno) — card "Meus profissionais"
```
+--------------------------------------------+
| Meus profissionais                         |
| (foto) Bruno Silva            Ficha ativa  |
|        Musculação · desde 15/10/2026     > |
| (foto) Ana Souza                           |
|        Funcional · desde 12/10/2026      > |
+--------------------------------------------+
```
Toque em uma linha abre `/profissional/:id`. Sem vínculo: o card não aparece.

## Treinos (e Início) — vinculado, mas sem ficha publicada
```
+--------------------------------------------+
| TREINO ATIVO   Nenhum treino ativo         |
| Você está vinculado a Bruno Silva.         |
| A ficha aparece aqui quando for publicada. |
| [ Ver profissional ]                       |
+--------------------------------------------+
```
Substitui o "sem personal / envie seu código" quando já existe vínculo.

## Responsável por ocorrências e conversas
Sem ficha escolhida: vai para o personal da ficha ativa (regra de um treino ativo) ou, se não houver, para o vínculo ativo mais recente.
