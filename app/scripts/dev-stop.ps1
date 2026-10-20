# Para somente os processos iniciados por dev-start.ps1 (PIDs salvos), nada mais.
param([string]$Root = 'F:\academia\acade')
$f = "$Root\runtime\pids.txt"; if (!(Test-Path $f)) { 'sem pids'; return }
foreach ($p in (Get-Content $f) -split ' ') { if ($p) { taskkill /PID $p /T /F } }
Remove-Item $f
