// Revisa las webs oficiales de los partidos pendientes y lista enlaces que
// parezcan el programa del 29N. No descarga nada: solo avisa para revisar a mano.
//   node scripts/vigilar.mjs
const WEBS = {
  podemos: ["https://podemos.info", "https://pazcasaytrabajo.es"],
  junts: ["https://junts.cat"],
  compromis: ["https://compromis.net", "https://frontvalencia.org"],
  upc: ["https://www.nuevacanarias.org"],
  geroabai: ["https://geroabai.eus"],
  ac: ["https://aliancacatalana.cat"],
  frenteobrero: ["https://frenteobrero.es"],
  pcte: ["https://pcte.es"],
};
const PISTA = /(programa|program|propuestas|propostes)/i;
const RECIENTE = /(2026|29n|29-n|generales|generals|xerais|orokor)/i;

for (const [id, urls] of Object.entries(WEBS)) {
  const hallados = new Set();
  const estados = [];
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000) });
      estados.push(r.status);
      const html = await r.text();
      for (const [, href] of html.matchAll(/href="([^"]+)"/gi))
        if (PISTA.test(href) && RECIENTE.test(href) && !/2023|2019|2016|2015/.test(href))
          hallados.add(new URL(href, url).href);
    } catch {
      estados.push("error");
    }
  }
  console.log(`${id.padEnd(13)} [${estados.join(",")}] ${hallados.size ? [...hallados].join("  ") : "—"}`);
}
