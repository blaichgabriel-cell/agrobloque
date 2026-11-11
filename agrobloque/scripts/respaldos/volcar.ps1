# Volcado SQL de PRODUCCION de AgroBloque (solo lectura: pg_dump no modifica nada).
# Genera, dentro de una carpeta nueva "volcado-AAAA-MM-DD-HH-MM":
#   1-private.sql              esquema private (funciones de permisos, administradores generales)
#   2-public.sql               esquema public completo: tablas, politicas RLS, funciones, triggers y datos
#   3-auth-storage-datos.sql   usuarios, identidades y buckets (solo datos)
#   4-politicas-storage.sql    politicas del bucket de facturas
#   conteos-produccion.txt     filas por tabla, para comparar despues de restaurar
# La contrasena se pide sin mostrarla y no se guarda en ningun archivo ni en el historial.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
. (Join-Path $PSScriptRoot '_comun.ps1')
$base = Obtener-CarpetaRespaldos

$bin = 'C:\Program Files\PostgreSQL\17\bin'
foreach ($e in 'pg_dump.exe', 'psql.exe') {
  if (-not (Test-Path (Join-Path $bin $e))) { Write-Host "Falta $e en $bin. Instala las herramientas de PostgreSQL 17."; exit 1 }
}

$ref = 'utdlehbifdfiliozxbif'
$segura = Read-Host 'Contrasena de la base de PRODUCCION (no se muestra al escribir)' -AsSecureString
$clave = [System.Net.NetworkCredential]::new('', $segura).Password
if (-not $clave) { Write-Host 'No escribiste ninguna contrasena. Se cancela.'; exit 1 }
$url = 'postgresql://postgres.' + $ref + ':' + [uri]::EscapeDataString($clave) + '@aws-1-us-west-1.pooler.supabase.com:5432/postgres'

$fecha = Get-Date -Format 'yyyy-MM-dd-HH-mm'
$dir = Join-Path $base ('volcado-' + $fecha)
New-Item -ItemType Directory -Path $dir | Out-Null

function Paso($texto, [scriptblock]$bloque) {
  Write-Host $texto
  & $bloque
  if ($LASTEXITCODE -ne 0) { throw "Fallo: $texto (codigo $LASTEXITCODE)" }
}

try {
  Paso '1/5 Esquema private...' { & "$bin\pg_dump.exe" --dbname=$url --schema=private --no-owner --file="$dir\1-private.sql" }
  Paso '2/5 Esquema public (tablas, politicas, funciones, triggers y datos)...' { & "$bin\pg_dump.exe" --dbname=$url --schema=public --no-owner --file="$dir\2-public.sql" }
  Paso '3/5 Usuarios, identidades y buckets (datos)...' { & "$bin\pg_dump.exe" --dbname=$url --data-only --table=auth.users --table=auth.identities --table=storage.buckets --file="$dir\3-auth-storage-datos.sql" }

  # 4: politicas del bucket de facturas, generadas como SQL
  $sqlPol = Join-Path $env:TEMP 'agrobloque-politicas-storage.sql'
  @'
select format('create policy %I on storage.objects as %s for %s to %s%s%s;',
  policyname, permissive, cmd, array_to_string(roles, ','),
  case when qual is not null then ' using (' || qual || ')' else '' end,
  case when with_check is not null then ' with check (' || with_check || ')' else '' end)
from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname;
'@ | Set-Content -Path $sqlPol -Encoding ascii
  Paso '4/5 Politicas del bucket de facturas...' { & "$bin\psql.exe" --dbname=$url -At -f $sqlPol -o "$dir\4-politicas-storage.sql" }

  # 5: conteos por tabla (para la comprobacion tras restaurar)
  $sqlCont = Join-Path $env:TEMP 'agrobloque-conteos.sql'
  @'
select t.s || '.' || t.n || '|' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', t.s, t.n), false, true, '')))[1]::text
from (select table_schema s, table_name n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'
      union all select 'auth', 'users' union all select 'auth', 'identities' union all select 'storage', 'buckets') t
order by 1;
'@ | Set-Content -Path $sqlCont -Encoding ascii
  Paso '5/5 Conteos de filas por tabla...' { & "$bin\psql.exe" --dbname=$url -At -f $sqlCont -o "$dir\conteos-produccion.txt" }

  Write-Host ''
  Write-Host ('Listo. Carpeta: ' + $dir)
  Get-ChildItem $dir | ForEach-Object { '{0,-30} {1,12:N0} bytes' -f $_.Name, $_.Length }
  Write-Host ('Tablas contadas: ' + (Get-Content "$dir\conteos-produccion.txt").Count)
}
finally {
  $clave = $null
  $url = $null
  Remove-Item $sqlPol, $sqlCont -ErrorAction SilentlyContinue
}
