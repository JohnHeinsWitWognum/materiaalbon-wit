/* Configuratie van de materiaalbon-app.
   Dit is het enige bestand dat je hoeft aan te passen. */

window.CONFIG = {
  // Tekst die bij de bon in WhatsApp komt; datum en tijd zet de app erachter,
  // bijvoorbeeld: "Materiaalbon 30-09-2026 14:05"
  onderschrift: 'Materiaalbon',
  bestandsVoorvoegsel: 'materiaalbon',

  // 'pdf' = WhatsApp stuurt hem als document en laat hem onaangeroerd.
  // 'jpg' = WhatsApp stuurt hem als foto en verkleint hem dan flink,
  //         tenzij de afzender zelf op HD tikt.
  verzendenAls: 'pdf',

  // Resolutie. A3 liggend is 42 cm breed; 4000 pixels is dan zo'n 240 dpi.
  maxLangeZijde: 4000, // groter wordt teruggeschaald, kleiner blijft zoals het is
  waarschuwOnder: 3000, // daaronder wordt handschrift op A3 krap (~180 dpi)
  jpegKwaliteit: 0.9,

  // Witbalans: welke pixels we als "papier" beschouwen (luminantie 0-255).
  papierMin: 150,
  papierMax: 252,
  maxKleurCorrectie: 0.25,

  // Contrast.
  witPercentiel: 0.6,
  zwartPunt: 15,

  // Rand van de bon zoeken.
  autoBijsnijden: true,
  randWerkbreedte: 320,
  randMarge: 0.01,
  voorbeeldBreedte: 1000,
};
