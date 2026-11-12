// Une data/materias.json + data/partidos.json + data/extract/*.json en
// src/generated/tabla.json, validando que cada partido publicado tenga una
// celda (o null = NS/NC) para cada materia y que las páginas citadas existan.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

const materias = read("data/materias.json");
const { partidos, fechaCorte, eleccion } = read("data/partidos.json");
const ids = new Set(materias.map((m) => m.id));
const errors = [];

// Número de páginas de cada PDF, contado sobre el texto extraído (marcadores "=== p.N ===").
function pageCount(id) {
  const f = join(root, "data/text", `${id}.pages.txt`);
  if (!existsSync(f)) return null;
  return (readFileSync(f, "utf8").match(/^=== p\.\d+ ===$/gm) || []).length;
}

const celdas = {};
for (const p of partidos.filter((p) => p.estado === "publicado")) {
  const ext = read(`data/extract/${p.id}.json`);
  const max = pageCount(p.id);
  p.paginas = max;
  for (const k of Object.keys(ext)) if (!ids.has(k)) errors.push(`${p.id}: materia desconocida "${k}"`);
  celdas[p.id] = {};
  for (const m of materias) {
    if (!(m.id in ext)) {
      errors.push(`${p.id}: falta la materia "${m.id}" (usa null para NS/NC)`);
      continue;
    }
    const c = ext[m.id];
    if (c !== null) {
      if (!c.postura || !Array.isArray(c.medidas) || !Array.isArray(c.paginas) || c.paginas.length === 0)
        errors.push(`${p.id}.${m.id}: celda incompleta`);
      for (const pg of c.paginas ?? [])
        if (max && (pg < 1 || pg > max)) errors.push(`${p.id}.${m.id}: página ${pg} fuera de rango (1-${max})`);
      c.paginas = [...new Set(c.paginas)].sort((a, b) => a - b);
    }
    celdas[p.id][m.id] = c;
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

// Copias locales de los PDF (si se han descargado con scripts/descargar.sh).
mkdirSync(join(root, "public/programas"), { recursive: true });
for (const p of partidos.filter((p) => p.archivo)) {
  const src = join(root, "data/raw", p.archivo);
  p.copiaLocal = existsSync(src);
  if (p.copiaLocal) copyFileSync(src, join(root, "public/programas", p.archivo));
}

mkdirSync(join(root, "src/generated"), { recursive: true });
writeFileSync(
  join(root, "src/generated/tabla.json"),
  JSON.stringify({ eleccion, fechaCorte, materias, partidos, celdas }, null, 1),
);

const pub = partidos.filter((p) => p.estado === "publicado");
const nsnc = pub.reduce((n, p) => n + materias.filter((m) => celdas[p.id][m.id] === null).length, 0);
console.log(`tabla.json: ${pub.length} programas × ${materias.length} materias, ${nsnc} celdas NS/NC`);
