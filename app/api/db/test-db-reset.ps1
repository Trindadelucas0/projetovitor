# Recria o banco de TESTE (padrao avagym_test) do zero: migrations + seed + contas fixas e2e.
# A API de teste (porta 8797) deve SEMPRE subir com $env:DB_NAME='avagym_test'. Nunca aponte testes para o banco real.
# Uso (de app\api\db): powershell -File test-db-reset.ps1 [-name avagym_test]
param([string]$name = 'avagym_test')
$ErrorActionPreference = 'Stop'
if ($name -notmatch '_test$') { throw "Recusado: '$name' nao termina em _test. Este script so recria bancos de teste." }
Push-Location (Join-Path $PSScriptRoot '..')
function Step($m){ if($LASTEXITCODE -ne 0){ throw "Falhou: $m (codigo $LASTEXITCODE)" } }
try {
  $env:DB_NAME = $name
  $js = "import './env.js'; import pg from 'pg'; import { dbConfig } from './db/pool.js'; const n=process.env.DB_NAME; if(!/_test$/.test(n)) throw new Error('nome invalido'); const c=new pg.Client(dbConfig('postgres')); await c.connect(); await c.query('select pg_terminate_backend(pid) from pg_stat_activity where datname=`$1 and pid<>pg_backend_pid()',[n]); await c.query('drop database if exists \""'+n+'\""'); await c.end(); console.log('banco de teste removido (se existia):', n)"
  Set-Content -Path '_testdb.tmp.mjs' -Value $js -Encoding utf8
  node _testdb.tmp.mjs; Remove-Item _testdb.tmp.mjs; Step drop
  $env:SEED_PROGRAMS = '1'; node db/migrate.js; Step migrate; Remove-Item Env:SEED_PROGRAMS
  node test/setup-e2e.mjs; Step setup-e2e
  Write-Host "ok: $name recriado. Suba a API de teste com `$env:DB_NAME='$name'"
} finally { Remove-Item Env:DB_NAME -ErrorAction SilentlyContinue; Pop-Location }
