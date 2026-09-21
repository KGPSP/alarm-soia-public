# Konsole sklepowe — co wpisać, skąd wziąć

Instrukcja dla osoby wypełniającej Google Play Console i App Store Connect. Każda wartość poniżej
pochodzi z plików `data/` tego repozytorium (jedyne źródło prawdy; walidowane przez `npm test`),
a ich stan to nadal `DRAFT_NOT_SUBMITTED`. Pozycje oznaczone **DECYZJA** wymagają rozstrzygnięcia
KG PSP przed wysłaniem do recenzji (szczegóły: README, „Decyzje przed wysyłką”).

Adresy publiczne (strona na GitHub Pages, zweryfikowane 2026-09-16):

| Pole | Wartość |
|---|---|
| Polityka prywatności | `https://kgpsp.github.io/alarm-soia-public/polityka-prywatnosci` |
| Pomoc / wsparcie | `https://kgpsp.github.io/alarm-soia-public/pomoc` |
| Strona produktu / marketing | `https://kgpsp.github.io/alarm-soia-public/` |
| E-mail wsparcia | `informacje@kg.straz.gov.pl` |
| E-mail IOD (tylko polityka) | `iod@kg.straz.gov.pl` |

## A. Google Play Console (`data/google-play.json`, `data/google-play-declarations.json`)

Wpis aplikacji ALARM.SOIA już istnieje (ścieżka wewnętrzna od 1.0.3). Kolejność jak w konsoli.

1. **Wpis w sklepie → Główny wpis** (język domyślny pl-PL, tłumaczenie en-GB): nazwa `appName`,
   krótki opis `shortDescription` (≤80 znaków), pełny opis `fullDescription` (≤4000). Grafiki:
   ikona `site/assets/google-play/icon-512.png` (512×512, 32-bit z alfą), grafika promocyjna
   `site/assets/google-play/feature-graphic.png` (1024×500 — **zaznaczyć etykietę treści AI**,
   tło powstało z generatora), zrzuty telefonu `site/assets/google-play/phone/01–05.png`
   (1080×1920). Zrzuty tabletów: pomijamy (README poz. 7).
2. **Ustawienia sklepu**: kategoria „Narzędzia” (`category: TOOLS`), tagi z listy konsoli
   (`tags.note`), dane kontaktowe: e-mail wsparcia, strona produktu, publiczny numer
   telefonu +48 47 722 31 12 (`developerProfile.phone`, rozstrzygnięte 2026-09-21; pole wymagane
   i widoczne publicznie dla konta organizacji).
3. **Polityka → Zawartość aplikacji**, po kolei:
   - *Polityka prywatności*: adres z tabeli wyżej.
   - *Reklamy*: nie (`ads: false`).
   - *Dostęp do aplikacji*: wszystkie funkcje dostępne bez logowania (`appAccess`).
   - *Ocena treści (IARC)*: kwestionariusz kategorii „Narzędzia / inne”; wszystkie pytania „nie”
     (`contentRating.questionnaire`); pytanie o nieograniczony internet — linki otwierają się
     w przeglądarce systemowej, zaznaczyć zgodnie z tym; oczekiwany wynik PEGI 3.
   - *Docelowi odbiorcy i treści*: wyłącznie 18+ (`targetAudience`), aplikacja nie jest
     skierowana do dzieci; bez ograniczania dostępu nieletnim (`restrictMinorAccess: false`).
   - *Aplikacja informacyjna*: nie. *Aplikacja związana z COVID-19*: nie. *Funkcje finansowe*:
     nie. *Aplikacje zdrowotne*: nie. *Identyfikator reklamowy*: nie.
   - *Aplikacje rządowe*: tak (`governmentApp: true`) — **DECYZJA: pismo KG PSP** na papierze
     firmowym z danymi kontaktowymi do weryfikacji (`governmentAppProof`).
   - *Bezpieczeństwo danych* (`dataSafety`): zbiera dane: tak; udostępnia: nie; szyfrowanie
     w tranzycie: tak; mechanizm żądania usunięcia: tak — opisać „wniosek do IOD
     (iod@kg.straz.gov.pl)”; typy: **Identyfikatory urządzenia lub inne** (token push FCM;
     wymagane, nieudostępniane, cel: funkcje aplikacji) oraz **Aktywność w aplikacji → Inne
     działania** (kody TERYT obszarów i priorytety; jak wyżej). Wszystkie pozostałe typy: nie
     zbierane (`notCollected`). Niezależny audyt bezpieczeństwa: nie.
4. **Kraje**: 27 państw UE z `countries`. **Cena**: bezpłatna.
5. **Informacje o wydaniu** (przy każdej wersji): `releaseNotes` pl-PL i en-GB.
6. **Uprawnienia wrażliwe**: brak deklaracji (`sensitivePermissionDeclarations`) — potwierdzić na
   artefakcie produkcyjnym przed wysyłką (lista manifestu w `permissionsInManifest`).

## B. App Store Connect (`data/app-store.json`, `data/app-store-declarations.json`)

1. **Informacje o aplikacji**: nazwa `name`, podtytuł `subtitle` (≤30 znaków, pl-PL i en-GB),
   kategoria główna „Narzędzia” (`UTILITIES`), dodatkowa „Pogoda” (`WEATHER`), adres polityki
   prywatności z tabeli wyżej. **DECYZJA: prawa do treści** (`contentRights`) — poradnik PDF
   MSWiA/MON/RCB dystrybuowany w aplikacji; oświadczenie o prawach osób trzecich dopiero po
   potwierdzeniu prawa do dystrybucji.
2. **Ocena wieku** (`ageRating.questionnaire`): wszystkie odpowiedzi „Brak/Nie”, także
   „Informacje medyczne lub o leczeniu” — `None` (rozstrzygnięte 2026-09-21); wynik 4+.
3. **Prywatność aplikacji** (`appPrivacy`): zbiera dane: tak. *Identyfikatory → Identyfikator
   urządzenia* — cel „Funkcje aplikacji”, powiązane z użytkownikiem: tak (wariant „nie” wymaga
   opinii IOD), śledzenie: nie. *Inne dane → Inne typy danych* — jak wyżej (kody TERYT,
   priorytety, platforma, wersja). Nie zbierane: lokalizacja, dane o użyciu, diagnostyka, dane
   kontaktowe, treści użytkownika. Śledzenie: nie.
4. **Ceny i dostępność**: bezpłatna, 27 państw UE z `countries`, wydanie ręczne
   (`releaseType: MANUAL`), bez wydania etapowego.
5. **Zgodność z DSA (Digital Services Act)**: zadeklarować **non-trader** (`dsa.traderStatus:
   NON_TRADER`, rozstrzygnięte 2026-09-21) — bez tej deklaracji Apple nie dystrybuuje aplikacji
   w UE; przy non-trader dane kontaktowe nie są pokazywane na stronie produktu.
6. **Wersja → Informacje o wersji** (pl-PL i en-GB): tekst promocyjny `promotionalText` (≤170),
   opis `description` (≤4000), słowa kluczowe `keywords` (≤100 bajtów), adres wsparcia
   i marketingu z tabeli wyżej, informacje o wydaniu `releaseNotes`, copyright `copyright`.
   Zrzuty iPhone 6,9" `site/assets/app-store/iphone-6.9/01–06.png` (1320×2868); slot 6,5"
   nie przyjmuje tego wymiaru — dla niego gotowy zestaw `site/assets/app-store/iphone-6.5/01–06.png`
   (1284×2778, ta sama kompozycja). Tylko iPhone (`deviceFamilies`). Stan konsoli 2026-09-21
   wieczorem: **strona wersji gotowa** — wersja 1.0.5, build 11, sześć zrzutów 6,5" bez paska
   w kolejności 01→06, dane kontaktowe do recenzji wpisane, wydanie ręczne. Do zrobienia zostają
   pozostałe sekcje: Informacje o aplikacji (podtytuł, kategorie), ocena wieku, prywatność
   aplikacji, ceny i dostępność, deklaracja DSA — wartości niżej i w `data/`.
7. **Informacje do recenzji** (`reviewNotes`): logowanie niewymagane; ścieżka testu przez kreator
   pierwszego uruchomienia; okno czasowe na ostrzeżenie testowe ĆWICZENIE dla wskazanego powiatu
   albo nagranie przepływu; Critical Alerts (entitlement zatwierdzony, wniosek `MPJHKAS7D9`) tylko
   dla P1; kamera tylko latarka. Dane osoby kontaktowej wpisać w konsoli, nie w repozytorium.
8. **Zgodność eksportowa**: aplikacja nie używa niestandardowego szyfrowania
   (`usesNonExemptEncryption: false`).

## C. Co blokuje wysyłkę do recenzji

| # | Decyzja | Gdzie | Pole w `data/` |
|---|---|---|---|
| 1 | ~~Status tradera DSA~~ — **rozstrzygnięte 2026-09-21: non-trader** | App Store Connect | `dsa.traderStatus: NON_TRADER` |
| 2 | ~~Ocena wieku~~ — **rozstrzygnięte 2026-09-21: `None`, wynik 4+** | App Store Connect | `ageRating.questionnaire.medicalOrTreatmentInformation: None` |
| 3 | ~~Publiczny telefon KG PSP~~ — **rozstrzygnięte 2026-09-21: +48 47 722 31 12** | Play Console | `developerProfile.phone` |
| 4 | ~~Akceptacja polityki prywatności przez IOD~~ — **rozstrzygnięte 2026-09-21** (obowiązuje od 21.09.2026, art. 6 ust. 1 lit. e RODO, standardowe klauzule umowne) | strona + obie konsole | polityka na stronie; `status` w `data/` zmienia się przy wysyłce |
| 5 | Pismo „Government apps” (równolegle) | Play Console | `governmentAppProof` |
| 6 | Prawa do poradnika PDF (równolegle) | App Store Connect | `contentRights` |

Po rozstrzygnięciu: wpisać wartości do `data/`, zmienić `status` na zatwierdzony, `npm test`,
commit — dopiero potem przepisać do konsol.
