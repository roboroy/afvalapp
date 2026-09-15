# afvalapp-teller

Een Cloudflare Worker die niets anders doet dan getallen ophogen, zodat je
weet hoeveel mensen de Afvalapp gebruiken zonder iets over hen te bewaren.

## Wat er opgeslagen wordt

Vier soorten sleutels in KV, met uitsluitend een getal erin:

```
totaal:openingen              1423
totaal:installaties             37
dag:2026-09-15:openingen        12
dag:2026-09-15:installaties      1
```

Geen IP-adres, geen user agent, geen identificatie, geen gegevens uit de app.
Niet gehasht of versleuteld opgeslagen — er is simpelweg geen veld voor.

Wat je *niet* kunt wegnemen: Cloudflare ziet net als elke webserver het
IP-adres op het moment van het verzoek. De Worker doet daar niets mee en legt
het nergens vast, maar het passeert wel. Dat staat ook zo in de app zelf
onder Instellingen → Privacy.

## Opzetten — via de browser (geen installatie nodig)

Cloudflare heeft een code-editor in het dashboard. Je hebt geen Node, npm of
wrangler nodig.

1. Maak een gratis account op [dash.cloudflare.com](https://dash.cloudflare.com).

2. **Maak de Worker.** Ga in het linkermenu naar *Workers & Pages* en maak een
   nieuwe Worker aan. Noem hem `afvalapp-teller` en publiceer de
   voorbeeldcode die Cloudflare aanbiedt. De eerste keer vraagt Cloudflare je
   om een subdomein te kiezen; dat wordt onderdeel van je adres.

3. **Plak de code.** Open de Worker en kies *Edit code* (of *Quick edit*).
   Gooi alles weg wat er staat, plak de inhoud van `worker.js` uit deze map,
   en publiceer.

4. **Maak de opslag.** Zoek in het linkermenu naar *KV* — die staat onder
   *Storage & Databases*, of onder *Workers & Pages*. Maak daar een namespace
   aan en noem die `afvalapp-teller`.

5. **Koppel de opslag aan de Worker.** Ga terug naar de Worker, naar
   *Settings*, en zoek het onderdeel voor bindings of variabelen. Voeg een
   KV-binding toe met als variabelenaam exact `TELLER`, en kies de namespace
   uit stap 4. Publiceer opnieuw.

   > Die naam moet letterlijk `TELLER` zijn — de code zoekt `env.TELLER`.

6. Op de pagina van je Worker staat het adres, in de vorm
   `https://afvalapp-teller.roboroy.workers.dev`.

7. Zet dat adres in `js/telemetrie.js` bij `TELLER_URL`. Zolang daar de
   standaardwaarde staat, verstuurt de app niets.

Cloudflare verandert de indeling van zijn dashboard regelmatig, dus de
menunamen kunnen iets afwijken. Je zoekt in alle gevallen twee dingen: een
plek om de code te plakken, en een plek om een KV-binding met de naam `TELLER`
toe te voegen.

## Opzetten — via de opdrachtregel

Liever met tooling? Dan heb je eerst Node nodig, want dat staat niet
standaard op macOS:

```bash
brew install node
```

Daarna:

```bash
npm install -g wrangler && wrangler login
wrangler kv namespace create TELLER
```

Zet de `id` die je terugkrijgt in `wrangler.toml`, en publiceer:

```bash
cd teller && wrangler deploy
```

## Cijfers bekijken

```bash
curl https://afvalapp-teller.roboroy.workers.dev/stats
```

Of via het Cloudflare-dashboard onder **Workers & Pages → KV**, waar je ook
de dagsleutels ziet staan.

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

## Wil je het waterdicht?

`hoogOp()` doet lezen-optellen-schrijven. Vallen twee verzoeken exact samen,
dan kan één ophoging verloren gaan. Bij dit aantal gebruikers gebeurt dat
niet. Wil je toch exacte tellingen, stap dan over op D1 met een atomaire
`UPDATE ... SET n = n + 1`.
