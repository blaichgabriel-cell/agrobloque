// Respaldo de SOLO LECTURA de la base de AgroBloque (Supabase).
// Guarda los datos de cada tabla en JSON y la estructura (columnas, politicas RLS,
// funciones, triggers, indices, restricciones) en un archivo aparte.
//
// Uso (PowerShell, dentro de esta carpeta):
//   $env:SUPABASE_DB_URL = "postgresql://..."   (cadena del "Session pooler")
//   node respaldar-supabase.js
//
// La cadena de conexion lleva la contrasena de la base: se lee de la variable de
// entorno y NUNCA se escribe en ningun archivo. Esta carpeta esta FUERA del repositorio.
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')
const os = require('os')

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('Falta la variable SUPABASE_DB_URL. Mira las instrucciones al inicio del archivo.')
  process.exit(1)
}

const fecha = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
// La carpeta de respaldos debe estar FUERA del repositorio (RESPALDOS_DIR; por defecto Escritorio\Respaldos AgroBloque).
const base = process.env.RESPALDOS_DIR || path.join(os.homedir(), 'Desktop', 'Respaldos AgroBloque')
const salida = path.join(base, `respaldo-${fecha}`)
fs.mkdirSync(path.join(salida, 'datos'), { recursive: true })

const escribir = (archivo, contenido) => fs.writeFileSync(path.join(salida, archivo), contenido)
const json = valor => JSON.stringify(valor, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 1)

// Tablas extra fuera de "public" que hacen falta para restaurar usuarios y archivos.
const EXTRAS = [
  ['auth', 'users'], ['auth', 'identities'],
  ['storage', 'buckets'], ['storage', 'objects'],
]

async function main() {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await c.connect()
  // Transaccion de solo lectura: este script no puede modificar nada en la base.
  await c.query('begin read only')

  const { rows: tablasPublic } = await c.query(
    `select table_schema, table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`)
  const tablas = [...tablasPublic.map(t => [t.table_schema, t.table_name]), ...EXTRAS]

  const resumen = []
  let errores = 0
  for (const [esquema, tabla] of tablas) {
    try {
      const { rows } = await c.query(`select * from "${esquema}"."${tabla}"`)
      escribir(`datos/${esquema}.${tabla}.json`, json(rows))
      resumen.push(`${esquema}.${tabla}: ${rows.length} filas`)
      console.log(`OK ${esquema}.${tabla} (${rows.length})`)
    } catch (e) {
      errores += 1
      resumen.push(`${esquema}.${tabla}: ERROR ${e.message}`)
      console.log(`ERR ${esquema}.${tabla}: ${e.message}`)
    }
  }

  const consulta = async sql => (await c.query(sql)).rows
  const estructura = {
    columnas: await consulta(`select table_schema, table_name, ordinal_position, column_name, data_type, udt_name, is_nullable, column_default
      from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position`),
    rls_por_tabla: await consulta(`select n.nspname as esquema, c.relname as tabla, c.relrowsecurity as rls, c.relforcerowsecurity as rls_forzado
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 2`),
    politicas_public: await consulta(`select schemaname, tablename, policyname, permissive, roles::text as roles, cmd, qual, with_check
      from pg_policies where schemaname = 'public' order by tablename, policyname`),
    politicas_storage: await consulta(`select schemaname, tablename, policyname, permissive, roles::text as roles, cmd, qual, with_check
      from pg_policies where schemaname = 'storage' order by policyname`),
    funciones: await consulta(`select n.nspname as esquema, p.proname as nombre, pg_get_functiondef(p.oid) as definicion
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and p.prokind in ('f', 'p') order by 1, 2`),
    triggers: await consulta(`select c.relname as tabla, t.tgname as nombre, pg_get_triggerdef(t.oid) as definicion
      from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not t.tgisinternal order by 1, 2`),
    indices: await consulta(`select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1, 2`),
    restricciones: await consulta(`select c.relname as tabla, k.conname as nombre, k.contype as tipo, pg_get_constraintdef(k.oid) as definicion
      from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' order by 1, 2`),
    permisos_tablas: await consulta(`select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as permisos
      from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated')
      group by 1, 2 order by 1, 2`),
    // Politicas y funciones del esquema private y datos de plataforma, para poder reconstruir permisos.
    administradores_plataforma: await consulta(`select count(*)::int as cantidad from private.platform_admins`),
  }
  escribir('estructura.json', json(estructura))

  await c.query('rollback')
  await c.end()

  escribir('resumen.txt', `Respaldo de AgroBloque - ${new Date().toISOString()}\n\n${resumen.join('\n')}\n`)
  console.log(`\nListo. Carpeta: ${salida}`)
  console.log(errores
    ? `ATENCION: ${errores} tabla(s) con ERROR. Revisa resumen.txt antes de fiarte de este respaldo.`
    : 'Sin errores: cada tabla de resumen.txt muestra su numero de filas.')
}

main().catch(e => {
  console.error('Fallo el respaldo:', e.message)
  process.exit(1)
})
