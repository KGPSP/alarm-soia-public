import { lstat, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Kontrola pakietu sklepowego (data/app-store*.json, data/google-play*.json) względem
// limitów App Store Connect i Play Console oraz faktów z data/dane-przekazywane.json.

export const EU_27 = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];
export const LOCALES = ["pl-PL", "en-GB"];
export const APPLE_CHARACTER_LIMITS = { name: 30, subtitle: 30, promotionalText: 170, description: 4000, releaseNotes: 4000 };
export const APPLE_BYTE_LIMITS = { keywords: 100 };
export const PLAY_CHARACTER_LIMITS = { appName: 30, shortDescription: 80, fullDescription: 4000, releaseNotes: 500 };

// Nazwy innych podmiotów i nazwa własna aplikacji — zakazane w słowach kluczowych (Apple 2.3.7).
const forbiddenKeywordTerms = [/\bRCB\b/iu, /\bApple\b/iu, /\bGoogle\b/iu, /\bair\s*alert\b/iu, /\bsoia\b/iu, /\bIMGW\b/iu];

function characters(text) {
  return [...text].length;
}

function localized(object, field, fileName) {
  const value = object[field];
  if (!value || typeof value !== "object") throw new Error(`${fileName}: pole ${field} musi być obiektem {locale: tekst}`);
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...LOCALES].sort())) {
    throw new Error(`${fileName}: pole ${field} musi mieć dokładnie lokalizacje ${LOCALES.join(", ")}`);
  }
  for (const locale of LOCALES) {
    const text = value[locale];
    if (typeof text !== "string" || text.trim() === "") throw new Error(`${fileName}: ${field}[${locale}] jest puste`);
    if (text !== text.trim()) throw new Error(`${fileName}: ${field}[${locale}] ma białe znaki na brzegach`);
    if (/<[a-z][^>]*>/iu.test(text)) throw new Error(`${fileName}: ${field}[${locale}] zawiera znaczniki HTML`);
  }
  return value;
}

function sameSet(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function requireEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: oczekiwano ${JSON.stringify(expected)}, jest ${JSON.stringify(actual)}`);
  }
}

async function readJson(root, name) {
  return JSON.parse(await readFile(join(root, "data", name), "utf8"));
}

async function routeFileExists(root, site, path) {
  const route = site.routes.find((candidate) => candidate.path === path);
  if (!route) return false;
  try {
    return (await lstat(join(root, "site", route.file))).isFile();
  } catch {
    return false;
  }
}

function routeUrl(site, path) {
  return path === "" ? `${site.publicOrigin}/` : `${site.publicOrigin}/${path}`;
}

async function checkUrl(root, site, url, path, label) {
  const accepted = path === "" ? [site.publicOrigin, `${site.publicOrigin}/`] : [routeUrl(site, path)];
  if (!accepted.includes(url)) throw new Error(`${label}: oczekiwano ${accepted.join(" lub ")}, jest ${url}`);
  if (!(await routeFileExists(root, site, path))) throw new Error(`${label}: trasa "${path}" nie ma pliku w site/`);
}

function checkKeywords(text, locale) {
  if (/,\s|\s,/u.test(text)) throw new Error(`keywords[${locale}]: przecinki bez spacji`);
  const terms = text.split(",");
  if (terms.some((term) => term === "" || term !== term.trim())) throw new Error(`keywords[${locale}]: puste albo obramowane spacją słowo`);
  if (new Set(terms.map((term) => term.toLowerCase())).size !== terms.length) throw new Error(`keywords[${locale}]: powtórzone słowo`);
  for (const pattern of forbiddenKeywordTerms) {
    if (pattern.test(text)) throw new Error(`keywords[${locale}]: niedozwolona nazwa innego podmiotu lub aplikacji (${pattern})`);
  }
}

export async function checkStoreData(repositoryRoot) {
  const root = resolve(repositoryRoot);
  const site = await readJson(root, "site.json");
  const facts = await readJson(root, "dane-przekazywane.json");
  const appStore = await readJson(root, "app-store.json");
  const appStoreDeclarations = await readJson(root, "app-store-declarations.json");
  const googlePlay = await readJson(root, "google-play.json");
  const googlePlayDeclarations = await readJson(root, "google-play-declarations.json");

  for (const [name, document] of [
    ["app-store.json", appStore],
    ["app-store-declarations.json", appStoreDeclarations],
    ["google-play.json", googlePlay],
    ["google-play-declarations.json", googlePlayDeclarations],
  ]) {
    if (document.schemaVersion !== 1) throw new Error(`${name}: schemaVersion musi być 1`);
    if (document.status !== "DRAFT_NOT_SUBMITTED") throw new Error(`${name}: status musi być DRAFT_NOT_SUBMITTED do czasu wysyłki`);
  }

  // App Store — limity per lokalizacja
  const apple = { characters: {}, bytes: {} };
  for (const [field, limit] of Object.entries(APPLE_CHARACTER_LIMITS)) {
    const value = localized(appStore, field, "app-store.json");
    apple.characters[field] = {};
    for (const locale of LOCALES) {
      const length = characters(value[locale]);
      apple.characters[field][locale] = length;
      if (length > limit) throw new Error(`app-store.json: ${field}[${locale}] ma ${length} znaków (limit ${limit})`);
    }
  }
  for (const [field, limit] of Object.entries(APPLE_BYTE_LIMITS)) {
    const value = localized(appStore, field, "app-store.json");
    apple.bytes[field] = {};
    for (const locale of LOCALES) {
      const bytes = Buffer.byteLength(value[locale], "utf8");
      apple.bytes[field][locale] = bytes;
      if (bytes > limit) throw new Error(`app-store.json: ${field}[${locale}] ma ${bytes} bajtów (limit ${limit})`);
      checkKeywords(value[locale], locale);
    }
  }
  requireEqual(appStore.locales, LOCALES, "app-store.json: locales");
  requireEqual(appStore.primaryLocale, "pl-PL", "app-store.json: primaryLocale");
  await checkUrl(root, site, appStore.privacyPolicyUrl, "polityka-prywatnosci", "app-store.json: privacyPolicyUrl");
  await checkUrl(root, site, appStore.supportUrl, "pomoc", "app-store.json: supportUrl");
  await checkUrl(root, site, appStore.marketingUrl, "", "app-store.json: marketingUrl");
  requireEqual(appStore.copyright, `2026 ${site.publisher.name}`, "app-store.json: copyright");
  requireEqual(appStore.publisherName, site.publisher.name, "app-store.json: publisherName");
  requireEqual(appStore.primaryCategory, "UTILITIES", "app-store.json: primaryCategory");
  if (typeof appStore.reviewNotes !== "string" || Buffer.byteLength(appStore.reviewNotes, "utf8") > 4000) throw new Error("app-store.json: reviewNotes musi mieć ≤ 4000 bajtów");
  for (const required of [/logowani/iu, /ĆWICZENIE/u, /MPJHKAS7D9/u, /latar/iu]) {
    if (!required.test(appStore.reviewNotes)) throw new Error(`app-store.json: reviewNotes bez wymaganego elementu ${required}`);
  }
  if (appStore.reviewContact !== null) throw new Error("app-store.json: reviewContact (dane osobowe) nie należy do publicznego repozytorium");

  // Google Play — limity per lokalizacja
  const play = { characters: {} };
  for (const [field, limit] of Object.entries(PLAY_CHARACTER_LIMITS)) {
    const value = localized(googlePlay, field, "google-play.json");
    play.characters[field] = {};
    for (const locale of LOCALES) {
      const length = characters(value[locale]);
      play.characters[field][locale] = length;
      if (length > limit) throw new Error(`google-play.json: ${field}[${locale}] ma ${length} znaków (limit ${limit})`);
    }
  }
  requireEqual(googlePlay.locales, LOCALES, "google-play.json: locales");
  requireEqual(googlePlay.defaultLocale, "pl-PL", "google-play.json: defaultLocale");
  await checkUrl(root, site, googlePlay.privacyPolicyUrl, "polityka-prywatnosci", "google-play.json: privacyPolicyUrl");
  await checkUrl(root, site, googlePlay.websiteUrl, "", "google-play.json: websiteUrl");
  requireEqual(googlePlay.developerName, site.publisher.name, "google-play.json: developerName");
  requireEqual(googlePlay.contactEmail, site.publisher.supportEmail, "google-play.json: contactEmail");
  requireEqual(googlePlay.category, "TOOLS", "google-play.json: category");
  requireEqual(googlePlay.targetAudience, "18_PLUS", "google-play.json: targetAudience");
  for (const locale of LOCALES) {
    if (/\b(?:news|wiadomości)\b/iu.test(googlePlay.fullDescription[locale])) throw new Error(`google-play.json: fullDescription[${locale}] nie może opisywać aplikacji jako newsowej`);
  }

  // App Store — deklaracje
  const declarations = appStoreDeclarations;
  if (!sameSet(declarations.countries, EU_27) || declarations.countries.length !== 27) throw new Error("app-store-declarations.json: countries musi być dokładnie 27 państw UE");
  requireEqual(declarations.deviceFamilies, ["IPHONE"], "app-store-declarations.json: deviceFamilies");
  requireEqual(declarations.dataCollected, true, "app-store-declarations.json: dataCollected");
  requireEqual(declarations.requiresAccount, false, "app-store-declarations.json: requiresAccount");
  requireEqual(declarations.usesNonExemptEncryption, false, "app-store-declarations.json: usesNonExemptEncryption");
  requireEqual(declarations.criticalAlertsRequest, "MPJHKAS7D9", "app-store-declarations.json: criticalAlertsRequest");
  requireEqual(declarations.releaseType, "MANUAL", "app-store-declarations.json: releaseType");
  requireEqual(declarations.price, "FREE", "app-store-declarations.json: price");
  requireEqual(declarations.category, appStore.primaryCategory, "app-store-declarations.json: category");
  if (!Array.isArray(declarations.appPrivacy) || declarations.appPrivacy.length === 0) throw new Error("app-store-declarations.json: appPrivacy puste mimo dataCollected=true");
  const appPrivacyTypes = declarations.appPrivacy.map((entry) => entry.type);
  for (const entry of declarations.appPrivacy) {
    if (!Array.isArray(entry.purposes) || !entry.purposes.includes("App Functionality")) throw new Error(`app-store-declarations.json: ${entry.type} bez celu App Functionality`);
    if (entry.usedForTracking !== false) throw new Error(`app-store-declarations.json: ${entry.type} nie może być używany do śledzenia`);
    if (typeof entry.linkedToUser !== "boolean") throw new Error(`app-store-declarations.json: ${entry.type} bez linkedToUser`);
  }
  if (!["4+", "9+", "13+", "16+", "18+"].includes(declarations.ageRating?.proposed)) throw new Error("app-store-declarations.json: ageRating.proposed spoza skali Apple");
  if (!declarations.ageRating?.decision) throw new Error("app-store-declarations.json: ageRating.decision wymagane");
  if (!declarations.dsa?.traderStatus) throw new Error("app-store-declarations.json: dsa.traderStatus wymagane (TRADER / NON_TRADER / DO_DECYZJI)");
  requireEqual(declarations.supportEmail, site.publisher.supportEmail, "app-store-declarations.json: supportEmail");
  requireEqual(declarations.privacyEmail, site.publisher.privacyEmail, "app-store-declarations.json: privacyEmail");
  requireEqual(declarations.version, appStore.version, "app-store-declarations.json: version");

  // Google Play — deklaracje
  const playDeclarations = googlePlayDeclarations;
  if (!sameSet(playDeclarations.countries, EU_27) || playDeclarations.countries.length !== 27) throw new Error("google-play-declarations.json: countries musi być dokładnie 27 państw UE");
  for (const [field, expected] of [
    ["governmentApp", true], ["ads", false], ["requiresAccount", false], ["dataCollected", true], ["dataShared", false],
    ["newsApp", false], ["financialFeatures", false], ["healthFeatures", false], ["advertisingId", false],
    ["inAppPurchases", false], ["restrictMinorAccess", false], ["category", "TOOLS"],
  ]) {
    requireEqual(playDeclarations[field], expected, `google-play-declarations.json: ${field}`);
  }
  requireEqual(playDeclarations.targetAudience, ["18_PLUS"], "google-play-declarations.json: targetAudience");
  requireEqual(playDeclarations.formFactors, ["PHONE"], "google-play-declarations.json: formFactors");
  if (!/PEGI 3/u.test(playDeclarations.contentRating?.expected ?? "")) throw new Error("google-play-declarations.json: contentRating.expected powinien zawierać PEGI 3");
  const dataSafety = playDeclarations.dataSafety;
  if (!dataSafety || !Array.isArray(dataSafety.collected)) throw new Error("google-play-declarations.json: brak dataSafety.collected");
  const dataSafetyTypes = dataSafety.collected.map((entry) => entry.type);
  for (const entry of dataSafety.collected) {
    if (entry.required !== true || entry.shared !== false || entry.ephemeral !== false) throw new Error(`google-play-declarations.json: ${entry.type} musi być required, niewspółdzielony, nieulotny`);
    requireEqual(entry.purposes, ["App functionality"], `google-play-declarations.json: ${entry.type}.purposes`);
  }
  requireEqual(dataSafety.encryptedInTransit, true, "google-play-declarations.json: dataSafety.encryptedInTransit");
  requireEqual(dataSafety.deletionMechanism, true, "google-play-declarations.json: dataSafety.deletionMechanism");
  if (!dataSafety.deletionNote) throw new Error("google-play-declarations.json: dataSafety.deletionNote wymagane");
  requireEqual(playDeclarations.publisher, site.publisher, "google-play-declarations.json: publisher");
  requireEqual(googlePlay.targetAudience, playDeclarations.targetAudience[0], "google-play.json: targetAudience vs deklaracje");
  requireEqual(googlePlay.category, playDeclarations.category, "google-play.json: category vs deklaracje");

  // Spójność z faktami o danych opuszczających telefon
  const registration = facts.zadania.find((task) => task.id === "rejestracja-push") ?? facts.zadania[0];
  const fields = registration.pola.join(" ");
  const absent = (facts.brak ?? []).join(" ");
  const consistency = [];
  const expect = (condition, message) => {
    consistency.push(message);
    if (!condition) throw new Error(`Niespójność z data/dane-przekazywane.json: ${message}`);
  };
  if (/token/iu.test(fields)) {
    expect(appPrivacyTypes.includes("Identifiers/Device ID"), "token push → App Privacy: Identifiers/Device ID");
    expect(dataSafetyTypes.includes("Device or other IDs"), "token push → Data safety: Device or other IDs");
    expect(declarations.dataCollected === true && playDeclarations.dataCollected === true, "token push → dataCollected=true w obu sklepach");
  }
  if (/TERYT/u.test(fields) || /priorytet/iu.test(fields)) {
    expect(appPrivacyTypes.includes("Other Data/Other Data Types"), "kody TERYT i priorytety → App Privacy: Other Data/Other Data Types");
    expect(dataSafetyTypes.includes("App activity/Other actions"), "kody TERYT i priorytety → Data safety: App activity/Other actions");
  }
  if (/lokalizacj/iu.test(absent)) {
    expect(!appPrivacyTypes.some((type) => /location/iu.test(type)), "brak lokalizacji → bez typów Location w App Privacy");
    expect(!dataSafetyTypes.some((type) => /location/iu.test(type)), "brak lokalizacji → bez typów Location w Data safety");
  }
  if (/analityk/iu.test(absent)) {
    expect(!appPrivacyTypes.some((type) => /usage data|diagnostics|advertising/iu.test(type)), "brak analityki → bez Usage Data/Diagnostics w App Privacy");
    expect(!dataSafetyTypes.some((type) => /app info and performance|crash|diagnostic/iu.test(type)), "brak analityki → bez App info and performance w Data safety");
    expect(playDeclarations.advertisingId === false && playDeclarations.ads === false, "brak reklam → advertisingId=false, ads=false");
    expect(declarations.appPrivacy.every((entry) => entry.usedForTracking === false), "brak analityki → usedForTracking=false");
  }
  if (/konto/iu.test(absent)) {
    expect(declarations.requiresAccount === false && playDeclarations.requiresAccount === false, "brak konta → requiresAccount=false w obu sklepach");
  }
  if (/DELETE/u.test(registration.retencja)) {
    expect(dataSafety.deletionMechanism === true, "cofnięcie zgody usuwa rejestrację → deletionMechanism=true");
  }
  expect(declarations.privacyEmail === facts.iod && playDeclarations.publisher.privacyEmail === facts.iod, "IOD z faktów = privacyEmail w deklaracjach");
  expect(declarations.supportEmail === facts.kontakt && googlePlay.contactEmail === facts.kontakt, "kontakt z faktów = supportEmail/contactEmail");

  return {
    locales: LOCALES,
    apple,
    play,
    countries: { appStore: declarations.countries.length, googlePlay: playDeclarations.countries.length },
    appPrivacyTypes,
    dataSafetyTypes,
    ageRating: declarations.ageRating.proposed,
    traderStatus: declarations.dsa.traderStatus,
    consistency,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const report = await checkStoreData(root);
    console.log(JSON.stringify({ ok: true, ...report }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exitCode = 1;
  }
}
