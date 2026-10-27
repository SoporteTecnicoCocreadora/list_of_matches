# Cruce de listas

Página web para comparar dos listas de Excel (por ejemplo, la asistencia que exporta Google Meet
contra la lista de seguimiento de un bootcamp) y saber qué personas están en ambas. Sirve con
cualquier Excel: compara por nombre, correo y cédula.

**Los archivos se procesan en el navegador:** no se suben a ningún servidor.

## Cómo se usa

1. Abre `index.html` en el navegador (doble clic, o publicado en GitHub Pages).
2. Sube la **Lista 1** (base) y la **Lista 2**. Acepta `.xlsx`, `.xls` y `.csv`.
3. La página detecta sola el encabezado y las columnas de nombre, correo y cédula, y muestra
   cuáles usará. Si se equivoca, usa **Cambiar columnas** (si el nombre y el apellido vienen
   separados, marca ambas).
4. Elige cómo comparar (todo, solo correo, solo cédula o solo nombre) y pulsa **Comparar listas**.
5. **Ver lista aquí** muestra los resultados en pestañas; **Descargar Excel** genera un archivo con:
   - `Coincidencias`: cada pareja encontrada, con el motivo.
   - `Lista 1` y `Lista 2`: las listas originales con cada fila coloreada y columnas nuevas con la
     persona con la que coincidió (verde: al 100%, amarillo: parcial, rojo: está solo en esa lista).

## Cómo compara

| Resultado | Cuándo |
|---|---|
| Coincidencia al 100% | Coinciden el nombre **y** el correo o la cédula (y las cédulas no se contradicen). |
| Coincide la cédula (parcial) | La cédula coincide pero el nombre no. |
| Coincide el correo (parcial) | El correo coincide pero el nombre no (p. ej. un apodo en Meet). |
| Coincide el nombre (parcial) | El nombre coincide pero el correo y la cédula no se pudieron confirmar. |
| Están solo en Lista 1 / solo en Lista 2 | Personas de esa lista que no coinciden con nadie de la otra, ni por correo, ni por cédula, ni por nombre. |

**Cédula:** se usa solo si las dos listas tienen una columna de cédula o documento (se detecta
por encabezados como "Cédula", "Documento", "Número de identificación", "CC"). Se comparan solo
los dígitos: `1.032.435.040`, `CC 1032435040` y `1032435040` son la misma.

"El nombre coincide" = al menos dos palabras en común (p. ej. nombre y apellido), sin importar
el orden, o el mismo nombre de una sola palabra. Una sola palabra suelta no basta.

Solo se comparan las columnas de nombre, correo y cédula marcadas en cada lista (se detectan
solas por el encabezado); las demás se ignoran. Si el nombre y el apellido vienen en columnas separadas, se unen.

- **Correos ocultos de Meet** (`fr.g*************@***.com`): se usan las letras visibles, el largo
  del correo (en la parte antes de la `@` cada `*` es una letra) y el final del dominio (`.com`, `.co`).
- Se ignoran mayúsculas, tildes y signos, y se toleran pequeños errores de digitación.
- Cada persona se empareja una sola vez, empezando por las parejas más seguras.

## Desarrollo

- `matcher.js`: lógica de comparación, sin dependencias (sirve en el navegador y en Node).
- `app.js`: interfaz. Usa [SheetJS](https://sheetjs.com) para leer y [ExcelJS](https://github.com/exceljs/exceljs)
  para escribir el Excel con colores (ambos desde CDN).
- Pruebas: `node --test` (Node 18 o superior).
