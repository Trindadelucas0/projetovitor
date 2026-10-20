# Componentes — Ranking

| Componente | Arquivo | Função |
|---|---|---|
| `Podium` | `frontend/src/components/Podium.jsx` + `podium.css` | Pódio reutilizável: 1º centro e mais alto, 2º esquerda, 3º direita; anéis e medalhas ouro/prata/bronze; troféu no 1º; lugares vazios quando há menos de 3; rótulo "empate"; animação de entrada desligada com `prefers-reduced-motion`; `aria-label` por lugar; ajustes abaixo de 340 px |
| `PodAvatar` | idem | Avatar circular; **iniciais** se não houver foto ou se a imagem falhar |
| `ChRanking` | `views/app/DesafioRanking.jsx` | Abas Geral / Minha posição, lista paginada, variantes equipes e coletivo, estado do resultado |
| `Score` (folha) | idem | "Entender pontuação" |
| `Person` (folha) | idem | Informação pública da pessoa/equipe |
| `ChPrizes` | `views/app/Trofeus.jsx` | Troféus do desafio e premiações oficiais com estado público |
| `TrophyPick`, `MyTrophies` | idem | Escolha/criação no assistente; vitrine no perfil (mostrar/ocultar) |

Testes: `components/Podium.test.jsx` (8 testes: ordem visual, iniciais, menos de 3, vazio, empate, medalhas/troféu, acessibilidade, "você").
