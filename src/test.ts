// «Averigua tu partido»: test de afinidad basado solo en los programas electorales.
// Las posturas de cada partido están en data/test/preguntas.json, cada una justificada
// con la celda de la tabla (y sus páginas) de la que sale.
import tablaData from "./generated/tabla.json";
import testData from "./generated/test.json";
import type { Partido, Tabla } from "./types";
import { esc, paginasHTML } from "./util";

type Postura = [valor: number, nota: string, materia?: string];
interface Pregunta {
  id: string;
  texto: string;
  materia: string;
  pos: Record<string, Postura>;
}

const tabla = tablaData as Tabla;
const preguntas = (testData as unknown as { preguntas: Pregunta[] }).preguntas;
const publicados = tabla.partidos.filter((p) => p.estado === "publicado");
const nombreMateria = Object.fromEntries(tabla.materias.map((m) => [m.id, m.nombre]));

/** Por debajo de este número de preguntas en común no se da porcentaje. */
const MINIMO = 5;

const OPCIONES: { v: number; txt: string }[] = [
  { v: 2, txt: "Muy de acuerdo" },
  { v: 1, txt: "De acuerdo" },
  { v: 0, txt: "Neutral" },
  { v: -1, txt: "En desacuerdo" },
  { v: -2, txt: "Muy en desacuerdo" },
];
const TXT_VALOR: Record<string, string> = Object.fromEntries(OPCIONES.map((o) => [o.v, o.txt]));
const TXT_PARTIDO: Record<string, string> = { "2": "Muy a favor", "1": "A favor", "-1": "En contra", "-2": "Muy en contra" };

// ---------- estado (respuestas guardadas solo en este navegador) ----------
interface Respuesta {
  v: number | null; // null = saltada
  imp: boolean; // «importante para mí»: cuenta doble
}
const KEY = "megatabla29n.test.v1";
let respuestas: Record<string, Respuesta> = {};
let actual = 0;
try {
  respuestas = JSON.parse(localStorage.getItem(KEY) ?? "{}");
} catch {
  /* sin almacenamiento */
}
const guardar = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(respuestas));
  } catch {
    /* ignorar */
  }
};

// ---------- cálculo ----------
interface Resultado {
  p: Partido;
  pct: number;
  n: number; // preguntas en común
}
function calcular(): { fiables: Resultado[]; escasos: Resultado[] } {
  const res = publicados.map((p) => {
    let suma = 0, peso = 0, n = 0;
    for (const q of preguntas) {
      const r = respuestas[q.id];
      const pos = q.pos[p.id];
      if (!r || r.v === null || !pos) continue;
      const w = r.imp ? 2 : 1;
      suma += w * (1 - Math.abs(r.v - pos[0]) / 4);
      peso += w;
      n++;
    }
    return { p, pct: peso ? Math.round((100 * suma) / peso) : 0, n };
  });
  const orden = (a: Resultado, b: Resultado) => b.pct - a.pct || b.n - a.n;
  return {
    fiables: res.filter((r) => r.n >= MINIMO).sort(orden),
    escasos: res.filter((r) => r.n < MINIMO).sort((a, b) => b.n - a.n),
  };
}

// ---------- pantallas ----------
let dlg: HTMLDialogElement;
let cuerpo: HTMLElement;

function pantallaInicio() {
  const hechas = preguntas.filter((q) => respuestas[q.id]).length;
  cuerpo.innerHTML = `
    <p class="ficha-meta">Test de afinidad · 29N</p>
    <h2 id="test-titulo">Averigua tu partido</h2>
    <p>${preguntas.length} afirmaciones sobre vivienda, impuestos, trabajo, inmigración, territorio y otros temas.
      Di si estás de acuerdo y verás tu porcentaje de coincidencia con cada partido.</p>
    <ul class="test-notas">
      <li><strong>Solo programas electorales.</strong> La postura de cada partido sale de su programa oficial para el 29N, con la página citada. No cuentan declaraciones, votaciones ni historia.</li>
      <li><strong>Si un programa no habla de un tema, no suma ni resta.</strong> Por eso cada resultado indica en cuántas preguntas se basa; con menos de ${MINIMO} no se da porcentaje.</li>
      <li>Marca «Importante para mí» en lo que más te importe: esa pregunta cuenta el doble.</li>
      <li>Tus respuestas no se envían a ningún sitio; solo se guardan en este navegador.</li>
    </ul>
    <div class="test-acciones">
      <button type="button" class="btn-primario" data-accion="empezar">${hechas ? "Continuar" : "Empezar"}</button>
      ${hechas ? `<button type="button" class="btn-sec" data-accion="resultados">Ver resultados</button><button type="button" class="btn-sec" data-accion="reiniciar">Empezar de cero</button>` : ""}
    </div>`;
}

function pantallaPregunta() {
  const q = preguntas[actual];
  const r = respuestas[q.id];
  cuerpo.innerHTML = `
    <div class="test-progreso" role="progressbar" aria-valuemin="1" aria-valuemax="${preguntas.length}" aria-valuenow="${actual + 1}">
      <span style="width:${((actual + 1) / preguntas.length) * 100}%"></span>
    </div>
    <p class="ficha-meta">${actual + 1} de ${preguntas.length} · ${esc(nombreMateria[q.materia])}</p>
    <h2 id="test-titulo" class="test-afirmacion">${esc(q.texto)}</h2>
    <div class="test-opciones" role="group" aria-label="Tu respuesta">
      ${OPCIONES.map(
        (o, i) =>
          `<button type="button" data-v="${o.v}" aria-pressed="${r?.v === o.v}" title="Tecla ${i + 1}">${o.txt}</button>`,
      ).join("")}
    </div>
    <label class="chk test-imp"><input type="checkbox" id="test-imp" ${r?.imp ? "checked" : ""}/> Importante para mí</label>
    <div class="test-nav">
      <button type="button" class="btn-sec" data-accion="atras" ${actual === 0 ? "disabled" : ""}>‹ Anterior</button>
      <button type="button" class="btn-sec" data-accion="saltar">Saltar</button>
      <button type="button" class="btn-sec" data-accion="resultados">Ver resultados</button>
    </div>`;
  cuerpo.querySelector<HTMLButtonElement>(r?.v != null ? `[data-v="${r.v}"]` : "[data-v]")?.focus();
}

function barra(r: Resultado) {
  return `<details class="test-res">
    <summary>
      <span class="test-siglas">${esc(r.p.siglas)}</span>
      <span class="test-barra"><span style="width:${r.pct}%"></span></span>
      <span class="test-pct">${r.pct} %</span>
      <span class="test-n">${r.n} preg.</span>
    </summary>
    ${detalle(r.p)}
  </details>`;
}

// Comparación pregunta a pregunta, con la justificación y las páginas del programa.
function detalle(p: Partido) {
  const filas = preguntas
    .filter((q) => respuestas[q.id]?.v != null)
    .map((q) => {
      const r = respuestas[q.id]!;
      const pos = q.pos[p.id];
      if (!pos) return `<li class="sin"><p class="test-q">${esc(q.texto)}</p><p class="test-q-pos">Su programa no se pronuncia.</p></li>`;
      const [v, nota, mat] = pos;
      const celda = tabla.celdas[p.id][mat ?? q.materia];
      const acuerdo = Math.round(100 * (1 - Math.abs(r.v! - v) / 4));
      return `<li>
        <p class="test-q">${esc(q.texto)}${r.imp ? ' <span class="test-imp-tag">importante</span>' : ""}</p>
        <p class="test-q-pos"><span>Tú: <b>${TXT_VALOR[r.v!]}</b></span><span>${esc(p.siglas)}: <b>${TXT_PARTIDO[v]}</b></span><span class="test-acuerdo" data-nivel="${acuerdo >= 75 ? "alto" : acuerdo <= 25 ? "bajo" : "medio"}">${acuerdo} %</span></p>
        <p class="test-nota">${esc(nota)} ${celda ? paginasHTML(p, celda.paginas) : ""}</p>
      </li>`;
    });
  return `<ol class="test-detalle">${filas.join("")}</ol>`;
}

function pantallaResultados() {
  const contestadas = preguntas.filter((q) => respuestas[q.id]?.v != null).length;
  if (!contestadas) {
    cuerpo.innerHTML = `<p class="ficha-meta">Resultados</p><h2 id="test-titulo">Aún no has respondido nada</h2>
      <div class="test-acciones"><button type="button" class="btn-primario" data-accion="empezar">Empezar el test</button></div>`;
    return;
  }
  const { fiables, escasos } = calcular();
  cuerpo.innerHTML = `
    <p class="ficha-meta">Resultados · ${contestadas} de ${preguntas.length} respondidas</p>
    <h2 id="test-titulo">Tu afinidad con cada partido</h2>
    <p class="test-explica">Porcentaje de coincidencia entre tus respuestas y lo que dice cada programa, solo en las preguntas
      sobre las que el programa se pronuncia. Pulsa un partido para ver la comparación pregunta a pregunta con la página del programa.</p>
    ${fiables.length ? `<div class="test-lista">${fiables.map(barra).join("")}</div>` : `<p class="vacio">Ningún partido coincide con al menos ${MINIMO} de tus respuestas. Responde más preguntas.</p>`}
    ${
      escasos.length
        ? `<p class="test-escasos"><strong>Sin datos suficientes</strong> (menos de ${MINIMO} preguntas en común con tus respuestas):
            ${escasos.map((r) => `${esc(r.p.siglas)} <small>(${r.n})</small>`).join(", ")}.</p>`
        : ""
    }
    <div class="test-acciones">
      <button type="button" class="btn-sec" data-accion="revisar">Revisar respuestas</button>
      <button type="button" class="btn-sec" data-accion="reiniciar">Empezar de cero</button>
    </div>
    <p class="ficha-fuente">Coincidencia por pregunta: 100 % si tu respuesta y la del partido son iguales, 75 % a un paso, y así hasta 0 % en extremos opuestos.
      Las preguntas marcadas como importantes cuentan el doble. Este test orienta, no recomienda: las posturas son resúmenes; prevalece el texto del programa.</p>`;
}

function responder(v: number | null) {
  const q = preguntas[actual];
  const imp = cuerpo.querySelector<HTMLInputElement>("#test-imp")?.checked ?? false;
  respuestas[q.id] = { v, imp };
  guardar();
  if (actual < preguntas.length - 1) {
    actual++;
    pantallaPregunta();
  } else pantallaResultados();
}

function primeraSinResponder() {
  const i = preguntas.findIndex((q) => !respuestas[q.id]);
  return i === -1 ? 0 : i;
}

export function abrirTest() {
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "test";
    dlg.className = "ancha";
    dlg.setAttribute("aria-labelledby", "test-titulo");
    dlg.innerHTML = `<form method="dialog"><button class="cerrar" aria-label="Cerrar">×</button></form><div id="test-cuerpo"></div>`;
    document.body.append(dlg);
    cuerpo = dlg.querySelector("#test-cuerpo")!;
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) return dlg.close();
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
      if (!b || !cuerpo.contains(b)) return;
      if (b.dataset.v !== undefined) return responder(Number(b.dataset.v));
      switch (b.dataset.accion) {
        case "empezar":
          actual = primeraSinResponder();
          return pantallaPregunta();
        case "revisar":
          actual = 0;
          return pantallaPregunta();
        case "atras":
          actual = Math.max(0, actual - 1);
          return pantallaPregunta();
        case "saltar":
          return responder(null);
        case "resultados":
          return pantallaResultados();
        case "reiniciar":
          respuestas = {};
          guardar();
          actual = 0;
          return pantallaPregunta();
      }
    });
    // Atajos: 1-5 responden, flechas navegan.
    dlg.addEventListener("keydown", (e) => {
      if (!cuerpo.querySelector(".test-opciones")) return;
      if ((e.target as HTMLElement).matches("input[type=text], input[type=search]")) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 5) {
        e.preventDefault();
        responder(OPCIONES[n - 1].v);
      } else if (e.key === "ArrowLeft" && actual > 0) {
        actual--;
        pantallaPregunta();
      } else if (e.key === "ArrowRight" && actual < preguntas.length - 1 && respuestas[preguntas[actual].id]) {
        actual++;
        pantallaPregunta();
      }
    });
    // Cambiar «importante» en una pregunta ya respondida se guarda sin volver a responder.
    dlg.addEventListener("change", (e) => {
      const t = e.target as HTMLInputElement;
      const r = respuestas[preguntas[actual]?.id];
      if (t.id === "test-imp" && r) {
        r.imp = t.checked;
        guardar();
      }
    });
  }
  pantallaInicio();
  if (!dlg.open) dlg.showModal();
}
