# AgroBloque

Sistema de gestión agrícola multiempresa: bloques, cultivos, vivero, fumigaciones y
fertilizaciones, inventario, agenda con calendario lunar, cosechas, ventas, costos,
rentabilidad y contabilidad.

**Stack:** React 18 (Create React App), React Router 6, Supabase (base de datos, auth y
almacenamiento), CSS puro con tokens (`src/design.css`). Se despliega en Vercel.

## Instalación local

1. Clonar el repositorio.
2. Crear `.env` (o `.env.local`) en esta carpeta:

   ```
   REACT_APP_SUPABASE_URL=https://TU-PROYECTO.supabase.co
   REACT_APP_SUPABASE_ANON_KEY=tu_clave_anon
   ```

   Si faltan, la app usa los valores del proyecto actual (`src/lib/supabase.js`).
   La clave `anon` es pública por diseño; **nunca** pongas la `service_role` en el frontend.
3. `npm install`
4. `npm start` (abre en `http://localhost:3000`)
5. `npm run build` genera `build/`. En Vercel el *Root Directory* debe ser `agrobloque`.

## Base de datos (Supabase)

Los scripts de `supabase/` son incrementales y se ejecutaron a mano en el *SQL Editor*; no
hay un esquema único. Para una base nueva, ejecútalos por orden de fecha del nombre y deja
`multiempresa-organizaciones-2026-11-02.sql` **al final**.

**Antes de ejecutar el SQL multiempresa:** haz un backup completo, revisa la lista de
usuarios de `auth.users` (el script convierte en administradores a los que ya existen) y lee
`supabase/LEEME_MULTIEMPRESA.md`.

## Lista de comprobación antes de abrir a clientes

- [ ] SQL multiempresa ejecutado y probado con dos empresas (una no ve los datos de la otra).
- [ ] Registro público de Supabase desactivado (*Authentication → Providers → Email → Allow new users to sign up*) o controlado con invitaciones.
- [ ] Políticas de *Storage* del bucket `facturas-contabilidad` separadas por empresa.
- [ ] Columna `productos.precio_unitario` creada y precios cargados (costos y rentabilidad la usan).
- [ ] Backups automáticos activados en Supabase.
- [ ] Términos de uso y política de privacidad publicados.

## Estructura

- `src/pages/` pantallas (cargadas por ruta con `React.lazy` desde `src/App.js`).
- `src/components/` piezas compartidas (`ErrorBoundary`, `NavBar`, `UI`…).
- `src/lib/` acceso a Supabase, permisos por rol, números y exportadores.
- `src/design.css` sistema de diseño; `src/design-reference.css` estilos generados.
  Los estilos nuevos van en `design.css`.
- `public/` iconos (`favicon.ico`, `logo192.png`, `logo512.png`, `apple-touch-icon.png`) y manifest.
