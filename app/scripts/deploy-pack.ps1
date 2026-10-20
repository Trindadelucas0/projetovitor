# Monta o pacote de deploy da VPS SEM conectar em nada: so o que o app usa (sem testes, prints, artefatos, .env, midia, node_modules, .bak).
# Uso: powershell -File scripts\deploy-pack.ps1   -> F:\academia\acade\deploy\avagym_<data>.tgz + manifesto .txt
param([string]$Out = (Join-Path $PSScriptRoot '..\..\deploy'))
$app = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
New-Item -ItemType Directory -Force $Out | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$stage = Join-Path $env:TEMP "avagym_deploy_$stamp"; New-Item -ItemType Directory -Force $stage | Out-Null
$skip = '\\node_modules\\|\\test\\|\\logs\\|\\uploads\\|\\private\\|\\data\\|\.bak|\.log$|\\\.env$|\.tmp\.|\\prints\\|test-artifacts|e2e'
function Take($rel) {
  $src = Join-Path $app $rel; if (-not (Test-Path $src)) { throw "faltou: $rel" }
  $files = if ((Get-Item $src).PSIsContainer) { Get-ChildItem $src -Recurse -File } else { Get-Item $src }
  foreach ($f in $files) { $r = $f.FullName.Substring($app.Length + 1); if ("\$r" -match $skip) { continue }
    $d = Join-Path $stage $r; New-Item -ItemType Directory -Force (Split-Path $d) | Out-Null; Copy-Item $f.FullName $d }
}
Get-ChildItem (Join-Path $app 'api') -File -Filter *.js | ? { $_.Name -notmatch '\.bak' } | % { Take ('api\' + $_.Name) }
'api\package.json','api\package-lock.json','api\.env.example','api\billing','api\db\migrations','api\db\down','api\db\migrate.js','api\scripts','api\storage' | % { Take $_ }
Get-ChildItem (Join-Path $app 'api\db') -File -Filter *.js | ? { $_.Name -notmatch '\.bak' } | % { Take ('api\db\' + $_.Name) }
'frontend\src','frontend\public','frontend\index.html','frontend\package.json','frontend\package-lock.json','frontend\vite.config.js' | % { Take $_ }
$list = Get-ChildItem $stage -Recurse -File | % { $_.FullName.Substring($stage.Length + 1).Replace('\','/') } | Sort-Object
$bad = $list | ? { $_ -match '(^|/)(test|e2e|prints|uploads|private|node_modules)/|test-artifacts|\.bak|\.env$|\.png$' -and $_ -notmatch '^frontend/(public|src)/' }
if ($bad) { throw "pacote contem arquivo proibido: $($bad -join ', ')" }
$tgz = Join-Path $Out "avagym_$stamp.tgz"
tar -czf $tgz -C $stage api frontend; if ($LASTEXITCODE) { throw 'tar falhou' }
$list | Set-Content (Join-Path $Out "avagym_$stamp.manifesto.txt") -Encoding utf8
$h = (Get-FileHash $tgz -Algorithm SHA256).Hash.ToLower(); "$h  avagym_$stamp.tgz" | Set-Content "$tgz.sha256" -Encoding ascii
Remove-Item $stage -Recurse -Force
"pacote: $tgz ($([math]::Round((Get-Item $tgz).Length/1MB,2)) MB, $($list.Count) arquivos)  sha256 $h"