#!/usr/bin/env bash
#
# deploy.sh — zet een wijziging live op GitHub Pages.
#
# Berekent een hash over alle app-bestanden en schrijft die in sw.js als
# VERSION. Daardoor ziet de browser dat er een nieuwe service worker is en
# krijg je in de app het balkje "Nieuwe versie beschikbaar". Je hoeft dus
# nooit zelf een versienummer bij te houden.
#
# Gebruik:  ./deploy.sh "wat je veranderd hebt"

set -euo pipefail
cd "$(dirname "$0")"

if [ $# -eq 0 ] || [ -z "$1" ]; then
  echo "Gebruik: ./deploy.sh \"wat je veranderd hebt\"" >&2
  exit 1
fi

# Hash over alles wat de app uitmaakt — sw.js zelf niet, anders bijt hij
# in zijn eigen staart. De globs zijn alfabetisch, dus de uitkomst is
# voor dezelfde inhoud altijd gelijk.
HASH=$(cat index.html manifest.webmanifest css/styles.css js/*.js icons/*.png \
       | shasum -a 256 | cut -c1-10)

sed -i '' -E "s|^const VERSION    = '[^']*';|const VERSION    = 'afvalapp-${HASH}';|" sw.js

if ! grep -q "const VERSION    = 'afvalapp-${HASH}';" sw.js; then
  echo "Kon de VERSION-regel in sw.js niet bijwerken. Is de regel handmatig aangepast?" >&2
  exit 1
fi

if git diff --quiet && git diff --cached --quiet; then
  echo "Niets gewijzigd — er valt niets te deployen."
  exit 0
fi

# Is sw.js zelf veranderd? Zo niet, dan zijn alleen bestanden gewijzigd die
# buiten de app vallen (README, dit script) en krijgt niemand een melding.
if git diff --quiet -- sw.js && git diff --cached --quiet -- sw.js; then
  APP_GEWIJZIGD=nee
else
  APP_GEWIJZIGD=ja
fi

echo "Versie: afvalapp-${HASH}"
git add -A
git commit -q -m "$1"
git push -q

echo
echo "Gepusht. GitHub Pages heeft ongeveer een minuut nodig."
if [ "$APP_GEWIJZIGD" = ja ]; then
  echo "Daarna verschijnt in de app het balkje 'Nieuwe versie beschikbaar'."
else
  echo "De app zelf is niet veranderd, dus er komt geen updatemelding."
fi
echo "https://roboroy.github.io/afvalapp/"
