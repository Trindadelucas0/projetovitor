# Backup do banco antes de cada migration. Uso: powershell -File db\backup.ps1 [rotulo]
param([string]$label = 'manual')
$envf = Join-Path $PSScriptRoot '..\.env'
$vars = @{}; Get-Content $envf | ? { $_ -match '^\s*([A-Z_]+)\s*=\s*(.*)$' } | % { $vars[$matches[1]] = $matches[2] }
$pgd = 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe'
$dir = Join-Path $PSScriptRoot '..\..\..\backups'; New-Item -ItemType Directory -Force $dir | Out-Null
$out = Join-Path $dir ("avagym_{0}_{1}.dump" -f (Get-Date -Format 'yyyyMMdd_HHmmss'), $label)
$env:PGPASSWORD = $vars['DB_PASSWORD']
& $pgd -U $(if ($vars['DB_USER']) { $vars['DB_USER'] } else { 'postgres' }) -h localhost -Fc -f $out $(if ($vars['DB_NAME']) { $vars['DB_NAME'] } else { 'avagym' })
if ($LASTEXITCODE -ne 0) { throw 'pg_dump falhou' }
Remove-Item Env:PGPASSWORD; "backup: $out"

# V5: mídia entra no backup - pública (api\uploads) e privada (STORAGE_LOCAL_PRIVATE_DIR ou DATA_DIR\private-media)
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$privCands = @($env:STORAGE_LOCAL_PRIVATE_DIR, $vars['STORAGE_LOCAL_PRIVATE_DIR'], $(if ($env:DATA_DIR) { Join-Path $env:DATA_DIR 'private-media' }), $(if ($vars['DATA_DIR']) { Join-Path $vars['DATA_DIR'] 'private-media' }), (Join-Path $PSScriptRoot '..\data\private-media')) | ? { $_ }
$pubCands = @($env:STORAGE_LOCAL_PUBLIC_DIR, $vars['STORAGE_LOCAL_PUBLIC_DIR'], $(if ($env:DATA_DIR) { Join-Path $env:DATA_DIR 'public-media' }), $(if ($vars['DATA_DIR']) { Join-Path $vars['DATA_DIR'] 'public-media' })) | ? { $_ }   # QA: avatares no DATA_DIR
$dd = @($env:DATA_DIR, $vars['DATA_DIR']) | ? { $_ } | Select-Object -Unique   # QA BUG-013: uploads e documentos agora no DATA_DIR
$media = @(,@('uploads', (Join-Path $PSScriptRoot '..\uploads'))) + @($dd | % { ,@('data-uploads', (Join-Path $_ 'uploads')) }) + @($dd | % { ,@('private-docs', (Join-Path $_ 'private-docs')) }) + @($pubCands | Select-Object -Unique | % { ,@('public-media', $_) }) + @($privCands | Select-Object -Unique | % { ,@('private-media', $_) })
$i = 0; foreach ($m in $media) { $i++; if ((Test-Path $m[1]) -and (Get-ChildItem $m[1] -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1)) { $z = Join-Path $dir ("avagym_{0}_{1}_{2}{3}.zip" -f $stamp, $label, $m[0], $i); Compress-Archive -Path (Join-Path $m[1] '*') -DestinationPath $z -Force; "backup midia: $z" } }