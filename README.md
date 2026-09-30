# Materiaalbon Wit

Statische webapp (PWA) om een ingevulde materiaalbon — A3 liggend, met de hand
ingevuld, altijd één blad — te fotograferen, recht te trekken en via WhatsApp te
versturen. Geen server, geen account, geen inloggen.

## Zo werkt het voor de medewerker

1. **Foto maken** — de gewone camera van de telefoon opent.
2. Het bijsnijdscherm laat meteen zien hoe de bon aankomt: rand gevonden,
   rechtgetrokken, liggend. Klopt een hoek niet, dan sleep je hem.
3. **Versturen** — het deelmenu opent, kies WhatsApp en de chat.

Na een paar keer staat de juiste chat bovenin het deelmenu, en is het dus:
Foto maken → Versturen → chat aantikken → versturen.

Gaat het deelmenu niet vanzelf open (zie hieronder), dan verschijnt een scherm
met de gescande bon en een knop *Versturen via WhatsApp*. Dat kost één tik extra.

## Bestanden

| Bestand | Wat het doet |
|---|---|
| `index.html` | De drie schermen: start, bijsnijden, klaar |
| `styles.css` | Vormgeving: grote knoppen, hoog contrast |
| `app.js` | Foto lezen, rand zoeken, rechttrekken, PDF maken, delen |
| `config.js` | **Het enige bestand dat je aanpast** |
| `manifest.json`, `sw.js` | PWA: beginscherm-icoon en offline openen |
| `logo.png`, `icons/` | Logo en app-iconen (op groen, om hem te onderscheiden van de pakbon-app) |

## Instellen

In `config.js`:

- `onderschrift` — tekst bij de bon in WhatsApp; datum en tijd komen erachter.
- `verzendenAls` — `'pdf'` (standaard) of `'jpg'`, zie hieronder.
- `maxLangeZijde` — maximale breedte in pixels (standaard 4000, ~240 dpi op A3).
- `waarschuwOnder` — onder deze breedte waarschuwt de app (standaard 3000).

## Keuzes en waarom

**Als PDF, niet als foto.** WhatsApp comprimeert foto's flink, en dan is de hoge
resolutie weg — precies waar handschrift om vraagt. Een PDF stuurt WhatsApp als
document, en daar blijft hij van af. De PDF is één A3-liggend-pagina met de JPEG
erin; die JPEG wordt niet opnieuw gecomprimeerd. Wil je toch een losse foto, zet
`verzendenAls` op `'jpg'`, maar dan moet de afzender in WhatsApp zelf op HD
tikken om de kwaliteit te houden.

**Altijd liggend.** Staat het gevonden vel rechtop in de foto, dan draait de app
het een kwartslag. Welke kant boven is kan de app niet zien zonder de tekst te
lezen, dus in de helft van die gevallen staat hij op zijn kop. Het bijsnijdscherm
toont precies hoe hij aankomt, en **Draaien** draait een kwartslag per tik. Wie de
telefoon gewoon boven de bon houdt zoals hij voor hem ligt, heeft daar geen last
van.

**Volle resolutie.** Er wordt uitgesneden vanaf de volle camerafoto en alleen
verkleind boven `maxLangeZijde` — nooit vergroot. Een telefoon van 12 megapixel
die de bon vult, levert ongeveer 3600 × 2550 pixels op.

**Rand zoeken.** Dezelfde methode als de pakbon-app: grootste lichte vlak,
vier uiterste punten, en weigeren zodra iets niet klopt. Werkt het best met de
bon op een donkere ondergrond; op een witte tafel ziet hij de rand niet en moet
je de hoeken zelf slepen.

**Meteen het deelmenu.** Een browser opent het deelmenu alleen kort na een tik.
Het scannen van een A3 kost op een telefoon een paar seconden; is dat moment
daarna voorbij (vaak op iPhone), dan komt het klaar-scherm met een eigen
verzendknop. Op de meeste Android-toestellen gaat het in één keer.

**Geen naam, geen pincode.** Wie de bon stuurde zie je aan de afzender in
WhatsApp. Bestandsnaam: `materiaalbon-JJJJ-MM-DD-uummss.pdf`.

## Lokaal proberen

```bash
python -m http.server 8800
```

en open `http://localhost:8800`.

## Op GitHub Pages zetten

Zelfde werkwijze als de pakbon-app: nieuwe repository (bijvoorbeeld
`materiaalbon-wit`), alle bestanden in de wortel plus de map `icons`, en in
**Settings → Pages** branch `main`, map `/ (root)`. De service worker ruimt
alleen zijn eigen cache op (`materiaalbon-…`), dus beide apps kunnen naast
elkaar op hetzelfde adres staan.

Na een wijziging: verhoog `VERSIE` in `sw.js`.

## Beperkingen

- De app kan de juiste WhatsApp-chat niet zelf voorkiezen; dat doet de telefoon
  na een paar keer delen.
- Via WhatsApp komen de bonnen in persoonlijke chats en op de servers van Meta.
- Het scannen blokkeert het scherm een paar seconden.
