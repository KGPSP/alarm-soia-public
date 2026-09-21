import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { checkSite, contrast } from "./check-site.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const site = JSON.parse(await readFile(join(root, "data", "site.json"), "utf8"));
const page = (file) => readFile(join(root, "site", file), "utf8");

async function pngHeader(path) {
  const buffer = await readFile(join(root, "site", path));
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), colorType: buffer[25] };
}

test("SITE-ROUTES publikuje 9 płaskich tras z data/site.json: lang=pl, linki względne bez rozszerzeń, canonical z publicOrigin, robots i sitemap", async () => {
  const report = await checkSite(root);

  assert.equal(report.routeCount, 9);
  assert.equal(report.language, "pl");
  assert.equal(report.publicOrigin, "https://kgpsp.github.io");
  assert.equal(report.basePath, "/alarm-soia-public/");
  assert.deepEqual(
    site.routes.map((route) => route.file),
    ["index.html", "polityka-prywatnosci.html", "pomoc.html", "bezpieczenstwo.html", "wydania.html", "dane-i-prywatnosc.html", "dostepnosc.html", "informacje-prawne.html", "404.html"],
  );
  assert.equal(report.sitemapRoutes.length, 8);
  assert.ok(report.sitemapRoutes.every((url) => url.startsWith(`${site.publicOrigin}${site.basePath}`)));
  assert.ok(!report.sitemapRoutes.some((url) => url.endsWith("/404")));

  for (const route of site.routes) {
    const html = await page(route.file);
    const canonical = `${site.publicOrigin}${site.basePath}${route.path}`;
    assert.match(html, /<html lang="pl">/u, route.file);
    assert.ok(html.includes(`<link rel="canonical" href="${canonical}">`), `${route.file}: canonical`);
    if (route.noindex) {
      // Strona błędu jest serwowana pod dowolną ścieżką — linki od basePath, nie względne.
      assert.ok(html.includes(`<link rel="stylesheet" href="${site.basePath}assets/css/alarm-`), `${route.file}: arkusz od basePath`);
      for (const [, link] of html.matchAll(/(?:href|src)="([^"#][^"]*)"/gu)) {
        if (/^(?:https?:|mailto:)/u.test(link)) continue;
        assert.ok(link.startsWith(site.basePath), `${route.file}: link ${link} nie zaczyna się od ${site.basePath}`);
      }
    } else {
      assert.doesNotMatch(html, /href="\/[^"]*"/u, `${route.file}: link bezwzględny`);
    }
    assert.doesNotMatch(html, /href="[^"]*\.html"/u, `${route.file}: link z rozszerzeniem .html`);
    assert.match(html, /<nav class="site-nav" aria-label="Główna nawigacja">/u, route.file);
    assert.match(html, /<nav class="footer-links" aria-label="Informacje uzupełniające">/u, route.file);
  }
  const notFound = await page("404.html");
  assert.match(notFound, /<meta name="robots" content="noindex">/u);
  assert.doesNotMatch(notFound, /aria-current/u);
  const robots = await readFile(join(root, "site", "robots.txt"), "utf8");
  assert.match(robots, /^Allow: \/$/mu);
  assert.ok(robots.includes(`Sitemap: ${site.publicOrigin}${site.basePath}sitemap.xml`));
});

test("SITE-CHECK kończy się bez naruszeń: zero zewnętrznych zasobów runtime, formularzy, trackerów i zakazanych wzorców; CSS z fingerprintem; kontrast ≥ 4,5:1", async () => {
  const report = await checkSite(root);

  assert.deepEqual(report.externalRuntimeUrls, []);
  assert.deepEqual(report.forbiddenMatches, []);
  assert.match(report.stylesheetAsset, /^assets\/css\/alarm-[a-f0-9]{8}\.css$/u);
  assert.equal(report.screenshotAspectRatio, "9 / 16");
  assert.ok(report.contrastPairs.length >= 10);
  assert.ok(report.contrastMinimum >= 4.5, `kontrast minimalny ${report.contrastMinimum}`);
  assert.ok(contrast("#FFFFFF", "#B42318") >= 4.5);
  assert.ok(contrast("#1C5BB0", "#FFFFFF") >= 4.5);
  for (const route of site.routes) {
    const html = await page(route.file);
    assert.doesNotMatch(html, /<script\b|<form\b|<iframe\b/iu, route.file);
    assert.doesNotMatch(html, /googletagmanager|google-analytics|fonts\.googleapis/iu, route.file);
  }
});

test("SITE-CHECK trzyma e-maile na właściwych stronach: informacje@ na pomocy, iod@ tylko w polityce i na stronie Dane i prywatność", async () => {
  const support = await page("pomoc.html");
  const privacy = await page("polityka-prywatnosci.html");
  const summary = await page("dane-i-prywatnosc.html");
  const home = await page("index.html");
  const security = await page("bezpieczenstwo.html");

  assert.match(support, /mailto:informacje@kg\.straz\.gov\.pl/u);
  assert.doesNotMatch(support, /iod@kg\.straz\.gov\.pl/u);
  assert.doesNotMatch(home, /iod@kg\.straz\.gov\.pl/u);
  assert.doesNotMatch(security, /iod@kg\.straz\.gov\.pl/u);
  assert.match(privacy, /mailto:iod@kg\.straz\.gov\.pl/u);
  assert.match(summary, /mailto:iod@kg\.straz\.gov\.pl/u);
  assert.match(security, /ALARM\.SOIA — bezpieczeństwo/u);
});

test("SITE-CHECK odrzuca prywatną ścieżkę lokalną dodaną gdziekolwiek w publicznym repozytorium", async () => {
  const leakPath = join(root, "temporary-private-leak.txt");
  await writeFile(leakPath, ["", "Users", "example", "private-source"].join("/"), "utf8");
  try {
    await assert.rejects(() => checkSite(root), /temporary-private-leak\.txt/u);
  } finally {
    await rm(leakPath, { force: true });
  }
});

test("ASSETS-DIMS grafiki sklepowe mają wymagane wymiary i typ koloru odczytany z nagłówka PNG", async () => {
  const report = await checkSite(root);

  assert.ok(report.googlePhoneScreenshots >= 4, `zrzutów telefonu Play: ${report.googlePhoneScreenshots}`);
  assert.ok(report.iphoneScreenshots >= 4, `zrzutów iPhone 6.9: ${report.iphoneScreenshots}`);
  assert.ok(report.iphone65Screenshots >= 4, `zrzutów iPhone 6.5: ${report.iphone65Screenshots}`);
  assert.equal(report.tabletAssets, 0);
  assert.deepEqual(await pngHeader("assets/google-play/feature-graphic.png"), { width: 1024, height: 500, colorType: 2 });
  const icon = await pngHeader("assets/google-play/icon-512.png");
  assert.equal(icon.width, 512);
  assert.equal(icon.height, 512);
  assert.ok([2, 6].includes(icon.colorType), `ikona: typ koloru ${icon.colorType}`);
  const og = await pngHeader("assets/og/og-image.png");
  assert.equal(og.width, 1200);
  assert.equal(og.height, 630);
  for (const [path, header] of Object.entries(report.pngs)) {
    if (path.startsWith("assets/google-play/phone/")) assert.deepEqual(header, { width: 1080, height: 1920, colorType: 2 }, path);
    if (path.startsWith("assets/app-store/iphone-6.9/")) assert.deepEqual(header, { width: 1320, height: 2868, colorType: 2 }, path);
    if (path.startsWith("assets/app-store/iphone-6.5/")) assert.deepEqual(header, { width: 1284, height: 2778, colorType: 2 }, path);
  }
  const mark = await readFile(join(root, "site", "assets/branding/alarm-soia-mark.svg"), "utf8");
  assert.match(mark, /^<svg /u);
  assert.match(mark, /#B42318/u);
});

test("PRIVACY-FACTS polityka prywatności pokrywa każde pole z data/dane-przekazywane.json, a strona Dane i prywatność streszcza je w tabeli", async () => {
  const report = await checkSite(root);
  const facts = JSON.parse(await readFile(join(root, "data", "dane-przekazywane.json"), "utf8"));

  assert.deepEqual(report.privacyFacts.missing, []);
  assert.equal(facts.zadania[0].id, "rejestracja-push");
  assert.equal(facts.zadania[0].pola.length, 6);
  for (const label of ["token", "platform", "environment", "wersj", "TERYT", "priorytet", "alarm.soia.info", "Apple", "analityk", "iod@kg.straz.gov.pl", "usun"]) {
    assert.ok(report.privacyFacts.required.includes(label), `wymagane słowo-klucz: ${label}`);
  }
  const privacy = await page("polityka-prywatnosci.html");
  for (const pattern of [
    /token/iu, /platform/iu, /environment/iu, /wersj/iu, /TERYT/u, /priorytet/iu,
    /alarm\.soia\.info/u, /Apple Maps/u, /APNs/u, /FCM/u, /analityk/iu, /awari/iu, /lokalizacj/iu,
    /iod@kg\.straz\.gov\.pl/u, /usun/iu, /Komendant Główny Państwowej Straży Pożarnej/u, /21 września 2026/u, /art\. 6 ust\. 1 lit\. e RODO/u, /standardowe klauzule umowne/u, /48 godzin/u,
  ]) {
    assert.match(privacy, pattern);
  }
  const summary = await page("dane-i-prywatnosc.html");
  for (const pattern of [/<table class="data-table">/u, /token/iu, /TERYT/u, /priorytet/iu, /Device ID/u, /Device or other IDs/u, /href="polityka-prywatnosci"/u]) {
    assert.match(summary, pattern);
  }
});

test("NO-TWIN-LEFTOVERS żaden plik nie zawiera pozostałości bliźniaczej witryny ani nieprawdziwej deklaracji o braku transmisji", async () => {
  const report = await checkSite(root);
  assert.deepEqual(report.twinLeftovers, []);

  const leakPath = join(root, "temporary-twin-leftover.txt");
  await writeFile(leakPath, ["brak transmisji", "do KG PSP"].join(" "), "utf8");
  try {
    await assert.rejects(() => checkSite(root), /temporary-twin-leftover\.txt/u);
  } finally {
    await rm(leakPath, { force: true });
  }
});
