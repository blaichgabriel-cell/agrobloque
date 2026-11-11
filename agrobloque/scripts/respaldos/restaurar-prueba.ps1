# Restaura un volcado en un proyecto de Supabase TEMPORAL y comprueba que los conteos coinciden.
# PROTECCIONES:
#   - Se niega a ejecutarse contra el proyecto de produccion (utdlehbifdfiliozxbif).
#   - Se niega a ejecutarse si el destino ya tiene tablas en public (debe ser un proyecto nuevo, o uno
#     donde una restauracion anterior fallo antes de crear las tablas).
#   - NO modifica el volcado: trabaja sobre una copia temporal.
# Se puede repetir: antes de restaurar deja limpio lo que una ejecucion anterior pudo dejar a medias
# (esquema private, usuarios, identidades y buckets). Es seguro porque el destino es un proyecto desechable.
# Uso:  powershell -ExecutionPolicy Bypass -File .\restaurar-prueba.ps1 [-Carpeta volcado-AAAA-MM-DD-HH-MM]
# La contrasena se pide sin mostrarla y no se guarda en ningun archivo ni en el historial.
param([string]$Carpeta)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
. (Join-Path $PSScriptRoot '_comun.ps1')
$base = Obtener-CarpetaRespaldos

$bin = 'C:\Program Files\PostgreSQL\17\bin'
$produccion = 'utdlehbifdfiliozxbif'
if (-not (Test-Path (Join-Path $bin 'psql.exe'))) { Write-Host "Falta psql.exe en $bin."; exit 1 }

if (-not $Carpeta) {
  $ultima = Get-ChildItem $base -Directory -Filter 'volcado-*' | Sort-Object Name | Select-Object -Last 1
  if (-not $ultima) { Write-Host 'No hay ninguna carpeta volcado-* . Ejecuta primero volcar.ps1.'; exit 1 }
  $Carpeta = $ultima.Name
}
$dir = Join-Path $base $Carpeta
foreach ($f in '1-private.sql', '2-public.sql', '3-auth-storage-datos.sql', '4-politicas-storage.sql', 'conteos-produccion.txt') {
  if (-not (Test-Path (Join-Path $dir $f))) { Write-Host "Falta $f en $dir"; exit 1 }
}
Write-Host "Volcado a restaurar: $Carpeta"

$plantilla = Read-Host 'Cadena de conexion del proyecto TEMPORAL (Session pooler, con [YOUR-PASSWORD] SIN poner la clave real)'
if ($plantilla -match $produccion) {
  Write-Host 'ALTO: esa cadena es la de PRODUCCION. Este script solo restaura en un proyecto temporal. Se cancela.'
  exit 1
}
if ($plantilla -notmatch '\[YOUR-PASSWORD\]') { Write-Host 'La cadena debe traer [YOUR-PASSWORD] (la clave se pide aparte). Se cancela.'; exit 1 }

$segura = Read-Host 'Contrasena de la base del proyecto TEMPORAL (no se muestra al escribir)' -AsSecureString
$clave = [System.Net.NetworkCredential]::new('', $segura).Password
if (-not $clave) { Write-Host 'No escribiste ninguna contrasena. Se cancela.'; exit 1 }
$url = $plantilla.Replace('[YOUR-PASSWORD]', [uri]::EscapeDataString($clave))

$sqlCont = $null
$copiaPublic = $null
$copiaAuth = $null

# Ejecuta un archivo SQL en una sola transaccion. Si falla, no queda nada a medias de ese archivo.
function EjecutarArchivo([string]$archivo) {
  & "$bin\psql.exe" --dbname=$url -v ON_ERROR_STOP=1 -X -q --single-transaction -f $archivo | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "psql fallo con $archivo (codigo $LASTEXITCODE)" }
}

try {
  # Debe haber conexion y no debe haber tablas en public
  $nTablas = (& "$bin\psql.exe" --dbname=$url -At -X -c "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'").Trim()
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo conectar al proyecto temporal. Revisa la cadena y la contrasena.' }
  if ([int]$nTablas -ne 0) { Write-Host "ALTO: el destino ya tiene $nTablas tablas en public. Usa un proyecto nuevo y vacio."; exit 1 }
  Write-Host 'Destino sin tablas en public: correcto.'

  # Limpiar restos de un intento anterior (el destino es desechable). Los buckets NO se borran: Supabase
  # impide borrar tablas de storage con SQL; el bucket se inserta mas abajo solo si no existe.
  Write-Host '0/4 Limpiando restos de intentos anteriores...'
  & "$bin\psql.exe" --dbname=$url -v ON_ERROR_STOP=1 -X -q --single-transaction -c "drop schema if exists private cascade; delete from auth.identities; delete from auth.users;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo limpiar el destino.' }

  # Copia temporal del volcado de public con dos ajustes para Supabase (el original no se toca):
  #  - el esquema public ya existe en todo proyecto nuevo
  #  - los privilegios por defecto del rol interno supabase_admin ya vienen puestos y el usuario postgres no puede cambiarlos
  Write-Host 'Preparando copia temporal del volcado de public...'
  $copiaPublic = Join-Path $env:TEMP 'agrobloque-2-public-restaurar.sql'
  $salida = New-Object System.IO.StreamWriter($copiaPublic, $false, (New-Object System.Text.UTF8Encoding($false)))
  $quitadas = 0
  try {
    foreach ($linea in [System.IO.File]::ReadLines((Join-Path $dir '2-public.sql'))) {
      if ($linea -eq 'CREATE SCHEMA public;') { $salida.WriteLine('CREATE SCHEMA IF NOT EXISTS public;'); continue }
      if ($linea -like 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin*') { $quitadas++; continue }
      $salida.WriteLine($linea)
    }
  } finally { $salida.Dispose() }
  Write-Host "  (se omitieron $quitadas lineas de privilegios por defecto de supabase_admin)"

  # Copia temporal del archivo de usuarios y buckets: el bucket se carga en una tabla temporal y se inserta
  # con ON CONFLICT DO NOTHING, para poder repetir la restauracion sin chocar con un bucket ya existente.
  Write-Host 'Preparando copia temporal del archivo de usuarios y buckets...'
  $copiaAuth = Join-Path $env:TEMP 'agrobloque-3-auth-restaurar.sql'
  $salidaAuth = New-Object System.IO.StreamWriter($copiaAuth, $false, (New-Object System.Text.UTF8Encoding($false)))
  $columnasBucket = $null
  try {
    foreach ($linea in [System.IO.File]::ReadLines((Join-Path $dir '3-auth-storage-datos.sql'))) {
      if ($linea -match '^COPY storage\.buckets \((.+)\) FROM stdin;$') {
        $columnasBucket = $matches[1]
        $salidaAuth.WriteLine('CREATE TEMP TABLE _stage_buckets (LIKE storage.buckets INCLUDING DEFAULTS);')
        $salidaAuth.WriteLine("COPY pg_temp._stage_buckets ($columnasBucket) FROM stdin;")
        continue
      }
      $salidaAuth.WriteLine($linea)
      if ($columnasBucket -and $linea -eq '\.') {
        $salidaAuth.WriteLine("INSERT INTO storage.buckets ($columnasBucket) SELECT $columnasBucket FROM pg_temp._stage_buckets ON CONFLICT (id) DO NOTHING;")
        $columnasBucket = $null
      }
    }
  } finally { $salidaAuth.Dispose() }

  Write-Host '1/4 Usuarios, identidades y buckets...';  EjecutarArchivo $copiaAuth
  Write-Host '2/4 Esquema private...';                  EjecutarArchivo (Join-Path $dir '1-private.sql')
  Write-Host '3/4 Esquema public (tablas, politicas, funciones, triggers y datos)...'; EjecutarArchivo $copiaPublic
  Write-Host '4/4 Politicas del bucket de facturas...'; EjecutarArchivo (Join-Path $dir '4-politicas-storage.sql')

  # Comprobacion de conteos
  $sqlCont = Join-Path $env:TEMP 'agrobloque-conteos-destino.sql'
  @'
select t.s || '.' || t.n || '|' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', t.s, t.n), false, true, '')))[1]::text
from (select table_schema s, table_name n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'
      union all select 'auth', 'users' union all select 'auth', 'identities' union all select 'storage', 'buckets') t
order by 1;
'@ | Set-Content -Path $sqlCont -Encoding ascii
  $destino = & "$bin\psql.exe" --dbname=$url -At -X -f $sqlCont
  $origen = Get-Content (Join-Path $dir 'conteos-produccion.txt')
  $mapaDestino = @{}; foreach ($l in $destino) { $p = $l.Split('|'); if ($p.Count -eq 2) { $mapaDestino[$p[0]] = $p[1] } }
  $iguales = 0; $distintas = @()
  foreach ($l in $origen) {
    $p = $l.Split('|'); if ($p.Count -ne 2) { continue }
    if ($mapaDestino[$p[0]] -eq $p[1]) { $iguales++ } else { $distintas += ('{0}: produccion={1} restaurado={2}' -f $p[0], $p[1], $mapaDestino[$p[0]]) }
  }
  Write-Host ''
  Write-Host "Tablas con el mismo numero de filas: $iguales de $($origen.Count)"
  if ($distintas.Count) { Write-Host 'DIFERENCIAS:'; $distintas | ForEach-Object { Write-Host "  $_" } }
  else { Write-Host 'RESTAURACION COMPROBADA: todos los conteos coinciden con produccion.' }
}
finally {
  $clave = $null
  $url = $null
  foreach ($t in $sqlCont, $copiaPublic, $copiaAuth) { if ($t) { Remove-Item $t -ErrorAction SilentlyContinue } }
}
