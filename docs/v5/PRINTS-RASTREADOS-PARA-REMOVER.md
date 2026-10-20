# Prints de teste ainda rastreados no git (V5) - PROPOSTA de remoção do índice, NÃO executada
# Total: 625 arquivos, 53.9 MB. Os arquivos continuam no disco do Lucas; só saem do git (e, portanto, da VPS).
# Já estão cobertos por .gitignore (docs/v4/**/*.png|jpg|webm), então não voltam a ser adicionados.
# Para remover do índice mantendo no disco (o Lucas roda, se concordar):
#   git rm --cached --pathspec-from-file=docs/v5/prints-rastreados.lista
# A lista pura (1 caminho por linha) está em docs/v5/prints-rastreados.lista.
# Por pasta:
#   163	docs/v4/testes-reais
#   142	docs/v4/casos-de-teste
#   108	docs/v4/prints-v44
#   99	docs/v4/evidencias-reorganizacao
#   46	docs/v4/evidencias-tours
#   24	docs/v4/progresso-redesign
#   24	docs/v4/treinos-redesign
#   7	docs/v4/evidencias-v42
#   6	docs/v4/evidencias-admin
#   4	docs/v4/prints-um-treino
#   2	docs/v4/evidencias-tema
