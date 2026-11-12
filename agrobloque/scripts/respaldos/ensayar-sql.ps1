# Ensaya un archivo SQL (con begin; ... commit;) en un proyecto de Supabase TEMPORAL.
#   Sin -Real : ENSAYO. Cambia el "commit;" final por "rollback;": ejecuta todo, comprueba que no da error y NO deja nada.
#   Con -Real : aplica de verdad en el proyecto temporal (pide escribir EJECUTAR).
#   Con -SinCambios : ejecuta el archivo tal cual (para archivos de prueba que ya terminan en rollback).
#   Con -Comprobar <archivo> : en ENSAYO, ejecuta ese archivo de comprobaciones justo antes del rollback (dentro de la transaccion).
#   Con -ProbarDespues <archivo> : tras aplicar con -Real, ejecuta ese archivo de pruebas con la misma conexion.
# PROTECCIONES: se niega a ejecutarse contra el proyecto de produccion (utdlehbifdfiliozxbif).
# La contrasena se pide sin mostrarla y no se guarda en ningun archivo ni en el historial.
# Uso:  powershell -ExecutionPolicy Bypass -File .\ensayar-sql.ps1 -Archivo ..\..\supabase\modo-soporte-2026-11-11.sql [-Real]
param([Parameter(Mandatory = $true)][string]$Archivo, [switch]$Real, [switch]$SinCambios, [string]$ProbarDespues, [string]$Comprobar)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$bin = 'C:\Program Files\PostgreSQL\17\bin'
$produccion = 'utdlehbifdfiliozxbif'
if (-not (Test-Path (Join-Path $bin 'psql.exe'))) { Write-Host "Falta psql.exe en $bin."; exit 1 }
if (-not (Test-Path $Archivo)) { Write-Host "No existe el archivo: $Archivo"; exit 1 }
$Archivo = (Resolve-Path $Archivo).Path

$plantilla = Read-Host 'Cadena de conexion del proyecto TEMPORAL (Session pooler, con [YOUR-PASSWORD] SIN poner la clave real)'
if ($plantilla -match $produccion) { Write-Host 'ALTO: esa cadena es la de PRODUCCION. Este script solo trabaja en un proyecto temporal. Se cancela.'; exit 1 }
if ($plantilla -notmatch '\[YOUR-PASSWORD\]') { Write-Host 'La cadena debe traer [YOUR-PASSWORD] (la clave se pide aparte). Se cancela.'; exit 1 }
$segura = Read-Host 'Contrasena de la base del proyecto TEMPORAL (no se muestra al escribir)' -AsSecureString
$clave = [System.Net.NetworkCredential]::new('', $segura).Password
if (-not $clave) { Write-Host 'No escribiste ninguna contrasena. Se cancela.'; exit 1 }
$url = $plantilla.Replace('[YOUR-PASSWORD]', [uri]::EscapeDataString($clave))

$tmp = Join-Path $env:TEMP 'agrobloque-ensayo.sql'
try {
  $conexion = (& "$bin\psql.exe" --dbname=$url -At -X -c "select current_database() || ' | ' || (select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE') || ' tablas en public'")
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo conectar. Revisa la cadena (Session pooler) y la contrasena.' }
  Write-Host "Conectado: $conexion"

  $sql = [System.IO.File]::ReadAllText($Archivo)
  if ($SinCambios) {
    $contenido = $sql
    Write-Host "Se ejecuta tal cual (archivo de pruebas, termina en rollback): $Archivo"
  } elseif ($Real) {
    Write-Host ''
    Write-Host "Se va a APLICAR DE VERDAD en el proyecto temporal: $Archivo"
    $ok = Read-Host 'Escribe EJECUTAR para continuar'
    if ($ok -ne 'EJECUTAR') { Write-Host 'Cancelado.'; exit 1 }
    $contenido = $sql
  } else {
    $cierre = 'rollback;'
    if ($Comprobar) {
      if (-not (Test-Path $Comprobar)) { throw "No existe el archivo de comprobaciones: $Comprobar" }
      $ruta = (Resolve-Path $Comprobar).Path.Replace('\', '/')
      $cierre = "\i '$ruta'`nrollback;"
    }
    $contenido = [regex]::Replace($sql, '(?m)^commit;', $cierre.Replace('$', '$$'))
    if ($contenido -eq $sql) { throw 'El archivo no termina en commit;, no se puede ensayar con rollback.' }
    Write-Host 'ENSAYO: se ejecuta todo con rollback al final. No quedara nada instalado.'
  }
  [System.IO.File]::WriteAllText($tmp, $contenido, (New-Object System.Text.UTF8Encoding($false)))

  & "$bin\psql.exe" --dbname=$url -v ON_ERROR_STOP=1 -X -f $tmp
  if ($LASTEXITCODE -ne 0) { Write-Host ''; Write-Host 'ERROR: el SQL fallo. No quedo nada aplicado (todo va en una transaccion). Copia el mensaje de arriba.'; exit 1 }

  Write-Host ''
  if ($Real) {
    Write-Host 'APLICADO en el proyecto temporal. Comprobacion:'
    & "$bin\psql.exe" --dbname=$url -At -X -c "select 'funciones de soporte y panel: ' || count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname like 'soporte\_%' or p.proname like 'plataforma\_%')"
    & "$bin\psql.exe" --dbname=$url -At -X -c "select 'politicas de bloqueo de escritura: ' || count(*) from pg_policies where policyname like 'soporte\_no\_%'"
    & "$bin\psql.exe" --dbname=$url -At -X -c "select 'app_can_action usa current_role: ' || (pg_get_functiondef('public.app_can_action(text,text)'::regprocedure) ilike '%current_role text%')"
    if ($ProbarDespues) {
      if (-not (Test-Path $ProbarDespues)) { throw "No existe el archivo de pruebas: $ProbarDespues" }
      Write-Host ''
      Write-Host "Ahora se ejecutan las pruebas (todo se deshace al final): $ProbarDespues"
      [System.IO.File]::WriteAllText($tmp, [System.IO.File]::ReadAllText((Resolve-Path $ProbarDespues).Path), (New-Object System.Text.UTF8Encoding($false)))
      & "$bin\psql.exe" --dbname=$url -v ON_ERROR_STOP=1 -X -f $tmp
      if ($LASTEXITCODE -ne 0) { Write-Host 'ERROR: las pruebas no pudieron ejecutarse. Copia el mensaje de arriba.'; exit 1 }
    }
  } elseif ($SinCambios) {
    Write-Host 'PRUEBAS TERMINADAS (todo se deshizo con rollback). Busca las lineas FALLA y el resumen final.'
  } else {
    Write-Host 'ENSAYO TERMINADO SIN ERRORES (se deshizo todo con rollback).'
    & "$bin\psql.exe" --dbname=$url -At -X -c "select 'tablas de soporte despues del ensayo: ' || count(*) from information_schema.tables where table_name like 'soporte\_%'"
  }
}
finally {
  $clave = $null
  $url = $null
  if (Test-Path $tmp) { Remove-Item $tmp -ErrorAction SilentlyContinue }
}
