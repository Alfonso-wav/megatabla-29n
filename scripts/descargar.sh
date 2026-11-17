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
  # Algunas webs (psoe.es) bloquean las descargas automáticas y devuelven HTML:
  # en ese caso se conserva la copia local, si la hay.
  curl -sSL -A "Mozilla/5.0" -o "data/raw/$archivo.tmp" "$url" || true
  if head -c 5 "data/raw/$archivo.tmp" 2>/dev/null | grep -q '%PDF'; then
    mv "data/raw/$archivo.tmp" "data/raw/$archivo"
  else
    rm -f "data/raw/$archivo.tmp"
    [ -f "data/raw/$archivo" ] || { echo "$id: la descarga no es un PDF y no hay copia local — bajarlo a mano a data/raw/$archivo"; continue; }
    echo "$id: la web no devolvió un PDF; se usa la copia local"
  fi
  got=$(sha256sum "data/raw/$archivo" | cut -d" " -f1)
  [ "$got" = "$sha" ] && echo "$id OK" || echo "$id: el PDF ha cambiado ($got) — revisar extracción"
  pdftotext -enc UTF-8 "data/raw/$archivo" - \
    | awk -v RS='\f' '{print "=== p." NR " ==="; print}' \
    | sed -E 's/[ \t]+/ /g' | grep -v '^\s*$' > "data/text/$id.pages.txt"
done
