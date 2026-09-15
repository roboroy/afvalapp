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

2. **Maak de tabel.**

   ```bash
   wrangler d1 execute afvalapp-teller --remote --file=schema.sql
   ```

3. **Publiceer.**

   ```bash
   wrangler deploy
   ```

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

Het gratis Workers-plan kent een dagelijks maximum aan verzoeken en aan
KV-schrijfacties. De app stuurt hoogstens één bericht per apparaat per dag,
dus je zit daar met ruime marge onder. Controleer de actuele limieten wel
even in je dashboard — Cloudflare past ze weleens aan.

## Wat dit niet is

De Worker weigert verzoeken waarvan de `Origin`-header niet van de app komt.
Dat houdt andere websites tegen, maar het is geen beveiliging: wie het adres
kent kan met `curl` een willekeurige `Origin` meesturen en de teller ophogen.

Strenger maken zou betekenen dat je per IP moet gaan bijhouden wie hoe vaak
telt — precies wat we hier níét willen. Het is dus een indicatie van gebruik,
geen gecontroleerd cijfer. Voor de vraag "gebruiken er eigenlijk mensen mijn
app" is dat ruim voldoende.
