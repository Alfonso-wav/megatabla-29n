// Une data/materias.json + data/partidos.json + data/extract/*.json en
// src/generated/tabla.json, validando que cada partido publicado tenga una
// celda (o null = NS/NC) para cada materia y que las páginas citadas existan.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, rmSync } from "node:fs";
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
// Con --publicar no se copian: la web publicada enlaza a las webs oficiales.
const publicar = process.argv.includes("--publicar");
rmSync(join(root, "public/programas"), { recursive: true, force: true });
if (!publicar) mkdirSync(join(root, "public/programas"), { recursive: true });
for (const p of partidos.filter((p) => p.archivo)) {
  const src = join(root, "data/raw", p.archivo);
  p.copiaLocal = !publicar && existsSync(src);
  if (p.copiaLocal) copyFileSync(src, join(root, "public/programas", p.archivo));
}

mkdirSync(join(root, "src/generated"), { recursive: true });
writeFileSync(
  join(root, "src/generated/tabla.json"),
  JSON.stringify({ eleccion, fechaCorte, materias, partidos, celdas }, null, 1),
);

// Listas al Congreso (BOE) y enlaces de cada candidato, en un JSON aparte que la web carga
// solo al abrir las listas de un partido. Se generan con scripts/candidatos.mjs.
const listasF = join(root, "data/candidatos/listas.json");
if (existsSync(listasF)) {
  const L = JSON.parse(readFileSync(listasF, "utf8"));
  const enlacesF = join(root, "data/candidatos/enlaces.json");
  const enl = existsSync(enlacesF) ? JSON.parse(readFileSync(enlacesF, "utf8")) : {};
  const ids = new Set(partidos.map((p) => p.id));
  for (const l of L.listas) if (!ids.has(l.partido)) errors.push(`listas: partido desconocido ${l.partido}`);
  const usados = new Set(L.listas.flatMap((l) => [...l.titulares, ...l.suplentes].map((c) => c.nombre)));
  const enlaces = Object.fromEntries(Object.entries(enl).filter(([n]) => usados.has(n)));
  writeFileSync(
    join(root, "src/generated/candidatos.json"),
    JSON.stringify({ fuente: L.fuente, correccion: L.correccion, listas: L.listas, enlaces }),
  );
  console.log(`candidatos.json: ${L.listas.length} listas, ${usados.size} candidatos, ${Object.keys(enlaces).length} con enlaces`);
} else {
  writeFileSync(join(root, "src/generated/candidatos.json"), JSON.stringify({ listas: [], enlaces: {} }));
}
// Test «Averigua tu partido»: cada postura debe apoyarse en una celda no vacía del programa.
const testF = join(root, "data/test/preguntas.json");
if (existsSync(testF)) {
  const T = JSON.parse(readFileSync(testF, "utf8"));
  const pubIds = new Set(partidos.filter((p) => p.estado === "publicado").map((p) => p.id));
  const vistos = new Set();
  for (const q of T.preguntas) {
    if (vistos.has(q.id)) errors.push(`test: pregunta repetida ${q.id}`);
    vistos.add(q.id);
    if (!q.texto) errors.push(`test.${q.id}: falta el texto`);
    if (!ids.has(q.materia)) errors.push(`test.${q.id}: materia desconocida ${q.materia}`);
    for (const [pid, [v, nota, mat]] of Object.entries(q.pos)) {
      const m = mat ?? q.materia;
      if (!pubIds.has(pid)) errors.push(`test.${q.id}: partido no publicado ${pid}`);
      else if (!celdas[pid][m]) errors.push(`test.${q.id}.${pid}: la celda ${m} es NS/NC, no puede justificar la postura`);
      if (![-2, -1, 1, 2].includes(v)) errors.push(`test.${q.id}.${pid}: valor ${v} fuera de la escala`);
      if (!nota) errors.push(`test.${q.id}.${pid}: falta la justificación`);
    }
  }
  writeFileSync(join(root, "src/generated/test.json"), JSON.stringify({ preguntas: T.preguntas }));
  console.log(`test.json: ${T.preguntas.length} preguntas`);
} else {
  writeFileSync(join(root, "src/generated/test.json"), JSON.stringify({ preguntas: [] }));
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const pub =partidos.filter((p) => p.estado === "publicado");
const nsnc = pub.reduce((n, p) => n + materias.filter((m) => celdas[p.id][m.id] === null).length, 0);
console.log(`tabla.json: ${pub.length} programas × ${materias.length} materias, ${nsnc} celdas NS/NC`);
