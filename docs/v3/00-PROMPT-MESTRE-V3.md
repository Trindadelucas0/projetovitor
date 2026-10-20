# Prompt Mestre V3 (texto do usuário) — PENDENTE DE CÓPIA LITERAL

> **Atenção:** este arquivo deveria conter, palavra por palavra, a mensagem "Prompt Mestre" do usuário (t122u).
> O executor não teve acesso à transcrição; o texto **não** foi reconstruído para não alterar o conteúdo.
> Cole aqui o original.

Regras inegociáveis aplicadas nesta entrega (repassadas ao executor):
1. Não apagar funcionalidades existentes; não zerar o banco; backup antes de cada migration.
2. Toda migration tem script de rollback em `app/api/db/down/`.
3. Regras comerciais no backend (não só no frontend).
4. Erros padronizados: `FEATURE_NOT_INCLUDED`, `LIMIT_REACHED`, `SUBSCRIPTION_INACTIVE`, `PERMISSION_DENIED`.
5. Sem acesso cruzado entre organizações; super-admin sem acesso direto a dados clínicos/de saúde do aluno.
6. Revisão humana dos comprovantes mantida; sem prescrição clínica automática.
7. Sem segredos em documentos/logs; sem preços comerciais (planos pagos são placeholders com preço nulo/"a definir").
8. Manter AGPL e créditos Z-Anatomy; a questão comercial da AGPL é **bloqueio jurídico** (ver 03-MATRIZ).
9. Sem bibliotecas desnecessárias (nenhuma dependência nova foi adicionada).
