# Megatabla 29N

Tabla comparativa de los programas electorales para las elecciones generales del
29 de noviembre de 2026. Cada fila es un partido, cada columna una materia, y cada
celda la postura y las medidas del partido, con enlace a la página del PDF oficial.

```bash
npm install
bash scripts/descargar.sh   # PDFs oficiales → data/raw, texto → data/text
npm run dev                 # valida datos y arranca en http://localhost:5173
npm run build               # dist/ estático
```

## Datos

| Archivo | Contenido |
|---|---|
| `data/partidos.json` | Partidos, estado (publicado/pendiente), URL oficial, SHA-256 del PDF |
| `data/materias.json` | Las 29 materias (unión de los temas de todos los programas) |
| `data/extract/<id>.json` | Una celda por materia: `{postura, medidas[], paginas[]}` o `null` = NS/NC |
| `data/text/<id>.pages.txt` | Texto extraído con marcadores de página, para verificar |
| `data/notas/` | Notas de lectura intermedias |

| `data/candidatos/listas.json` | Listas al Congreso proclamadas (BOE-A-2026-23103), por circunscripción, con titulares y suplentes |
| `data/candidatos/correcciones.json` | Corrección de errores del BOE (BOE-A-2026-23383), transcrita a mano |
| `data/candidatos/enlaces.json` | Wikipedia, Wikidata y ficha del Congreso de cada candidato, cuando la identificación es segura |
| `data/candidatos/enlaces-manuales.json` | (opcional) `{ "Nombre BOE": {wikipedia, …} }` para añadir o corregir; `null` quita el enlace |

`scripts/build-data.mjs` falla si a un partido le falta alguna materia o cita una
página inexistente.

## Añadir un programa cuando se publique

1. Rellenar `url`, `archivo`, `sha256`, `fechaPublicacion`… y `"estado": "publicado"` en `data/partidos.json`.
2. `bash scripts/descargar.sh`.
3. Leer el texto y crear `data/extract/<id>.json` con las 29 materias. Si trata un tema
   nuevo, añadir la materia a `materias.json` y revisar los demás programas para ese tema
   (grep en `data/text/`): los que no lo mencionen llevan `null`.

Estado a 13/11/2026: publicados PP, Vox, ERC, PNV, BNG, CC, Existe y Soria Ya; pendientes PSOE, Sumar/Frente Amplio,
Podemos, Junts, EH Bildu y SALF.

## Listas de candidatos

Al pulsar el nombre de un partido se abren sus listas al Congreso en cada circunscripción.

```bash
node scripts/candidatos.mjs            # BOE → data/candidatos/listas.json (+ correcciones)
node scripts/candidatos.mjs --enlaces  # además, Congreso, Wikipedia y Wikidata (~1,5 h la primera vez; con caché)
```

- Ficha del Congreso: diputados de las legislaturas X-XV, del buscador oficial de congreso.es,
  emparejados por nombre y apellidos exactos.
- Wikipedia: se busca el nombre completo del BOE en es.wikipedia y solo se enlaza si el título
  está contenido en ese nombre, el artículo es de un político y menciona el partido de la lista
  (o es diputado según el Congreso). Si dos artículos cumplen, no se enlaza ninguno.
- Las siglas del BOE se asignan a los partidos de `partidos.json` en la tabla `PARTIDO` del script;
  las que no encajan van a «Otras».
- Wikidata: para quien no tiene artículo en es.wikipedia se buscan sus etiquetas y alias en cualquier
  idioma; se enlaza la Wikipedia disponible (es, ca, gl, eu, en) si es un político español y su partido en
  Wikidata, o el artículo, coincide con la lista. De Wikidata salen también descripción, profesión,
  formación (P69) y LinkedIn (P6634); LinkedIn no se consulta directamente.
- Biografía: primeras líneas de la biografía oficial de los datos abiertos del Congreso, sin datos familiares.

## Publicación

`npm run deploy` valida los datos, compila y sube `dist/` a la rama `gh-pages`, que
GitHub Pages sirve en https://alfonso-wav.github.io/megatabla-29n/. Si un JSON tiene un
error (materia que falta, página inexistente), el build falla y no se publica nada.

En la versión publicada los números de página enlazan al PDF en la web oficial de cada
partido; las copias locales (`data/raw`, `public/programas`) no se suben.

Actualización diaria:

```bash
node scripts/vigilar.mjs        # ¿algún programa nuevo?
bash scripts/descargar.sh       # tras añadirlo a data/partidos.json
# crear data/extract/<id>.json
npm run deploy                  # valida, compila y publica
git add -A && git commit -m "datos: añade programa de X" && git push
```
