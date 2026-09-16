# ALARM.SOIA — strona publiczna

Oficjalne informacje, polityka prywatności, pomoc oraz materiały sklepowe dla aplikacji ALARM.SOIA
wydawanej przez Komendę Główną Państwowej Straży Pożarnej.

Strona produkcyjna (GitHub Pages): <https://kgpsp.github.io/alarm-soia-public/>

Wzorzec strukturalny: publiczna strona bliźniaczej aplikacji KG PSP (statyczny HTML, zero
zależności, skrypt kontrolny w Node). Treści są własne i wynikają z faktów o aplikacji ALARM.SOIA
zapisanych w `data/dane-przekazywane.json`.

## Granica publikacji

To repozytorium nie zawiera kodu aplikacji mobilnej, konfiguracji EAS, kluczy, poświadczeń, logów
urządzeń ani historii prywatnego repozytorium. Zawiera wyłącznie statyczny kod witryny, publiczne
dokumenty i przygotowane materiały sklepowe.

Aplikacja jest przeznaczona na iPhone oraz telefony z Androidem; na tabletach z Androidem daje się
zainstalować, ale materiały sklepowe dotyczą telefonów. Repozytorium nie zawiera zrzutów dla iPada
ani tabletów z Androidem (patrz „Decyzje przed wysyłką”).

## Układ

| Ścieżka | Zawartość |
|---|---|
| `site/` | katalog publikowany 1:1 — płaskie pliki `.html` (`pomoc.html` → `/pomoc`), `404.html`, `robots.txt`, `sitemap.xml`, `assets/` |
| `site/assets/css/alarm-<8 hex>.css` | jedyny arkusz stylów; nazwa = pierwsze 8 znaków SHA-256 treści (ochrona przed starym cache) |
| `site/assets/` | znak SVG, ikona 512, grafika promocyjna 1024×500, obraz OG 1200×630, zrzuty App Store (1320×2868) i Google Play (1080×1920) |
| `data/site.json` | origin publiczny, ścieżka bazowa, lista tras, wydawca, adresy sklepów (puste do publikacji) |
| `data/dane-przekazywane.json` | fakty o danych opuszczających telefon — jedyne źródło prawdy dla polityki prywatności |
| `data/app-store.json`, `data/app-store-declarations.json` | wpis i deklaracje App Store Connect (pl-PL + en-GB) |
| `data/google-play.json`, `data/google-play-declarations.json` | wpis i deklaracje Play Console (pl-PL + en-GB) |
| `scripts/` | `check-site.mjs` (witryna), `check-store-data.mjs` (pakiet sklepowy) i ich testy `node --test` |

Linki wewnętrzne w HTML są względne i bez rozszerzeń (`href="pomoc"`, `href="assets/…"`),
a `canonical`, `og:url`, `sitemap.xml` i `robots.txt` są absolutne z `publicOrigin`. Jedyny wyjątek
to `404.html`: hosting serwuje ją pod dowolną, także zagnieżdżoną ścieżką (`/pomoc/x`), więc jej
linki i arkusz stylów zaczynają się od `basePath` (`href="/alarm-soia-public/pomoc"`,
`href="/alarm-soia-public/assets/…"`) — skrypt kontrolny wymaga tego dla trasy z `noindex`
i zabrania linków od korzenia na pozostałych.

## Kontrola lokalna

```sh
npm ci
npm test
npm run check
```

`npm test` uruchamia testy nazwane identyfikatorami kryteriów akceptacji (`SITE-ROUTES`, `SITE-CHECK`,
`ASSETS-DIMS`, `PRIVACY-FACTS`, `NO-TWIN-LEFTOVERS`, `STORE-LIMITS`, `STORE-DECL`). `npm run check`
wypisuje raport JSON i kończy się kodem 1 przy pierwszym naruszeniu.

Witryna nie ma zależności produkcyjnych ani deweloperskich, analityki, formularzy, skryptów,
zewnętrznych fontów ani plików cookie. Wymagany Node ≥ 24 (`node --test`, ESM, `fs.cp`).

## Publikacja: GitHub Pages

Strona żyje pod `https://kgpsp.github.io/alarm-soia-public/` — tak jak bliźniacza witryna drugiej
aplikacji KG PSP (decyzja Michała z 2026-09-16, zastępuje pierwsze wdrożenie na EAS Hosting z tego
samego dnia).
Wdraża ją workflow `.github/workflows/pages.yml`: na każdy push do `main` uruchamia `npm ci`,
`npm test` i `npm run check`, po czym wysyła katalog `site/` przez `actions/upload-pages-artifact`
i `actions/deploy-pages` (ustawienie Pages: „GitHub Actions”, bez Jekylla, HTTPS wymuszone).
Nie ma osobnego kroku po stronie człowieka — merge do `main` = publikacja; podgląd zmian przed
merge'em daje `validate.yml` na pull requeście plus lokalny serwer statyczny na `site/`.

`publicOrigin` (`https://kgpsp.github.io`) i `basePath` (`/alarm-soia-public/`) w `data/site.json`
są źródłem dla `canonical`, `og:url`, `og:image`, `sitemap.xml`, `robots.txt`, linków w `404.html`
i adresów w `data/app-store.json` / `data/google-play.json` — skrypt kontrolny wymusza zgodność.
Adres polityki prywatności jest kontraktem zewnętrznym (stała w aplikacji, wpisy w konsolach):
zmiana origin lub ścieżki = nowa wersja aplikacji i edycja obu konsol.

### Alternatywa: EAS Hosting

Kod nie zależy od hostingu — linki wewnętrzne są względne, tylko `404.html` używa `basePath`.
Powrót na EAS Hosting (`https://alarm-soia.expo.app`, projekt `@kg-psp/alarm-soia`) wymaga
`app.json` ze `slug`/`owner`/`extra.eas.projectId`, podmiany `publicOrigin` na
`https://alarm-soia.expo.app` i `basePath` na `/` w `data/site.json`, regeneracji wartości
absolutnych (`grep -rl kgpsp.github.io/alarm-soia-public site data`) oraz
`eas deploy --export-dir site --prod`. Ta ścieżka została wykonana 2026-09-16 i wycofana tego
samego dnia (deployment usunięty).

## Decyzje przed wysyłką

Elementy oznaczone w danych jako `DO_DECYZJI` / „projekt” wymagają decyzji KG PSP (służby prawne,
IOD, Biuro Ochrony Ludności) przed wpisaniem do konsol sklepów:

1. **Status tradera DSA (Apple)** — `data/app-store-declarations.json` → `dsa.traderStatus`;
   bezpłatna usługa publiczna ma przesłanki „non-trader”, ale definicja DSA obejmuje osoby prawne
   „publicly owned”; opinia służb prawnych KG PSP/IOD.
2. **Age Rating 4+ vs 13+ (Apple)** — rozdział „Pierwsza pomoc” poradnika PDF może oznaczać
   „Medical or Treatment Information: Infrequent” (13+); `ageRating.proposed` = 4+.
3. **Content Rights poradnika PDF (Apple)** — „Poradnik bezpieczeństwa” MSWiA, MON i RCB (2025):
   potwierdzić prawo do dystrybucji w aplikacji przed oświadczeniem o prawach do treści osób trzecich.
4. **Publiczny telefon KG PSP w profilu dewelopera Google Play** — pole wymagane i publiczne dla
   konta organizacji; `data/google-play-declarations.json` → `developerProfile.phone`.
5. **Pismo do deklaracji „Government apps” (Google Play)** — dokument KG PSP na papierze firmowym
   z danymi kontaktowymi do weryfikacji; konto organizacji w domenie `kg.straz.gov.pl`.
6. **Hosting** — rozstrzygnięte 2026-09-16: GitHub Pages pod `https://kgpsp.github.io/alarm-soia-public/`
   (decyzja Michała; pierwsze wdrożenie na EAS Hosting `alarm-soia.expo.app` z tego samego dnia
   wycofane, deployment usunięty, `app.json` usunięty z repo). Adres polityki w aplikacji i w konsolach
   wskazuje GitHub Pages; zmiana origin = nowa wersja aplikacji i edycja obu konsol.
7. **Zrzuty tabletów Android (opcjonalne)** — aplikacja jest dostępna na tabletach Android
   (`supports-screens`); zrzuty 7"/10" nie są wymagane do publikacji, ale Play może je promować.
8. **Odświeżenie zrzutów przed wydaniem publicznym** — obecne zrzuty pochodzą z buildu testowego
   (pasek APLIKACJA TESTOWA, ostrzeżenia „ĆWICZENIE”); przed promocją do sprzedaży wykonać nowe.
9. **Etykieta treści AI dla grafiki promocyjnej (Google Play)** — tło `feature-graphic.png`
   i `og-image.png` powstało z użyciem generatora obrazów; przy wgrywaniu w Play Console zaznaczyć
   etykietę treści AI. Zrzuty ekranu pokazują prawdziwy interfejs aplikacji.
10. **Polityka prywatności = projekt** — data obowiązywania, podstawa prawna (art. 6 ust. 1 RODO),
    okres porządkowania nieaktywnych rejestracji i „Linked to You” dla tokenu push wymagają
    akceptacji IOD (`status: DRAFT_NOT_SUBMITTED` we wszystkich plikach `data/`).
11. **Ikona 512** — `icon-512.png` jest 32-bitowym PNG z kanałem alfa (typ koloru 6), tak jak opisuje
    ją Play Console; skrypt kontrolny dopuszcza też wariant 24-bitowy, gdyby konsola zażądała pliku
    bez przezroczystości.
12. **Adres sklepów** — po publikacji wpisać `storeUrls` w `data/site.json` i dodać przyciski
    pobierania na stronie głównej.

13. **Cofnięcie zgody w aplikacji** — polityka i Data safety opisują usunięcie rejestracji na wniosek
    do IOD, bo wersja 1.0.3 nie ma w Ustawieniach kontrolki, która wysyłałaby żądanie usunięcia
    (`DELETE /api/public/devices/{token}`). Decyzja produktowa: wdrożyć w kolejnej wersji (osobny PR)
    i wtedy zaktualizować politykę oraz `deletionNote`.
14. **Nadawca na zrzutach ćwiczebnych** — alerty ĆWICZENIE na zrzutach mają nadawcę „Rządowe Centrum
    Bezpieczeństwa” (lokalna Brama sprzed ADR-0109). Przed wydaniem publicznym zrzuty z nadawcą
    syntetycznym (np. „Powiat Demo (playground)”) razem z pozycją 8.

## Prawa

Kod HTML, CSS i skrypty kontrolne tego repozytorium są licencjonowane na warunkach EUPL-1.2.
Kod aplikacji mobilnej nie jest częścią tego repozytorium. Oficjalne znaki, grafiki, treści prawne,
zrzuty ekranów i materiały KG PSP pozostają objęte odrębnymi prawami — zobacz [NOTICE.md](NOTICE.md).
Zgłoszenia bezpieczeństwa: [SECURITY.md](SECURITY.md).
