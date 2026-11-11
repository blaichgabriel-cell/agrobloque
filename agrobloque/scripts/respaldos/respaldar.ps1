# Ejecuta el respaldo de AgroBloque pidiendo la contrasena de la base SIN mostrarla ni guardarla.
# - La contrasena no queda en el historial de PowerShell ni en ningun archivo.
# - Los simbolos especiales (@ # / ...) se codifican solos.
# - Al terminar se borra la variable de entorno.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
. (Join-Path $PSScriptRoot '_comun.ps1')
$env:RESPALDOS_DIR = Obtener-CarpetaRespaldos

$segura = Read-Host 'Contrasena de la base de datos (no se muestra al escribir)' -AsSecureString
$clave = [System.Net.NetworkCredential]::new('', $segura).Password
if (-not $clave) {
  Write-Host 'No escribiste ninguna contrasena. Se cancela.'
  exit 1
}

$env:SUPABASE_DB_URL = 'postgresql://postgres.utdlehbifdfiliozxbif:' + [uri]::EscapeDataString($clave) + '@aws-1-us-west-1.pooler.supabase.com:5432/postgres'
try {
  node respaldar-supabase.js
}
finally {
  Remove-Item Env:SUPABASE_DB_URL -ErrorAction SilentlyContinue
  Remove-Item Env:RESPALDOS_DIR -ErrorAction SilentlyContinue
  $clave = $null
}
