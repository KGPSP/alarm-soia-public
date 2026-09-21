import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Kontrola publicznej witryny ALARM.SOIA. Parametry tras, origin i wydawcy pochodzą
// z data/site.json; fakty o danych opuszczających telefon — z data/dane-przekazywane.json.

const SITE_DIRECTORY = "site";
const DATA_DIRECTORY = "data";
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules"]);
const TEXT_EXTENSIONS = new Set([
  "", ".css", ".html", ".js", ".json", ".md", ".mjs", ".svg", ".txt", ".xml", ".yaml", ".yml",
]);

const forbiddenPagePatterns = [
  /<form\b/iu,
  /<script\b/iu,
  /<iframe\b/iu,
  /<object\b/iu,
  /<embed\b/iu,
  /@import\b/iu,
  /rel=["'](?:preconnect|dns-prefetch|prefetch|preload)["']/iu,
  /(?:google-analytics|googletagmanager|fonts\.googleapis|fonts\.gstatic|segment\.com|sentry\.io|hotjar|matomo|plausible\.io|facebook\.net|doubleclick)/iu,
];

// Wzorce zakazane w całym repozytorium. Zapis z sekwencjami ucieczki sprawia,
// że tekst źródłowy tego pliku sam ich nie spełnia.
const forbiddenRepositoryPatterns = [
  /\/Users\//u,
  /KGPSP\/alert\.soia\.info/u,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  // `id-token: write` w workflow Pages to nazwa uprawnienia OIDC, nie sekret — stąd wykluczenie
  // słowa poprzedzonego myślnikiem lub znakiem słowa (np. `id-token:`), reszta jak dotąd.
  /(?<![\w-])(?:secret|token|password)\s*[:=]/iu,
  /\bAKIA[0-9A-Z]{16}\b/u,
];
const forbiddenFileNames = [/^\.env/u, /(?:^|\/)\.env/u, /eas\.json$/u, /credentials?/iu, /\.soiaaut[h]$/u, /\.p8$/u, /\.p12$/u, /\.keystore$/u];

// Pozostałości bliźniaczej witryny — nieprawdziwe dla ALARM.SOIA. Nawiasy kwadratowe
// rozbijają dopasowanie do własnego tekstu źródłowego.
const twinLeftoverPatterns = [
  /T[O]TP/u,
  /\.soiaaut[h]\b/u,
  /Authenticat[o]r/u,
  /kody jednorazow[e]/iu,
  /soia-authenticator-publi[c]/u,
  /brak transmisji do KG ?PS[P]/iu,
  /nie zbiera danych użytkownik[a]/iu,
];

const requiredColorTokens = [
  "#B42318", "#1C5BB0", "#E8F0FA", "#16181C", "#4A525C", "#FFFFFF", "#F4F6F8", "#EEF0F2", "#D7DBE0",
  "#16703F", "#B54708", "#8A6116", "#51606F",
];
const contrastPairs = [
  ["#16181C", "#FFFFFF"],
  ["#16181C", "#F4F6F8"],
  ["#16181C", "#E8F0FA"],
  ["#4A525C", "#FFFFFF"],
  ["#4A525C", "#F4F6F8"],
  ["#4A525C", "#EEF0F2"],
  ["#1C5BB0", "#FFFFFF"],
  ["#1C5BB0", "#F4F6F8"],
  ["#FFFFFF", "#1C5BB0"],
  ["#FFFFFF", "#B42318"],
  ["#B42318", "#F4F6F8"],
  ["#16703F", "#F4F6F8"],
  ["#B54708", "#F4F6F8"],
  ["#16181C", "#F28C28"],
];

const fixedPngRules = [
  { path: "assets/google-play/icon-512.png", width: 512, height: 512, colorTypes: [2, 6] },
  { path: "assets/google-play/feature-graphic.png", width: 1024, height: 500, colorTypes: [2] },
  { path: "assets/og/og-image.png", width: 1200, height: 630, colorTypes: [2, 6] },
];
const screenshotSets = [
  { id: "googlePhoneScreenshots", directory: "assets/google-play/phone/", width: 1080, height: 1920, minimum: 4, colorTypes: [2] },
  { id: "iphoneScreenshots", directory: "assets/app-store/iphone-6.9/", width: 1320, height: 2868, minimum: 4, colorTypes: [2] },
  { id: "iphone65Screenshots", directory: "assets/app-store/iphone-6.5/", width: 1284, height: 2778, minimum: 4, colorTypes: [2] },
];

// Słowa-klucze polityki prywatności wyprowadzane z pól rejestracji push.
const fieldKeywordRules = [
  { field: /token/iu, keyword: /token/iu, label: "token" },
  { field: /platform/iu, keyword: /platform/iu, label: "platform" },
  { field: /environment/iu, keyword: /environment/u, label: "environment" },
  { field: /wersja/iu, keyword: /wersj/iu, label: "wersj" },
  { field: /TERYT/u, keyword: /TERYT/u, label: "TERYT" },
  { field: /priorytet/iu, keyword: /priorytet/iu, label: "priorytet" },
];
const missingKeywordRules = [
  { entry: /lokalizacj/iu, keyword: /lokalizacj/iu, label: "lokalizacj" },
  { entry: /analityk/iu, keyword: /analityk/iu, label: "analityk" },
  { entry: /awari/iu, keyword: /awari/iu, label: "awari" },
  { entry: /konto/iu, keyword: /kont[ao]\b/iu, label: "konto" },
  { entry: /mikrofon/iu, keyword: /mikrofon/iu, label: "mikrofon" },
  { entry: /kamera/iu, keyword: /latark/iu, label: "latark" },
];
const platformKeywordRules = [
  { id: "apple-maps", keyword: /Apple Maps/u, label: "Apple Maps" },
  { id: "apns-fcm", keyword: /APNs/u, label: "APNs" },
  { id: "apns-fcm", keyword: /FCM/u, label: "FCM" },
];

async function collectFiles(root, directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    const path = relative(root, absolute).split(sep).join("/");
    const stats = await lstat(absolute);
    if (stats.isSymbolicLink()) throw new Error(`Niedozwolony symlink: ${path}`);
    if (stats.isDirectory()) files.push(...(await collectFiles(root, absolute)));
    else if (stats.isFile()) files.push(path);
  }
  return files.sort();
}

async function readJson(root, name) {
  const text = await readFile(join(root, DATA_DIRECTORY, name), "utf8");
  return JSON.parse(text);
}

function canonicalFor(site, route) {
  return `${site.publicOrigin}${site.basePath}${route.path}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function readPngHeader(buffer, path) {
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`Nieprawidłowy nagłówek PNG: ${path}`);
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), colorType: buffer[25] };
}

function luminance(hex) {
  const channels = hex
    .slice(1)
    .match(/.{2}/gu)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function contrast(left, right) {
  const [lighter, darker] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function isTextFile(path) {
  return TEXT_EXTENSIONS.has(extname(path).toLowerCase());
}

function attributeValues(fragment, attribute) {
  const values = [];
  const pattern = new RegExp(`\\b${attribute}=["']([^"']*)["']`, "giu");
  for (const match of fragment.matchAll(pattern)) values.push(match[1]);
  return values;
}

// absolutePrefix: strona 404 jest serwowana pod dowolną (także zagnieżdżoną) ścieżką, więc jej linki
// muszą zaczynać się od basePath (np. "/alarm-soia-public/"); pozostałe strony używają linków względnych.
function internalTarget(siteRoot, routeByPath, currentFile, value, absolutePrefix = null) {
  let clean = value.split("#")[0].split("?")[0];
  if (clean === "" || /^(?:mailto:|tel:|https?:\/\/)/iu.test(clean)) return null;
  if (clean.startsWith("/")) {
    if (!absolutePrefix) throw new Error(`Link bezwzględny zamiast względnego: ${value} w ${currentFile}`);
    if (!clean.startsWith(absolutePrefix)) throw new Error(`Link od korzenia poza basePath ${absolutePrefix}: ${value} w ${currentFile}`);
    clean = clean.slice(absolutePrefix.length);
    if (clean === "") return resolve(siteRoot, "index.html");
  } else if (absolutePrefix) {
    throw new Error(`Link względny na stronie błędu serwowanej pod dowolną ścieżką: ${value} w ${currentFile}`);
  }
  if (clean === "." || clean === "./") return resolve(siteRoot, "index.html");
  if (/\.html$/iu.test(clean)) throw new Error(`Link z rozszerzeniem .html: ${value} w ${currentFile}`);
  const routeFile = routeByPath.get(clean);
  if (routeFile) return resolve(siteRoot, routeFile);
  if (!extname(clean)) throw new Error(`Link do nieznanej trasy: ${value} w ${currentFile}`);
  return resolve(dirname(join(siteRoot, currentFile)), clean);
}

function checkPageStructure(site, route, html, file) {
  const problems = [];
  const canonical = canonicalFor(site, route);
  if (!/^<!doctype html>/iu.test(html)) problems.push("brak doctype");
  if (!html.includes(`<html lang="${site.language}">`)) problems.push(`brak lang=${site.language}`);
  if (!/<meta charset="utf-8">/iu.test(html)) problems.push("brak meta charset");
  if (!/<meta name="viewport" content="width=device-width, initial-scale=1">/u.test(html)) problems.push("brak meta viewport");
  if (!/<meta name="description" content="[^"]+">/u.test(html)) problems.push("brak opisu meta");
  const title = html.match(/<title>([^<]+)<\/title>/u)?.[1] ?? "";
  if (!title.includes(site.productName)) problems.push("tytuł bez nazwy produktu");
  if (!html.includes(`<link rel="canonical" href="${canonical}">`)) problems.push(`nieprawidłowy canonical (oczekiwano ${canonical})`);
  if (!html.includes(`<meta property="og:url" content="${canonical}">`)) problems.push("og:url różny od canonical");
  if (!/<meta property="og:title" content="[^"]+">/u.test(html)) problems.push("brak og:title");
  if (!/<meta property="og:description" content="[^"]+">/u.test(html)) problems.push("brak og:description");
  if (!html.includes(`<meta property="og:image" content="${site.publicOrigin}${site.basePath}assets/og/og-image.png">`)) problems.push("og:image musi być absolutny z publicOrigin + basePath");
  const linkPrefix = route.noindex ? site.basePath : "";
  if (!html.includes(`<link rel="icon" href="${linkPrefix}assets/branding/alarm-soia-mark.svg" type="image/svg+xml">`)) problems.push("brak favicon SVG");
  if (!html.includes('<a class="skip-link" href="#tresc">')) problems.push("brak skip-linku");
  if (!html.includes('<main id="tresc"')) problems.push("brak main#tresc");
  if (!/<nav class="site-nav" aria-label="[^"]+">/u.test(html)) problems.push("brak nawigacji głównej");
  if (!/<nav class="footer-links" aria-label="[^"]+">/u.test(html)) problems.push("brak nawigacji stopki");
  if (!html.includes('<span class="brand-name">')) problems.push("brak marki w nagłówku");
  const hasNoindex = /<meta name="robots" content="noindex">/u.test(html);
  if (Boolean(route.noindex) !== hasNoindex) problems.push(route.noindex ? "brak noindex" : "niedozwolony noindex");
  const currentHref = route.path === "" ? "./" : route.path;
  const currentMarks = html.match(/aria-current="page"/gu)?.length ?? 0;
  if (route.noindex) {
    if (currentMarks !== 0) problems.push("strona 404 nie może mieć aria-current");
  } else if (!html.includes(`href="${currentHref}" aria-current="page"`)) {
    problems.push(`brak aria-current dla href="${currentHref}"`);
  }
  for (const other of site.routes) {
    if (other.noindex) continue;
    const href = other.path === "" ? linkPrefix || "./" : `${linkPrefix}${other.path}`;
    if (!new RegExp(`<a href="${escapeRegExp(href)}"(?: aria-current="page")?>`, "u").test(html)) {
      problems.push(`brak linku nawigacyjnego do ${href}`);
    }
  }
  return problems;
}

function pageRuntimeUrls(html) {
  const urls = [];
  for (const tag of html.matchAll(/<(?:img|script|link|source|iframe|video|audio|picture)\b[^>]*>/giu)) {
    // <link rel="canonical"|"alternate"…> wskazuje adresy, nie ładuje zasobów.
    if (/^<link\b/iu.test(tag[0]) && /\brel=["'](?:canonical|alternate|author|license|help|next|prev)["']/iu.test(tag[0])) continue;
    for (const value of [...attributeValues(tag[0], "src"), ...attributeValues(tag[0], "href"), ...attributeValues(tag[0], "srcset")]) {
      if (/^(?:https?:)?\/\//iu.test(value) || /^data:/iu.test(value)) urls.push(value);
    }
  }
  return urls;
}

export async function checkSite(repositoryRoot) {
  const root = resolve(repositoryRoot);
  const siteRoot = join(root, SITE_DIRECTORY);
  const site = await readJson(root, "site.json");
  const facts = await readJson(root, "dane-przekazywane.json");
  if (site.schemaVersion !== 1) throw new Error("data/site.json: nieznany schemaVersion");
  if (!/^https:\/\/[a-z0-9.-]+$/u.test(site.publicOrigin)) throw new Error("data/site.json: publicOrigin musi być https i bez ukośnika końcowego");
  if (typeof site.basePath !== "string" || !/^\/(?:[a-z0-9-]+\/)*$/u.test(site.basePath)) throw new Error("data/site.json: basePath musi zaczynać się i kończyć ukośnikiem (np. \"/\" albo \"/alarm-soia-public/\")");
  if (!Array.isArray(site.routes) || site.routes.length === 0) throw new Error("data/site.json: brak tras");
  const files = await collectFiles(root);
  const siteFiles = files.filter((path) => path.startsWith(`${SITE_DIRECTORY}/`)).map((path) => path.slice(SITE_DIRECTORY.length + 1));
  const routeByPath = new Map(site.routes.map((route) => [route.path, route.file]));
  const approvedEmails = new Set([site.publisher.supportEmail, site.publisher.privacyEmail]);
  const privacyEmailPages = new Set(["polityka-prywatnosci.html", "dane-i-prywatnosc.html"]);

  const forbiddenMatches = [];
  const twinLeftovers = [];
  const externalRuntimeUrls = [];
  const stylesheetAssets = new Set();

  for (const file of files) {
    if (forbiddenFileNames.some((pattern) => pattern.test(file))) forbiddenMatches.push(`${file}:niedozwolona nazwa`);
    if (!isTextFile(file)) continue;
    const text = await readFile(join(root, file), "utf8");
    for (const pattern of forbiddenRepositoryPatterns) {
      if (pattern.test(text)) forbiddenMatches.push(`${file}:${pattern}`);
    }
    for (const pattern of twinLeftoverPatterns) {
      if (pattern.test(text)) twinLeftovers.push(`${file}:${pattern}`);
    }
    const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu) ?? [];
    for (const email of emails) {
      if (!approvedEmails.has(email.toLowerCase())) forbiddenMatches.push(`${file}:niedozwolony e-mail ${email}`);
    }
  }

  const pages = new Map();
  for (const route of site.routes) {
    if (!/^[a-z0-9-]+\.html$/u.test(route.file)) throw new Error(`Trasa musi być płaskim plikiem .html: ${route.file}`);
    if (route.path !== "" && route.path !== route.file.replace(/\.html$/u, "")) throw new Error(`Ścieżka trasy niezgodna z plikiem: ${route.path}`);
    if (!siteFiles.includes(route.file)) throw new Error(`Brak wymaganej strony: ${SITE_DIRECTORY}/${route.file}`);
    const html = await readFile(join(siteRoot, route.file), "utf8");
    pages.set(route.file, html);
    const problems = checkPageStructure(site, route, html, route.file);
    if (problems.length > 0) throw new Error(`${route.file}: ${problems.join("; ")}`);
    const stylesheetMatches = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/gu)];
    if (stylesheetMatches.length !== 1) throw new Error(`Dokładnie jeden lokalny arkusz stylów: ${route.file}`);
    stylesheetAssets.add(route.noindex && stylesheetMatches[0][1].startsWith(site.basePath) ? stylesheetMatches[0][1].slice(site.basePath.length) : stylesheetMatches[0][1]);
    for (const pattern of forbiddenPagePatterns) {
      if (pattern.test(html)) forbiddenMatches.push(`${route.file}:${pattern}`);
    }
    externalRuntimeUrls.push(...pageRuntimeUrls(html).map((url) => `${route.file}:${url}`));
    for (const value of [...attributeValues(html, "href"), ...attributeValues(html, "src")]) {
      const target = internalTarget(siteRoot, routeByPath, route.file, value, route.noindex ? site.basePath : null);
      if (!target) continue;
      try {
        const stats = await lstat(target);
        if (!stats.isFile()) throw new Error();
      } catch {
        throw new Error(`Niedziałający link ${value} w ${route.file}`);
      }
    }
    const hasPrivacyEmail = html.includes(site.publisher.privacyEmail);
    if (hasPrivacyEmail && !privacyEmailPages.has(route.file)) forbiddenMatches.push(`${route.file}:e-mail IOD poza polityką`);
  }
  for (const [file, mustContain] of [
    ["pomoc.html", `mailto:${site.publisher.supportEmail}`],
    ["polityka-prywatnosci.html", `mailto:${site.publisher.privacyEmail}`],
    ["index.html", `mailto:${site.publisher.supportEmail}`],
  ]) {
    if (!pages.get(file)?.includes(mustContain)) throw new Error(`${file}: brak ${mustContain}`);
  }

  // robots.txt i sitemap.xml
  const robots = await readFile(join(siteRoot, "robots.txt"), "utf8").catch(() => { throw new Error("Brak site/robots.txt"); });
  if (!/^Allow: \/$/mu.test(robots) || !robots.includes(`Sitemap: ${site.publicOrigin}${site.basePath}sitemap.xml`)) throw new Error("robots.txt: wymagane Allow: / i Sitemap z publicOrigin + basePath");
  const sitemap = await readFile(join(siteRoot, "sitemap.xml"), "utf8").catch(() => { throw new Error("Brak site/sitemap.xml"); });
  const sitemapRoutes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]);
  const expectedSitemap = site.routes.filter((route) => !route.noindex).map((route) => canonicalFor(site, route));
  if (JSON.stringify(sitemapRoutes) !== JSON.stringify(expectedSitemap)) {
    throw new Error(`sitemap.xml niezgodny z trasami (oczekiwano: ${expectedSitemap.join(", ")})`);
  }

  // Arkusz stylów z fingerprintem
  if (stylesheetAssets.size !== 1) throw new Error("Wszystkie strony muszą używać tego samego arkusza stylów.");
  const stylesheetAsset = [...stylesheetAssets][0];
  const fingerprintMatch = stylesheetAsset.match(/^assets\/css\/alarm-([a-f0-9]{8})\.css$/u);
  if (!fingerprintMatch) throw new Error("Arkusz stylów musi być względny i mieć fingerprint: assets/css/alarm-<8 hex>.css");
  const cssBuffer = await readFile(join(siteRoot, stylesheetAsset));
  const cssFingerprint = createHash("sha256").update(cssBuffer).digest("hex");
  if (!cssFingerprint.startsWith(fingerprintMatch[1])) throw new Error("Fingerprint w nazwie arkusza nie odpowiada jego treści.");
  const cssFiles = siteFiles.filter((path) => path.startsWith("assets/css/"));
  if (cssFiles.length !== 1) throw new Error("W assets/css może być tylko jeden arkusz (stare fingerprinty usuwaj).");
  const css = cssBuffer.toString("utf8");
  if (/url\(\s*["']?(?:https?:)?\/\//iu.test(css) || /@import\b/iu.test(css)) throw new Error("CSS nie może ładować zasobów zewnętrznych.");
  const screenshotRule = css.match(/\.screenshots img\s*\{([^}]*)\}/u)?.[1] ?? "";
  if (
    !/width:\s*100%/u.test(screenshotRule) ||
    !/height:\s*auto/u.test(screenshotRule) ||
    !/aspect-ratio:\s*9\s*\/\s*16/u.test(screenshotRule) ||
    !/object-fit:\s*contain/u.test(screenshotRule)
  ) {
    throw new Error("Grafiki sklepowe muszą zachowywać proporcje 9:16.");
  }
  for (const token of requiredColorTokens) {
    if (!css.toUpperCase().includes(token)) throw new Error(`Brak kanonicznego koloru: ${token}`);
  }
  const contrastReport = contrastPairs.map(([foreground, background]) => ({ foreground, background, ratio: Number(contrast(foreground, background).toFixed(2)) }));
  for (const pair of contrastReport) {
    if (pair.ratio < 4.5) throw new Error(`Kontrast poniżej WCAG AA: ${pair.foreground}/${pair.background} = ${pair.ratio}`);
  }

  // Grafiki PNG — wymiary i typ koloru z nagłówka
  const pngs = {};
  const knownPngs = new Set();
  for (const rule of fixedPngRules) {
    if (!siteFiles.includes(rule.path)) throw new Error(`Brak grafiki: ${rule.path}`);
    const header = readPngHeader(await readFile(join(siteRoot, rule.path)), rule.path);
    if (header.width !== rule.width || header.height !== rule.height || !rule.colorTypes.includes(header.colorType)) {
      throw new Error(`Nieprawidłowy format grafiki: ${rule.path} (${header.width}×${header.height}, typ ${header.colorType}; oczekiwano ${rule.width}×${rule.height}, typ ${rule.colorTypes.join("/")})`);
    }
    pngs[rule.path] = header;
    knownPngs.add(rule.path);
  }
  const screenshotCounts = {};
  for (const set of screenshotSets) {
    const members = siteFiles.filter((path) => path.startsWith(set.directory) && path.endsWith(".png"));
    if (members.length < set.minimum) throw new Error(`Za mało zrzutów w ${set.directory}: ${members.length} < ${set.minimum}`);
    for (const path of members) {
      const header = readPngHeader(await readFile(join(siteRoot, path)), path);
      if (header.width !== set.width || header.height !== set.height || !set.colorTypes.includes(header.colorType)) {
        throw new Error(`Nieprawidłowy format zrzutu: ${path} (${header.width}×${header.height}, typ ${header.colorType}; oczekiwano ${set.width}×${set.height}, typ ${set.colorTypes.join("/")})`);
      }
      pngs[path] = header;
      knownPngs.add(path);
    }
    screenshotCounts[set.id] = members.length;
  }
  for (const path of siteFiles.filter((file) => file.endsWith(".png"))) {
    if (!knownPngs.has(path)) throw new Error(`Grafika bez reguły kontroli: ${path}`);
  }
  const tabletAssets = files.filter((path) => /ipad|tablet|chromeos|android-xr/iu.test(path)).length;
  if (tabletAssets > 0) throw new Error("Repozytorium zawiera zasoby tabletowe.");
  if (!siteFiles.includes("assets/branding/alarm-soia-mark.svg")) throw new Error("Brak znaku assets/branding/alarm-soia-mark.svg");

  // Pokrycie faktów w polityce prywatności
  const policy = pages.get("polityka-prywatnosci.html");
  const summary = pages.get("dane-i-prywatnosc.html");
  const registration = facts.zadania.find((task) => task.id === "rejestracja-push") ?? facts.zadania[0];
  const requiredKeywords = [];
  for (const field of registration.pola) {
    const rule = fieldKeywordRules.find((candidate) => candidate.field.test(field));
    if (!rule) throw new Error(`Pole rejestracji bez reguły słowa-klucza: ${field}`);
    requiredKeywords.push({ source: field, keyword: rule.keyword, label: rule.label });
  }
  for (const entry of facts.brak ?? []) {
    const rule = missingKeywordRules.find((candidate) => candidate.entry.test(entry));
    if (rule) requiredKeywords.push({ source: entry, keyword: rule.keyword, label: rule.label });
  }
  for (const service of facts.uslugi_platformowe ?? []) {
    for (const rule of platformKeywordRules.filter((candidate) => candidate.id === service.id)) {
      requiredKeywords.push({ source: service.id, keyword: rule.keyword, label: rule.label });
    }
  }
  const host = facts.host.replace(/^https?:\/\//u, "");
  const administrator = facts.administrator.split(",")[0].trim();
  requiredKeywords.push(
    { source: "host", keyword: new RegExp(escapeRegExp(host), "u"), label: host },
    { source: "usługi Apple", keyword: /Apple/u, label: "Apple" },
    { source: "brak analityki", keyword: /analityk/iu, label: "analityk" },
    { source: "iod", keyword: new RegExp(escapeRegExp(facts.iod), "u"), label: facts.iod },
    { source: "kontakt", keyword: new RegExp(escapeRegExp(facts.kontakt), "u"), label: facts.kontakt },
    { source: "usunięcie danych", keyword: /usun/iu, label: "usun" },
    { source: "administrator", keyword: new RegExp(escapeRegExp(administrator), "u"), label: administrator },
    { source: "retencja", keyword: /cofni/iu, label: "cofni" },
    { source: "okno historii", keyword: /48 godzin/u, label: "48 godzin" },
  );
  const missing = requiredKeywords.filter((entry) => !entry.keyword.test(policy)).map((entry) => `${entry.label} (${entry.source})`);
  if (missing.length > 0) throw new Error(`Polityka prywatności nie pokrywa: ${missing.join(", ")}`);
  for (const keyword of [/token/iu, /TERYT/u, /priorytet/iu, /Apple/u, /href="polityka-prywatnosci"/u, /lokalizacj/iu]) {
    if (!keyword.test(summary)) throw new Error(`Strona Dane i prywatność nie zawiera ${keyword}`);
  }

  if (forbiddenMatches.length > 0) throw new Error(forbiddenMatches.join(", "));
  if (twinLeftovers.length > 0) throw new Error(`Pozostałości bliźniaka: ${twinLeftovers.join(", ")}`);
  if (externalRuntimeUrls.length > 0) throw new Error(`Zewnętrzne zasoby runtime: ${externalRuntimeUrls.join(", ")}`);

  return {
    routeCount: site.routes.length,
    language: site.language,
    publicOrigin: site.publicOrigin,
    basePath: site.basePath,
    stylesheetAsset,
    cssFingerprint: fingerprintMatch[1],
    screenshotAspectRatio: "9 / 16",
    contrastMinimum: Math.min(...contrastReport.map((pair) => pair.ratio)),
    contrastPairs: contrastReport,
    ...screenshotCounts,
    pngs,
    tabletAssets,
    sitemapRoutes,
    privacyFacts: {
      required: [...new Set(requiredKeywords.map((entry) => entry.label))],
      missing,
    },
    externalRuntimeUrls,
    forbiddenMatches,
    twinLeftovers,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const report = await checkSite(root);
    console.log(JSON.stringify({ ok: true, ...report }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exitCode = 1;
  }
}
