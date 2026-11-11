# Respaldos y restauración de la base (Supabase)

El plan Free de Supabase **no hace respaldos automáticos**. Estos scripts (en `scripts/respaldos/`) los hacen a mano y permiten comprobar que se pueden restaurar. Se probaron el 2026-11-11: una restauración completa en un proyecto temporal dio **46 de 46 tablas con las mismas filas** y la misma seguridad (políticas, triggers, RLS).

> **Regla de oro:** un respaldo trae datos reales de clientes y las contraseñas cifradas de los usuarios. **Nunca** va a GitHub ni a un chat. Se guarda en una carpeta fuera del repo y en un Drive **privado**. Los scripts se niegan a escribir dentro de un repositorio, y `.gitignore` ignora `respaldo-*/` y `volcado-*/`.

## Dos tipos de respaldo

| | Script | Sirve para |
|---|---|---|
| **JSON por tabla** | `respaldar.ps1` | Mirar el estado de un día, comparar y **recuperar filas sueltas**. |
| **Volcado SQL** | `volcar.ps1` | **Reconstruir toda la base** (tablas, políticas RLS, funciones, triggers y datos). |

Haz los dos: el JSON es cómodo para inspeccionar; el volcado es el que realmente restaura.

## Requisitos (una sola vez)
1. Node.js y, dentro de `scripts/respaldos/`: `npm install` (instala `pg`).
2. Herramientas de PostgreSQL 17 (cliente `pg_dump` y `psql`; el servidor de Supabase es 17.x):
   `winget install -e --id PostgreSQL.PostgreSQL.17 --override "--mode unattended --unattendedmodeui none --enable-components commandlinetools --disable-components server,pgAdmin,stackbuilder"`
3. Una carpeta de respaldos **fuera del repo**. Por defecto `Escritorio\Respaldos AgroBloque`; se cambia con la variable `RESPALDOS_DIR`.
4. La **contraseña de la base** (Supabase → Project Settings → Database). Los scripts la piden sin mostrarla y no la guardan en archivos ni en el historial de PowerShell. Se aceptan símbolos raros: se codifican solos.

## Hacer un respaldo
En PowerShell, dentro de `scripts/respaldos/`:
```powershell
powershell -ExecutionPolicy Bypass -File .\respaldar.ps1   # JSON por tabla + estructura.json + resumen.txt
powershell -ExecutionPolicy Bypass -File .\volcar.ps1      # 1-private.sql, 2-public.sql, 3-auth-storage-datos.sql, 4-politicas-storage.sql, conteos-produccion.txt
```
- Ambos son de **solo lectura** sobre producción.
- `respaldar.ps1` debe terminar con "Sin errores"; en `resumen.txt` ninguna tabla debe decir `ERROR`.
- Sube cada carpeta nueva a Drive (privada) y **no sobrescribas** las anteriores.

## Rutina recomendada (mientras sea piloto)
- **Cada semana:** los dos respaldos, subir a Drive, conservar los últimos 4.
- **Antes de cualquier cambio grande** en la base (SQL de seguridad, mover fotos a Storage, etc.): un volcado nuevo.
- **Cada mes:** repetir la prueba de restauración de abajo.
- **Con el primer cliente que pague:** pasar a Supabase Pro (respaldos diarios automáticos).

## Probar la restauración (proyecto temporal)
1. Crear un proyecto nuevo y vacío en Supabase (`agrobloque-prueba-restauracion`). En el plan Free el límite es de 2 proyectos activos **por persona**: si no deja crearlo, pausar uno propio que no se use.
2. En ese proyecto: **Connect → Session pooler** y copiar la cadena (trae `[YOUR-PASSWORD]`).
3. Ejecutar:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\restaurar-prueba.ps1
   ```
   Pide la cadena (con `[YOUR-PASSWORD]` sin cambiar) y, aparte, la contraseña. Restaura en 4 pasos y compara las filas de cada tabla con `conteos-produccion.txt`. Debe terminar con **"RESTAURACION COMPROBADA"**.
4. **Borrar el proyecto temporal** al terminar: contiene copia de los datos reales.

Protecciones del restaurador: se niega a ejecutarse contra producción (`utdlehbifdfiliozxbif`), se niega si el destino ya tiene tablas en `public`, restaura cada archivo en una sola transacción (si algo falla no queda nada a medias) y trabaja sobre copias temporales sin modificar el volcado.

### Detalles propios de Supabase (ya resueltos en el script)
- Un proyecto nuevo ya trae el esquema `public`; el volcado trae `CREATE SCHEMA public`, así que se cambia a `IF NOT EXISTS`.
- El volcado intenta cambiar privilegios por defecto del rol interno `supabase_admin`; el usuario `postgres` no puede, y ya vienen puestos. Se omiten esas líneas.
- Supabase **impide borrar `storage.buckets` con SQL**. Para poder repetir la restauración, el bucket se carga en una tabla temporal y se inserta con `ON CONFLICT DO NOTHING`.
- Las políticas del bucket de facturas (`storage.objects`) no entran en el volcado de `public`; `volcar.ps1` las exporta aparte (`4-politicas-storage.sql`).

## Recuperar filas sueltas
Para saber qué filas desaparecieron entre dos respaldos JSON:
```powershell
node comparar-respaldos.js respaldo-AAAA-MM-DD-HH-MM respaldo-AAAA-MM-DD-HH-MM asistencia adelantos
```
Muestra las filas que estaban y ya no están (por `id`), de qué fechas y cuánto suman. Ejemplo real: al borrar a un **operario** de la base (la app solo permite desactivarlo), la regla `ON DELETE CASCADE` eliminó también toda su asistencia y sus adelantos. Ese historial solo se pudo ver gracias a un respaldo anterior.

## Límites conocidos
- Los respaldos son una foto: lo cargado después no está. Por eso la rutina semanal.
- El volcado se prueba contra un proyecto de Supabase; los usuarios y archivos de `auth` y `storage` se restauran por datos, no por esquema.
- La restauración **no** se ensaya contra producción: solo contra proyectos temporales.
