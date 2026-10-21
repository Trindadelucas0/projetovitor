# Inicia openGyn em modo dev local (sem Docker): API Node em :8787 + Vite em :5551.
# Dados e logs ficam FORA do repo (D:\open-gyn-saas\runtime, D:\open-gyn-saas\logs).
param([string]$Root = 'F:\academia\acade')
$app = Split-Path $PSScriptRoot -Parent
New-Item -ItemType Directory -Force "$Root\runtime\data","$Root\logs" | Out-Null
$env:PORT = '8787'; $env:DATA_DIR = "$Root\runtime\data"
$env:RP_NAME = 'AVAGYM'; $env:RP_ID = 'localhost'; $env:ORIGIN = 'http://localhost:5551'
# Mídia de exercícios local (baixada em runtime\media) servida pelo Vite em /img e /gif
$env:OPENGYM_MEDIA_DIR = "$Root\runtime\media"; $env:VITE_IMG_BASE = '/img/'; $env:VITE_GIF_BASE = '/gif/'
$api = Start-Process node -ArgumentList 'server.js' -WorkingDirectory "$app\api" -WindowStyle Hidden -PassThru -RedirectStandardOutput "$Root\logs\api.out.log" -RedirectStandardError "$Root\logs\api.err.log"
Remove-Item Env:PORT
$web = Start-Process cmd -ArgumentList '/c','npx vite --port 5551 --strictPort' -WorkingDirectory "$app\frontend" -WindowStyle Hidden -PassThru -RedirectStandardOutput "$Root\logs\vite.out.log" -RedirectStandardError "$Root\logs\vite.err.log"
"$($api.Id) $($web.Id)" | Set-Content "$Root\runtime\pids.txt"
"API pid $($api.Id) http://localhost:8787 | Web pid $($web.Id) http://localhost:5551"
