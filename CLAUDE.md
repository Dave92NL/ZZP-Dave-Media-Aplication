# ZZP Manager — instrukcje dla Claude

> Aplikacja do zarządzania jednoosobową działalnością (ZZP) freelancera w Holandii.
> Właściciel: Dave Media YT (kanał YouTube „Archiwum zła"), rozliczenia głównie
> reverse-charge z Google Ireland Limited (AdSense).
>
> ⚠️ **Uwaga:** plik `CLAUDE.md` w katalogu `C:\Users\dawid\Desktop\ClaudeCode\aplikacja montażowa\`
> dotyczy **czego innego** (scenariusze kanału YouTube). Ten plik, w repo `D:\...\ZZP-Dave-Media-Aplication`,
> jest właściwym kontekstem aplikacji.

---

## 1. Co to jest

Dwie zsynchronizowane aplikacje w jednym repo (GitHub: `Dave92NL/ZZP-Dave-Media-Aplication`, **publiczne**):

| Katalog | Co to | Stack |
|---|---|---|
| `zzp-manager/` | Desktop, źródło prawdy | Electron 29 + better-sqlite3, vanilla JS renderer |
| `zzp-mobile/`  | Kompan mobilny (PWA) | Vite + vanilla JS, offline-first (IndexedDB) |
| `supabase/`    | Funkcje chmurowe | Deno Edge Functions |

Synchronizacja przez **Supabase** (Postgres + Storage + Auth). Desktop trzyma dane
lokalnie w SQLite i push/pull do chmury; mobile pisze bezpośrednio do Supabase
(z warstwą offline). Chmura synchronizuje: `clients, projects, invoices,
invoice_items, expenses, time_entries` (+ `push_subscriptions` dla powiadomień).

---

## 2. Architektura — kluczowe pliki

### Desktop (`zzp-manager/`)
- `main.js` — proces główny Electron: okno, tray, floating widget, **rejestracja IPC**
- `preload.js` — most `window.api.*`; **whitelist `VALID_CHANNELS`** — każdy nowy kanał IPC MUSI tu być dopisany, inaczej wywołanie rzuca „IPC channel not allowed"
- `src/database/db.js` — SQLite, **migracje wersjonowane** (aktualnie do wersji 5) w `getMigrations()`
- `src/modules/*.js` — logika biznesowa (invoices, expenses, projects, contacts, time-tracking, mileage, products, tax-calculator, reports, cloud-sync, efaktura-import, hours-import, backup, notifications, settings, …)
- `src/renderer/index.html` — sidebar nav + ładowanie skryptów stron
- `src/renderer/js/app.js` — router SPA (`pageLoaders`, `navigate`)
- `src/renderer/js/page-*.js` — strony (jeden IIFE `window.PageXxx` na stronę)
- `src/renderer/js/translations.js` — i18n (PL domyślny, EN, NL). **Działa przez podmianę tekstu w DOM** (MutationObserver + `DOM_MAP`/`ATTR_MAP`/`PATTERN_RULES`). Nowe napisy UI trzeba dopisać do map, inaczej zostają po polsku w NL/EN.
- `docs/supabase-schema.sql` — pełny schemat chmury (DESTRUKCYJNY, drop+create)
- `docs/supabase-migration-faza-a.sql` — bezpieczny addytywny wariant migracji
- `docs/push-setup.md` — instrukcja wdrożenia push (VAPID, Edge Function, cron)

### Mobile (`zzp-mobile/`)
- `src/data/` — warstwa offline-first: `idb.js` (IndexedDB), `outbox.js` (kolejka zapisów offline), `repo.js` (jedyny dostęp do danych: online→Supabase / offline→outbox + cache), `sync.js` (flush kolejki z remapowaniem kluczy obcych), `status.js` (pasek stanu)
- `src/pages/` — strony (dashboard, koszty, faktury, projekty, klienci, czas, więcej…)
- `src/push.js` — subskrypcja Web Push; `public/push-sw.js` — handler push w SW
- `vite.config.js` — **base = `/ZZP-Dave-Media-Aplication/`** (GitHub Pages w podkatalogu), manifest PWA, workbox

### Chmura
- `supabase/functions/send-due-reminders/` — codzienny push o fakturach po terminie
- `.github/workflows/deploy-mobile.yml` — build `zzp-mobile` → deploy na GitHub Pages

---

## 3. Środowisko i uruchamianie

- **Node nie jest w PATH** powłok narzędziowych. Jest pod nvm:
  `C:\Users\dawid\AppData\Local\nvm\v22.23.1\node.exe`. W PowerShell:
  `$env:PATH = "C:\Users\dawid\AppData\Local\nvm\v22.23.1;$env:PATH"` przed `npm`.
- Desktop: `npm start` w `zzp-manager` (jest `.claude/launch.json`). Migracje bazy
  wykonują się automatycznie przy starcie. Baza: `%APPDATA%\zzp-manager\zzp-manager.db`.
- Mobile: `npm run build` w `zzp-mobile` (build_time env: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`).
- **Sandbox klasyfikator Bash bywa niedostępny** (gdy model chwilowo niedostępny) —
  wtedy używać narzędzi read-only lub PowerShell; do commitów git message przez plik
  `git commit -F <plik>` (here-string w PS się rozjeżdża).
- `node --check <plik>` do szybkiej weryfikacji składni.

---

## 4. Wdrożenie (stan produkcyjny)

- **GitHub:** repo publiczne, gałąź `main`. Mobile auto-deployuje się na
  **GitHub Pages** przy pushu → https://dave92nl.github.io/ZZP-Dave-Media-Aplication/
- **Supabase:** project ref **`mrmyznqentpabkrtybah`** (URL `https://mrmyznqentpabkrtybah.supabase.co`).
  Używa NOWEGO systemu kluczy: **publishable** `sb_publishable_...` = anon (do frontu),
  **secret** `sb_secret_...` = service_role (tylko serwer, nigdy do repo/frontu).
- **Edge Function** `send-due-reminders` wdrożona (`--no-verify-jwt`), sekrety:
  VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, SITE_URL. Cron `due-reminders-daily`
  o 08:00 (pg_cron + pg_net).
- Push potwierdzony end-to-end (test: faktura po terminie → powiadomienie na telefon).

---

## 5. Co zrobiliśmy w tej sesji

### Mobile — Fazy A–D (pełna rozbudowa)
- **A:** rozszerzenie schematu chmury (projects, time_entries, push_subscriptions,
  `project_id` w fakturach/kosztach) + migracja SQLite v4 + `cloud-sync.js` o projekty i czas
- **B:** architektura offline-first (IndexedDB cache + outbox + silnik sync z
  remapowaniem FK; faktury offline dostają numer dopiero przy wysyłce)
- **C:** nowe ekrany (pulpit, projekty, klienci, czas: licznik+wpisy), nawigacja z menu „Więcej"
- **D:** powiadomienia push (subskrypcje, service worker, Edge Function + cron)
- Wdrożenie: repo upublicznione, Pages włączone, funkcja i cron w Supabase

### Desktop — pakiet z audytu efaktura.nl (`docs/audyt-efaktura.md`)
- **Migracja SQLite v5:** tabele `products`, `mileage_entries`, kolumna `invoices.sale_date`
- **Katalog produktów:** moduł `products.js` + wybór z katalogu w pozycjach faktury + modal zarządzania
- **Kilometrówka:** moduł `mileage.js` (stawka €0,23/km, tam-i-z-powrotem, podsumowanie roczne) + strona `page-mileage.js` + nav
- **Faktura:** pole „Data sprzedaży" (leverdatum) + **QR EPC** w PDF (pakiet `qrcode`) + **eksport UBL 2.1/Peppol XML**
- **Import godzinówki z efaktura** (`hours-import.js`): parser PDF (priorytet, PL/NL) + XML, kreator z podglądem na stronie Czas pracy
- **Kalibracja parsera godzin** — poprawione rozpoznawanie przerw `(00:45h)` i podsumowań `Aantal uren ...`, plus lepsze łączenie zawiniętych linii opisu.
- **Przypomnienia/wezwania do zapłaty:** szablony NL/EN/PL, kopiuj + mailto (`util:openExternal`)
- **Weryfikacja VIES** numeru VAT (handler `vies:check`, API UE) w formularzu kontaktu + „wypełnij dane z VIES"
- **Poprawki po testach:**
  - przychody liczą się po `paid_date`; dodano pole „Data zapłaty" + synchronizację `income_entries` przy edycji faktury (naprawia dashboard po zmianie dat)
  - VIES: usuwanie zer wiodących z numeru domu
  - tłumaczenia NL/EN dla wszystkich nowych ekranów
  - import faktur PDF brał holenderskie miasto jako klienta (kotwica „Factuur voor:")

---

## 6. Kolejne kroki (backlog)

Zrezygnowano (decyzja użytkownika): **proformy**, **zniżka/zaliczka na fakturze**.

### Do zaprogramowania (priorytet malejąco)
1. **Kalibracja parsera godzin** — czeka na prawdziwy PDF „POBIERZ GODZINY" z efaktury (użytkownik miał wrzucić do folderu Google Drive ze zrzutami). Dostroić regexy w `hours-import.js`.
2. **Kredytnoty** (faktury korygujące) — akcja z poziomu faktury
3. **Oferty (offertes)** + konwersja oferta→faktura
4. **Język faktury per faktura** — szablon PDF w NL/EN/PL
5. **Koszty 2.0** — wiele stawek VAT w dokumencie, wiele załączników, edytor split-view (dokument obok formularza), filtr „nieuzupełnione"
6. Kalendarzowy widok godzinówki + pole przerwy; wysyłka e-mail z aplikacji (SMTP/Gmail); AI-asysta opisów
7. (opcjonalnie) Kilometrówka i produkty w mobile + sync

### Po stronie użytkownika
- **Pełna migracja z efaktura.nl** — import ~20 pozycji (faktury PDF, koszty XML) przez „📥 Import XML/PDF", ręczna korekta klienta gdzie trzeba, potem „Wyślij" (sync)
- Unieważnić tokeny użyte do wdrożenia (GitHub PAT, Supabase Access Token), jeśli jeszcze aktywne

---

## 7. Konwencje i pułapki (WAŻNE przy edycji)

- **Nowy kanał IPC** = dopisz w 3 miejscach: `main.js` (`ipcMain.handle`), `preload.js`
  (`VALID_CHANNELS` **oraz** `window.api.*`). Pominięcie whitelisty → „IPC channel not allowed".
- **Nowy napis UI** widoczny dla użytkownika = dopisz tłumaczenie do `translations.js`
  (`DOM_MAP` dla tekstu, `ATTR_MAP` dla `title`/`placeholder`, `PATTERN_RULES` dla napisów z liczbami),
  inaczej zostanie po polsku w trybie NL/EN.
- **Zmiana schematu SQLite** = nowa migracja w `db.js` `getMigrations()` (kolejny numer);
  nie edytować istniejących migracji. Analogiczna zmiana w chmurze: `docs/supabase-schema.sql`
  + addytywnie w migracji, oraz w `cloud-sync.js` jeśli tabela ma być synchronizowana.
- **Przychody w raportach/dashboardzie** liczą się z `invoices` po `status='paid'` i `paid_date`
  (nie po dacie wystawienia). Edytując faktury trzymać `income_entries` w zgodzie (robi to `invoices.update`).
- **Nowy kanał IPC w mobile** nie istnieje — mobile nie ma IPC; dane przez `src/data/repo.js`.
- Git na Windows ostrzega o LF→CRLF — to nieszkodliwe.
- Reverse charge (Google Ireland): `btw_reverse_charge=1`, BTW=0, w UBL kategoria `AE`.
