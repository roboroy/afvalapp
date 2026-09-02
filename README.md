# Afvalapp

Een webapp om je gewicht bij te houden. Werkt offline, staat als icoon op je
beginscherm en heeft geen account, server of database nodig — al je metingen
staan in de opslag van je eigen browser.

- **Vandaag** — gewicht invullen, huidig gewicht, verschil met vorige meting, voortgang naar je doel
- **Grafiek** — verloop per **dag**, **week**, **maand** en **jaar**, met een 7-daags gemiddelde en je streefgewicht als stippellijn
- **Historie** — alle metingen per maand, aantikken om te wijzigen, kruisje om te verwijderen
- **Instellingen** — start- en streefgewicht, lengte (BMI), dagelijkse herinnering, back-up en export

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

Na een wijziging houdt de service worker soms de oude versie vast. Verhoog dan
`VERSION` bovenaan `sw.js`, of ververs met een harde reload.
