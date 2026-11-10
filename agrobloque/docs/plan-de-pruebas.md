# Plan de pruebas previo a vender AgroBloque

Lista escrita para repetir **antes de cada cliente nuevo** y después de cualquier cambio de permisos, RLS o inventario. Cada prueba dice qué hacer y qué debe pasar. Si algo no coincide, es una falla: se anota y se corrige antes de seguir.

> Este repositorio es público. **No escribir aquí** claves, correos reales, datos de clientes ni capturas con datos reales. Los resultados se anotan en una copia fuera del repo (`_privado/`).

## 0. Cómo usar este plan

- **Quién:** el front (pantallas, permisos visibles) lo prueba quien lleva el diseño; la base (RLS, SQL, respaldos) la prueba quien administra Supabase. Los bloques 1 y 2 son los que más importan.
- **Cuándo:** completo antes del piloto y antes de cada cliente nuevo. Los bloques 1, 2 y 3 también después de cada cambio de SQL o de `permissions.js`.
- **Antes de empezar:** respaldo de la base hecho y guardado fuera del repo. Las pruebas crean y borran datos, así que **solo con empresas de prueba, nunca con la del cliente**.
- **Resultado:** `OK`, `FALLA` o `N/A`, con fecha y quién lo probó. Criterio de aprobado: **cero fallas en los bloques 1 y 2**; las fallas de los demás bloques se clasifican (bloquea la venta / se corrige en el piloto).

## 1. Preparación (una sola vez)

1. Crear dos empresas de prueba desde **Configuración → Nueva empresa** (usa `provision_organization`): **Empresa A** y **Empresa B**. Un administrador de plataforma es el único que puede hacerlo.
2. Usuarios de prueba (correos que controles, por ejemplo con `+a-admin`):
   - A: `admin`, `operador`, `lectura`.
   - B: `admin`.
3. En **ambas** empresas, cargar los mismos datos mínimos: un campo, un bloque (`A-1`), un cultivo, una plantación, un producto con stock (10 kg), un operario, un comprador, una cosecha, una venta, una factura PDF y un enlace de invitado. Poner nombres distintos en A y en B (`Bloque-A1` / `Bloque-B1`) para reconocer de cuál es cada dato.
4. Anotar, fuera del repo, el `organizacion_id` de A y de B (Supabase → tabla `organizaciones`).

## 2. Aislamiento entre empresas (el más importante)

Entrar como **admin de A** y comprobar que **nada de B** aparece ni se puede tocar. Repetir en sentido contrario (admin de B no ve nada de A).

| # | Recurso | Qué hacer | Resultado esperado |
|---|---|---|---|
| 2.1 | Usuarios | Configuración → Usuarios y permisos | Solo los usuarios de A. |
| 2.2 | Campos y bloques | Mapa, selector de campo, Buscar | Solo los de A. |
| 2.3 | Asistencia | Asistencia, operarios y notas del día | Solo operarios de A. |
| 2.4 | Pagos y adelantos | Asistencia → adelantos | Solo los de A. |
| 2.5 | Inventario | Inventario y movimientos | Solo productos de A. |
| 2.6 | Ventas y compradores | Ventas, Compradores, saldos | Solo los de A. |
| 2.7 | Contabilidad | Contabilidad y Facturas | Solo los de A. |
| 2.8 | Archivos | Abrir una factura de A | Se abre. Con un usuario de B, el enlace firmado de esa factura **no** abre. |
| 2.9 | Invitados | Enlace de invitado de A | Muestra solo datos de A. El de B muestra solo B. |
| 2.10 | Fumigaciones, fertilizaciones, vivero, cosecha, costos, alertas | Abrir cada pantalla | Solo datos de A. |
| 2.11 | Invitar | Invitar el correo del admin de B desde A | Rechazado: "ya pertenece a otra empresa". La contraseña de B **no** cambia. |
| 2.12 | URL directa | Pegar la URL de un registro de B (`/bloque/<id de B>`) estando como A | No muestra datos de B (vacío o "no encontrado"). |

### 2.A Comprobación directa en la base (quien administra Supabase)

Estas consultas simulan al usuario de A y **no modifican nada** (todo dentro de una transacción con `rollback`). Sustituir `UUID_USUARIO_A`, `CORREO_A`, `ORG_A` y `ORG_B` por los valores de prueba. *Aún no están probadas contra la base: ejecutarlas primero con un usuario de A conocido y revisar que devuelven resultados.*

**Lectura** — debe devolver **0 en todas las tablas**:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','UUID_USUARIO_A','email','CORREO_A','role','authenticated')::text, true);

select c.table_name as tabla,
       (xpath('/row/n/text()', query_to_xml(
          format('select count(*) as n from public.%I where organizacion_id <> %L', c.table_name, 'ORG_A'),
          false, true, '')))[1]::text::int as filas_de_otras_empresas
from information_schema.columns c
where c.table_schema = 'public' and c.column_name = 'organizacion_id'
order by 2 desc, 1;
rollback;
```

**Escritura** — cada sentencia debe devolver **0 filas** (la base no deja tocar lo de B):

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','UUID_USUARIO_A','email','CORREO_A','role','authenticated')::text, true);

update public.operarios            set organizacion_id = organizacion_id where organizacion_id = 'ORG_B' returning id;
update public.productos            set organizacion_id = organizacion_id where organizacion_id = 'ORG_B' returning id;
update public.ventas               set organizacion_id = organizacion_id where organizacion_id = 'ORG_B' returning id;
update public.contabilidad_facturas set organizacion_id = organizacion_id where organizacion_id = 'ORG_B' returning id;
update public.app_user_roles       set organizacion_id = organizacion_id where organizacion_id = 'ORG_B' returning id;
delete from public.adelantos       where organizacion_id = 'ORG_B' returning id;
delete from public.asistencia      where organizacion_id = 'ORG_B' returning id;
rollback;
```

**Archivos (Storage)**: con el usuario de A, intentar descargar o listar la carpeta `ORG_B/…` del bucket `facturas-contabilidad` debe fallar o devolver vacío.

## 3. Permisos por rol, dentro de la misma empresa

Probar con los usuarios `admin`, `operador` y `lectura` de A. Los permisos por módulo y por acción salen de `src/lib/permissions.js`.

| # | Prueba | Resultado esperado |
|---|---|---|
| 3.1 | `lectura` abre el menú | No ve Asistencia, Cuentas a pagar ni Configuración. |
| 3.2 | `lectura` abre una pantalla con datos | Ve los datos, **sin** botones de crear, editar ni borrar. |
| 3.3 | `operador` crea y edita (fumigación, cosecha, venta) | Puede. |
| 3.4 | `operador` intenta borrar o anular | No tiene el botón. Si logra enviarlo, aparece un aviso de error y el dato **no** cambia (`writeGuard.js`). |
| 3.5 | `operador` invitado desde la app abre `/configuracion` y `/asistencia` por URL | Lo redirige. *(Un operador sin permisos personalizados tendría Asistencia por defecto; la app se los quita al invitarlo. Si se crea un operador por otra vía, revisar su lista de permisos.)* |
| 3.6 | Permisos personalizados: quitar a un `operador` el módulo Ventas y la acción "editar" de Cosecha | Ventas desaparece; en Cosecha no puede editar. |
| 3.7 | Abrir por URL un módulo desactivado (`/cuentas-pagar`, `/reportes`, `/historial`, `/auditoria`) con cualquier rol | No se puede entrar. |
| 3.8 | Usuario con `activo = false` | No puede entrar a la app. |
| 3.9 | `admin` | Ve y hace todo, incluida Configuración. |
| 3.10 | Cambiar el rol de un usuario y que vuelva a entrar | Ve los permisos nuevos. |

**Puntos que vigilar** (en el código, algunas acciones no revisan el error de la base y dependen del aviso global): anular cosecha, anular o eliminar adelanto y eliminar venta. Con un usuario sin permiso de borrar, cada una debe mostrar un aviso y dejar el dato intacto; si dice "listo" y el dato sigue igual, es una falla.

## 4. Flujos críticos de principio a fin

Verificar siempre **el número final** (stock, saldo, monto), no solo que "no dio error".

### 4.1 Fumigación e inventario
1. Producto con stock **10 kg**. Registrar una fumigación que use **2 kg** → stock **8 kg**; aparece un movimiento de consumo en el inventario.
2. Editar la fumigación a **3 kg** → stock **7 kg** (devuelve 2 y descuenta 3).
3. Anular → stock **10 kg**; la fumigación desaparece del listado y queda en la auditoría.
4. Usar una unidad incompatible con el stock (por ejemplo litros sobre un producto en kg) → la pantalla avisa y no guarda.
5. **Consumir más de lo que hay** (stock 1 kg, usar 3 kg) y luego anular. La base nunca deja el stock en negativo (lo recorta a 0), pero el movimiento registra los 3 kg completos; al anular podría devolver 3 kg cuando solo había 1. **Anotar qué pasa**; si el stock final no es el original, es una falla que hay que decidir (impedir el consumo o ajustar la devolución).

### 4.2 Fertilización (puntual y plan semanal)
1. Registrar una aplicación puntual con productos del inventario → el stock baja en la cantidad convertida (kg/g, L/cc).
2. Registrar un plan semanal y "Aplicar hoy" → baja el stock una sola vez.
3. Anular con motivo → vuelve el stock ("Aplicación anulada y productos devueltos al inventario"); la aplicación aparece como anulada.
4. Anular dos veces la misma aplicación (doble clic o con otra pestaña abierta) → el stock **no** se devuelve dos veces.
5. **Anular sin conexión** (modo avión justo al confirmar) → el código primero marca la aplicación como anulada y luego devuelve el stock; si se corta entre los dos pasos quedaría anulada sin devolución. Anotar el resultado y revisar el stock.

### 4.3 Cosecha → venta → cobro
1. Registrar una cosecha de **100 kg** en el bloque A-1.
2. Registrar una venta de **60 kg** por **Gs. 600.000** a un comprador, con cobro **pendiente** → saldo **Gs. 600.000**.
3. Registrar un cobro parcial de **Gs. 200.000** → saldo **Gs. 400.000**, estado parcial. El saldo del comprador coincide.
4. Cobrar el resto → estado **Pagado**, saldo en `-`.
5. Los totales de Ventas, Costos y Rentabilidad coinciden con lo registrado.
6. Anular la cosecha que ya tiene venta → **anotar qué pasa** (¿avisa? ¿queda la venta huérfana?).
7. Eliminar una venta → pide confirmación y deja registro en auditoría.
8. Cifras largas (por ejemplo Gs. 1.234.567.890) no se parten ni se desbordan.

### 4.4 Asistencia → adelantos → pagos
1. Marcar asistencia de una semana con montos por operario.
2. Agregar una nota del día.
3. Registrar un adelanto de **Gs. 50.000** → el neto a pagar baja en esa cantidad.
4. Anular el adelanto → el neto vuelve; el adelanto aparece como anulado.
5. Los costos de mano de obra en Costos coinciden con la asistencia.
6. Un `operador` sin el módulo Asistencia no ve nada de esto.

### 4.5 Facturas y contabilidad
1. Subir una factura PDF → queda en la carpeta `organizacion_id/usuario_id/…` del bucket.
2. Subir un archivo que no es PDF y otro de más de 10 MB → se rechazan con aviso.
3. Aprobar la factura → se crea el movimiento contable correcto.
4. Abrir la factura desde la lista → abre el PDF (enlace firmado de 60 segundos).
5. Un usuario de la misma empresa puede leerla; uno de otra empresa no (ver 2.8).
6. Un usuario que no la subió y no es admin no puede borrarla.
*Nota: Cuentas a pagar está desactivado en la app; no se prueba hasta activarlo.*

### 4.6 Invitaciones y contraseñas
1. Admin invita un correo nuevo → se crea el usuario y entra con la contraseña definida.
2. Admin reinicia la contraseña de un usuario de su empresa → funciona.
3. Invitar un correo de otra empresa, o una cuenta sin rol → rechazado con mensaje claro y **sin cambios**.
4. Un rol inválido o un `operador` intentando invitar → rechazado.
5. Login → "Primera vez o ¿olvidaste tu contraseña?" → llega el correo y el enlace permite fijar la contraseña. Un enlace vencido muestra "Este enlace no es válido o venció".
6. El **registro público** está apagado: no se puede crear una cuenta propia desde la pantalla de login.

### 4.7 Enlaces de invitado (solo lectura)
1. Crear un enlace de invitado, abrirlo en una ventana privada **sin sesión** → muestra solo lo permitido.
2. Intentar escribir desde ese acceso → no puede.
3. Desactivar el enlace desde Configuración → deja de funcionar. *(Hoy no hay fecha de vencimiento: el enlace vale hasta que se desactiva.)*
4. Un token inventado o mal escrito → no muestra datos.
5. El enlace de A nunca muestra datos de B (ver 2.9).

### 4.8 Vivero
1. Crear un lote con proveedor, **precio de compra** (con separador de miles, por ejemplo `250.000`) y fotos (hasta 6) → se guarda y se muestra bien.
2. Editar el lote y recargar → los números conservan su valor.
3. Los lotes de A no aparecen en B.

## 5. Uso real: celular, PC y mala conexión

| # | Prueba | Resultado esperado |
|---|---|---|
| 5.1 | Mismo usuario en celular y PC; guardar algo en uno y recargar el otro | El dato aparece en ambos. |
| 5.2 | Dos personas editan el mismo registro a la vez | Se conserva el último guardado sin romper la app; nada se duplica. |
| 5.3 | Guardar con conexión lenta o cortada | Aviso claro; el dato **no** queda a medias; al reintentar no se duplica. |
| 5.4 | Doble toque en "Guardar" | Un solo registro. |
| 5.5 | Dejar la app abierta durante un despliegue nuevo y navegar | Aparece "Hay una versión nueva de la app" con botón Recargar, no una pantalla en blanco. |
| 5.6 | iPhone y Android: formularios, hojas inferiores, botones de 44 px, teclado numérico en cantidades | Se usan sin zoom ni cortes. |
| 5.7 | Modo claro y oscuro en las pantallas principales | Todo se lee. |

## 6. Alta de un cliente nuevo (onboarding)

Con una empresa recién creada y **sin ayuda**, un usuario nuevo debe poder:
1. Completar el nombre de la empresa y su primer campo.
2. Crear bloques y asignar cultivos.
3. Invitar a sus usuarios.
4. Cargar inventario inicial.
5. Registrar su primera fumigación.

Anotar dónde se pierde o pide ayuda.

## 7. Respaldo y recuperación (quien administra Supabase)

- Hacer un respaldo, **restaurarlo en un proyecto temporal** y comparar los conteos de filas por tabla con el original. Un respaldo que no se restauró no cuenta como respaldo.
- Definir y anotar fuera del repo: frecuencia, cuánto tiempo se conservan, quién puede acceder a ellos y qué se hace si un cliente borra información.
- El respaldo contiene usuarios y datos: nunca se sube a GitHub.

## 8. Registro de resultados

Copiar esta tabla fuera del repo para cada vuelta de pruebas.

| Fecha | Bloque / prueba | Probó | Resultado | Notas / falla |
|---|---|---|---|---|
| | | | | |

## 9. Después de las pruebas

- Borrar las empresas y usuarios de prueba (lo hace quien administra la base, con respaldo previo).
- Las fallas de los bloques 2 y 3 se corrigen **antes** de vender; las demás se anotan en la lista de pendientes.
- Repetir los bloques 2, 3 y 4.1–4.3 después de cada cambio de SQL, de permisos o de inventario.
