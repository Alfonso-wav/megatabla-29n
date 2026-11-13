// Listas al Congreso proclamadas (BOE) → data/candidatos/listas.json
//
//   node scripts/candidatos.mjs            descarga el XML del BOE y regenera listas.json
//   node scripts/candidatos.mjs --enlaces  además busca fichas y biografías del Congreso, Wikipedia y Wikidata
//
// Fuente: «Candidaturas proclamadas para las elecciones al Congreso de los Diputados y
// al Senado» (BOE-A-2026-23103) y sus correcciones (data/candidatos/correcciones.json,
// transcritas a mano de BOE-A-2026-23383). Solo se usa la parte del Congreso.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "data/candidatos");
const cache = join(root, "data/raw/boe");
mkdirSync(dir, { recursive: true });
mkdirSync(cache, { recursive: true });
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const UA = { "User-Agent": "megatabla-29n (datos abiertos)" };

const BOE = "BOE-A-2026-23103";
const CORRECCION = "BOE-A-2026-23383";

async function boeXML(id) {
  const f = join(cache, `${id}.xml`);
  if (!existsSync(f)) {
    const r = await fetch(`https://www.boe.es/diario_boe/xml.php?id=${id}`, { headers: UA });
    if (!r.ok) throw new Error(`${id}: HTTP ${r.status}`);
    writeFileSync(f, await r.text());
  }
  return readFileSync(f, "utf8");
}

const limpiar = (s) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

// "Junta Electoral de A Coruña" → nombre de circunscripción
const CIRC = {
  "ILLES BALEARS": "Illes Balears", "A CORUÑA": "A Coruña", "LAS PALMAS": "Las Palmas",
  "SANTA CRUZ DE TENERIFE": "Santa Cruz de Tenerife", "LA RIOJA": "La Rioja", "CIUDAD REAL": "Ciudad Real",
};
const titulo = (s) =>
  CIRC[s] ?? s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

function parsear(xml) {
  const cuerpo = xml.slice(xml.indexOf("<texto>"));
  const parrafos = [...cuerpo.matchAll(/<p class="([^"]+)"[^>]*>([\s\S]*?)<\/p>/g)].map(([, c, t]) => [c, limpiar(t)]);
  const listas = [];
  let circ = null, camara = null, lista = null, suplentes = false;
  for (const [clase, t] of parrafos) {
    if (clase === "centro_negrita") {
      const m = t.match(/JUNTA ELECTORAL (?:PROVINCIAL )?DE (.+)$/i);
      if (m) circ = titulo(m[1].toUpperCase());
      lista = null;
    } else if (clase === "centro_cursiva") {
      camara = /CONGRESO/i.test(t) ? "congreso" : "senado";
      lista = null;
    } else if (camara !== "congreso") {
      continue;
    } else if (clase === "centro_redonda") {
      // «9. José María Calvo Guerra» (agrupación sin siglas, p. ej. no proclamada)
      const m = t.match(/^(\d+)\.\s*(.+?)\s*\(([^()]+)\)\s*$/) ?? t.match(/^(\d+)\.\s*((.+))$/);
      if (!m) throw new Error(`${circ}: candidatura irreconocible: «${t}»`);
      lista = { circunscripcion: circ, orden: +m[1], denominacion: m[2], siglas: m[3], titulares: [], suplentes: [] };
      listas.push(lista);
      suplentes = false;
    } else if (lista) {
      if (/^Suplentes?:?$/i.test(t)) suplentes = true;
      else if (/^Titular(es)?:?$/i.test(t)) suplentes = false;
      else if (/^No proclamada/i.test(t)) lista.noProclamada = true;
      else {
        const m = t.match(/^(\d+)\.\s*(.+?)\.?$/);
        if (!m) throw new Error(`${circ} ${lista.siglas}: línea inesperada «${t}»`);
        // en coaliciones el BOE anota el partido de cada candidato: «Nombre (EH BILDU)»
        const [, nombre, partido] = m[2].match(/^(.+?)(?:\s*\(([^()]+)\))?$/);
        const c = { n: +m[1], nombre: nombre.replace(/\.$/, "") };
        if (partido) c.partido = partido;
        (suplentes ? lista.suplentes : lista.titulares).push(c);
      }
    }
  }
  return listas.filter((l) => !l.noProclamada);
}

// Correcciones: [{circunscripcion, siglas, suplentes?: bool, n, de, a}] o lista completa {titulares, suplentes}
function corregir(listas) {
  const f = join(dir, "correcciones.json");
  if (!existsSync(f)) return 0;
  const { correcciones } = JSON.parse(readFileSync(f, "utf8"));
  for (const c of correcciones) {
    const l = listas.find((x) => x.circunscripcion === c.circunscripcion && x.siglas === c.siglas);
    if (!l) throw new Error(`corrección sin lista: ${c.circunscripcion} ${c.siglas}`);
    if (c.nuevasSiglas || c.denominacion || c.quitarPartido) {
      if (c.nuevasSiglas) l.siglas = c.nuevasSiglas;
      if (c.denominacion) l.denominacion = c.denominacion;
      if (c.quitarPartido) for (const x of [...l.titulares, ...l.suplentes]) delete x.partido;
    } else if (c.titulares) {
      l.titulares = c.titulares.map((nombre, i) => ({ n: i + 1, nombre }));
      l.suplentes = (c.suplentes ?? []).map((nombre, i) => ({ n: i + 1, nombre }));
    } else {
      const arr = c.suplente ? l.suplentes : l.titulares;
      const x = arr.find((y) => y.n === c.n);
      if (!x || x.nombre !== c.de) throw new Error(`corrección no aplicable: ${JSON.stringify(c)}`);
      x.nombre = c.a;
    }
  }
  return correcciones.length;
}

// Siglas del BOE → id de data/partidos.json (solo por siglas, para no confundir p. ej.
// «FALANGE» con «FA»). Lo que no esté aquí va a "otros".
const PARTIDO = [
  [/^(PSOE|PSC-PSOE|PSN-PSOE|PSdeG-PSOE|PSE-EE-PSOE|PSE-EE \(PSOE\)|PSIB-PSOE|PSPV-PSOE|PSC|PSE-EE)$/i, "psoe"],
  [/^(PP|UPN-PP)$/i, "pp"],
  [/^VOX$/i, "vox"],
  [/^(FA|FRENTE AMPLIO.*|COMUNS-FRONT AMPLI|CHA-IU-MS-FRENTE AMPLIO|ARAMÉS-EU-MS)$/i, "fa"],
  [/^PODEMOS$/i, "podemos"],
  [/^SALF$/i, "salf"],
  [/^(JUNTS.*|JxCat)$/i, "junts"],
  [/^ERC\b/i, "erc"],
  [/^EH BILDU/i, "bildu"],
  [/^(EAJ-PNV|PNV)$/i, "pnv"],
  [/^B\.?N\.?G\.?$/i, "bng"],
  [/^(CCa-1\.ºCAN|1\.ºCAN-CCa|CC|CCa)$/i, "cc"],
  [/^(TERUEL EXISTE|ARAG[ÓO]N EXISTE|EXISTE)$/i, "existe"],
  [/^PACMA$/i, "pacma"],
  [/^COMPROM[ÍI]S/i, "compromis"],
  [/^ADELANTE ANDALUC[ÍI]A$/i, "adelante"],
  [/^(UPC|NC-BC, PODEMOS, IU, SUMAR)$/i, "upc"],
  [/^GBAI$/i, "geroabai"],
  [/^(SY|SORIA ¡?YA!?)$/i, "soriaya"],
  [/^AC$/i, "ac"],
  [/^(FO|FRENTE OBRERO)$/i, "frenteobrero"],
  [/^D21$/i, "d21"],
  [/^(PCTE|PCTE\/ELAK|ELAK\/PCTE|PCTC|PCTG)$/i, "pcte"],
];
const idPartido = (siglas) => PARTIDO.find(([re]) => re.test(siglas.trim()))?.[1] ?? "otros";

// ---------- enlaces ----------
// Solo se enlaza cuando la identificación es segura; ante la duda, sin enlace.
const norm = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
const VACIAS = new Set(["de", "del", "la", "las", "los", "y", "i", "e", "da", "das", "do", "dos"]);
const tokens = (s) => norm(s).split(" ").filter((t) => t && !VACIAS.has(t));
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
const UA_WIKI = { "User-Agent": "megatabla-29n/0.1 (https://alfonso-wav.github.io/megatabla-29n/)" };

// Ritmo máximo por servidor (Wikidata devuelve 429 si se le pide demasiado rápido).
const INTERVALO = { "www.wikidata.org": 350, "es.wikipedia.org": 150 };
const turno = {};
async function esperarTurno(host) {
  const min = INTERVALO[host] ?? 100;
  const ahora = Date.now();
  const t = Math.max(ahora, (turno[host] ?? 0) + min);
  turno[host] = t;
  if (t > ahora) await espera(t - ahora);
}

async function json(url, init = {}, tries = 8) {
  const host = new URL(url).host;
  for (let i = 0; ; i++) {
    try {
      await esperarTurno(host);
      const r = await fetch(url, { ...init, headers: { ...UA_WIKI, Accept: "application/json", ...init.headers }, signal: AbortSignal.timeout(30000) });
      if ((r.status === 429 || r.status >= 500) && i < tries) {
        const ra = Number(r.headers.get("retry-after"));
        const ms = (ra > 0 ? ra * 1000 : 5000 * (i + 1)) + 500;
        turno[host] = Date.now() + ms; // pausa también a los demás trabajadores
        await espera(ms);
        continue;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return await r.json();
    } catch (e) {
      if (i >= tries) throw e;
      await espera(2000 * (i + 1));
    }
  }
}

// Diputados del Congreso, legislaturas X-XV, del buscador oficial de congreso.es (trae codParlamentario).
async function diputadosCongreso() {
  const f = join(cache, "congreso-diputados.json");
  if (!existsSync(f)) {
    const todos = [];
    for (let leg = 10; leg <= 15; leg++) {
      const body = new URLSearchParams({
        _diputadomodule_idLegislatura: String(leg), _diputadomodule_genero: "0", _diputadomodule_grupo: "all",
        _diputadomodule_tipo: "2", _diputadomodule_nombre: "", _diputadomodule_apellidos: "",
        _diputadomodule_formacion: "all", _diputadomodule_filtroProvincias: "[]", _diputadomodule_nombreCircunscripcion: "",
      });
      const r = await json(
        "https://www.congreso.es/es/busqueda-de-diputados?p_p_id=diputadomodule&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=searchDiputados&p_p_cacheability=cacheLevelPage",
        { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0" } },
      );
      todos.push(...r.data);
      console.log(`congreso: legislatura ${leg}, ${r.data.length} diputados`);
    }
    writeFileSync(f, JSON.stringify(todos));
  }
  return JSON.parse(readFileSync(f, "utf8"));
}
const fichaCongreso = (cod, leg) =>
  `https://www.congreso.es/es/busqueda-de-diputados?p_p_id=diputadomodule&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_diputadomodule_mostrarFicha=true&codParlamentario=${cod}&idLegislatura=${leg}`;

// Palabras que el artículo de Wikipedia debe mencionar para aceptar que es la misma persona.
const AFINIDAD = {
  pp: /Partido Popular|\bPP\b|Unión del Pueblo Navarro|\bUPN\b/,
  psoe: /PSOE|Socialista|\bPSC\b|\bPSN\b|PSdeG|PSPV|PSIB|PSE-EE/,
  vox: /\bVox\b/i,
  fa: /Sumar|Izquierda Unida|Más Madrid|Comuns|Comú|Compromís|Chunta|Frente Amplio|Front Ampli|Fronte Ampla|Equo|Más País|Iniciativa per Catalunya|Anova|Mes per Mallorca|Més per Mallorca/,
  podemos: /Podemos/,
  salf: /Se Acabó La Fiesta|\bSALF\b|Alvise/,
  junts: /Junts|Convergència|PDeCAT|\bCiU\b/,
  erc: /Esquerra Republicana|\bERC\b/,
  bildu: /Bildu|Sortu|Eusko Alkartasuna|Aralar/,
  pnv: /\bPNV\b|Partido Nacionalista Vasco|\bEAJ\b/,
  bng: /\bBNG\b|Bloque Nacionalista Galego/,
  cc: /Coalición Canaria|Primero Canarias/,
  existe: /Teruel Existe|Aragón Existe/,
  pacma: /PACMA|Animalista/,
  compromis: /Compromís/,
  adelante: /Adelante Andalucía|Anticapitalistas/,
  upc: /Nueva Canarias|Unidad del Pueblo Canario|Podemos|Izquierda Unida|Sumar/,
  geroabai: /Geroa Bai/,
  soriaya: /Soria ¡?Ya/,
  ac: /Aliança Catalana/,
  frenteobrero: /Frente Obrero/,
  d21: /Democracia 21|Ciudadanos|\bUCIN\b/,
  pcte: /Partido Comunista de los Trabajadores|\bPCTE\b/,
};
const POLITICO = /Polític|Diputad|Senador|Concejal|Alcalde|Consejer|Eurodiputad|Parlamentari|Ministr|Sindicalist|Miembros d|Militantes/;
const LEGISLATURA_ES = /Diputados de la [IVXL]+ Legislatura de España/;

// Busca en es.wikipedia por el nombre completo del BOE. Acepta un artículo solo si
//  - las palabras del título (sin desambiguación) están todas en el nombre del BOE (≥2),
//  - es de un político (categorías) y
//  - es diputado del Congreso coincidente con los datos oficiales, o menciona el partido de la lista.
// Si más de un artículo cumple, no se enlaza.
// El título (sin desambiguación) debe tener ≥2 palabras y aparecer, en el mismo orden, dentro
// del nombre del BOE. Si es «Nombre Apellido», ese apellido no puede ser el último del BOE:
// «Pedro Sánchez» no es «Pedro Delgado Sánchez». Excepciones, en enlaces-manuales.json.
function tituloCompatible(titulo, nombre) {
  const tt = tokens(titulo.replace(/\s*\(.*\)$/, ""));
  const bt = tokens(nombre);
  if (tt.length < 2) return false;
  let i = 0;
  for (const t of bt) if (t === tt[i]) i++;
  if (i < tt.length) return false;
  // (salvo apellidos repetidos: «Dolors Montserrat Montserrat»)
  if (tt.length === 2 && bt.length >= 3 && tt[1] === bt.at(-1) && bt.at(-2) !== bt.at(-1)) return false;
  return true;
}

async function wikipedia(nombre, partido, siglas, denominacion, esDiputado) {
  const url =
    "https://es.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1" +
    "&generator=search&gsrlimit=5&gsrsearch=" + encodeURIComponent(nombre) +
    "&prop=categories|pageprops|extracts&cllimit=max&clshow=!hidden&exintro=1&explaintext=1&exlimit=max&ppprop=wikibase_item";
  const r = await json(url);
  const afin = AFINIDAD[partido] ?? new RegExp(`\\b(${[siglas, denominacion].map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");
  const ok = [];
  for (const p of r.query?.pages ?? []) {
    if (!tituloCompatible(p.title, nombre)) continue;
    const cats = (p.categories ?? []).map((c) => c.title).join(" ");
    if (!POLITICO.test(cats)) continue;
    const texto = `${p.extract ?? ""} ${cats}`;
    if (!((esDiputado && LEGISLATURA_ES.test(cats)) || afin.test(texto))) continue;
    ok.push({ wikipedia: `https://es.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`, wikidata: p.pageprops?.wikibase_item });
  }
  return ok.length === 1 ? ok[0] : ok.length > 1 ? "ambiguo" : null;
}

// Partidos en inglés/catalán/gallego, para artículos de otras Wikipedias y etiquetas de Wikidata.
const AFINIDAD_OTRAS = {
  pp: /People's Party|Partit Popular/,
  psoe: /Socialist Workers|Socialists' Party|Partit dels Socialistes/,
  fa: /United Left|Esquerra Unida|Catalunya en Comú|Galician Left/,
  junts: /Together for Catalonia|Junts per Catalunya/,
  erc: /Republican Left of Catalonia/,
  pnv: /Basque Nationalist/,
  bng: /Galician Nationalist Bloc|Bloque Nacionalista Galego/,
  cc: /Canarian Coalition|Coalició Canària/,
  pacma: /Animalist/,
  d21: /Citizens|Ciutadans/,
  pcte: /Communist Party of the Workers of Spain/,
  ac: /Catalan Alliance/,
};
const afinidad = (partido, siglas, denominacion) => {
  const base =
    AFINIDAD[partido] ??
    new RegExp(`\\b(${[siglas, denominacion].map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");
  const otra = AFINIDAD_OTRAS[partido];
  return { test: (t) => base.test(t) || (otra ? otra.test(t) : false) };
};

// ---------- Wikidata ----------
const WD = "https://www.wikidata.org/w/api.php?format=json&";
const WIKIS = ["eswiki", "cawiki", "glwiki", "euwiki", "enwiki"]; // orden de preferencia
const IDIOMAS = "es|ca|gl|eu|en";
const qids = (e, p) => (e.claims?.[p] ?? []).map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
const valores = (e, p) => (e.claims?.[p] ?? []).map((c) => c.mainsnak?.datavalue?.value).filter((v) => typeof v === "string");
const texto = (m, ...langs) => langs.map((l) => m?.[l]?.value).find(Boolean);

// Entidades en caché reducida: solo lo que se usa.
function reducir(e) {
  const nombres = new Set();
  for (const l of Object.values(e.labels ?? {})) nombres.add(l.value);
  for (const a of Object.values(e.aliases ?? {})) for (const x of a) nombres.add(x.value);
  const sitelinks = {};
  for (const w of WIKIS) if (e.sitelinks?.[w]) sitelinks[w] = e.sitelinks[w].title;
  return {
    nombres: [...nombres],
    desc: texto(e.descriptions, "es", "ca", "gl", "en"),
    descEn: texto(e.descriptions, "en"),
    humano: qids(e, "P31").includes("Q5"),
    espana: qids(e, "P27").includes("Q29"),
    ocupacion: qids(e, "P106"),
    cargos: qids(e, "P39").length,
    partidos: qids(e, "P102"),
    estudios: qids(e, "P69"),
    linkedin: valores(e, "P6634")[0],
    sitelinks,
  };
}

async function entidades(qs, ecache) {
  const faltan = [...new Set(qs)].filter((q) => !(q in ecache));
  for (let i = 0; i < faltan.length; i += 50) {
    const lote = faltan.slice(i, i + 50);
    const r = await json(`${WD}action=wbgetentities&props=labels|aliases|descriptions|claims|sitelinks&languages=${IDIOMAS}&ids=${lote.join("|")}`);
    for (const q of lote) ecache[q] = r.entities?.[q]?.claims ? reducir(r.entities[q]) : null;
  }
}

// Etiquetas (partidos, universidades, profesiones) en caché aparte.
async function etiquetas(qs, lcache) {
  const faltan = [...new Set(qs)].filter((q) => !(q in lcache));
  for (let i = 0; i < faltan.length; i += 50) {
    const lote = faltan.slice(i, i + 50);
    const r = await json(`${WD}action=wbgetentities&props=labels&languages=${IDIOMAS}&ids=${lote.join("|")}`);
    for (const q of lote) lcache[q] = texto(r.entities?.[q]?.labels, "es", "ca", "gl", "en") ?? null;
  }
}

// Consultas de búsqueda por nombre: el completo y «nombre + apellido» probables.
function consultas(nombre) {
  const w = nombre.split(/\s+/).filter((x) => !VACIAS.has(norm(x)));
  const q = new Set([nombre]);
  if (w.length >= 3) {
    q.add(`${w[0]} ${w[1]}`);
    q.add(`${w[0]} ${w[w.length - 2]}`);
    if (w.length >= 4) q.add(`${w[1]} ${w[2]}`);
  }
  return [...q];
}

const urlWiki = (wiki, titulo) =>
  `https://${wiki.replace(/wiki$/, "")}.wikipedia.org/wiki/${encodeURIComponent(titulo.replace(/ /g, "_"))}`;

async function extracto(wiki, titulo, xcache) {
  const k = `${wiki}:${titulo}`;
  if (!(k in xcache)) {
    const host = `${wiki.replace(/wiki$/, "")}.wikipedia.org`;
    const r = await json(
      `https://${host}/w/api.php?action=query&format=json&formatversion=2&redirects=1&prop=extracts|categories&cllimit=max&clshow=!hidden&exintro=1&explaintext=1&titles=${encodeURIComponent(titulo)}`,
    );
    const p = r.query?.pages?.[0];
    xcache[k] = `${p?.extract ?? ""} ${(p?.categories ?? []).map((c) => c.title).join(" ")}`.slice(0, 4000);
  }
  return xcache[k];
}

const ES_POLITICO = (e) =>
  e.ocupacion.includes("Q82955") || e.cargos > 0 || e.partidos.length > 0 || /pol[íi]tic/i.test(`${e.desc} ${e.descEn}`);
const ES_ESPANA = (e) => e.espana || /espa|spanish|catal|basque|vasc|galic|galleg|canari|andaluz|andalusian/i.test(`${e.desc} ${e.descEn}`);

// Una entidad es la persona del BOE si: es humana, española y política; alguno de sus nombres
// (en cualquier idioma) es compatible con el nombre completo del BOE; y su partido en Wikidata
// coincide con el de la lista o, si Wikidata no lo dice, el artículo de Wikipedia lo menciona.
async function verificar(q, nombre, p, esDiputado, ecache, lcache, xcache) {
  const e = ecache[q];
  if (!e || !e.humano || !ES_POLITICO(e) || !ES_ESPANA(e)) return false;
  if (!e.nombres.some((x) => tituloCompatible(x, nombre))) return false;
  const af = afinidad(p.partido, p.siglas, p.denominacion);
  if (e.partidos.length) {
    await etiquetas(e.partidos, lcache);
    if (e.partidos.some((x) => lcache[x] && af.test(lcache[x]))) return true;
  }
  const wiki = WIKIS.find((w) => e.sitelinks[w]);
  if (!wiki) return false;
  const t = await extracto(wiki, e.sitelinks[wiki], xcache);
  return af.test(t) || (esDiputado && LEGISLATURA_ES.test(t));
}

async function enlaces(listas) {
  // Congreso: clave = nombre + apellidos normalizados; se enlaza la ficha de la legislatura más reciente.
  const congreso = {};
  for (const d of await diputadosCongreso()) {
    const k = norm(`${d.nombre} ${d.apellidos}`);
    const prev = congreso[k];
    if (!prev || d.idLegislatura > prev.leg)
      congreso[k] = { leg: d.idLegislatura, cod: d.codParlamentario, legs: [...(prev?.legs ?? []), d.idLegislatura] };
    else prev.legs.push(d.idLegislatura);
  }
  const bios = await biografiasCongreso();

  const cargar = (n) => (existsSync(join(cache, n)) ? JSON.parse(readFileSync(join(cache, n), "utf8")) : {});
  const guardar = (n, o) => writeFileSync(join(cache, n), JSON.stringify(o));
  const wcache = cargar("wikipedia-cache.json"); // nombre → resultado de la búsqueda en es.wikipedia
  const scache = cargar("wikidata-busquedas.json"); // consulta → [Q…]
  const ecache = cargar("wikidata-entidades.json"); // Q → entidad reducida
  const lcache = cargar("wikidata-etiquetas.json"); // Q → etiqueta
  const xcache = cargar("wikipedia-extractos.json"); // wiki:título → texto
  const vcache = cargar("wikidata-verificados.json"); // nombre → Q | null | "ambiguo"
  const guardarTodo = () => {
    guardar("wikipedia-cache.json", wcache);
    guardar("wikidata-busquedas.json", scache);
    guardar("wikidata-entidades.json", ecache);
    guardar("wikidata-etiquetas.json", lcache);
    guardar("wikipedia-extractos.json", xcache);
    guardar("wikidata-verificados.json", vcache);
  };

  const personas = new Map(); // nombre → {partido, siglas, denominacion, titular}
  for (const l of listas)
    for (const [c, titular] of [...l.titulares.map((c) => [c, true]), ...l.suplentes.map((c) => [c, false])]) {
      const prev = personas.get(c.nombre);
      if (!prev || (titular && !prev.titular))
        personas.set(c.nombre, { partido: l.partido, siglas: l.siglas, denominacion: l.denominacion, titular });
    }
  const buscables = [...personas].filter(([n, p]) => p.titular || congreso[norm(n)]);

  // 1) es.wikipedia por nombre completo
  {
    const cola = buscables.filter(([n]) => !(n in wcache));
    let hechos = 0;
    const trabajador = async () => {
      while (cola.length) {
        const [n, p] = cola.shift();
        try {
          wcache[n] = await wikipedia(n, p.partido, p.siglas, p.denominacion, !!congreso[norm(n)]);
        } catch (e) {
          console.warn(`\n${n}: ${e.message}`);
        }
        if (++hechos % 50 === 0) {
          guardarTodo();
          process.stdout.write(`\rwikipedia ${hechos} (quedan ${cola.length})   `);
        }
        await espera(150);
      }
    };
    await Promise.all([trabajador(), trabajador(), trabajador()]);
    guardarTodo();
  }
  const wikiES = (n) => {
    const w = wcache[n];
    return w && w !== "ambiguo" && tituloCompatible(decodeURIComponent(w.wikipedia.split("/wiki/")[1]).replace(/_/g, " "), n) ? w : null;
  };

  // 2) Wikidata (etiquetas y alias en cualquier idioma) para quien no tiene artículo en es.wikipedia
  {
    const cola = buscables.filter(([n]) => !wikiES(n) && !(n in vcache));
    let hechos = 0;
    const trabajador = async () => {
      while (cola.length) {
        const [n, p] = cola.shift();
        try {
          const qs = new Set();
          for (const c of consultas(n)) {
            if (!(c in scache)) {
              const r = await json(`${WD}action=wbsearchentities&type=item&limit=7&language=es&uselang=es&search=${encodeURIComponent(c)}`);
              scache[c] = (r.search ?? []).map((x) => x.id);
            }
            for (const q of scache[c]) qs.add(q);
          }
          await entidades([...qs], ecache);
          const ok = [];
          for (const q of qs) if (await verificar(q, n, p, !!congreso[norm(n)], ecache, lcache, xcache)) ok.push(q);
          vcache[n] = ok.length === 1 ? ok[0] : ok.length > 1 ? "ambiguo" : null;
        } catch (e) {
          console.warn(`\n${n}: ${e.message}`);
        }
        if (++hechos % 50 === 0) {
          guardarTodo();
          process.stdout.write(`\rwikidata ${hechos} (quedan ${cola.length})   `);
        }
      }
    };
    await Promise.all([trabajador(), trabajador(), trabajador()]);
    guardarTodo();
    process.stdout.write("\n");
  }

  // 3) Datos de Wikidata (descripción, estudios, profesión, LinkedIn) de todos los identificados
  const qDe = (n) => wikiES(n)?.wikidata ?? (vcache[n] && vcache[n] !== "ambiguo" ? vcache[n] : null);
  const todosQ = [...personas.keys()].map(qDe).filter(Boolean);
  await entidades(todosQ, ecache);
  await etiquetas(todosQ.flatMap((q) => [...(ecache[q]?.estudios ?? []), ...(ecache[q]?.ocupacion ?? [])]), lcache);
  guardarTodo();

  // Enlaces manuales (data/candidatos/enlaces-manuales.json) tienen prioridad; null = no enlazar.
  const fm = join(dir, "enlaces-manuales.json");
  const manual = existsSync(fm) ? JSON.parse(readFileSync(fm, "utf8")) : {};
  const out = {};
  for (const n of personas.keys()) {
    const e = {};
    const w = wikiES(n);
    const q = qDe(n);
    const ent = q ? ecache[q] : null;
    if (w) Object.assign(e, w);
    else if (ent) {
      const wiki = WIKIS.find((x) => ent.sitelinks[x]);
      if (wiki) e.wikipedia = urlWiki(wiki, ent.sitelinks[wiki]);
      e.wikidata = q;
    }
    if (ent) {
      if (ent.desc) e.descripcion = ent.desc;
      const est = ent.estudios.map((x) => lcache[x]).filter(Boolean);
      if (est.length) e.estudios = [...new Set(est)];
      const ocu = ent.ocupacion.filter((x) => x !== "Q82955").map((x) => lcache[x]).filter(Boolean);
      if (ocu.length) e.ocupacion = [...new Set(ocu)].slice(0, 4);
      if (ent.linkedin) e.linkedin = `https://www.linkedin.com/in/${encodeURIComponent(ent.linkedin)}`;
    }
    const c = congreso[norm(n)];
    if (c) {
      e.congreso = fichaCongreso(c.cod, c.leg);
      e.legislaturas = [...new Set(c.legs)].sort((a, b) => a - b);
    }
    if (bios[norm(n)]) e.biografia = bios[norm(n)];
    if (n in manual) {
      if (manual[n] === null) continue;
      Object.assign(e, manual[n]);
    }
    if (Object.keys(e).length) out[n] = e;
  }
  const ordenado = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b, "es")));
  writeFileSync(join(dir, "enlaces.json"), JSON.stringify(ordenado, null, 1));
  const v = Object.values(out);
  const cuenta = (f) => v.filter(f).length;
  const amb = [...Object.values(wcache), ...Object.values(vcache)].filter((x) => x === "ambiguo").length;
  console.log(
    `enlaces.json: ${cuenta((x) => x.wikipedia)} con Wikipedia (${cuenta((x) => x.wikipedia && !x.wikipedia.includes("//es."))} en otros idiomas), ` +
      `${cuenta((x) => x.congreso)} con ficha del Congreso, ${cuenta((x) => x.biografia)} con biografía oficial, ` +
      `${cuenta((x) => x.estudios)} con estudios, ${cuenta((x) => x.linkedin)} con LinkedIn; ${amb} ambiguos sin enlazar`,
  );
}

// Biografías oficiales de los diputados (datos abiertos del Congreso, todas las legislaturas disponibles).
// Se quitan los datos familiares y se guardan las primeras líneas.
function lineasBiografia(texto) {
  const partes = texto
    // salto a mitad de frase: «Escuela de\nCapataces», «técnico\nsuperior»
    .replace(/\b(de|del|la|las|el|los|y|e|en|por|para|a|con)\n(?=\S)/gi, "$1 ")
    .replace(/(\S)\n(?=[a-záéíóúñ])/g, "$1 ")
    .split(/\s{2,}|\s*\n\s*|\.\s+(?=[A-ZÁÉÍÓÚ])/)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter((s) => s.length > 1 && !/^(casad|solter|divorciad|viud|pareja|\d+ hij|.*\bhij[oa]s?\b)/i.test(s));
  // años sueltos («1995») se unen a la línea siguiente
  const out = [];
  for (let i = 0; i < partes.length; i++) {
    if (/^\d{4}([-–]\d{4})?$/.test(partes[i]) && partes[i + 1]) out.push(`${partes[i]}: ${partes[++i]}`);
    else if (partes[i].length > 2) out.push(partes[i]);
  }
  return out.slice(0, 6);
}

async function biografiasCongreso() {
  const f = join(cache, "congreso-biografias-v2.json");
  if (!existsSync(f)) {
    const page = await fetch("https://www.congreso.es/es/opendata/diputados", { headers: UA }).then((r) => r.text());
    const urls = [...new Set([...page.matchAll(/href="([^"]*opendata\/diputados\/(?:DiputadosActivos|DiputadosDeBaja|odsDiputados\d+)__[^"]+\.json)"/g)].map((m) => new URL(m[1], "https://www.congreso.es").href))];
    const bios = {};
    for (const u of urls) {
      let datos = [];
      try {
        datos = await json(u, { headers: { "User-Agent": "Mozilla/5.0" } });
      } catch (e) {
        console.warn("congreso:", e.message);
      }
      for (const d of datos) {
        if (!d.NOMBRE || !d.BIOGRAFIA) continue;
        const [ap, nom] = d.NOMBRE.split(",").map((s) => s.trim());
        const k = norm(`${nom} ${ap}`);
        if (bios[k]) continue; // la primera URL es la legislatura actual
        const lineas = lineasBiografia(d.BIOGRAFIA);
        if (lineas.length) bios[k] = lineas;
      }
    }
    writeFileSync(f, JSON.stringify(bios));
  }
  return JSON.parse(readFileSync(f, "utf8"));
}

// ---------- principal ----------
const listas = parsear(await boeXML(BOE));
await boeXML(CORRECCION); // se guarda para revisión manual de correcciones.json
const nCorr = corregir(listas);
for (const l of listas) l.partido = idPartido(l.siglas);

const circs = [...new Set(listas.map((l) => l.circunscripcion))];
if (circs.length !== 52) throw new Error(`se esperaban 52 circunscripciones y hay ${circs.length}: ${circs.join(", ")}`);
const ids = new Set(read("data/partidos.json").partidos.map((p) => p.id));
for (const l of listas) if (!ids.has(l.partido)) throw new Error(`partido desconocido ${l.partido}`);

writeFileSync(
  join(dir, "listas.json"),
  JSON.stringify(
    {
      fuente: { id: BOE, url: `https://www.boe.es/diario_boe/txt.php?id=${BOE}`, fecha: "2026-11-03" },
      correccion: { id: CORRECCION, url: `https://www.boe.es/diario_boe/txt.php?id=${CORRECCION}`, fecha: "2026-11-07", aplicadas: nCorr },
      listas,
    },
    null,
    1,
  ),
);
const porPartido = {};
for (const l of listas) porPartido[l.partido] = (porPartido[l.partido] ?? 0) + 1;
console.log(`listas.json: ${listas.length} candidaturas al Congreso en ${circs.length} circunscripciones`);
console.log(porPartido);
const otras = [...new Set(listas.filter((l) => l.partido === "otros").map((l) => l.siglas))];
console.log("otras siglas:", otras.join(" | "));
if (process.argv.includes("--enlaces")) await enlaces(listas);
