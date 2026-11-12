#!/usr/bin/env bash
# Descarga los PDF oficiales, comprueba su SHA-256 y extrae el texto con
# marcadores de página (=== p.N ===) en data/text/. Requiere curl, node y pdftotext.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/raw data/text
node -e '
const {partidos}=require("./data/partidos.json");
for (const p of partidos.filter(p=>p.url)) console.log(p.id, p.archivo, p.sha256, p.url);
' | while read -r id archivo sha url; do
  curl -sSL -A "Mozilla/5.0" -o "data/raw/$archivo" "$url"
  got=$(sha256sum "data/raw/$archivo" | cut -d" " -f1)
  [ "$got" = "$sha" ] && echo "$id OK" || echo "$id: el PDF ha cambiado ($got) — revisar extracción"
  pdftotext -enc UTF-8 "data/raw/$archivo" - \
    | awk -v RS='\f' '{print "=== p." NR " ==="; print}' \
    | sed -E 's/[ \t]+/ /g' | grep -v '^\s*$' > "data/text/$id.pages.txt"
done
