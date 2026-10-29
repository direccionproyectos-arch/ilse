# 🧾 Folios de Facturación

Página web (GitHub Pages) que lee la imagen de la tabla de facturas (CLIENTE · CONCEPTO · CANTIDAD · P/U · SUBTOTAL · IVA · NETO) y genera un Excel de folio por factura, idéntico a la plantilla `plantilla/plantilla.xlsx`.

## Cómo funciona
1. **Sube la imagen**: arrástrala, elígela o pégala con Ctrl+V. El texto se lee dentro del navegador (Tesseract.js), sin costo y sin mandar la imagen a ningún servidor.
2. **Facturadora**: el título de la imagen (ej. *CORPORATION HOWITZER*) se busca en el backlog de emisoras.
3. **Clientes**: la columna CLIENTE de cada bloque se busca en el backlog de receptoras; de ahí salen RFC, dirección, C.P., colonia, ciudad y los valores por defecto de forma/método/uso CFDI.
4. **Código SAT**: cada concepto se busca primero en lo **aprendido**; si no existe, se **sugiere** desde el catálogo oficial (52,796 claves) y se marca para que lo confirmes. Al descargar, lo usado se guarda y la próxima vez sale solo.
5. **Descarga**: un Excel por factura con nombre `FOLIO_CLIENTE_TOTAL_FACTURADORA.xlsx`, o todos juntos en un ZIP.

## Puesta en marcha

### 1. Base de datos (Supabase)
1. Entra a tu proyecto de Supabase → **SQL Editor** → **New query**.
2. Pega el contenido de `supabase/schema.sql` y presiona **Run**. Crea 3 tablas (`folio_emisoras`, `folio_receptoras`, `folio_conceptos_sat`) con acceso sólo para usuarios con sesión.
3. Ve a **Project Settings → API** y copia la **anon public key**.
4. Abre `js/config.js` y pégala en `SUPABASE_ANON_KEY` (revisa también `SUPABASE_URL`).
5. Los usuarios entran con el correo y contraseña que tengan en **Authentication → Users** de ese proyecto.

> Si dejas `SUPABASE_ANON_KEY` vacío, la página funciona en **modo local** (los datos sólo viven en ese navegador). Sirve para probar; luego puedes pasar los datos con *Backlog → Exportar / Importar respaldo*.

### 2. Publicar en GitHub Pages
1. Crea un repositorio nuevo en GitHub (ej. `folios-facturacion`).
2. Sube **todo el contenido de esta carpeta** (Add file → Upload files, arrastrando las carpetas).
3. Repositorio → **Settings → Pages** → *Source*: `Deploy from a branch`, *Branch*: `main` / `(root)` → Save.
4. En 1–2 minutos queda en `https://TU-USUARIO.github.io/folios-facturacion/`.

### 3. Llenar el backlog
En **🗂️ Backlog de empresas**:
- **Facturadoras**: nombre como debe salir en el Excel, nombre corto para el archivo y en *Otros nombres* cómo aparece en las imágenes (ej. `CORPORATION HOWITZER`).
- **Clientes**: nombre, RFC, dirección, C.P., colonia, ciudad y, opcional, forma de pago / método / uso CFDI por defecto.
- **Códigos SAT aprendidos**: se llenan solos al descargar; aquí puedes corregir o enseñar códigos nuevos.

También puedes dar de alta empresas directo desde la página principal con el botón ➕ junto a cada desplegable; el nombre leído se guarda como alias para que la próxima vez se seleccione sola.

## Ajustes (`js/config.js`)
| Ajuste | Para qué |
|---|---|
| `PLANTILLA_CONCEPTO` | Cómo se arma el concepto en el Excel. Por defecto `{CONCEPTO} REF: {REFERENCIA}` |
| `DEFAULTS` | Forma de pago, método, uso CFDI, moneda y unidad por defecto |
| `NOMBRES_UNIDAD` | Texto de "Descripción unidad" (ej. `E48` → `SERVICIO`) |
| `PREFERIR_SERVICIOS` | Al sugerir del catálogo, prioriza claves de servicios |

## Estructura
```
index.html            Generar folios
backlog.html          Empresas y códigos aprendidos
plantilla/plantilla.xlsx   Excel original que se rellena
data/                 Catálogos SAT extraídos de la plantilla
js/                   Lógica (config, datos, OCR, SAT, Excel)
vendor/               Librerías (Tesseract, ExcelJS, JSZip, Supabase)
supabase/schema.sql   Tablas y permisos
```
Para cambiar el formato del Excel basta con reemplazar `plantilla/plantilla.xlsx` conservando las mismas celdas (datos en C3–C20, conceptos desde el renglón 23).
