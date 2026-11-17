import type { Partido } from "./types";

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const enlacePagina = (p: Partido, n: number) =>
  p.copiaLocal ? `${import.meta.env.BASE_URL}programas/${p.archivo}#page=${n}` : `${p.url}#page=${n}`;

export function paginasHTML(p: Partido, paginas: number[]) {
  return `<span class="pags">p. ${paginas
    .map((n) => `<a href="${esc(enlacePagina(p, n))}" target="_blank" rel="noopener" title="Abrir el programa de ${esc(p.siglas)} en la página ${n}">${n}</a>`)
    .join(", ")}</span>`;
}
