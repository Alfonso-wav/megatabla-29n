import "./style.css";
import data from "./generated/tabla.json";
import type { Candidatos, Celda, Enlaces, Lista, Materia, Partido, Tabla } from "./types";

const tabla = data as Tabla;
const { materias, partidos, celdas } = tabla;
const publicados = partidos.filter((p) => p.estado === "publicado");
const pendientes = partidos.filter((p) => p.estado === "pendiente");
const grupos = [...new Set(materias.map((m) => m.grupo))];
const COMPACTO = 2; // medidas visibles por celda en modo compacto

// ---------- estado (preferencias de vista en localStorage, opcional) ----------
interface Estado {
  q: string;
  orient: "partidos" | "materias";
  detalle: boolean;
  grupo: string;
  ocultos: string[];
  verPendientes: boolean;
}
const KEY = "megatabla29n.vista.v2"; // v2: vista por defecto con materias en filas
const estado: Estado = {
  q: "",
  orient: "materias",
  detalle: false,
  grupo: "todos",
  ocultos: [],
  verPendientes: true,
};
try {
  Object.assign(estado, JSON.parse(localStorage.getItem(KEY) ?? "{}"), { q: "" });
} catch {
  /* sin almacenamiento: valores por defecto */
}
function guardar() {
  try {
    const { q: _q, ...resto } = estado;
    localStorage.setItem(KEY, JSON.stringify(resto));
  } catch {
    /* ignorar */
  }
}

// ---------- utilidades ----------
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const VARIANTES: Record<string, string> = {
  a: "aáàäâ", e: "eéèëê", i: "iíìïî", o: "oóòöô", u: "uúùüû", n: "nñ", c: "cç",
};
function regexBusqueda(q: string): RegExp | null {
  const limpio = sinTildes(q.trim());
  if (!limpio) return null;
  const patron = [...limpio]
    .map((ch) => (VARIANTES[ch] ? `[${VARIANTES[ch]}]` : ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(patron, "gi");
}
const marcar = (texto: string, re: RegExp | null) =>
  re ? esc(texto).replace(re, (m) => `<mark>${m}</mark>`) : esc(texto);

const textoCelda = (c: Celda) => (c ? [c.postura, ...c.medidas].join(" ") : "");
const coincide = (c: Celda, re: RegExp | null) => {
  if (!re || !c) return false;
  re.lastIndex = 0;
  const ok = re.test(textoCelda(c));
  re.lastIndex = 0;
  return ok;
};

const enlacePagina = (p: Partido, n: number) =>
  p.copiaLocal ? `${import.meta.env.BASE_URL}programas/${p.archivo}#page=${n}` : `${p.url}#page=${n}`;

const fecha = (iso?: string) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : "";

const IDIOMA: Record<string, string> = { es: "castellano", ca: "catalán", gl: "gallego" };

// ---------- piezas de HTML ----------
function paginasHTML(p: Partido, paginas: number[]) {
  return `<span class="pags">p. ${paginas
    .map((n) => `<a href="${esc(enlacePagina(p, n))}" target="_blank" rel="noopener" title="Abrir el programa de ${esc(p.siglas)} en la página ${n}">${n}</a>`)
    .join(", ")}</span>`;
}

function celdaHTML(p: Partido, m: Materia, re: RegExp | null) {
  const c = celdas[p.id][m.id];
  if (c === null) return `<td class="nsnc" data-p="${p.id}" data-m="${m.id}"><span>NS/NC</span></td>`;
  const dim = re && !coincide(c, re) ? " dim" : "";
  const n = estado.detalle ? c.medidas.length : Math.min(COMPACTO, c.medidas.length);
  const resto = c.medidas.length - n;
  return `<td class="celda${dim}" data-p="${p.id}" data-m="${m.id}" tabindex="0">
    <p class="postura">${marcar(c.postura, re)}</p>
    <ul>${c.medidas.slice(0, n).map((x) => `<li>${marcar(x, re)}</li>`).join("")}</ul>
    <div class="pie">${resto > 0 ? `<button class="mas" type="button">+${resto} medida${resto > 1 ? "s" : ""}</button>` : "<span></span>"}${paginasHTML(p, c.paginas)}</div>
  </td>`;
}

// El nombre del partido abre sus listas al Congreso.
const botonListas = (p: Partido) =>
  `<button type="button" class="ver-listas" data-listas="${esc(p.id)}" title="Ver las listas de ${esc(p.siglas)} al Congreso">
    <span class="siglas">${esc(p.siglas)}</span>
    <span class="nombre">${esc(p.nombre)}</span>
    <span class="listas-hint">Candidatos ›</span>
  </button>`;

function partidoTH(p: Partido) {
  if (p.estado === "pendiente")
    return `<th scope="row" class="cab-partido pendiente">${botonListas(p)}</th>`;
  return `<th scope="row" class="cab-partido">
    ${botonListas(p)}
    <a class="fuente" href="${esc(p.copiaLocal ? `${import.meta.env.BASE_URL}programas/${p.archivo}` : p.url!)}" target="_blank" rel="noopener">Programa · ${fecha(p.fechaPublicacion)}${p.idioma !== "es" ? ` · ${IDIOMA[p.idioma!]}` : ""}</a>
  </th>`;
}

function materiaTH(m: Materia, scope: "col" | "row") {
  return `<th scope="${scope}" class="cab-materia"><span class="grupo">${esc(m.grupo)}</span><span class="nombre">${esc(m.nombre)}</span></th>`;
}

function tablaHTML() {
  const re = regexBusqueda(estado.q);
  let ms = materias.filter((m) => estado.grupo === "todos" || m.grupo === estado.grupo);
  let ps = publicados.filter((p) => !estado.ocultos.includes(p.id));
  let pend = estado.verPendientes ? pendientes : [];
  // Con búsqueda: fuera las materias y los partidos sin ninguna celda que coincida.
  if (re) {
    ms = ms.filter((m) => ps.some((p) => coincide(celdas[p.id][m.id], re)));
    ps = ps.filter((p) => ms.some((m) => coincide(celdas[p.id][m.id], re)));
    pend = [];
    if (!ms.length) return `<p class="sin-resultados">Ninguna propuesta contiene «${esc(estado.q.trim())}».</p>`;
  }
  if (!ps.length && !pend.length)
    return `<p class="sin-resultados">No hay ningún partido seleccionado. Elige alguno en el filtro de partidos.</p>`;
  const textoPend = `Programa no publicado a ${fecha(tabla.fechaCorte)}`;

  if (estado.orient === "partidos") {
    return `<table>
      <thead><tr><th class="esquina" scope="col">Partido</th>${ms.map((m) => materiaTH(m, "col")).join("")}</tr></thead>
      <tbody>
        ${ps.map((p) => `<tr>${partidoTH(p)}${ms.map((m) => celdaHTML(p, m, re)).join("")}</tr>`).join("")}
        ${pend.map((p) => `<tr class="fila-pendiente">${partidoTH(p)}<td class="pend" colspan="${ms.length}"><span>${textoPend}</span></td></tr>`).join("")}
      </tbody></table>`;
  }
  return `<table class="t-materias">
    <thead><tr><th class="esquina" scope="col">Materia</th>${[...ps, ...pend]
      .map((p) => partidoTH(p).replace('scope="row"', 'scope="col"'))
      .join("")}</tr></thead>
    <tbody>${ms
      .map(
        (m) =>
          `<tr>${materiaTH(m, "row")}${ps.map((p) => celdaHTML(p, m, re)).join("")}${pend
            .map(() => `<td class="pend"><span>No publicado</span></td>`)
            .join("")}</tr>`,
      )
      .join("")}</tbody></table>`;
}

function contadorHTML() {
  const re = regexBusqueda(estado.q);
  if (!re) return "";
  const ms = materias.filter((m) => estado.grupo === "todos" || m.grupo === estado.grupo);
  const ps = publicados.filter((p) => !estado.ocultos.includes(p.id));
  let n = 0;
  for (const p of ps) for (const m of ms) if (coincide(celdas[p.id][m.id], re)) n++;
  return `${n} celda${n === 1 ? "" : "s"} con «${esc(estado.q.trim())}»`;
}

// ---------- maqueta ----------
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
<header class="cabecera">
  <div class="titulo">
    <h1>Megatabla 29N</h1>
    <p>Qué proponen los partidos en las <strong>elecciones generales del 29 de noviembre de 2026</strong>, materia por materia, según sus programas electorales oficiales.</p>
  </div>
  <dl class="cifras">
    <div><dt>Programas publicados</dt><dd>${publicados.length}<small> / ${partidos.filter((p) => p.id !== "otros").length} candidaturas</small></dd></div>
    <div><dt>Materias</dt><dd>${materias.length}</dd></div>
    <div><dt>Fecha de corte</dt><dd>${new Date(tabla.fechaCorte + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "long" })}</dd></div>
  </dl>
</header>

<details class="metodo">
  <summary>Cómo se ha hecho esta tabla</summary>
  <div class="metodo-cuerpo">
    <ul>
      <li><strong>Fuente única:</strong> el programa electoral oficial de cada partido, descargado de su web. No se usan declaraciones, entrevistas ni programas de elecciones anteriores.</li>
      <li><strong>Materias:</strong> las ${materias.length} columnas recogen la unión de todos los temas que tratan los programas publicados. Si un tema aparece en un solo programa, tiene columna igualmente.</li>
      <li><strong>NS/NC:</strong> el programa no menciona la materia. Se ha comprobado buscando palabras clave en el texto completo.</li>
      <li><strong>Celdas:</strong> cada una resume en una frase la postura del partido y enumera sus medidas concretas. Son resúmenes, no citas literales; el número de página abre el PDF original en esa página para comprobarlo.</li>
      <li><strong>Candidatos:</strong> pulsa el nombre de un partido para ver sus listas al Congreso en cada circunscripción, tal como las proclamó el BOE, con enlaces a Wikipedia y a la ficha oficial del Congreso cuando la identificación es segura.</li>
      <li><strong>Traducción:</strong> los programas de ERC (catalán) y BNG (gallego) se han resumido en castellano.</li>
      <li><strong>Pendientes:</strong> ${pendientes.map((p) => esc(p.siglas)).join(", ")} no habían publicado su programa a la fecha de corte. Aparecen como «no publicado», no como NS/NC, para no confundir «no lo dice» con «aún no lo ha presentado».</li>
    </ul>
    <h3>Documentos usados</h3>
    <table class="fuentes">
      <thead><tr><th>Partido</th><th>Documento</th><th>Publicado</th><th>Págs.</th><th>SHA-256</th></tr></thead>
      <tbody>${publicados
        .map(
          (p) => `<tr><td>${esc(p.siglas)}</td><td><a href="${esc(p.url!)}" target="_blank" rel="noopener">${esc(p.titulo!)}</a>${p.nota ? `<br><small>${esc(p.nota)}</small>` : ""}</td><td>${fecha(p.fechaPublicacion)}</td><td>${p.paginas ?? ""}</td><td><code title="${esc(p.sha256!)}">${p.sha256!.slice(0, 12)}…</code></td></tr>`,
        )
        .join("")}</tbody>
    </table>
  </div>
</details>

<div class="barra" role="toolbar" aria-label="Controles de la tabla">
  <label class="buscar">
    <span class="sr">Buscar</span>
    <input id="q" type="search" placeholder="Buscar en las propuestas: «alquiler», «nuclear», «OTAN»…" autocomplete="off" />
  </label>
  <div class="seg" role="group" aria-label="Orientación">
    <button type="button" data-orient="partidos">Partidos en filas</button>
    <button type="button" data-orient="materias">Materias en filas</button>
  </div>
  <label class="sel">Grupo
    <select id="grupo"><option value="todos">Todas las materias</option>${grupos
      .map((g) => `<option value="${esc(g)}">${esc(g)}</option>`)
      .join("")}</select>
  </label>
  <label class="chk"><input id="detalle" type="checkbox" /> Todas las medidas</label>
  <label class="chk"><input id="pend" type="checkbox" /> Mostrar no publicados</label>
  <details class="filtro-partidos" id="filtro-partidos">
    <summary><span id="filtro-resumen">Partidos</span></summary>
    <div class="menu" role="group" aria-label="Partidos visibles">
      <div class="menu-acciones">
        <button type="button" data-todos="1">Marcar todos</button>
        <button type="button" data-todos="0">Desmarcar todos</button>
      </div>
      ${publicados
        .map(
          (p) =>
            `<label class="opcion"><input type="checkbox" data-partido="${p.id}" /> <strong>${esc(p.siglas)}</strong> <span>${esc(p.nombre)}</span></label>`,
        )
        .join("")}
    </div>
  </details>
  <output id="contador" aria-live="polite"></output>
</div>

<main id="marco" class="marco" tabindex="-1"></main>

<dialog id="ficha" aria-labelledby="ficha-titulo">
  <form method="dialog"><button class="cerrar" aria-label="Cerrar">×</button></form>
  <div id="ficha-cuerpo"></div>
</dialog>

<footer class="pie-pagina">
  Resúmenes elaborados a partir de los programas oficiales; ante cualquier duda, prevalece el texto original enlazado en cada celda.
</footer>`;

const marco = document.querySelector<HTMLElement>("#marco")!;
const q = document.querySelector<HTMLInputElement>("#q")!;
const contador = document.querySelector<HTMLOutputElement>("#contador")!;
const ficha = document.querySelector<HTMLDialogElement>("#ficha")!;
const fichaCuerpo = document.querySelector<HTMLDivElement>("#ficha-cuerpo")!;

function pintar() {
  marco.innerHTML = tablaHTML();
  contador.innerHTML = contadorHTML();
  document.querySelectorAll<HTMLButtonElement>("[data-orient]").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.orient === estado.orient)),
  );
  guardar();
}

// controles: estado inicial
(document.querySelector("#grupo") as HTMLSelectElement).value = estado.grupo;
(document.querySelector("#detalle") as HTMLInputElement).checked = estado.detalle;
(document.querySelector("#pend") as HTMLInputElement).checked = estado.verPendientes;
document.querySelectorAll<HTMLInputElement>("[data-partido]").forEach((c) => {
  c.checked = !estado.ocultos.includes(c.dataset.partido!);
});

let t: number | undefined;
q.addEventListener("input", () => {
  clearTimeout(t);
  t = window.setTimeout(() => {
    estado.q = q.value;
    pintar();
  }, 120);
});
document.querySelectorAll<HTMLButtonElement>("[data-orient]").forEach((b) =>
  b.addEventListener("click", () => {
    estado.orient = b.dataset.orient as Estado["orient"];
    pintar();
  }),
);
document.querySelector("#grupo")!.addEventListener("change", (e) => {
  estado.grupo = (e.target as HTMLSelectElement).value;
  pintar();
});
document.querySelector("#detalle")!.addEventListener("change", (e) => {
  estado.detalle = (e.target as HTMLInputElement).checked;
  pintar();
});
document.querySelector("#pend")!.addEventListener("change", (e) => {
  estado.verPendientes = (e.target as HTMLInputElement).checked;
  pintar();
});
const filtroPartidos = document.querySelector<HTMLDetailsElement>("#filtro-partidos")!;
function resumenFiltro() {
  const n = publicados.length - estado.ocultos.filter((id) => publicados.some((p) => p.id === id)).length;
  document.querySelector("#filtro-resumen")!.textContent =
    n === publicados.length ? "Todos los partidos" : n === 0 ? "Ningún partido" : `${n} de ${publicados.length} partidos`;
}
document.querySelectorAll<HTMLInputElement>("[data-partido]").forEach((c) =>
  c.addEventListener("change", () => {
    const id = c.dataset.partido!;
    estado.ocultos = c.checked ? estado.ocultos.filter((x) => x !== id) : [...estado.ocultos, id];
    resumenFiltro();
    pintar();
  }),
);
document.querySelectorAll<HTMLButtonElement>("[data-todos]").forEach((b) =>
  b.addEventListener("click", () => {
    const todos = b.dataset.todos === "1";
    estado.ocultos = todos ? [] : publicados.map((p) => p.id);
    document.querySelectorAll<HTMLInputElement>("[data-partido]").forEach((c) => (c.checked = todos));
    resumenFiltro();
    pintar();
  }),
);
// cerrar el desplegable al pulsar fuera o con Escape
document.addEventListener("click", (e) => {
  if (filtroPartidos.open && !filtroPartidos.contains(e.target as Node)) filtroPartidos.open = false;
});
filtroPartidos.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    filtroPartidos.open = false;
    filtroPartidos.querySelector("summary")!.focus();
  }
});
resumenFiltro();

// ficha de detalle al pulsar una celda
function abrirFicha(td: HTMLElement) {
  const p = partidos.find((x) => x.id === td.dataset.p)!;
  const m = materias.find((x) => x.id === td.dataset.m)!;
  const c = celdas[p.id][m.id];
  if (!c) return;
  const re = regexBusqueda(estado.q);
  ficha.classList.remove("ancha");
  fichaCuerpo.innerHTML = `
    <p class="ficha-meta">${esc(m.grupo)} · ${esc(p.nombre)}</p>
    <h2 id="ficha-titulo">${esc(m.nombre)}: ${esc(p.siglas)}</h2>
    <p class="postura">${marcar(c.postura, re)}</p>
    <ol>${c.medidas.map((x) => `<li>${marcar(x, re)}</li>`).join("")}</ol>
    <p class="ficha-fuente">Fuente: <em>${esc(p.titulo!)}</em>, ${paginasHTML(p, c.paginas)}</p>
    <nav class="ficha-comparar" aria-label="Misma materia en otros partidos">
      ${publicados
        .filter((o) => o.id !== p.id)
        .map((o) =>
          celdas[o.id][m.id]
            ? `<button type="button" data-p="${o.id}" data-m="${m.id}">${esc(o.siglas)}</button>`
            : `<span title="${esc(o.siglas)} no menciona esta materia">${esc(o.siglas)}: NS/NC</span>`,
        )
        .join("")}
    </nav>`;
  if (!ficha.open) ficha.showModal();
}
marco.addEventListener("click", (e) => {
  const el = e.target as HTMLElement;
  if (el.closest("a")) return; // los enlaces de página abren el PDF
  const td = el.closest<HTMLElement>("td.celda");
  if (td) abrirFicha(td);
});
marco.addEventListener("keydown", (e) => {
  const td = (e.target as HTMLElement).closest<HTMLElement>("td.celda");
  if (td && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    abrirFicha(td);
  }
});
fichaCuerpo.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("button[data-p]");
  if (b) abrirFicha(b);
});
ficha.addEventListener("click", (e) => {
  if (e.target === ficha) ficha.close(); // clic fuera del contenido
});
ficha.addEventListener("close", () => ficha.classList.remove("ancha"));

// ---------- listas de candidatos (BOE), cargadas bajo demanda ----------
let candidatos: Candidatos | null = null;
const cargarCandidatos = async () =>
  (candidatos ??= (await import("./generated/candidatos.json")).default as Candidatos);

const ROMANO = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI"];
const fechaLarga = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });

function enlacesHTML(e: Enlaces | undefined, nombre: string) {
  if (!e) return "";
  const a = (href: string, txt: string, title: string, cls: string) =>
    `<a class="enl ${cls}" href="${esc(href)}" target="_blank" rel="noopener" title="${esc(title)}">${txt}</a>`;
  const legs = e.legislaturas?.map((l) => ROMANO[l] ?? l).join(", ");
  return `<span class="enlaces">${[
    e.wikipedia && a(e.wikipedia, "Wikipedia", `Artículo de ${nombre} en Wikipedia`, "w"),
    e.congreso && a(e.congreso, "Congreso", `Ficha oficial en congreso.es${legs ? ` (diputado/a en la legislatura ${legs})` : ""}`, "c"),
    e.wikidata && a(`https://www.wikidata.org/wiki/${e.wikidata}`, "Wikidata", `${nombre} en Wikidata`, "d"),
  ]
    .filter(Boolean)
    .join("")}</span>`;
}

function candidatoHTML(c: Lista["titulares"][number], l: Lista, re: RegExp | null) {
  const e = candidatos!.enlaces[c.nombre];
  const marca = c.partido && c.partido !== l.siglas ? ` <span class="afil" title="Partido según el BOE">${esc(c.partido)}</span>` : "";
  return `<li value="${c.n}"><span class="cand">${marcar(c.nombre, re)}${marca}</span>${enlacesHTML(e, c.nombre)}</li>`;
}

function listaHTML(l: Lista, p: Partido, re: RegExp | null, abierta: boolean) {
  const conEnlace = l.titulares.filter((c) => candidatos!.enlaces[c.nombre]).length;
  const otraMarca = p.id === "otros" || l.siglas.toUpperCase() !== p.siglas.toUpperCase();
  return `<details class="lista" ${abierta ? "open" : ""}>
    <summary>
      <span class="circ">${marcar(l.circunscripcion, re)}</span>
      ${otraMarca ? `<span class="marca" title="${esc(l.denominacion)}">${esc(l.siglas)}</span>` : ""}
      <span class="cuenta">${l.titulares.length} titular${l.titulares.length === 1 ? "" : "es"}${conEnlace ? ` · ${conEnlace} con enlaces` : ""}</span>
    </summary>
    <ol class="titulares">${l.titulares.map((c) => candidatoHTML(c, l, re)).join("")}</ol>
    ${
      l.suplentes.length
        ? `<p class="sup-tit">Suplentes</p><ol class="suplentes">${l.suplentes.map((c) => candidatoHTML(c, l, re)).join("")}</ol>`
        : ""
    }
  </details>`;
}

let listasPartido: { p: Partido; listas: Lista[] } | null = null;

function pintarListas(q: string) {
  const cont = fichaCuerpo.querySelector<HTMLElement>("#listas-cuerpo");
  if (!cont || !listasPartido) return;
  const { p, listas } = listasPartido;
  const re = regexBusqueda(q);
  const pasa = (l: Lista) => {
    if (!re) return true;
    const t = [l.circunscripcion, l.siglas, ...l.titulares.map((c) => c.nombre), ...l.suplentes.map((c) => c.nombre)].join(" | ");
    re.lastIndex = 0;
    const ok = re.test(t);
    re.lastIndex = 0;
    return ok;
  };
  const vis = listas.filter(pasa);
  cont.innerHTML = vis.length
    ? vis.map((l) => listaHTML(l, p, re, !!re || listas.length === 1)).join("")
    : `<p class="vacio">Ningún candidato ni circunscripción coincide con «${esc(q.trim())}».</p>`;
}

async function abrirListas(id: string) {
  const p = partidos.find((x) => x.id === id);
  if (!p) return;
  ficha.classList.add("ancha");
  fichaCuerpo.innerHTML = `<p class="ficha-meta">Listas al Congreso</p><h2 id="ficha-titulo">${esc(p.siglas)}</h2><p>Cargando…</p>`;
  if (!ficha.open) ficha.showModal();
  const cand = await cargarCandidatos();
  const listas = cand.listas
    .filter((l) => l.partido === p.id)
    .sort((a, b) => a.circunscripcion.localeCompare(b.circunscripcion, "es") || a.orden - b.orden);
  listasPartido = { p, listas };
  const personas = listas.flatMap((l) => l.titulares);
  const nW = personas.filter((c) => cand.enlaces[c.nombre]?.wikipedia).length;
  const nC = personas.filter((c) => cand.enlaces[c.nombre]?.congreso).length;
  const marcas = [...new Set(listas.map((l) => l.siglas))];
  const fuente = cand.fuente
    ? `<a href="${esc(cand.fuente.url)}" target="_blank" rel="noopener">BOE de ${fechaLarga(cand.fuente.fecha)} (${esc(cand.fuente.id)})</a>${
        cand.correccion
          ? `, con la <a href="${esc(cand.correccion.url)}" target="_blank" rel="noopener">corrección de errores del ${fechaLarga(cand.correccion.fecha)}</a>`
          : ""
      }`
    : "";

  fichaCuerpo.innerHTML = `
    <p class="ficha-meta">Listas al Congreso de los Diputados · 29N</p>
    <h2 id="ficha-titulo">${esc(p.siglas)} <small>${esc(p.nombre)}</small></h2>
    ${
      listas.length
        ? `<p class="listas-resumen">${listas.length} circunscripci${listas.length === 1 ? "ón" : "ones"} · ${personas.length} candidatos titulares
            · <span class="enl w">Wikipedia</span> ${nW} · <span class="enl c">Congreso</span> ${nC}</p>
          ${marcas.length > 1 ? `<p class="listas-marcas">Se presenta como: ${marcas.map((m) => `<span class="marca">${esc(m)}</span>`).join(" ")}</p>` : ""}
          <label class="buscar buscar-listas"><span class="sr">Buscar candidato o circunscripción</span>
            <input id="q-listas" type="search" placeholder="Buscar candidato o circunscripción…" autocomplete="off" /></label>
          <div id="listas-cuerpo" class="listas"></div>`
        : `<p class="vacio">No consta ninguna lista de ${esc(p.siglas)} al Congreso entre las candidaturas proclamadas.</p>`
    }
    <p class="ficha-fuente">Fuente: ${fuente}. Los números son el puesto en la lista.
      Enlaces a Wikipedia solo cuando el artículo coincide con el nombre completo del BOE, es de un político y menciona su partido
      (o consta como diputado en los datos del Congreso); si hay dudas no se enlaza, así que pueden faltar.
      La ficha del Congreso aparece para quienes han sido diputados entre la X y la XV legislatura.</p>`;
  pintarListas("");
  const qL = fichaCuerpo.querySelector<HTMLInputElement>("#q-listas");
  let tl: number | undefined;
  qL?.addEventListener("input", () => {
    clearTimeout(tl);
    tl = window.setTimeout(() => pintarListas(qL.value), 120);
  });
}

marco.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("button[data-listas]");
  if (b) void abrirListas(b.dataset.listas!);
});

pintar();
