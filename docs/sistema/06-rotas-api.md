# Rotas da API

Total: **370** rotas. Públicas (sem login): `GET/HEAD /api/health`, `GET /api/config`, `GET /api/terms`, `GET /api/legal/company`, `GET /api/media` (chave assinada), `GET /api/push/public-key`, `POST /api/auth/{login,register,forgot,reset,logout}`, webhooks de cobrança. Todo o resto exige login; `/api/adm/*` e `/api/admin/*` exigem papel admin. `GET /api/admin/programs` não existe (404 esperado, BUG-030).

### /api/active-training
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/active-training | active-training.js |
| POST | /api/active-training | active-training.js |
| POST | /api/active-training/detach | active-training.js |

### /api/activity
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/activity | server.js |

### /api/adm/access
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/access | accounts-v42.js |
| POST | /api/adm/access/decide | accounts-v42.js |
| POST | /api/adm/access/set | accounts-v42.js |

### /api/adm/assign
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/adm/assign | pro.js |

### /api/adm/audit
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/audit | pro.js |

### /api/adm/audit-log
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/audit-log | audit-log.js |

### /api/adm/billing
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/billing/campaigns | billing/routes.js |
| POST | /api/adm/billing/campaigns | billing/routes.js |
| GET | /api/adm/billing/charges | billing/routes.js |
| POST | /api/adm/billing/codes | billing/routes.js |
| POST | /api/adm/billing/codes/status | billing/routes.js |
| GET | /api/adm/billing/overview | billing/routes.js |
| GET | /api/adm/billing/partners | billing/routes.js |
| POST | /api/adm/billing/partners | billing/routes.js |
| GET | /api/adm/billing/plans | billing/routes.js |
| POST | /api/adm/billing/plans | billing/routes.js |
| POST | /api/adm/billing/reconcile | billing/routes.js |
| GET | /api/adm/billing/redemptions | billing/routes.js |
| POST | /api/adm/billing/settings | billing/routes.js |
| POST | /api/adm/billing/simulate | billing/routes.js |
| GET | /api/adm/billing/subscriptions | billing/routes.js |
| POST | /api/adm/billing/webhooks/replay | billing/routes.js |

### /api/adm/capacity
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/adm/capacity | portal.js |

### /api/adm/challenge-categories
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/adm/challenge-categories | challenges.js |

### /api/adm/challenges
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/challenges | challenges.js |
| POST | /api/adm/challenges/homologate | prizes.js |
| POST | /api/adm/challenges/recompute | prizes.js |

### /api/adm/close-occurrence
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/adm/close-occurrence | pro.js |

### /api/adm/comments
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/comments | admcrud.js |
| POST | /api/adm/comments/delete | admcrud.js |
| POST | /api/adm/comments/update | admcrud.js |

### /api/adm/company
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/company | legal.js |
| PUT | /api/adm/company | legal.js |
| GET | /api/adm/company/cnpj | legal.js |

### /api/adm/data-requests
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/data-requests | lgpd.js |
| POST | /api/adm/data-requests/decide | lgpd.js |

### /api/adm/email-test
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/adm/email-test | adm-email-test.js |

### /api/adm/exercises
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/exercises | exmedia.js |
| POST | /api/adm/exercises/archive | admcrud.js |
| POST | /api/adm/exercises/media | exmedia.js |
| POST | /api/adm/exercises/media/remove | exmedia.js |
| POST | /api/adm/exercises/save | admcrud.js |
| POST | /api/adm/exercises/upload | exmedia.js |

### /api/adm/grants
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/grants | entitlements.js |
| POST | /api/adm/grants | entitlements.js |
| POST | /api/adm/grants/revoke | entitlements.js |

### /api/adm/groups
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/groups | groups.js |
| POST | /api/adm/groups/status | groups.js |

### /api/adm/kpis
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/kpis | portal.js |

### /api/adm/links
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/links | pro.js |
| POST | /api/adm/links | pro.js |
| POST | /api/adm/links/end | pro.js |
| POST | /api/adm/links/transfer | admcrud.js |

### /api/adm/live
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/live | server.js |

### /api/adm/logs
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/logs | audit-log.js |
| GET | /api/adm/logs/meta | audit-log.js |
| POST | /api/adm/logs/settings | audit-log.js |

### /api/adm/management
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/management | management.js |
| GET | /api/adm/management/invites | management.js |

### /api/adm/overview
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/overview | pro.js |

### /api/adm/plan
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/plan | admcrud.js |

### /api/adm/plans
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/plans | pro.js |
| POST | /api/adm/plans | pro.js |
| POST | /api/adm/plans/delete | admcrud.js |
| POST | /api/adm/plans/save | admcrud.js |

### /api/adm/posts
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/posts | admcrud.js |
| POST | /api/adm/posts/delete | admcrud.js |
| POST | /api/adm/posts/update | admcrud.js |

### /api/adm/prizes
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/prizes | prizes.js |
| POST | /api/adm/prizes | prizes.js |
| POST | /api/adm/prizes/deliver | prizes.js |
| POST | /api/adm/prizes/transition | prizes.js |

### /api/adm/professionals
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/professionals | pro.js |
| POST | /api/adm/professionals | pro.js |
| POST | /api/adm/professionals/profile | admcrud.js |

### /api/adm/proof-reviewers
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/proof-reviewers | challenge-feed.js |
| POST | /api/adm/proof-reviewers | challenge-feed.js |

### /api/adm/proofs
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/proofs | challenge-feed.js |
| POST | /api/adm/proofs/invalidate | challenge-feed.js |

### /api/adm/qualifications
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/qualifications | admcrud.js |
| POST | /api/adm/qualifications/delete | admcrud.js |
| POST | /api/adm/qualifications/save | admcrud.js |
| POST | /api/adm/qualifications/verify | pro.js |

### /api/adm/queue
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/queue | pro.js |

### /api/adm/ranking
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/ranking | ranking.js |
| POST | /api/adm/ranking/invalidate | ranking.js |

### /api/adm/reports
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/reports | community.js |
| POST | /api/adm/reports/decide | community.js |

### /api/adm/requests
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/requests | portal.js |
| POST | /api/adm/requests/decide | portal.js |

### /api/adm/restrictions
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/adm/restrictions/delete | admcrud.js |
| POST | /api/adm/restrictions/save | admcrud.js |

### /api/adm/sessions
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/adm/sessions/void | admcrud.js |

### /api/adm/settings
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/settings | pro.js |
| POST | /api/adm/settings | pro.js |

### /api/adm/student
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/student/record | admcrud.js |
| POST | /api/adm/student/record | admcrud.js |
| GET | /api/adm/student/training | admcrud.js |

### /api/adm/subscriptions
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/subscriptions | entitlements.js |
| POST | /api/adm/subscriptions/plan | entitlements.js |
| POST | /api/adm/subscriptions/status | entitlements.js |

### /api/adm/templates
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/templates | portal.js |
| POST | /api/adm/templates | portal.js |
| POST | /api/adm/templates/status | portal.js |

### /api/adm/terms
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/terms | lgpd.js |
| POST | /api/adm/terms | lgpd.js |

### /api/adm/trophies
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/trophies | prizes.js |
| POST | /api/adm/trophies/decide | prizes.js |

### /api/adm/user-programs
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/adm/user-programs/end | admcrud.js |

### /api/adm/users
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/users | pro.js |
| POST | /api/adm/users/create | pro.js |
| POST | /api/adm/users/delete | admcrud.js |
| GET | /api/adm/users/overview | saas.js |
| POST | /api/adm/users/plan | pro.js |
| POST | /api/adm/users/reset-link | auth.js |
| POST | /api/adm/users/role | pro.js |
| POST | /api/adm/users/same-person | pro.js |
| POST | /api/adm/users/status | pro.js |
| POST | /api/adm/users/update | admcrud.js |
| GET | /api/adm/users/workouts | server.js |

### /api/adm/verifications
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/adm/verifications | identity.js |
| POST | /api/adm/verifications/decide | identity.js |

### /api/admin
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/admin/program-badges/revoke | programs-editorial.js |
| GET | /api/admin/program-review | programs-editorial.js |
| GET | /api/admin/program-reviews | programs-editorial.js |
| POST | /api/admin/program-reviews/decision | programs-editorial.js |
| POST | /api/admin/programs/archive | programs-editorial.js |
| POST | /api/admin/programs/badges | programs-editorial.js |
| POST | /api/admin/programs/publish | programs-editorial.js |
| POST | /api/admin/programs/revoke | programs-editorial.js |
| GET | /api/admin/tenant-users | auth.js |

### /api/auth
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/auth/ | server.js |
| POST | /api/auth/forgot | auth.js |
| POST | /api/auth/login | auth.js |
| POST | /api/auth/logout | auth.js |
| POST | /api/auth/logout-all | auth.js |
| GET | /api/auth/me | auth.js |
| POST | /api/auth/password | auth.js |
| POST | /api/auth/register | auth.js |
| POST | /api/auth/reset | auth.js |

### /api/billing
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/billing/access | billing/routes.js |
| POST | /api/billing/cancel | billing/routes.js |
| POST | /api/billing/cards | billing/routes.js |
| POST | /api/billing/cards/remove | billing/routes.js |
| POST | /api/billing/change-card | billing/routes.js |
| GET | /api/billing/config | billing/routes.js |
| POST | /api/billing/coupon/redeem | billing/routes.js |
| POST | /api/billing/coupon/validate | billing/routes.js |
| GET | /api/billing/me | billing/routes.js |
| POST | /api/billing/pay-now | billing/routes.js |
| GET | /api/billing/plans | billing/routes.js |
| POST | /api/billing/reactivate | billing/routes.js |
| POST | /api/billing/subscribe | billing/routes.js |
| POST | /api/billing/webhook/asaas | billing/routes.js |
| POST | /api/billing/webhook/simulado | billing/routes.js |

### /api/blocks
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/blocks | pro.js |

### /api/care
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/care | pro.js |

### /api/challenge
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/challenge | challenges.js |

### /api/challenge-categories
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/challenge-categories | challenges.js |

### /api/challenges
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/challenges | challenges.js |
| POST | /api/challenges | challenges.js |
| POST | /api/challenges/decide | challenges.js |
| GET | /api/challenges/feed | challenge-feed.js |
| POST | /api/challenges/invite-students | challenges.js |
| POST | /api/challenges/invites | challenges.js |
| POST | /api/challenges/invites/revoke | challenges.js |
| POST | /api/challenges/join | challenges.js |
| POST | /api/challenges/leave | challenges.js |
| POST | /api/challenges/media | challenge-feed.js |
| POST | /api/challenges/media/stream | challenge-feed.js |
| POST | /api/challenges/optout | challenges.js |
| POST | /api/challenges/posts | challenge-feed.js |
| POST | /api/challenges/posts/comment | challenge-feed.js |
| POST | /api/challenges/posts/delete | challenge-feed.js |
| POST | /api/challenges/posts/like | challenge-feed.js |
| POST | /api/challenges/posts/pin | challenge-feed.js |
| POST | /api/challenges/posts/publish | challenge-feed.js |
| GET | /api/challenges/prizes | prizes.js |
| GET | /api/challenges/proofs | challenge-feed.js |
| POST | /api/challenges/proofs | challenge-feed.js |
| POST | /api/challenges/proofs/appeal | challenge-feed.js |
| POST | /api/challenges/proofs/replace | challenge-feed.js |
| POST | /api/challenges/proofs/review | challenge-feed.js |
| POST | /api/challenges/publish | challenges.js |
| GET | /api/challenges/ranking | challenge-feed.js |
| POST | /api/challenges/remove | challenges.js |
| GET | /api/challenges/score | challenge-feed.js |
| GET | /api/challenges/sessions | challenge-feed.js |
| POST | /api/challenges/transition | challenges.js |
| GET | /api/challenges/trophies | prizes.js |
| POST | /api/challenges/trophies | prizes.js |

### /api/comments
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/comments | community.js |
| POST | /api/comments/delete | community.js |
| POST | /api/comments/like | community.js |

### /api/config
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/config | server.js |

### /api/data
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/data | appstate.js |
| PUT | /api/data | appstate.js |

### /api/exercises
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/exercises/media | exmedia.js |
| GET | /api/exercises/search | pro.js |

### /api/feed
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/feed | community.js |
| GET | /api/feed/categories | community.js |

### /api/follows
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/follows | community.js |

### /api/group
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/group | groups.js |

### /api/groups
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/groups | groups.js |
| POST | /api/groups | groups.js |
| POST | /api/groups/decide | groups.js |
| POST | /api/groups/invites | groups.js |
| POST | /api/groups/invites/revoke | groups.js |
| POST | /api/groups/join | groups.js |
| POST | /api/groups/leave | groups.js |
| POST | /api/groups/remove | groups.js |
| POST | /api/groups/role | groups.js |
| POST | /api/groups/transfer | groups.js |
| POST | /api/groups/update | groups.js |

### /api/guided
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/guided/abandon | guided.js |
| POST | /api/guided/admin/program-status | guided.js |
| GET | /api/guided/admin/programs | guided.js |
| GET | /api/guided/equipment | guided.js |
| PUT | /api/guided/equipment | guided.js |
| GET | /api/guided/muscle-load | guided.js |
| POST | /api/guided/onboarding | guided.js |
| GET | /api/guided/program | guided.js |
| GET | /api/guided/programs | guided.js |
| GET | /api/guided/progress | guided.js |
| GET | /api/guided/recommendations | guided.js |
| POST | /api/guided/sessions | guided.js |
| POST | /api/guided/sessions/correct-time | sessions-v4.js |
| GET | /api/guided/sessions/events | sessions-v4.js |
| POST | /api/guided/sessions/events | sessions-v4.js |
| GET | /api/guided/sessions/open | sessions-v4.js |
| POST | /api/guided/sessions/start | entitlements.js |
| POST | /api/guided/start | entitlements.js |
| GET | /api/guided/state | guided.js |
| GET | /api/guided/today | guided.js |

### /api/health
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/health | audit-log.js |
| HEAD | /api/health | server.js |

### /api/invites
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/invites/accept | entitlements.js |
| POST | /api/invites/decline | invites.js |
| GET | /api/invites/view | invites.js |

### /api/legal
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/legal/accept | legal.js |
| GET | /api/legal/company | legal.js |
| POST | /api/legal/health-consent | legal.js |
| GET | /api/legal/me | legal.js |

### /api/logout
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/logout | server.js |
| POST | /api/logout/all | server.js |

### /api/me
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/me | server.js |
| DELETE | /api/me/avatar | social.js |
| POST | /api/me/avatar | social.js |
| POST | /api/me/capacities | identity.js |
| GET | /api/me/coaches | pro.js |
| GET | /api/me/code | portal.js |
| GET | /api/me/context | identity.js |
| POST | /api/me/context | identity.js |
| POST | /api/me/delete-request | lgpd.js |
| POST | /api/me/delete-request/cancel | lgpd.js |
| GET | /api/me/export-request | accounts-v42.js |
| POST | /api/me/export-request | accounts-v42.js |
| GET | /api/me/follow-requests | social.js |
| POST | /api/me/follow-requests | social.js |
| GET | /api/me/invites | invites.js |
| GET | /api/me/legacy | appstate.js |
| GET | /api/me/live-session | appstate.js |
| PUT | /api/me/live-session | appstate.js |
| POST | /api/me/live-session/clear | appstate.js |
| POST | /api/me/onboarding/skip | appstate.js |
| GET | /api/me/requests | lgpd.js |
| GET | /api/me/share-card | social.js |
| GET | /api/me/social | social.js |
| POST | /api/me/social | social.js |
| GET | /api/me/subscriptions | entitlements.js |
| GET | /api/me/theme | active-training.js |
| POST | /api/me/theme | active-training.js |
| GET | /api/me/tours | tours.js |
| POST | /api/me/tours | tours.js |
| POST | /api/me/tours/reset | tours.js |
| GET | /api/me/trophies | prizes.js |
| POST | /api/me/trophies/show | prizes.js |
| GET | /api/me/unlock-request | accounts-v42.js |
| POST | /api/me/unlock-request | accounts-v42.js |

### /api/media
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/media | community.js |
| GET | /api/media/private | social.js |
| GET | /api/media/pub | social.js |

### /api/messages
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/messages | pro.js |

### /api/muscles
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/muscles | auth.js |
| GET | /api/muscles/exercises | auth.js |

### /api/notification-prefs
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/notification-prefs | challenge-feed.js |
| POST | /api/notification-prefs | challenge-feed.js |

### /api/notifications
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/notifications | pro.js |
| POST | /api/notifications/read | pro.js |

### /api/occurrences
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/occurrences | pro.js |

### /api/plan
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/plan | pro.js |

### /api/plans
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/plans | entitlements.js |

### /api/post
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/post | community.js |

### /api/posts
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/posts | community.js |
| POST | /api/posts/delete | community.js |
| POST | /api/posts/like | community.js |

### /api/pro/assess
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/pro/assess | pro.js |

### /api/pro/capacity
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/pro/capacity | portal.js |

### /api/pro/clients
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/pro/clients | accounts-v42.js |
| POST | /api/pro/clients | accounts-v42.js |
| POST | /api/pro/clients/reset-password | accounts-v42.js |

### /api/pro/close-occurrence
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/pro/close-occurrence | pro.js |

### /api/pro/close-thread
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/pro/close-thread | pro.js |

### /api/pro/dashboard
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/pro/dashboard | pro.js |

### /api/pro/home
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/pro/home | portal.js |

### /api/pro/invites
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/pro/invites | invites.js |
| POST | /api/pro/invites | entitlements.js |
| POST | /api/pro/invites/cancel | invites.js |

### /api/pro/library
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/pro/library | portal.js |

### /api/pro/partner
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/pro/partner | billing/routes.js |

### /api/pro/plans
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/pro/plans | entitlements.js |
| POST | /api/pro/plans/archive | pro.js |

### /api/pro/prescription
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/pro/prescription | portal.js |

### /api/pro/prescriptions
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/pro/prescriptions | portal.js |
| POST | /api/pro/prescriptions | portal.js |
| POST | /api/pro/prescriptions/archive | portal.js |
| POST | /api/pro/prescriptions/publish | portal.js |

### /api/pro/profile
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/pro/profile | pro.js |

### /api/pro/program
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/pro/program | programs-editorial.js |

### /api/pro/programs
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/pro/programs | programs-editorial.js |
| PATCH | /api/pro/programs | programs-editorial.js |
| POST | /api/pro/programs | programs-editorial.js |
| POST | /api/pro/programs/submit | programs-editorial.js |

### /api/pro/proposals
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/pro/proposals | pro.js |
| POST | /api/pro/proposals/decide | pro.js |

### /api/pro/qualifications
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/pro/qualifications | pro.js |

### /api/pro/requests
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/pro/requests | portal.js |
| POST | /api/pro/requests/cancel | portal.js |
| POST | /api/pro/requests/reply | portal.js |

### /api/pro/student
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/pro/student | pro.js |
| GET | /api/pro/student/full | portal.js |

### /api/pro/students
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/pro/students | portal.js |
| GET | /api/pro/students/lookup | saas.js |

### /api/pro/templates
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/pro/templates | portal.js |
| POST | /api/pro/templates | portal.js |

### /api/pro/threads
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/pro/threads | pro.js |

### /api/pro/verification
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/pro/verification | identity.js |
| POST | /api/pro/verification | identity.js |
| POST | /api/pro/verification/document | identity.js |

### /api/professional
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/professional | pro.js |

### /api/professionals
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/professionals | pro.js |

### /api/programs
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/programs | auth.js |

### /api/push
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/push/public-key | server.js |
| POST | /api/push/rest-timer | server.js |
| POST | /api/push/rest-timer/cancel | server.js |
| POST | /api/push/subscribe | server.js |
| POST | /api/push/test | server.js |
| POST | /api/push/unsubscribe | server.js |

### /api/ranking
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/ranking | ranking.js |
| GET | /api/ranking/history | ranking.js |
| POST | /api/ranking/prefs | ranking.js |

### /api/reports
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/reports | community.js |

### /api/social
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/social/follow | social.js |
| GET | /api/social/follows | social.js |
| GET | /api/social/handle-check | social.js |
| GET | /api/social/profile | social.js |

### /api/terms
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/terms | lgpd.js |
| POST | /api/terms/accept | lgpd.js |

### /api/test
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/test/rate-limit/reset | server.js |

### /api/thread
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/thread | pro.js |

### /api/threads
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/threads | pro.js |

### /api/trophies
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/trophies | prizes.js |
| POST | /api/trophies | prizes.js |

### /api/uploads
| Método | Caminho | Arquivo |
|---|---|---|
| POST | /api/uploads | community.js |

### /api/users
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/users/trophies | prizes.js |

### /api/verification
| Método | Caminho | Arquivo |
|---|---|---|
| GET | /api/verification/document | identity.js |

