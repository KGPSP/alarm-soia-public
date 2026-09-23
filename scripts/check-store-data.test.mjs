import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  APPLE_BYTE_LIMITS,
  APPLE_CHARACTER_LIMITS,
  EU_27,
  LOCALES,
  PLAY_CHARACTER_LIMITS,
  checkStoreData,
} from "./check-store-data.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const data = async (name) => JSON.parse(await readFile(join(root, "data", name), "utf8"));
const site = await data("site.json");

// Kopia data/ z pustymi plikami tras — do testów negatywnych bez dotykania repozytorium.
async function temporaryRoot(mutate) {
  const directory = await mkdtemp(join(tmpdir(), "alarm-soia-store-"));
  await cp(join(root, "data"), join(directory, "data"), { recursive: true });
  await mkdir(join(directory, "site"), { recursive: true });
  for (const route of site.routes) await writeFile(join(directory, "site", route.file), "", "utf8");
  await mutate(async (name, change) => {
    const document = JSON.parse(await readFile(join(directory, "data", name), "utf8"));
    change(document);
    await writeFile(join(directory, "data", name), JSON.stringify(document, null, 2), "utf8");
  });
  return directory;
}

async function rejectsAfter(mutate, expected) {
  const directory = await temporaryRoot(mutate);
  try {
    await assert.rejects(() => checkStoreData(directory), expected);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("STORE-LIMITS Apple: name ≤30, subtitle ≤30, promotionalText ≤170, description ≤4000 znaków, keywords ≤100 bajtów — pl-PL i en-GB", async () => {
  const report = await checkStoreData(root);
  const appStore = await data("app-store.json");

  assert.deepEqual(APPLE_CHARACTER_LIMITS, { name: 30, subtitle: 30, promotionalText: 170, description: 4000, releaseNotes: 4000 });
  assert.deepEqual(APPLE_BYTE_LIMITS, { keywords: 100 });
  assert.deepEqual(LOCALES, ["pl-PL", "en-GB"]);
  for (const locale of LOCALES) {
    for (const [field, limit] of Object.entries(APPLE_CHARACTER_LIMITS)) {
      const length = [...appStore[field][locale]].length;
      assert.ok(length <= limit, `${field}[${locale}] = ${length} > ${limit}`);
      assert.equal(report.apple.characters[field][locale], length);
    }
    const bytes = Buffer.byteLength(appStore.keywords[locale], "utf8");
    assert.ok(bytes <= 100, `keywords[${locale}] = ${bytes} B`);
    assert.equal(report.apple.bytes.keywords[locale], bytes);
  }
  assert.equal(appStore.name["pl-PL"], "ALARM.SOIA");
  assert.equal(appStore.subtitle["pl-PL"], "Oficjalne ostrzeżenia KG PSP");
  await rejectsAfter((edit) => edit("app-store.json", (document) => { document.subtitle["en-GB"] = "x".repeat(31); }), /subtitle\[en-GB\]/u);
});

test("STORE-LIMITS Play: appName ≤30, shortDescription ≤80, fullDescription ≤4000 — pl-PL i en-GB", async () => {
  const report = await checkStoreData(root);
  const googlePlay = await data("google-play.json");

  assert.deepEqual(PLAY_CHARACTER_LIMITS, { appName: 30, shortDescription: 80, fullDescription: 4000, releaseNotes: 500 });
  for (const locale of LOCALES) {
    for (const [field, limit] of Object.entries(PLAY_CHARACTER_LIMITS)) {
      const length = [...googlePlay[field][locale]].length;
      assert.ok(length <= limit, `${field}[${locale}] = ${length} > ${limit}`);
      assert.equal(report.play.characters[field][locale], length);
    }
  }
  await rejectsAfter((edit) => edit("google-play.json", (document) => { document.shortDescription["pl-PL"] = "x".repeat(81); }), /shortDescription\[pl-PL\]/u);
});

test("STORE-LIMITS URL-e polityki, wsparcia i marketingu wskazują publicOrigin i istniejące pliki tras", async () => {
  const appStore = await data("app-store.json");
  const googlePlay = await data("google-play.json");

  assert.equal(appStore.privacyPolicyUrl, `${site.publicOrigin}${site.basePath}polityka-prywatnosci`);
  assert.equal(appStore.supportUrl, `${site.publicOrigin}${site.basePath}pomoc`);
  assert.equal(appStore.marketingUrl, `${site.publicOrigin}${site.basePath}`);
  assert.equal(googlePlay.privacyPolicyUrl, `${site.publicOrigin}${site.basePath}polityka-prywatnosci`);
  assert.equal(googlePlay.websiteUrl, `${site.publicOrigin}${site.basePath}`);
  for (const path of ["polityka-prywatnosci", "pomoc", ""]) {
    const route = site.routes.find((candidate) => candidate.path === path);
    assert.ok(route, `trasa ${path}`);
    await readFile(join(root, "site", route.file));
  }
  await rejectsAfter((edit) => edit("app-store.json", (document) => { document.privacyPolicyUrl = `${site.publicOrigin}/privacy`; }), /privacyPolicyUrl/u);
});

test("STORE-LIMITS słowa kluczowe: przecinki bez spacji, bez powtórzeń, bez nazw innych podmiotów ani nazwy aplikacji", async () => {
  const appStore = await data("app-store.json");

  for (const locale of LOCALES) {
    const keywords = appStore.keywords[locale];
    assert.doesNotMatch(keywords, /,\s|\s,/u, `keywords[${locale}]`);
    assert.doesNotMatch(keywords, /\bRCB\b/iu, `keywords[${locale}]`);
    assert.doesNotMatch(keywords, /soia/iu, `keywords[${locale}]`);
  }
  await rejectsAfter((edit) => edit("app-store.json", (document) => { document.keywords["pl-PL"] = "alert,RCB,powiat"; }), /RCB/u);
  await rejectsAfter((edit) => edit("app-store.json", (document) => { document.keywords["en-GB"] = "alerts, warnings"; }), /przecinki/u);
});

test("STORE-DECL Apple: 27 kodów UE, tylko IPHONE, dataCollected, Device ID + Other Data z celem App Functionality, usedForTracking=false, ageRating, DSA, encryption, Critical Alerts", async () => {
  const report = await checkStoreData(root);
  const declarations = await data("app-store-declarations.json");

  assert.equal(EU_27.length, 27);
  assert.deepEqual([...declarations.countries].sort(), [...EU_27].sort());
  assert.deepEqual(declarations.deviceFamilies, ["IPHONE"]);
  assert.equal(declarations.dataCollected, true);
  assert.deepEqual(report.appPrivacyTypes, ["Identifiers/Device ID", "Other Data/Other Data Types"]);
  for (const entry of declarations.appPrivacy) {
    assert.deepEqual(entry.purposes, ["App Functionality"]);
    assert.equal(entry.usedForTracking, false);
    assert.equal(entry.linkedToUser, true);
  }
  assert.equal(declarations.ageRating.proposed, "4+");
  assert.match(declarations.ageRating.alternative, /13\+/u);
  assert.equal(declarations.ageRating.decision, "KG PSP");
  assert.equal(declarations.dsa.traderStatus, "NON_TRADER");
  assert.equal(declarations.ageRating.questionnaire.medicalOrTreatmentInformation, "None");
  assert.equal(declarations.ageRating.decided, "4+");
  assert.equal(declarations.usesNonExemptEncryption, false);
  assert.equal(declarations.criticalAlertsRequest, "MPJHKAS7D9");
  assert.equal(declarations.releaseType, "MANUAL");
  assert.equal(declarations.price, "FREE");
  assert.equal(declarations.status, "RELEASED");
  await rejectsAfter((edit) => edit("app-store-declarations.json", (document) => { document.countries = document.countries.filter((code) => code !== "PL"); }), /27 państw/u);
  await rejectsAfter((edit) => edit("app-store-declarations.json", (document) => { document.appPrivacy[0].usedForTracking = true; }), /śledzenia/u);
});

test("STORE-DECL Play: 27 kodów UE, governmentApp, ads=false, newsApp=false, advertisingId=false, 18_PLUS bez ograniczania nieletnich, TOOLS, Data safety z Device IDs i App activity, encryptedInTransit, deletionMechanism", async () => {
  const report = await checkStoreData(root);
  const declarations = await data("google-play-declarations.json");

  assert.deepEqual([...declarations.countries].sort(), [...EU_27].sort());
  assert.equal(declarations.governmentApp, true);
  assert.equal(declarations.ads, false);
  assert.equal(declarations.requiresAccount, false);
  assert.equal(declarations.newsApp, false);
  assert.equal(declarations.financialFeatures, false);
  assert.equal(declarations.healthFeatures, false);
  assert.equal(declarations.advertisingId, false);
  assert.deepEqual(declarations.targetAudience, ["18_PLUS"]);
  assert.equal(declarations.restrictMinorAccess, false);
  assert.equal(declarations.category, "TOOLS");
  assert.match(declarations.contentRating.expected, /PEGI 3/u);
  assert.deepEqual(report.dataSafetyTypes, ["Device or other IDs", "App activity/Other actions"]);
  for (const entry of declarations.dataSafety.collected) {
    assert.equal(entry.required, true);
    assert.equal(entry.shared, false);
    assert.equal(entry.ephemeral, false);
    assert.deepEqual(entry.purposes, ["App functionality"]);
  }
  assert.equal(declarations.dataSafety.encryptedInTransit, true);
  assert.equal(declarations.dataSafety.deletionMechanism, true);
  assert.match(declarations.dataSafety.deletionNote, /\bIOD\b/u);
  assert.match(declarations.dataSafety.deletionNote, /brak kontrolki/u);
  assert.deepEqual(declarations.formFactors, ["PHONE"]);
  assert.deepEqual(declarations.publisher, site.publisher);
  await rejectsAfter((edit) => edit("google-play-declarations.json", (document) => { document.governmentApp = false; }), /governmentApp/u);
  await rejectsAfter((edit) => edit("google-play-declarations.json", (document) => { document.dataSafety.deletionNote = "cofnięcie zgody w aplikacji"; }), /deletionNote wskazującą IOD/u);
  await rejectsAfter((edit) => edit("google-play-declarations.json", (document) => { document.dataSafety.deletionNote = "wniosek do IOD"; }), /brak kontrolki/u);
  await rejectsAfter((edit) => edit("google-play-declarations.json", (document) => { document.targetAudience = ["13_15", "18_PLUS"]; }), /targetAudience/u);
});

test("STORE-DECL deklaracje są spójne z data/dane-przekazywane.json: token push → Device ID / Device or other IDs, TERYT → Other Data / App activity, brak lokalizacji i analityki", async () => {
  const report = await checkStoreData(root);
  const facts = await data("dane-przekazywane.json");

  assert.match(facts.zadania[0].pola.join(" "), /token/iu);
  assert.match(facts.zadania[0].pola.join(" "), /TERYT/u);
  assert.match(facts.brak.join(" "), /lokalizacj/iu);
  assert.match(facts.brak.join(" "), /analityk/iu);
  assert.ok(report.consistency.some((message) => /Device ID/u.test(message)));
  assert.ok(report.consistency.some((message) => /Device or other IDs/u.test(message)));
  assert.ok(report.consistency.some((message) => /App activity/u.test(message)));
  assert.ok(report.consistency.some((message) => /lokalizacji/u.test(message)));
  assert.ok(report.consistency.length >= 10);
  await rejectsAfter((edit) => edit("app-store-declarations.json", (document) => { document.appPrivacy = document.appPrivacy.filter((entry) => entry.type !== "Identifiers/Device ID"); }), /Device ID/u);
  await rejectsAfter((edit) => edit("google-play-declarations.json", (document) => { document.dataSafety.collected.push({ type: "Location/Approximate location", required: false, shared: false, ephemeral: false, purposes: ["App functionality"] }); }), /Location/u);
});

test("STORE-STATUS cykl życia: App Store RELEASED z adresem produktu, Play SUBMITTED_FOR_REVIEW bez adresu; status obcy, rozjazd wpis↔deklaracje i adres przed wydaniem odrzucane", async () => {
  assert.equal((await data("app-store.json")).status, "RELEASED");
  assert.equal((await data("google-play.json")).status, "SUBMITTED_FOR_REVIEW");
  assert.equal(site.storeUrls.appStore, "https://apps.apple.com/pl/app/alarm-soia/id6805916290");
  assert.equal(site.storeUrls.googlePlay, null);
  await rejectsAfter((edit) => edit("google-play.json", (document) => { document.status = "PUBLISHED"; }), /status musi być jednym z/u);
  await rejectsAfter((edit) => edit("app-store-declarations.json", (document) => { document.status = "SUBMITTED_FOR_REVIEW"; }), /ten sam status/u);
  await rejectsAfter((edit) => edit("site.json", (document) => { document.storeUrls.googlePlay = "https://play.google.com/store/apps/details?id=info.soia.alarm"; }), /musi być null/u);
  await rejectsAfter((edit) => edit("site.json", (document) => { document.storeUrls.appStore = "https://apps.apple.com/app/id123"; }), /stroną produktu/u);
  await rejectsAfter((edit) => edit("site.json", (document) => { document.storeUrls.appStore = null; }), /stroną produktu/u);
});
