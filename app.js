/* Materiaalbon-app. Eén bon per keer: foto maken, bijsnijden, versturen.
   Alles gebeurt in de browser van het toestel; geen server, geen account. */

(function () {
  'use strict';

  var C = window.CONFIG;

  // ---------------------------------------------------------------- toestand

  var state = {
    file: null,          // het originele camerabestand; daaruit wordt gesneden
    hoeken: null,        // vier hoeken als fracties van de foto: LB, RB, RO, LO
    gevonden: false,     // rand automatisch gevonden?
    draai: 0,            // kwartslagen met de klok mee (0-3)
    img: null,           // verkleind, onbewerkt beeld voor het bijsnijdscherm
    voorbeeldUrl: null,
    resultaat: null,     // { bestand, jpgUrl, w, h, tekst }
  };

  var el = {};
  ['invoer-foto','scherm-start','knop-foto','status-start','scherm-snijden',
   'uitleg-snijden','doek','status-snijden','knop-versturen','knop-draai',
   'knop-opnieuw','scherm-klaar','klaar-beeld','klaar-meta','status-klaar',
   'knop-deel','knop-opslaan','knop-nieuw'].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  function toon(scherm) {
    ['scherm-start','scherm-snijden','scherm-klaar'].forEach(function (s) {
      el[s].hidden = (s !== scherm);
    });
    window.scrollTo(0, 0);
  }

  function meld(id, tekst) {
    el[id].textContent = tekst || '';
    el[id].hidden = !tekst;
  }

  function fout(e) {
    console.error(e);
    alert('Er ging iets mis:\n' + (e && e.message ? e.message : e));
  }

  // ------------------------------------------------------------- hulpstukken

  function klem(v, min, max) { return v < min ? min : (v > max ? max : v); }
  function luminantie(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; }
  function afstand(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
  function p2(n) { return String(n).padStart(2, '0'); }

  // Even de beurt teruggeven aan de browser, zodat een melding ook echt op
  // het scherm komt voordat het rekenwerk begint.
  function wacht() {
    return new Promise(function (r) { setTimeout(r, 30); });
  }

  // imageOrientation 'from-image' past de EXIF-orientatie toe, anders staan
  // foto's op hun kant.
  function leesAfbeelding(file) {
    if (window.createImageBitmap) {
      try {
        return createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch (e) { /* oudere browser: val terug op <img> */ }
    }
    return laadBeeld(URL.createObjectURL(file), true);
  }

  function laadBeeld(url, opruimen) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { if (opruimen) URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { if (opruimen) URL.revokeObjectURL(url); reject(new Error('kan foto niet lezen')); };
      img.src = url;
    });
  }

  function naarBlob(canvas, kwaliteit) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) {
        b ? resolve(b) : reject(new Error('kan geen JPEG maken'));
      }, 'image/jpeg', kwaliteit);
    });
  }

  // Sterk verkleinen in één stap geeft kartelige letters; halveer daarom
  // stapsgewijs tot we dicht bij de doelmaat zitten.
  function tekenGeschaald(bron, bw, bh, doel) {
    var w = bw, h = bh, huidig = bron;
    while (w / 2 >= doel.w && h / 2 >= doel.h) {
      w = Math.round(w / 2);
      h = Math.round(h / 2);
      var tussen = document.createElement('canvas');
      tussen.width = w; tussen.height = h;
      var tc = tussen.getContext('2d');
      tc.imageSmoothingEnabled = true;
      tc.imageSmoothingQuality = 'high';
      tc.drawImage(huidig, 0, 0, w, h);
      huidig = tussen;
    }
    var canvas = document.createElement('canvas');
    canvas.width = doel.w;
    canvas.height = doel.h;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(huidig, 0, 0, doel.w, doel.h);
    return canvas;
  }

  function heleFoto() {
    return [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  }

  // ------------------------------------------------------ rand van het papier

  // Drempel tussen licht en donker volgens Otsu.
  function otsu(hist, totaal) {
    var som = 0, i;
    for (i = 0; i < 256; i++) som += i * hist[i];
    var somAchter = 0, nAchter = 0, beste = 0, drempel = 128;
    for (i = 0; i < 256; i++) {
      nAchter += hist[i];
      if (nAchter === 0) continue;
      var nVoor = totaal - nAchter;
      if (nVoor === 0) break;
      somAchter += i * hist[i];
      var mAchter = somAchter / nAchter;
      var mVoor = (som - somAchter) / nVoor;
      var tussen = nAchter * nVoor * (mAchter - mVoor) * (mAchter - mVoor);
      if (tussen > beste) { beste = tussen; drempel = i; }
    }
    return drempel;
  }

  function oppervlak(p) {
    var o = 0;
    for (var i = 0; i < 4; i++) {
      var j = (i + 1) % 4;
      o += p[i].x * p[j].y - p[j].x * p[i].y;
    }
    return Math.abs(o) / 2;
  }

  function bol(p) {
    var teken = 0;
    for (var i = 0; i < 4; i++) {
      var a = p[i], b = p[(i + 1) % 4], c = p[(i + 2) % 4];
      var kruis = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (kruis === 0) continue;
      var t = kruis > 0 ? 1 : -1;
      if (teken === 0) teken = t;
      else if (teken !== t) return false;
    }
    return true;
  }

  // Zoek de vier hoeken van het papier: verklein, splits licht van donker,
  // neem het grootste lichte vlak en pak daarvan de vier uiterste punten.
  // Geeft null zodra iets niet klopt — liever niet uitsnijden dan verkeerd.
  function vindHoeken(bron) {
    var f = Math.min(1, C.randWerkbreedte / Math.max(bron.width, bron.height));
    var w = Math.max(8, Math.round(bron.width * f));
    var h = Math.max(8, Math.round(bron.height * f));
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bron, 0, 0, w, h);
    var d = ctx.getImageData(0, 0, w, h).data;

    var totaal = w * h;
    var grijs = new Uint8Array(totaal);
    var hist = new Uint32Array(256);
    for (var i = 0, p = 0; p < totaal; i += 4, p++) {
      var l = luminantie(d[i], d[i + 1], d[i + 2]) | 0;
      grijs[p] = l;
      hist[l]++;
    }
    var drempel = otsu(hist, totaal);

    var bezocht = new Uint8Array(totaal);
    var stapel = new Int32Array(totaal);
    var beste = null;
    for (var start = 0; start < totaal; start++) {
      if (bezocht[start] || grijs[start] <= drempel) continue;
      var top = 0;
      stapel[top++] = start;
      bezocht[start] = 1;
      var n = 0;
      var minSom = 1e9, maxSom = -1e9, minVer = 1e9, maxVer = -1e9;
      var iLB = start, iRB = start, iRO = start, iLO = start;
      while (top > 0) {
        var q = stapel[--top];
        n++;
        var qx = q % w, qy = (q / w) | 0;
        var som = qx + qy, ver = qx - qy;
        if (som < minSom) { minSom = som; iLB = q; }
        if (som > maxSom) { maxSom = som; iRO = q; }
        if (ver > maxVer) { maxVer = ver; iRB = q; }
        if (ver < minVer) { minVer = ver; iLO = q; }
        if (qx > 0 && !bezocht[q - 1] && grijs[q - 1] > drempel) { bezocht[q - 1] = 1; stapel[top++] = q - 1; }
        if (qx < w - 1 && !bezocht[q + 1] && grijs[q + 1] > drempel) { bezocht[q + 1] = 1; stapel[top++] = q + 1; }
        if (qy > 0 && !bezocht[q - w] && grijs[q - w] > drempel) { bezocht[q - w] = 1; stapel[top++] = q - w; }
        if (qy < h - 1 && !bezocht[q + w] && grijs[q + w] > drempel) { bezocht[q + w] = 1; stapel[top++] = q + w; }
      }
      if (!beste || n > beste.n) beste = { n: n, hoeken: [iLB, iRB, iRO, iLO] };
    }
    if (!beste) return null;
    if (beste.n < 0.25 * totaal || beste.n > 0.97 * totaal) return null;

    var punten = beste.hoeken.map(function (q) {
      return { x: (q % w) + 0.5, y: ((q / w) | 0) + 0.5 };
    });

    var opp = oppervlak(punten);
    if (opp < beste.n * 0.85 || opp > beste.n * 1.35) return null;
    if (!bol(punten)) return null;

    var kort = Math.min(w, h);
    for (var z = 0; z < 4; z++) {
      if (afstand(punten[z], punten[(z + 1) % 4]) < 0.2 * kort) return null;
    }
    var breed = (afstand(punten[0], punten[1]) + afstand(punten[3], punten[2])) / 2;
    var hoog = (afstand(punten[0], punten[3]) + afstand(punten[1], punten[2])) / 2;
    if (Math.max(breed, hoog) / Math.min(breed, hoog) > 5) return null;

    // Iets naar buiten schuiven, anders schaaf je de rand van de bon eraf.
    var mx = (punten[0].x + punten[1].x + punten[2].x + punten[3].x) / 4;
    var my = (punten[0].y + punten[1].y + punten[2].y + punten[3].y) / 4;
    return punten.map(function (q) {
      return {
        x: klem((q.x + (q.x - mx) * C.randMarge) / w, 0, 1),
        y: klem((q.y + (q.y - my) * C.randMarge) / h, 0, 1),
      };
    });
  }

  // Staat het gevonden vel rechtop in de foto? Een materiaalbon is altijd
  // liggend, dus dan moet hij een kwartslag gedraaid worden.
  function staatRechtop(hoeken, bw, bh) {
    var p = hoeken.map(function (q) { return { x: q.x * bw, y: q.y * bh }; });
    var breed = (afstand(p[0], p[1]) + afstand(p[3], p[2])) / 2;
    var hoog = (afstand(p[0], p[3]) + afstand(p[1], p[2])) / 2;
    return hoog > breed;
  }

  // ------------------------------------------------------------- rechttrekken

  // Projectieve afbeelding van het eenheidsvierkant naar de vierhoek; per
  // doelpixel terugrekenen naar de bron, bilineair bemonsterd.
  function trekRecht(bronBeeld, doelBeeld, hoeken, sw, sh) {
    var x0 = hoeken[0].x * sw, y0 = hoeken[0].y * sh;
    var x1 = hoeken[1].x * sw, y1 = hoeken[1].y * sh;
    var x2 = hoeken[2].x * sw, y2 = hoeken[2].y * sh;
    var x3 = hoeken[3].x * sw, y3 = hoeken[3].y * sh;

    var dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
    var dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    var a, b, c, dd, e, f, g, hh;
    var noemer = dx1 * dy2 - dx2 * dy1;
    if (dx3 === 0 && dy3 === 0) {
      g = 0; hh = 0;
      a = x1 - x0; b = x2 - x1; c = x0;
      dd = y1 - y0; e = y2 - y1; f = y0;
    } else {
      if (noemer === 0) return false;
      g = (dx3 * dy2 - dx2 * dy3) / noemer;
      hh = (dx1 * dy3 - dx3 * dy1) / noemer;
      a = x1 - x0 + g * x1; b = x3 - x0 + hh * x3; c = x0;
      dd = y1 - y0 + g * y1; e = y3 - y0 + hh * y3; f = y0;
    }

    var S = bronBeeld.data, D = doelBeeld.data;
    var W = doelBeeld.width, H = doelBeeld.height;
    var maxX = sw - 1.001, maxY = sh - 1.001;
    var o = 0;
    for (var j = 0; j < H; j++) {
      var v = (j + 0.5) / H;
      for (var i = 0; i < W; i++) {
        var u = (i + 0.5) / W;
        var t = g * u + hh * v + 1;
        var x = (a * u + b * v + c) / t;
        var y = (dd * u + e * v + f) / t;
        if (x < 0) x = 0; else if (x > maxX) x = maxX;
        if (y < 0) y = 0; else if (y > maxY) y = maxY;
        var fx = x | 0, fy = y | 0;
        var tx = x - fx, ty = y - fy;
        var k = (fy * sw + fx) * 4;
        var k2 = k + sw * 4;
        var w11 = (1 - tx) * (1 - ty), w21 = tx * (1 - ty);
        var w12 = (1 - tx) * ty, w22 = tx * ty;
        D[o] = S[k] * w11 + S[k + 4] * w21 + S[k2] * w12 + S[k2 + 4] * w22;
        D[o + 1] = S[k + 1] * w11 + S[k + 5] * w21 + S[k2 + 1] * w12 + S[k2 + 5] * w22;
        D[o + 2] = S[k + 2] * w11 + S[k + 6] * w21 + S[k2 + 2] * w12 + S[k2 + 6] * w22;
        D[o + 3] = 255;
        o += 4;
      }
    }
    return true;
  }

  // Snijd de vierhoek uit en trek hem recht, vanaf de volle cameraresolutie.
  // De eerste hoek wordt linksboven van het resultaat; zo regelt de volgorde
  // van de hoeken meteen ook de stand.
  function snijdUit(bron, hoeken) {
    var pw = hoeken.map(function (p) { return { x: p.x * bron.width, y: p.y * bron.height }; });
    var breed = (afstand(pw[0], pw[1]) + afstand(pw[3], pw[2])) / 2;
    var hoog = (afstand(pw[0], pw[3]) + afstand(pw[1], pw[2])) / 2;
    if (!(breed > 8 && hoog > 8)) return null;

    // Alleen verkleinen boven het maximum, nooit vergroten: geen verzonnen pixels.
    var f = Math.min(1, C.maxLangeZijde / Math.max(breed, hoog));
    var dw = Math.max(1, Math.round(breed * f));
    var dh = Math.max(1, Math.round(hoog * f));
    var sw = Math.max(2, Math.round(bron.width * f));
    var sh = Math.max(2, Math.round(bron.height * f));

    var bronCanvas = tekenGeschaald(bron, bron.width, bron.height, { w: sw, h: sh });
    var bronBeeld = bronCanvas.getContext('2d', { willReadFrequently: true })
      .getImageData(0, 0, sw, sh);

    var doel = document.createElement('canvas');
    doel.width = dw; doel.height = dh;
    var dctx = doel.getContext('2d', { willReadFrequently: true });
    var doelBeeld = dctx.createImageData(dw, dh);
    if (!trekRecht(bronBeeld, doelBeeld, hoeken, sw, sh)) return null;
    dctx.putImageData(doelBeeld, 0, 0);
    return doel;
  }

  // ------------------------------------------------------------ kleur en licht

  function tabel(gain) {
    var lut = new Uint8ClampedArray(256);
    for (var v = 0; v < 256; v++) lut[v] = Math.round(v * gain);
    return lut;
  }

  // Witbalans: het papier (lichte pixels) moet neutraal grijs worden.
  function witbalans(data) {
    var n = 0, sr = 0, sg = 0, sb = 0;
    var stap = 4 * Math.max(1, Math.round(data.length / 4 / 200000));
    for (var i = 0; i < data.length; i += stap) {
      var r = data[i], g = data[i + 1], b = data[i + 2];
      var l = luminantie(r, g, b);
      if (l >= C.papierMin && l <= C.papierMax) { n++; sr += r; sg += g; sb += b; }
    }
    if (n < 50) return;
    var ar = sr / n, ag = sg / n, ab = sb / n;
    var grijs = (ar + ag + ab) / 3;
    var laag = 1 - C.maxKleurCorrectie, hoog = 1 + C.maxKleurCorrectie;
    var lutR = tabel(klem(grijs / ar, laag, hoog));
    var lutG = tabel(klem(grijs / ag, laag, hoog));
    var lutB = tabel(klem(grijs / ab, laag, hoog));
    for (var j = 0; j < data.length; j += 4) {
      data[j] = lutR[data[j]];
      data[j + 1] = lutG[data[j + 1]];
      data[j + 2] = lutB[data[j + 2]];
    }
  }

  // Contrast: 60e percentiel van het papier wordt wit, zwartpunt rond 15.
  function contrast(data) {
    var hist = new Uint32Array(256), n = 0;
    for (var i = 0; i < data.length; i += 4) {
      var l = Math.round(luminantie(data[i], data[i + 1], data[i + 2]));
      if (l >= C.papierMin && l <= C.papierMax) { hist[l]++; n++; }
    }
    var wit = 235;
    if (n >= 50) {
      var grens = n * C.witPercentiel, som = 0;
      for (var v = 0; v < 256; v++) {
        som += hist[v];
        if (som >= grens) { wit = v; break; }
      }
    }
    var zwart = C.zwartPunt;
    if (wit < zwart + 40) wit = zwart + 40;
    var lut = new Uint8ClampedArray(256);
    for (var w = 0; w < 256; w++) lut[w] = Math.round((w - zwart) * 255 / (wit - zwart));
    for (var j = 0; j < data.length; j += 4) {
      data[j] = lut[data[j]];
      data[j + 1] = lut[data[j + 1]];
      data[j + 2] = lut[data[j + 2]];
    }
  }

  // ------------------------------------------------------------------- PDF

  // Eén A3-liggend-pagina met de JPEG erin. PDF kan JPEG rechtstreeks
  // bevatten (DCTDecode), dus er wordt niets opnieuw gecomprimeerd.
  // WhatsApp stuurt een PDF als document en laat hem dan onaangeroerd.
  function maakPdf(jpg, w, h) {
    var enc = new TextEncoder();
    var delen = [], lengte = 0, posities = [];
    function voeg(x) {
      var b = typeof x === 'string' ? enc.encode(x) : x;
      delen.push(b);
      lengte += b.length;
    }
    function getal(x) { return (Math.round(x * 100) / 100).toString(); }

    var PW = 1190.55, PH = 841.89;               // A3 liggend in punten
    var s = Math.min(PW / w, PH / h);
    var dw = w * s, dh = h * s;
    var inhoud = 'q ' + getal(dw) + ' 0 0 ' + getal(dh) + ' ' +
      getal((PW - dw) / 2) + ' ' + getal((PH - dh) / 2) + ' cm /Im0 Do Q';

    voeg('%PDF-1.4\n');
    voeg(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));
    posities[1] = lengte;
    voeg('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
    posities[2] = lengte;
    voeg('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
    posities[3] = lengte;
    voeg('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH +
      '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n');
    posities[4] = lengte;
    voeg('4 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + w + ' /Height ' + h +
      ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
      jpg.length + ' >>\nstream\n');
    voeg(jpg);
    voeg('\nendstream\nendobj\n');
    posities[5] = lengte;
    voeg('5 0 obj\n<< /Length ' + inhoud.length + ' >>\nstream\n' + inhoud +
      '\nendstream\nendobj\n');

    var xref = lengte;
    var tabelTekst = 'xref\n0 6\n0000000000 65535 f \n';
    for (var i = 1; i <= 5; i++) {
      tabelTekst += String(posities[i]).padStart(10, '0') + ' 00000 n \n';
    }
    voeg(tabelTekst);
    voeg('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return new Blob(delen, { type: 'application/pdf' });
  }

  // ------------------------------------------------------- van foto naar scan

  // Eerste ronde, licht: lezen, voorbeeld maken, rand zoeken. Hier wordt nog
  // niets uitgesneden; dat gebeurt pas bij Versturen.
  function verken(file) {
    return leesAfbeelding(file).then(function (bron) {
      return wacht().then(function () {
        var hoeken = C.autoBijsnijden ? vindHoeken(bron) : null;
        var v = Math.min(1, C.voorbeeldBreedte / Math.max(bron.width, bron.height));
        var klein = tekenGeschaald(bron, bron.width, bron.height, {
          w: Math.max(1, Math.round(bron.width * v)),
          h: Math.max(1, Math.round(bron.height * v)),
        });
        return naarBlob(klein, 0.8).then(function (vb) {
          ruimFotoOp();
          state.file = file;
          state.gevonden = !!hoeken;
          state.hoeken = hoeken || heleFoto();
          // Alleen draaien als het vél rechtop staat. Zonder gevonden rand
          // zegt de vorm van de foto niets over de stand van de bon.
          state.draai = (hoeken && staatRechtop(hoeken, bron.width, bron.height)) ? 1 : 0;
          state.voorbeeldUrl = URL.createObjectURL(vb);
          if (bron.close) bron.close();
          return laadBeeld(state.voorbeeldUrl, false);
        }).then(function (img) {
          state.img = img;
        });
      });
    });
  }

  // De hoeken in de volgorde zoals ze op het scherm staan. Een kwartslag met
  // de klok mee betekent: wat linksonder zat, wordt linksboven.
  function gedraaideHoeken() {
    var k = state.draai, uit = [];
    for (var i = 0; i < 4; i++) uit.push(state.hoeken[(i - k + 4) % 4]);
    return uit;
  }

  function nu() {
    var d = new Date();
    return {
      bestand: d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) +
        '-' + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds()),
      leesbaar: p2(d.getDate()) + '-' + p2(d.getMonth() + 1) + '-' + d.getFullYear() +
        ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()),
      tijd: p2(d.getHours()) + ':' + p2(d.getMinutes()),
    };
  }

  // Tweede ronde, zwaar: uitsnijden vanaf de volle resolutie, dan witbalans
  // en contrast, dan JPEG en eventueel PDF.
  function maakScan() {
    var hoeken = gedraaideHoeken();
    return leesAfbeelding(state.file).then(function (bron) {
      return wacht().then(function () {
        var canvas = snijdUit(bron, hoeken);
        if (bron.close) bron.close();
        if (!canvas) throw new Error('de uitsnede is te klein');

        var ctx = canvas.getContext('2d', { willReadFrequently: true });
        var beeld = ctx.getImageData(0, 0, canvas.width, canvas.height);
        witbalans(beeld.data);
        contrast(beeld.data);
        ctx.putImageData(beeld, 0, 0);

        var w = canvas.width, h = canvas.height, s = nu();
        var naam = C.bestandsVoorvoegsel + '-' + s.bestand;
        var tekst = C.onderschrift + ' ' + s.leesbaar;

        return naarBlob(canvas, C.jpegKwaliteit).then(function (jpg) {
          var uit = { jpgUrl: URL.createObjectURL(jpg), w: w, h: h, tekst: tekst };
          if (C.verzendenAls === 'jpg') {
            uit.bestand = new File([jpg], naam + '.jpg', { type: 'image/jpeg' });
            return uit;
          }
          return jpg.arrayBuffer().then(function (buf) {
            var pdf = maakPdf(new Uint8Array(buf), w, h);
            uit.bestand = new File([pdf], naam + '.pdf', { type: 'application/pdf' });
            return uit;
          });
        });
      });
    });
  }

  // ---------------------------------------------------------------- versturen

  function kanDelen(bestand) {
    try {
      return !!(navigator.share && navigator.canShare &&
        navigator.canShare({ files: [bestand] }));
    } catch (e) {
      return false;
    }
  }

  function deel(res) {
    return navigator.share({ files: [res.bestand], title: res.tekst, text: res.tekst });
  }

  function laag(res) { return Math.max(res.w, res.h) < C.waarschuwOnder; }

  // Na het rekenwerk meteen het deelmenu openen. Dat mag een browser alleen
  // kort na een tik; is dat moment voorbij, dan komt er een scherm met een
  // eigen verzendknop. Op de meeste Android-telefoons gaat het in één keer.
  function versturen() {
    if (!state.file) return;
    el['knop-versturen'].disabled = true;
    meld('status-snijden', 'Bezig met scannen…');
    maakScan().then(function (res) {
      ruimResultaatOp();
      state.resultaat = res;
      el['knop-versturen'].disabled = false;
      meld('status-snijden', '');
      var magNog = !navigator.userActivation || navigator.userActivation.isActive;
      if (magNog && kanDelen(res.bestand)) {
        deel(res).then(gelukt, function (e) { toonKlaar(e); });
      } else {
        toonKlaar();
      }
    }).catch(function (e) {
      el['knop-versturen'].disabled = false;
      meld('status-snijden', '');
      fout(e);
    });
  }

  function gelukt() {
    var r = state.resultaat;
    var tekst = 'Doorgegeven om ' + nu().tijd + ' (' + r.w + '×' + r.h +
      ' pixels). Kijk in WhatsApp of hij echt verstuurd is.';
    if (laag(r)) tekst += ' Let op: lage resolutie, handschrift kan slecht leesbaar zijn.';
    ruimFotoOp();
    ruimResultaatOp();
    meld('status-start', tekst);
    toon('scherm-start');
  }

  function toonKlaar(e) {
    var r = state.resultaat;
    el['klaar-beeld'].src = r.jpgUrl;
    el['klaar-meta'].textContent = r.w + '×' + r.h + ' pixels · ' +
      (r.bestand.size / 1048576).toFixed(1).replace('.', ',') + ' MB' +
      (laag(r) ? ' · lage resolutie, handschrift kan slecht leesbaar zijn' : '');

    var kan = kanDelen(r.bestand);
    el['knop-deel'].hidden = !kan;
    el['knop-opslaan'].className = kan ? 'knop groot secundair' : 'knop groot';

    if (!kan) {
      meld('status-klaar', 'Dit toestel kan de bon niet doorgeven vanuit de app. ' +
        'Sla hem op en stuur hem vanuit je bestanden via WhatsApp.');
    } else if (e && e.name === 'AbortError') {
      meld('status-klaar', 'Niet verstuurd. Tik op Versturen om het opnieuw te proberen.');
    } else {
      meld('status-klaar', 'Tik op Versturen en kies WhatsApp.');
    }
    toon('scherm-klaar');
  }

  function slaOp() {
    var r = state.resultaat;
    if (!r) return;
    var url = URL.createObjectURL(r.bestand);
    var a = document.createElement('a');
    a.href = url;
    a.download = r.bestand.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  function ruimFotoOp() {
    if (state.voorbeeldUrl) URL.revokeObjectURL(state.voorbeeldUrl);
    state.file = null; state.hoeken = null; state.img = null;
    state.voorbeeldUrl = null; state.draai = 0;
  }

  function ruimResultaatOp() {
    if (state.resultaat) URL.revokeObjectURL(state.resultaat.jpgUrl);
    state.resultaat = null;
  }

  // ------------------------------------------------------------ bijsnijden

  var doek = { breed: 0, hoog: 0, sleept: -1 };

  // Van fracties op de foto naar fracties op het (gedraaide) scherm en terug.
  function naarScherm(p) {
    switch (state.draai) {
      case 1: return { x: 1 - p.y, y: p.x };
      case 2: return { x: 1 - p.x, y: 1 - p.y };
      case 3: return { x: p.y, y: 1 - p.x };
      default: return { x: p.x, y: p.y };
    }
  }

  function naarFoto(d) {
    switch (state.draai) {
      case 1: return { x: d.y, y: 1 - d.x };
      case 2: return { x: 1 - d.x, y: 1 - d.y };
      case 3: return { x: 1 - d.y, y: d.x };
      default: return { x: d.x, y: d.y };
    }
  }

  function openSnijden() {
    el['uitleg-snijden'].textContent = state.gevonden
      ? 'Zo komt hij aan. Klopt de rand niet, sleep dan de hoeken.'
      : 'Rand niet gevonden. Sleep de hoeken naar de rand van de bon.';
    meld('status-snijden', '');
    toon('scherm-snijden');
    pasDoekAan();
  }

  function pasDoekAan() {
    if (!state.img) return;
    var c = el['doek'];
    var oneven = state.draai % 2;
    var iw = oneven ? state.img.height : state.img.width;
    var ih = oneven ? state.img.width : state.img.height;
    var maxB = c.parentNode.clientWidth - 16;
    var maxH = Math.max(200, window.innerHeight - 270);
    var b = maxB, h = b * ih / iw;
    if (h > maxH) { h = maxH; b = h * iw / ih; }
    doek.breed = Math.round(b);
    doek.hoog = Math.round(h);
    var dpr = window.devicePixelRatio || 1;
    c.style.width = doek.breed + 'px';
    c.style.height = doek.hoog + 'px';
    c.width = Math.round(doek.breed * dpr);
    c.height = Math.round(doek.hoog * dpr);
    tekenDoek();
  }

  function tekenDoek() {
    if (!state.img) return;
    var c = el['doek'], ctx = c.getContext('2d');
    var B = doek.breed, H = doek.hoog;
    var dpr = c.width / B;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, B, H);

    // Foto in de stand waarin hij verstuurd wordt: wat je ziet komt aan.
    ctx.save();
    ctx.translate(B / 2, H / 2);
    ctx.rotate(state.draai * Math.PI / 2);
    var oneven = state.draai % 2;
    var iw = oneven ? H : B, ih = oneven ? B : H;
    ctx.drawImage(state.img, -iw / 2, -ih / 2, iw, ih);
    ctx.restore();

    var p = state.hoeken.map(function (q) {
      var s = naarScherm(q);
      return { x: s.x * B, y: s.y * H };
    });

    // Alles buiten de vierhoek dempen, zodat meteen zichtbaar is wat wegvalt.
    ctx.beginPath();
    ctx.rect(0, 0, B, H);
    ctx.moveTo(p[0].x, p[0].y);
    for (var i = 3; i >= 1; i--) ctx.lineTo(p[i].x, p[i].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fill('evenodd');

    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    for (var j = 1; j < 4; j++) ctx.lineTo(p[j].x, p[j].y);
    ctx.closePath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#f9a13a';
    ctx.stroke();

    for (var k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.arc(p[k].x, p[k].y, 16, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#005837';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p[k].x, p[k].y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#005837';
      ctx.fill();
    }
  }

  function doekPositie(e) {
    var r = el['doek'].getBoundingClientRect();
    return {
      x: klem((e.clientX - r.left) / r.width, 0, 1),
      y: klem((e.clientY - r.top) / r.height, 0, 1),
    };
  }

  function omlaag(e) {
    if (!state.img) return;
    var pos = doekPositie(e);
    var beste = -1, kortst = 1e9;
    for (var i = 0; i < 4; i++) {
      var s = naarScherm(state.hoeken[i]);
      var d = Math.hypot((s.x - pos.x) * doek.breed, (s.y - pos.y) * doek.hoog);
      if (d < kortst) { kortst = d; beste = i; }
    }
    if (kortst > 60) return; // ruime greep, ook met handschoenen
    doek.sleept = beste;
    try { el['doek'].setPointerCapture(e.pointerId); } catch (x) { /* niet essentieel */ }
    e.preventDefault();
  }

  function beweeg(e) {
    if (doek.sleept < 0) return;
    state.hoeken[doek.sleept] = naarFoto(doekPositie(e));
    tekenDoek();
    e.preventDefault();
  }

  function omhoog() { doek.sleept = -1; }

  // ------------------------------------------------------------- vastknopen

  function kiesFoto() {
    el['invoer-foto'].value = '';
    el['invoer-foto'].click();
  }

  el['knop-foto'].addEventListener('click', kiesFoto);
  el['knop-opnieuw'].addEventListener('click', kiesFoto);

  el['invoer-foto'].addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    el['knop-foto'].disabled = true;
    meld('status-start', 'Foto wordt gelezen…');
    meld('status-snijden', 'Foto wordt gelezen…');
    verken(f).then(function () {
      el['knop-foto'].disabled = false;
      meld('status-start', '');
      openSnijden();
    }).catch(function (err) {
      el['knop-foto'].disabled = false;
      meld('status-start', '');
      meld('status-snijden', '');
      fout(err);
    });
  });

  el['doek'].addEventListener('pointerdown', omlaag);
  el['doek'].addEventListener('pointermove', beweeg);
  el['doek'].addEventListener('pointerup', omhoog);
  el['doek'].addEventListener('pointercancel', omhoog);
  window.addEventListener('resize', function () {
    if (!el['scherm-snijden'].hidden) pasDoekAan();
  });

  el['knop-draai'].addEventListener('click', function () {
    state.draai = (state.draai + 1) % 4;
    pasDoekAan();
  });

  el['knop-versturen'].addEventListener('click', versturen);

  el['knop-deel'].addEventListener('click', function () {
    var r = state.resultaat;
    if (!r) return;
    deel(r).then(gelukt, function (e) {
      if (e && e.name === 'AbortError') return;
      meld('status-klaar', 'Versturen lukte niet: ' + (e && e.message ? e.message : e));
    });
  });

  el['knop-opslaan'].addEventListener('click', slaOp);

  el['knop-nieuw'].addEventListener('click', function () {
    ruimFotoOp();
    ruimResultaatOp();
    meld('status-start', '');
    toon('scherm-start');
    kiesFoto();
  });

  // ------------------------------------------------------------------ start

  toon('scherm-start');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (e) {
        console.warn('service worker niet geregistreerd', e);
      });
    });
  }
})();
