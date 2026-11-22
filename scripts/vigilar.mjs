// Revisa las webs oficiales de los partidos pendientes y lista enlaces que
// parezcan el programa del 29N. No descarga nada: solo avisa para revisar a mano.
//   node scripts/vigilar.mjs
const WEBS = {
  upc: ["https://www.nuevacanarias.org"],
  ac: ["https://aliancacatalana.cat"],
  pcte: ["https://pcte.es"],
};
// Algunas webs (podemos.info) devuelven 403 a un User-Agent mínimo.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const PISTA = /(programa|program|propuestas|propostes)/i;
const RECIENTE = /(2026|29n|29-n|generales|generals|xerais|orokor)/i;
const VIEJO = /20(1[0-9]|2[0-5])/; // años anteriores a 2026 en la URL

for (const [id, urls] of Object.entries(WEBS)) {
  const hallados = new Set();
  const estados = [];
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
      estados.push(r.status);
      const html = await r.text();
      for (const [, href] of html.matchAll(/href="([^"]+)"/gi)) {
        if (!PISTA.test(href) || VIEJO.test(href)) continue;
        // Un PDF con «programa» en el nombre se avisa aunque no lleve el año
        // (compromis.net y frontvalencia.org no lo ponían).
        if (RECIENTE.test(href) || /\.pdf(\?|$)/i.test(href)) hallados.add(new URL(href, url).href);
      }
    } catch {
      estados.push("error");
    }
  }
  console.log(`${id.padEnd(13)} [${estados.join(",")}] ${hallados.size ? [...hallados].join("  ") : "—"}`);
}
