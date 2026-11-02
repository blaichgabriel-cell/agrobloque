# Activación del sistema multiempresa

Este cambio convierte AgroBloque en una aplicación para varias empresas sin mezclar sus datos.

## Qué hace

- Conserva todos los datos actuales y los asigna a una empresa inicial llamada **AgroBloque**.
- Permite cambiar el nombre, email, teléfono, color y logotipo desde **Configuración > Empresa**.
- Aísla los registros de cada empresa mediante políticas RLS de Supabase.
- Convierte a los administradores actuales en administradores de plataforma.
- Agrega **Configuración > Nueva empresa** para crear un cliente y enviar la invitación al dueño.
- Los usuarios e invitados nuevos quedan asociados solamente a su empresa.

## Cómo activarlo

1. Hacé un backup completo de la base en Supabase.
2. Abrí **Supabase > SQL Editor > New query**.
3. Copiá y ejecutá completo `multiempresa-organizaciones-2026-11-02.sql`, una sola vez.
4. Cerrá sesión y volvé a entrar en AgroBloque.
5. Entrá en **Configuración > Empresa** y cargá los datos reales de tu empresa.
6. Para vender una cuenta, usá **Configuración > Nueva empresa** e ingresá el nombre y el correo del dueño.

## Importante

- No ejecutes solamente una parte del SQL.
- El script no borra registros ni cambia los IDs existentes.
- Mientras el SQL no se ejecute, la interfaz mantiene compatibilidad con la base anterior, pero el aislamiento multiempresa todavía no estará activo.
- Si Supabase muestra un error, guardá el texto exacto y no continúes creando clientes hasta corregirlo.
