# Reglas Supremas de Diseño y Arquitectura (CLAUDE.md)

## 1. Stack Técnico Estricto
- React 18 (Create React App / react-scripts), React Router DOM 6, Tabler Icons, Supabase.
- ESTILOS: CSS Puro Avanzado (`design.css`, `index.css`, `design-reference.css`) con arquitectura de Tokens CSS en 3 capas. NO usar Tailwind CSS ni shadcn. Eliminar todos los estilos inline heredados.

## 2. Dirección de Arte: "Bio-Luminescent Spatial Glass" (Apple visionOS + Multi-Color AgTech)
- Lienzo de fondo (`body`): Base `#EEF2F6` con mesh gradients fijos multicapa (Esmeralda `#10B981`, Cian `#06B6D4`, Índigo `#6366F1` y Ámbar `#F59E0B` en opacidades suaves 8%-14%) para que los paneles de vidrio refracten color real.
- Paneles de Cristal (`.spatial-glass`): `background: rgba(255, 255, 255, 0.68)`, `backdrop-filter: blur(28px) saturate(200%)`, borde superior/izquierdo especular `1px solid rgba(255, 255, 255, 0.95)`, contorno externo `0 0 0 1px rgba(15, 23, 42, 0.06)`, sombra multicapa profunda.
- REGLA INQUEBRANTABLE DE CONTRASTE:
  - En superficies claras de cristal (Sidebar, tarjetas generales, tablas): Texto principal SIEMPRE oscuro `#0F172A`, secundario `#475569`. PROHIBIDO poner fondo oscuro en el Sidebar con letras negras.
  - En superficies Hero oscuras (`linear-gradient(135deg, #061A14 0%, #0D2E22 50%, #0F172A 100%)`): Texto SIEMPRE blanco `#FFFFFF` y sub-tarjetas de cristal ahumado `rgba(255, 255, 255, 0.08)` con borde `rgba(255, 255, 255, 0.18)`.
- Codificación Multicolor por Módulo:
  - Bloques y Cosecha: Gradientes Esmeralda-Lima (`#059669` a `#10B981`).
  - Vivero y Fertilizaciones/Riego: Gradientes Cian-Turquesa (`#0284C7` a `#06B6D4`).
  - Fumigaciones y Alertas: Gradientes Ámbar-Coral (`#D97706` a `#F43F5E`).
  - Contabilidad y Finanzas: Gradientes Índigo-Violeta (`#4F46E5` a `#9333EA`).
- Tipografía: Google Fonts `'Plus Jakarta Sans'` para títulos, `'Inter'` para UI, y `'JetBrains Mono'` (`tabular-nums`) para códigos de bloque (`A-1`), kilos, días, plantas y montos de dinero.

## 3. Estado de la implementación (notas del repo)
- El sistema vive al final de `src/design.css` (sección "BIO-LUMINESCENT SPATIAL GLASS"): tokens `--bl-*` (capa 1), `--grad-*`, `--glass-*`, `--text-*` (capa 2) y `--mod-*` / `--tone-*` (capa 3). Los tokens heredados (`--forest-*`, `--slate-*`, `--sage-*`) se reasignan ahí.
- Color por módulo: `data-module` en `.ag-app` (ruta activa, `MODULE_BY_PATH` en `src/App.js`) y `data-tone` en íconos y tarjetas (`bloques`, `agua`, `alerta`, `finanzas`, `neutral`).
- `src/design-reference.css` es generado: guarda los estilos que eran inline como clases `.ui-xxxxxx` (selector triple para conservar su prioridad) con los colores viejos mapeados a tokens. Para estilos nuevos usar clases con nombre en `design.css`, no agregar ahí ni volver a `style={{}}`.
- Páginas nuevas de terceros (Calendario, Rentabilidad…) traen sus clases en `design-reference.css`; se rediseñan en `design.css` con prefijo `.ag-app` para ganar prioridad sin editar ese archivo.
- Siguen inline solo los valores dinámicos (anchos de barras, ternarios por tamaño de pantalla), unos 300.
- Clases compartidas para formularios y hojas: `bl-overlay`, `bl-sheet`, `bl-input`, `bl-label`, `bl-btn` (--primary, --ghost, --danger), `bl-btn-solid`, `bl-card`, `bl-icon-btn`.
- Enteros (plantas, semillas, kilos): input de texto con `inputMode="numeric"`, `formatLocaleInteger` al salir y `parseLocaleInteger` al guardar (`src/lib/numbers.js`). Nunca `type="number"`.
- Móvil/tableta (<=1099px): todos los `button` miden mínimo 44x44 (regla con `!important` al final de `design.css`, bloque "MÓVIL TÁCTIL"), los campos van a 16px y todo `:hover` va dentro de `@media (hover:hover) and (pointer:fine)`. Las hojas inferiores (`.bl-sheet`, `.ag-modal-overlay>div`, `.ag-work-dialog`, `.ag-more-menu` y los modales antiguos detectados como `[data-sheet]`) llevan tirador y se cierran arrastrando (`src/components/SheetGestures.js`). Las cifras de dinero no se parten: `.fin-card` escala la letra al ancho de la tarjeta.
