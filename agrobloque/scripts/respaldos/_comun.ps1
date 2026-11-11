# Funciones comunes de los scripts de respaldo.
# La carpeta de respaldos NUNCA debe estar dentro de un repositorio: lleva datos reales de clientes y las
# contrasenas cifradas de los usuarios. Por defecto es "Escritorio\Respaldos AgroBloque"; se puede cambiar
# con la variable de entorno RESPALDOS_DIR.
function Obtener-CarpetaRespaldos {
  $base = $env:RESPALDOS_DIR
  if (-not $base) { $base = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Respaldos AgroBloque' }
  $base = [System.IO.Path]::GetFullPath($base)
  $raiz = $null
  try { $raiz = (& git -C $PSScriptRoot rev-parse --show-toplevel 2>$null) } catch { $raiz = $null }
  if ($raiz) {
    $raiz = [System.IO.Path]::GetFullPath(($raiz -replace '/', '\'))
    if ($base.StartsWith($raiz, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "La carpeta de respaldos ($base) esta DENTRO del repositorio ($raiz). Define RESPALDOS_DIR con una ruta fuera del repositorio."
    }
  }
  if (-not (Test-Path $base)) { New-Item -ItemType Directory -Path $base | Out-Null }
  return $base
}
