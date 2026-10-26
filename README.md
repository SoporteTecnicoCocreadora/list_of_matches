# Cruce de listas

Página web para comparar dos listas de Excel (por ejemplo, la asistencia que exporta Google Meet
contra la lista de seguimiento de un bootcamp) y saber qué personas están en ambas.

**Los archivos se procesan en el navegador:** no se suben a ningún servidor.

## Cómo se usa

1. Abre `index.html` en el navegador (doble clic, o publicado en GitHub Pages).
2. Sube la **Lista 1** (base) y la **Lista 2**. Acepta `.xlsx`, `.xls` y `.csv`.
3. Revisa lo que se detectó en cada lista: hoja, fila de encabezados, columna(s) de nombre
   (si el nombre y el apellido vienen separados, marca ambas) y columna de correo.
4. Elige cómo comparar (correo y nombre, solo correo o solo nombre) y pulsa **Comparar listas**.
5. **Ver lista aquí** muestra los resultados en pestañas; **Descargar Excel** genera un archivo con:
   - `Resumen`: totales.
   - `Coincidencias`: cada pareja encontrada, con el motivo.
   - `Lista 1` y `Lista 2`: las listas originales con cada fila coloreada y columnas nuevas con la
     persona con la que coincidió (verde: total, amarillo: parcial, rojo: sin coincidencia).

## Cómo compara

| Resultado | Cuándo |
|---|---|
| Coincidencia total | El correo coincide y el nombre tiene al menos una palabra en común, o el correo es idéntico. |
| Coincide el correo | El correo coincide pero el nombre no se parece (p. ej. un apodo en Meet). |
| Coincide el nombre | Coinciden al menos dos palabras del nombre (nombre y apellido) pero el correo no se pudo confirmar. |
| Sin coincidencia | Nada de lo anterior. |

- **Correos ocultos de Meet** (`fr.g*************@***.com`): se usan las letras visibles, el largo
  del correo (en la parte antes de la `@` cada `*` es una letra) y el final del dominio (`.com`, `.co`).
- Se ignoran mayúsculas, tildes y signos, y se toleran pequeños errores de digitación.
- Cada persona se empareja una sola vez, empezando por las parejas más seguras.

## Desarrollo

- `matcher.js`: lógica de comparación, sin dependencias (sirve en el navegador y en Node).
- `app.js`: interfaz. Usa [SheetJS](https://sheetjs.com) para leer y [ExcelJS](https://github.com/exceljs/exceljs)
  para escribir el Excel con colores (ambos desde CDN).
- Pruebas: `node --test` (Node 18 o superior).
