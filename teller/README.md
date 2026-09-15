# afvalapp-teller

Een Cloudflare Worker die niets anders doet dan getallen ophogen, zodat je
weet hoeveel mensen de Afvalapp gebruiken zonder iets over hen te bewaren.

## Wat er opgeslagen wordt

Eén tabel in een D1-database (SQLite), met twee kolommen en alleen getallen:

```
sleutel                       aantal
totaal:openingen                1423
totaal:installaties               37
dag:2026-09-15:openingen          12
dag:2026-09-15:installaties        1
```

Geen IP-adres, geen user agent, geen identificatie, geen gegevens uit de app.
Niet gehasht of versleuteld opgeslagen — er is simpelweg geen veld voor.

De dagsleutels gebruiken UTC, terwijl de app zijn eigen "hoogstens één keer
per dag" op de lokale datum baseert. Wie 's nachts weegt kan daardoor in de
UTC-dag ervoor belanden. Voor de totalen maakt dat niets uit; alleen de
dagverdeling schuift dan een paar uur.

Wat je *niet* kunt wegnemen: Cloudflare ziet net als elke webserver het
IP-adres op het moment van het verzoek. De Worker doet daar niets mee en legt
het nergens vast, maar het passeert wel. Dat staat ook zo in de app zelf
onder Instellingen → Privacy.

## Waarom D1 en niet KV

De eerste versie gebruikte KV met lezen-optellen-schrijven. Dat werkt niet:
KV cachet leesacties tot ongeveer een minuut, dus twee tellingen binnen
datzelfde minuutje lezen allebei dezelfde oude waarde en schrijven allebei
dat getal plus één. De tweede telling is dan weg.

Gemeten op de live teller: vijf leesacties achter elkaar gaven
`1, 1, 2, 1, 1`. Dat is geen zeldzame samenloop maar het normale gedrag.

D1 hoogt op met één opdracht — `INSERT ... ON CONFLICT DO UPDATE SET
aantal = aantal + 1` — en kan daardoor niets kwijtraken.

## Opzetten

Je hebt Node en wrangler nodig. Staat Node er nog niet:

```bash
brew install node && npm install -g wrangler && wrangler login
```

1. **Maak de database.**

   ```bash
   wrangler d1 create afvalapp-teller
   ```

   Je krijgt een `database_id` terug. Zet die in `wrangler.toml` op de plek
   van `VUL_HIER_JE_D1_DATABASE_ID_IN`.

   > Wrangler drukt er een kant-en-klaar blokje bij af met
   > `binding = "afvalapp_teller"`. **Neem dat niet over.** De Worker zoekt
   > `env.DB`, dus de binding in `wrangler.toml` moet `DB` blijven. Alleen de
   > `database_id` hoef je te kopiëren.

2. **Maak de tabel.**

   ```bash
   wrangler d1 execute afvalapp-teller --remote --file=schema.sql
   ```

3. **Publiceer.**

   ```bash
   wrangler deploy
   ```

   Controleer in de uitvoer dat er `env.DB (afvalapp-teller)` met
   `D1 Database` staat. Zie je daar iets anders, dan wordt een verkeerde
   `wrangler.toml` gebruikt en draai je waarschijnlijk vanuit de verkeerde map.

4. Het adres staat in de uitvoer, in de vorm
   `https://afvalapp-teller.roboroy.workers.dev`. Dat adres staat al
   ingevuld in `js/telemetrie.js`.

De oude KV-namespace `afvalapp-teller` wordt niet meer gebruikt en kun je
opruimen in het Cloudflare-dashboard onder *Storage & Databases → KV*.

## Cijfers bekijken

```bash
curl https://afvalapp-teller.roboroy.workers.dev/stats
```

Of alles ineens, inclusief de dagcijfers:

```bash
wrangler d1 execute afvalapp-teller --remote --command "SELECT * FROM tellingen ORDER BY sleutel"
```

Terugzetten naar nul:

```bash
wrangler d1 execute afvalapp-teller --remote --command "DELETE FROM tellingen"
```

## Gratis grenzen

Het gratis plan kent een dagelijks maximum aan Worker-verzoeken en aan
D1-rijen die je leest en schrijft. Elke telling schrijft twee rijen: het
totaal en de dag. De app stuurt hoogstens één bericht per apparaat per dag,
dus je zit met ruime marge onder die grenzen. Controleer de actuele limieten
wel even in je dashboard — Cloudflare past ze weleens aan.

## Wat de app aan zijn kant doet

Zie [`js/telemetrie.js`](../js/telemetrie.js).

- **Hoogstens één telling per apparaat per kalenderdag.** De app onthoudt de
  datum van de laatste telling. Daardoor is het cijfer "hoeveel apparaten
  openden de app die dag" en niet een optelsom van schermbezoeken.
- **Een installatie telt één keer per apparaat**, op het moment dat je de app
  op je beginscherm zet.
- **Mislukt het verzoek, dan wordt de datum niet opgeslagen.** Offline of een
  onbereikbare teller levert dus geen gemiste dag op: de volgende keer dat je
  de app opent probeert hij het opnieuw. Je merkt er niets van; een telling is
  nooit belangrijk genoeg om een foutmelding voor te tonen.
- **De schakelaar onder Instellingen → Privacy** zet alles uit. Dan wordt er
  geen enkel verzoek meer gedaan.
- **Staat er geen adres in `TELLER_URL`, dan verstuurt de app niets.** Handig
  bij lokaal ontwikkelen: je vervuilt de teller niet.

## Wat dit niet is

De Worker weigert verzoeken waarvan de `Origin`-header niet van de app komt.
Dat houdt andere websites tegen, maar het is geen beveiliging: wie het adres
kent kan met `curl` een willekeurige `Origin` meesturen en de teller ophogen.

Strenger maken zou betekenen dat je per IP moet gaan bijhouden wie hoe vaak
telt — precies wat we hier níét willen.

Daar komt bij dat een PWA structureel te laag telt: offline openen levert geen
telling op, en offline werken is juist een kernfunctie van deze app. Ook
iemand die de schakelaar uitzet telt niet mee.

Het is dus een indicatie van gebruik, geen gecontroleerd cijfer. Voor de vraag
"gebruiken er eigenlijk mensen mijn app" is dat ruim voldoende.
