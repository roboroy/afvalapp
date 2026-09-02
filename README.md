# Afvalapp

Een webapp om je gewicht bij te houden. Werkt offline, staat als icoon op je
beginscherm en heeft geen account, server of database nodig — al je metingen
staan in de opslag van je eigen browser.

- **Vandaag** — gewicht invullen, je trendgewicht, voortgang naar je doel met een
  prognose wanneer je het haalt, en hoeveel dagen op rij je gemeten hebt
- **Grafiek** — verloop per **dag**, **week**, **maand** en **jaar**, met een 7-daags gemiddelde en je streefgewicht als stippellijn
- **Historie** — alle metingen per maand, aantikken om te wijzigen, kruisje om te verwijderen
- **Instellingen** — start- en streefgewicht, lengte (BMI), dagelijkse herinnering, back-up en export

---

## Het trendgewicht

Het grote getal op het beginscherm is niet je laatste meting, maar het
gemiddelde van de afgelopen zeven dagen. Dat is bewust.

Je gewicht schommelt van dag tot dag met een kilo of meer door vocht, zout en
wat er nog in je darmen zit. Dat heeft niets met vet te maken. Stuur je op die
rauwe cijfers, dan schrik je van een slechte ochtend en word je te blij van een
goede. Het weekgemiddelde laat zien wat er werkelijk gebeurt. Je meting van
vandaag staat er gewoon onder.

Vanaf drie metingen schakelt de app over op het trendgewicht; daarvoor toont
hij je laatste meting.

De **prognose** onder de voortgangsbalk trekt een rechte lijn door je
trendwaarden van de afgelopen vier weken en rekent uit wanneer je op je doel
zit. Hij zegt bewust niets zolang je minder dan twee weken of minder dan vijf
keer gemeten hebt, en ook niet als je gewicht stilstaat of stijgt — een datum
noemen zou dan schijnnauwkeurigheid zijn.

**Dagen op rij** telt hoe lang je het volhoudt. De reeks breekt niet doordat je
vandaag nog niet op de weegschaal hebt gestaan; de dag is immers nog bezig. Staat
je herinnering op wekelijks, dan telt de app weken in plaats van dagen.

---

## 1. Op je telefoon zetten

Voor herinneringen en offline gebruik moet de app via **https** geserveerd
worden. Hieronder de snelste gratis manier.

### GitHub Pages (aanbevolen)

1. Maak een account op [github.com](https://github.com) als je die nog niet hebt.
2. Maak een nieuwe repository, bijvoorbeeld `afvalapp`. Zet 'm op **Private**
   als je wilt — Pages werkt ook voor privérepo's op een betaald plan; op het
   gratis plan moet de repo **Public** zijn. De app zelf verstuurt niets, dus
   je metingen blijven hoe dan ook privé: die staan alleen op je telefoon.
3. Upload de inhoud van deze map (`index.html`, `sw.js`, `manifest.webmanifest`
   en de mappen `css/`, `js/`, `icons/`). Sleep ze in de browser naar
   *Add file → Upload files*, of gebruik git:

   ```bash
   git init && git add . && git commit -m "Afvalapp" && git branch -M main && git remote add origin https://github.com/JOUWNAAM/afvalapp.git && git push -u origin main
   ```

4. Ga in de repo naar **Settings → Pages**, kies bij *Source* de branch `main`
   en map `/ (root)`, en klik op **Save**.
5. Na een minuut staat de app op `https://JOUWNAAM.github.io/afvalapp/`.
   Open die link op je telefoon.

### Alternatief zonder GitHub

[Netlify Drop](https://app.netlify.com/drop): sleep deze map in het vak op die
pagina. Je krijgt direct een https-adres. Let op dat je het adres bewaart —
zonder account is het lastig terug te vinden.

### Installeren op je beginscherm (Android)

Open de link in Chrome. Er verschijnt onderin een balkje **Installeren**; tik
daarop. Zie je die niet, gebruik dan het menu ⋮ → **App installeren** of
**Toevoegen aan startscherm**.

**Dit is niet optioneel als je herinneringen wilt.** Android laat een webapp
alleen op de achtergrond wekken wanneer die geïnstalleerd is.

---

## 2. Herinneringen — wat werkt en wat niet

Een webapp mag zelf niets inplannen op je telefoon. De app gebruikt daarom
drie lagen:

| Laag | Wanneer | Betrouwbaarheid |
|---|---|---|
| Periodic Background Sync | App geïnstalleerd, Android wekt de app af en toe | Goed, maar Android bepaalt zelf het exacte moment — de melding kan wat later komen |
| Timer in de app | Zolang de app openstaat | Prima, maar alleen bij een open app |
| Inhaalcheck | Elke keer dat je de app opent | Altijd — je ziet dan alsnog dat je nog niet gewogen hebt |

Wil je een melding op een gegarandeerd tijdstip, gebruik dan de knop
**Agenda-afspraak** bij Instellingen. Die maakt een `.ics`-bestand met een
dagelijks terugkerende afspraak plus alarm. Open het bestand op je telefoon en
je agenda-app zet 'm erin. Dat loopt via het besturingssysteem en is daarmee
de zekerste optie.

Bij **Instellingen → Herinnering** kies je hoe vaak: **elke dag** of **1× per
week**. Kies je voor wekelijks, dan verschijnt er een keuze voor de dag. Het
tijdstip geldt in beide gevallen. De agenda-export volgt dezelfde instelling:
een dagelijkse afspraak, of een wekelijkse op de gekozen dag.

Zet meldingen aan via de schakelaar bij **Instellingen → Herinnering**. Chrome
vraagt dan eenmalig toestemming. Heb je die per ongeluk geweigerd, dan zet je
het terug via het slotje/instellingen-icoon links van de adresbalk →
*Meldingen*.

---

## 3. Je gegevens

Alles staat in `localStorage` van de browser waarin je de app opent. Dat
betekent:

- Niemand anders kan erbij, ook ik niet — er is geen server.
- De gegevens zijn **per apparaat en per browser**. Op je laptop zie je niet
  wat je op je telefoon hebt ingevuld.
- Als je de sitegegevens van Chrome wist, verdwijnen je metingen.

Maak daarom af en toe een back-up: **Instellingen → Back-up maken** geeft een
JSON-bestand dat je met **Back-up terugzetten** weer kunt inladen. Bij
**Historie → CSV** krijg je een bestand met puntkomma's, dat direct opent in
Excel of Numbers.

---

## 4. Lokaal draaien om iets aan te passen

Dubbelklikken op `index.html` werkt niet: de app gebruikt JavaScript-modules
en een service worker, en die vereisen `http://` of `https://`. Start een
lokale server:

```bash
python3 -m http.server 8931
```

Open daarna `http://localhost:8931`. Op `localhost` gelden dezelfde rechten
als op https, dus ook de service worker en meldingen werken daar.

### Bestanden

```
index.html              schermopbouw
manifest.webmanifest    naam, iconen en kleuren voor het beginscherm
sw.js                   offline cache + achtergrondherinnering
css/styles.css          vormgeving, licht en donker thema
js/store.js             opslag, datumhulp, aggregatie per dag/week/maand/jaar
js/charts.js            de SVG-grafiek (geen externe libraries)
js/reminders.js         meldingen, planning en de .ics-export
js/app.js               navigatie en alle schermen aan elkaar
icons/                  app-iconen
```

## 5. Een wijziging live zetten

```bash
./deploy.sh "wat je veranderd hebt"
```

Dat script berekent een hash over alle app-bestanden, schrijft die als
`VERSION` in `sw.js`, en committeert en pusht. Je hoeft dus nooit zelf een
versienummer bij te houden — verander die regel ook niet met de hand, want
dan overschrijft het script 'm toch.

Na ongeveer een minuut staat de nieuwe versie op GitHub Pages. Open je dan de
app, dan verschijnt onderin **"Er staat een nieuwe versie klaar"** met een knop
*Vernieuwen*. Pas als je daarop tikt neemt de nieuwe versie het over en
herlaadt de app in één keer.

Dat wachten is expres. De service worker roept bij het installeren bewust
geen `skipWaiting()` aan: zou hij meteen overnemen, dan kun je nieuwe HTML
krijgen terwijl de JavaScript nog uit de oude cache komt. Door te wachten tot
jij op *Vernieuwen* tikt, wisselt alles tegelijk.

**Je metingen blijven bij een update staan.** De service worker beheert alleen
de cache met app-bestanden; je gegevens staan in `localStorage` en worden
daarbij niet aangeraakt. Alleen de knop *Alle gegevens wissen* verwijdert ze.
