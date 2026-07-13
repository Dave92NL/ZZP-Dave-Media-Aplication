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

### Koszty 2.0 (dokodowane lokalnie w VS Code + Qwen, potem przegląd i naprawy)
- **Migracja SQLite v6:** tabela `expense_attachments` (wiele plików do jednego kosztu)
- **Wiele załączników do kosztu:** `expenses.getAttachments/addAttachment/deleteAttachment`, IPC + preload; kolumna „Załączniki" z licznikiem
- **Filtr „nieuzupełnione"** (koszty bez załącznika) na liście kosztów
- **Podgląd split-view** w formularzu faktury i kosztu oraz podgląd pliku w kreatorze importu
- **Naprawy po przeglądzie (Opus):** brakujący eksport `showImportPreview`; podglądy plików przez **`data:` URL** (nowy IPC `util:readFileAsDataUrl`) zamiast `file://` blokowanego przez CSP; CSP rozszerzony o `object-src 'self' data:`; deduplikacja i scalenie parsera godzin (`parseHoursText`); `deleteAttachment`/`delete` kosztu sprzątają pliki z dysku; testy `tests/hours-import.test.js` (6/6). Prywatne PDF godzin w `.gitignore`.

### Viewer dokumentu jak w efakturze (ZROBIONE)
- **Faktura:** `invoices.renderPreviewPDF(data)` renderuje **żywy PDF** z danych formularza (debounce ~0,6 s), rysowany przez **pdf.js do canvas** w prawym panelu.
- **Koszt:** viewer wgranego dokumentu z **miniaturami załączników** po lewej + duży podgląd (PDF przez pdf.js/canvas, obrazy jako `<img>`), formularz po prawej; dodawanie/usuwanie/przełączanie załączników.
- **Klucz:** `<embed>`/`<iframe>` PDF dawały szare tło (PDFium) → użyto **pdf.js** (`src/renderer/js/pdfviewer.js`). Szczegóły w sekcji 7.
- **Podgląd po kliknięciu wiersza (read-only):** faktura i koszt — klik w wiersz otwiera modal split-view (dane + dokument), bez wchodzenia w edycję. `invoices.renderSavedPreviewPDF(id)` renderuje PDF zapisanej faktury; koszt pokazuje pierwszy załącznik. Przyciski akcji w wierszu mają `event.stopPropagation()`.
- **Presety opisu pozycji faktury (NL/EN/PL):** select w formularzu (`SERVICE_PRESETS` w `page-invoices.js`) wstawia pozycję z gotowym opisem usługi wg KvK (advertentieruimte YouTube, audiotracks, video's filmproducties, reparatie/onderhoud computers).

### Parytet mobilny — pakiet 1+2 + podgląd dokumentu (ZROBIONE)
Wyrównanie telefonu do desktopu: kilometrówka, data sprzedaży/zapłaty na fakturze, podgląd dokumentów.
- **Chmura:** `docs/supabase-migration-mobile-pakiet.sql` (addytywnie: `invoices.sale_date` + tabela `mileage_entries` z RLS). Uruchomić w Supabase SQL Editor. Schemat wzorcowy `docs/supabase-schema.sql` też zaktualizowany.
- **Desktop sync:** migracja SQLite **v7** (`cloud_id/synced_at/updated_at` w `mileage_entries`); `cloud-sync.js` pushuje/pobiera `mileage_entries` (mapowanie FK `client_id`/`project_id`) oraz `sale_date` na fakturach; `getStatus()` liczy oczekujące przejazdy.
- **Mobile kilometrówka:** nowy store IndexedDB `mileage_entries` (`idb.js`, **DB_VERSION 2**), `repo.pushMileage/createMileage/listMileage`, typ outboxa `insert-mileage` z remapem FK w `sync.js`, strona `pages/mileage.js` (formularz + lista + podsumowanie km/odliczenie), trasa w `main.js`, pozycja w menu „Więcej", `mileage` w `MORE_PAGES`.
- **Mobile faktura:** pole „Data sprzedaży (Leverdatum)" + dropdown presetów opisu (`SERVICE_PRESETS`, te same NL/EN/PL co desktop) w `newInvoice.js`; `sale_date` w nagłówku; w `invoiceDetail.js` pokazywana Leverdatum + przycisk **„Oznacz jako zapłaconą"** (`repo.markInvoicePaid`, online-only, ustawia `status='paid'`+`paid_date` — desktop liczy przychód po `paid_date`).
- **Mobile podgląd dokumentu:**
  - Koszt: paragon-obraz → `<img>`, paragon-**PDF** → render **pdf.js do canvas** (`src/lib/pdfPreview.js`, worker bundlowany przez Vite `?url`) + link „otwórz w nowej karcie". pdfjs-dist@3.11.174 dodany do `zzp-mobile`.
  - Faktura: **stylizowany podgląd dokumentu HTML** (wygląd papierowej faktury na białym tle) w `invoiceDetail.js` z danych zsynchronizowanych. Dane sprzedawcy w `src/lib/companyProfile.js` (`COMPANY`) — **do uzupełnienia przez użytkownika** (KvK/IBAN/BTW/adres nie są synchronizowane z desktopu; puste pola są pomijane, nic nie jest zmyślane).
- **Build:** `npm run build` w `zzp-mobile` przechodzi; ostrzeżenie `eval` z pdf.js to fallback fake-workera — nieistotne, bo realny worker jest emitowany jako osobny asset.

### Synchronizacja usunięć + auto-sync w obie strony (ZROBIONE)
Usunięcie rekordu na jednym urządzeniu znika też na drugim; zmiany synchronizują się automatycznie.
- **Desktop — nagrobki usunięć:** migracja SQLite **v8** tabela `sync_deletions (table_name, cloud_id)`. **Wszystkie 6 modułów synchronizowanych** (`invoices`, `expenses`, `contacts`→clients, `projects`, `time-tracking`→time_entries, `mileage`→mileage_entries) w `delete_` zapisują nagrobek dla rekordu z `cloud_id`; przyjmują `opts.fromCloudSync` by pominąć nagrobek przy usunięciu pochodzącym z sync (uniknięcie pętli). **Pułapka historyczna:** początkowo objęto tylko faktury/koszty — usunięty kontakt „wracał po chwili", bo pull odtwarzał go z chmury.
- **Desktop — cloud-sync:** push najpierw przetwarza nagrobki (kasuje w Supabase: faktury z kaskadą `invoice_items`; koszty + plik paragonu ze Storage; **klienci/projekty: najpierw `update {client_id|project_id: null}` na tabelach zależnych** — FK w Postgres blokują delete, lokalny SQLite ich nie egzekwuje). Pull po pobraniu każdej tabeli **rekoncyliuje usunięcia** helperem `_reconcileDeletions(table, cloudRows, deleteFn)`: lokalny rekord z `cloud_id` nieobecny w chmurze → usuń lokalnie (`fromCloudSync:true`). Bezpieczne: tylko po udanym fetchu, tylko rekordy wcześniej zsynchronizowane. `getStatus` liczy nagrobki jako oczekujące. Zwrot pull ma liczniki `deleted*` dla wszystkich 6 tabel (sygnał `changed` w auto-sync `main.js`).
- **Desktop — auto-sync (main.js):** wrapper `mut()` na kanałach mutujących (invoices/expenses/projects/contacts/time/mileage create/update/delete) planuje push+pull ~1,5 s po zmianie; heartbeat `setInterval` co 15 s robi pull (zmiany z telefonu). Po auto-syncu `mainWindow.webContents.send('sync:autoSynced', {changed})`; renderer (`app.js`) odświeża bieżącą listę tylko gdy `changed` i nie ma otwartego modala (`#modal-overlay`). Kanał w `preload.js` `VALID_PUSH_CHANNELS`.
- **Mobile:** `repo.deleteInvoice/deleteExpense` (online → kasuje w Supabase + Storage; offline → outbox `delete-invoice`/`delete-expense`; rekord jeszcze niewysłany → tylko usunięcie wpisu z outboxa). `sync.js flushOutbox` obsługuje delete-opy. Listy filtrują nakładkę „oczekujące" do `insert-*` (delete-opy nie renderują się jako wiersze). Przyciski „Usuń" w `invoiceDetail`/`expenseDetail`. Auto-odświeżanie: `sync.js` heartbeat `syncNow` co 15 s wykrywa zmianę stanu chmury lekką **sygnaturą** (`repo.remoteChangeSignature` = id+updated_at faktur, kosztów, godzinówki i kilometrówki) i dopiero wtedy emituje `zzp-synced`, a `main.js` re-renderuje bieżący widok. Kluczowe: **nie odświeżamy bezwarunkowo co cykl** (to powodowało „mruganie") — tylko gdy dane faktycznie się zmieniły. Odczyt mobilny i tak lustrzano odbija chmurę (`idb.replaceAll`), więc usunięcia z desktopu znikają przy odświeżeniu.
- **Model „immediate":** push natychmiast (~1,5 s po zmianie), pull/propagacja na drugie urządzenie do ~15 s. (Realtime/websocket odrzucone jako cięższe.)

### Przerwa we wpisie czasu (ZROBIONE, desktop + chmura)
Godzinówka 1:1 z efakturą: czas trwania = od–do **minus przerwa** (netto).
- Migracja SQLite **v9**: `time_entries.break_minutes INTEGER DEFAULT 0`; chmura ma tę kolumnę (wykonano przez Management API; addytywnie też w `docs/supabase-migration-mobile-pakiet.sql` sekcja 3 i w `supabase-schema.sql`).
- `time-tracking.js`: `create` liczy netto ze start/end−przerwa i zapisuje `break_minutes`; `update` ma `break_minutes` w allowed.
- `page-time.js`: formularz ręczny — pole „Przerwa (min)" (`m-break`, `calcDuration` odejmuje); edycja — pola od/do/przerwa (`e-from/e-to/e-break`, prefill z wpisu; przy podanych od–do czas liczony z zakresu minus przerwa); karta podglądu pokazuje `(HH:MM przerwy)`.
- `cloud-sync.js`: push/pull time_entries z `break_minutes`. **Uwaga:** push wysyła tę kolumnę bezwarunkowo — chmura MUSI ją mieć (inaczej błąd inserta wszystkich wpisów).
- Mobile nie wysyła `break_minutes` (default 0 w chmurze) — ewentualne pole przerwy na telefonie to osobny krok.

### Karta podglądu wpisu czasu (ZROBIONE, desktop)
Klik w wiersz na liście godzinówki otwiera kartę jak w efakturze: tytuł = klient
(`time-tracking.js getAll` ma teraz `LEFT JOIN clients` → `client_name`), podtytuł =
projekt/kategoria, data słownie (pl-PL, weekday+day+month), zakres godzin (tylko wpisy
z licznika — ręczne nie mają start/end), czas trwania `HH:MM godzin`, opis; stopka
✏️ Edytuj / 🗑 Usuń (przechodzą do istniejących modali). `PageTime.viewEntry(id)` w
`page-time.js`; wiersz `onclick` + `event.stopPropagation()` na komórce akcji;
style `.time-view-*` w `main.css` (zielony pasek akcentu).

### Poprawki po zgłoszeniu (pole opisu, polskie znaki w PDF, menu tłumaczenia)
- **Polskie znaki w PDF faktury (krzaczki):** pdfkit domyślnie używał Helvetiki, która nie ma glifów ą/ć/ę/ł/ń/ś/ź/ż. Dodano czcionkę **DejaVu Sans** (`src/assets/fonts/DejaVuSans.ttf` + `-Bold.ttf`), rejestrowaną helperem `_registerPdfFonts(doc)` po każdym `new PDFDocument` w `invoices.js`; wszystkie `doc.font('Helvetica*')` → `'INV'/'INV-Bold'`. Dotyczy PDF faktury i żywego podglądu. (Font bundlowany w src/** → trafia do instalatora.)
- **Wąskie pole opisu w pozycji faktury:** po dodaniu ikonki 🌐 input miał `width:100%` w kontenerze flex → ściśnięty. Zmiana na `flex:1;min-width:0` (`.tr-field`).
- **Menu tłumaczenia „nic nie robiło":** absolutne menu było przycinane przez overflow tabeli/modala. Teraz `translator.js` pozycjonuje `.tr-menu` jako **fixed** liczone od przycisku (nie da się przyciąć).

### Tłumaczenie opisów na żywo PL → NL/EN (ZROBIONE, desktop)
Obok pól opisu (pozycje faktury + godzinówka: `timer-desc`/`m-desc`/`e-desc`) ikonka 🌐 → wybór 🇳🇱/🇬🇧 → treść pola zastępowana tłumaczeniem.
- **Backend:** `src/modules/translate.js` — `translate(text, 'nl'|'en')` w procesie głównym (omija CSP). Silnik: **DeepL** jeśli w Ustawieniach jest `deepl_api_key` (host `api-free`/`api` po sufiksie `:fx`), inaczej/przy błędzie **fallback na MyMemory** (darmowe, bez klucza). IPC `translate:text` + whitelist w `preload.js` + `window.api.translate.text`.
- **UI:** globalny widget `src/renderer/js/translator.js` (`window.Translator.widgetHTML(id?)`, delegowany click, resolver pola po id lub sąsiedztwie), wpięty w `index.html` przed `page-*`. Style `.tr-widget/.tr-btn/.tr-menu` w `main.css`. Klucz DeepL w Ustawieniach → zakładka „🌐 Tłumaczenia" (`page-settings.js`, `deepl_api_key` przez generyczne settings).
- Weryfikacja: MyMemory realnie tłumaczy PL→NL/EN. Zmiana wymaga restartu desktopu (nowy skrypt w index.html).
- **Rozwijane menu → dwa przyciski „🌐 NL"/„🌐 EN":** menu (`position:fixed`) było niewidoczne w modalu centrowanym `transform` (fixed liczony względem przetransformowanego przodka). Zamiast menu: dwa zawsze widoczne przyciski, klik = od razu tłumaczy. Klik łapany w **fazie przechwytywania** (`addEventListener('click', h, true)`) — odporne na `stopPropagation`. Uwaga diagnostyczna: `main.js` console-listener filtruje `level>=1`, więc `console.log` (level 0) z renderera NIE trafia do terminala.
- **Mobile (to samo):** `zzp-mobile/src/lib/translate.js` (MyMemory wprost z przeglądarki — CORS `*`, bez klucza; DeepL blokuje CORS, więc na mobile pominięty — ewentualnie proxy przez Edge Function w przyszłości) + `translateWidget.js` (`translateWidgetHTML(id?)` + `initTranslateWidget()` wołane raz w `main.js`). Ikonki w `newInvoice.js` (pozycje) i `timeTracking.js` (`tm-desc`/`tk-desc`). Style `.tr-*` w mobilnym `main.css`.

### Poprawka wysyłki kosztów (paragony) do chmury (ZROBIONE)
Push kosztów kończył się błędem `mime type text/plain;charset=UTF-8 is not supported` — koszty z paragonem nie trafiały na telefon (9 zaległych).
- **Przyczyna 1 (kod):** `cloud-sync.js` upload paragonu do Storage bez `contentType` → supabase-js wysyłał Buffer jako `text/plain`, bucket odrzucał. Fix: `_mimeForExt(ext)` dobiera typ (image/jpeg, image/png, application/pdf…), przekazany w `upload(..., { contentType })`.
- **Przyczyna 2 (chmura):** bucket `receipts` miał `allowed_mime_types` tylko obrazy. Dodano **`application/pdf`** (paragony PDF z importu efaktury). Zmiana przez Management API, zachowane typy obrazów.
- Diagnoza: błąd czytany z tabeli `sync_history.error_message` (bo UI pokazuje tylko „Wysłano: 0 rekordów"). Po restarcie desktopu + „Wyślij zmiany" koszty się wysyłają.

### Wybór roku na listach mobilnych (ZROBIONE)
Listy faktur i kosztów na telefonie dostały **filtr roku** (jak na desktopie): `expenseList.js`/`invoiceList.js` budują listę lat z danych (`date` / `issue_date`), select „Rok" + opcja „Wszystkie lata", domyślnie bieżący rok (albo najnowszy z danymi), podsumowanie (liczba + suma, faktury też „opłacone"). Wybór roku trzymany w zmiennej modułu — przeżywa auto-odświeżanie. Styl `.list-filter-bar` w `main.css`.

### Edycja wpisów czasu pracy w mobile (ZROBIONE)
Wpisy na liście „Ostatnie wpisy" (strona Czas pracy) są teraz **klikalne** → otwierają inline formularz edycji (kategoria, projekt, data, godziny, opis + widget tłumaczenia, rozliczalne) z przyciskami **Zapisz zmiany / Anuluj / Usuń wpis**.
- **Warstwa danych (`repo.js`):** `pushUpdateTimeEntry(cloudId, patch)` (update w Supabase + cache), `pushDeleteTimeEntry(cloudId)`, oraz `updateTimeEntry(id, patch)` / `deleteTimeEntry(id)` decydujące online vs offline (jak `deleteExpense/Invoice`). Rekord jeszcze niewysłany (pending `insert-time-entry` w outboxie) → edycja **modyfikuje payload w outboxie**, usunięcie → tylko kasuje wpis z outboxa (bez osobnej operacji).
- **Outbox/sync:** nowe typy `update-time-entry` (payload `{ id, ...zmienione pola }`) i `delete-time-entry`; obsłużone w `sync.js flushOutbox` (z remapem FK `project_id`/`id`).
- **Ważne:** `listTimeEntries` filtruje teraz nakładkę „oczekujące" do `insert-time-entry` (inaczej operacje update/delete renderowałyby się jako fałszywe wiersze).
- **UI (`timeTracking.js`):** stan modułu `_entries/_projects/_editingId`; `_renderEditForm/_saveEdit/_deleteEntry`. Godziny liczone z `duration_minutes`; zapis ustawia `duration_minutes = round(h*60)`. Edycja przeżywa auto-odświeżanie po syncu (`_editingId` w scope modułu). Styl `.edit-form-title` w `main.css`. Tylko mobile UI (Polski), brak i18n do dopisania.

### Redesign UI aplikacji mobilnej (ZROBIONE — etap 1: wygląd)
Pełne przeprojektowanie wyglądu `zzp-mobile` wg dostarczonego mockupu (ciemny „premium" UI:
karty statystyk z ikonami, wykresy, pierścień timera, segmentowane zakładki, FAB, pełnoekranowe menu).
- **System projektowy (`src/styles/main.css`):** rozbudowane tokeny w `:root` — głębsze tło
  (`--bg-primary #0A0E14`), `--bg-elevated`, skale `--sp-*`, promienie `--radius-lg/pill`, cienie
  `--shadow-card/pop`, akcent `--accent-purple`. Nowe komponenty: `.greeting`, `.hero-card`,
  `.stat-card`+`.stat-chip`, `.panel`, `.chart-legend`, `.quick-actions`+`.qa-*`, `.seg-tabs`,
  `.fab`, `.row-card`+`.row-chip`, `.pill`+`.pill-dot`, `.sheet-*`/`.menu-group`, `.timer-card`/
  `.timer-ring-wrap`/`.ring-*`, `.session-row`, `.coming-soon`, `.summary-box`. Font systemowy (bez
  zewnętrznych zależności).
- **Nowe moduły współdzielone:**
  - `src/lib/icons.js` — zestaw ikon liniowych **inline SVG** (feather-style) + `icon(name,{size})`.
    Używane w nawigacji, menu, chipach kart, szybkich akcjach, nagłówkach, przyciskach wstecz.
  - `src/lib/charts.js` — wykresy **inline SVG** (bez bibliotek): `areaSparkline` (hero „Przychód
    netto"), `groupedBars` (przychód vs koszty), `progressRing` (timer). **PUŁAPKA:** `var(--…)`
    NIE działa w atrybutach prezentacji SVG (`stroke=`/`fill=`) — kolory podajemy przez inline
    `style="stroke:…"`. Skalowanie przez `viewBox`+`preserveAspectRatio`.
  - `src/lib/aggregate.js` — grupowanie miesięczne (`lastNMonths`, `revenueByMonth`, `costsByMonth`),
    `pctChange`, `formatDelta`. **Przychód liczony z faktur opłaconych po `paid_date`** (parytet
    z desktopem; fallback `issue_date`).
- **Nawigacja (`src/components/nav.js`):** 5 zakładek z ikonami SVG — **Pulpit / Faktury / Czas /
  Finanse / Menu**. „Koszty" zeszły z dolnego paska → dostęp z „Szybkich akcji" i z Menu
  (`MORE_PAGES` obejmuje `expenses`).
- **Ekrany:** `dashboard.js` (powitanie „Witaj, {imię}" z e-maila, hero + sparkline + delta,
  2×2 karty, słupki z zakresem 6/12 mies., szybkie akcje), `timeTracking.js` (pierścień timera +
  sesje — **logika edycji/usuwania wpisów zachowana**), `invoiceList.js` (zakładki statusów +
  wyszukiwarka + `row-card` + FAB), `expenseList.js` (`row-card` + FAB), `more.js` (pełnoekranowe
  menu-sheet z profilem i grupami), `login.js` (`login-card`, ląduje na `dashboard`). Detale:
  przyciski „← Wróć" z ikoną. Blok `.invoice-doc*` (jasny podgląd faktury) bez zmian.
- **Stub `src/pages/finance.js`** + trasa `finance` w `main.js` — placeholder „Wkrótce".
- **Weryfikacja:** `npm run build` OK; zrzuty 4 ekranów w Chromium (Playwright) — zgodność z mockupem.
- **UI mobilne tylko po polsku** (brak i18n DOM-map jak w desktopie) — bez tłumaczeń do dopisania.

#### Finanse — pełny ekran (ZROBIONE, etap 2)
`src/pages/finance.js` zamiast placeholdera: wybór roku (chip-select), karty 2×2
(Przychód opłacony / Koszty / Zysk / VAT rok), wykres słupkowy przychód vs koszty (12 mies.,
`groupedBars`), **VAT kwartalnie** (należny wg `issue_date` − odliczalny wg daty kosztu = do
zapłaty per kwartał + suma roczna) oraz **struktura przychodu** (zwykły vs reverse-charge, ważne
dla AdSense/Google Ireland). Przychód liczony z faktur opłaconych (`incomeDate` = paid_date/issue_date).
Style `.fin-vat-*`/`.fin-bar*`/`.fin-legend2` w `main.css`. Reużywa `charts.js`, `aggregate.sumBy`, `icons.js`.

#### Do zbudowania w przyszłości (etap 2 — pozostałe ekrany z menu mockupu)
Na razie placeholdery „Wkrótce" (obsługa „🔒 Wkrótce" w `more.js`): **Raporty**, **Eksport danych**,
**Ustawienia** (m.in. nazwa użytkownika do powitania, dane firmy), **Kopia zapasowa**.

### Redesign UI aplikacji desktop — wyrównanie do mobilnej (ZROBIONE)
Desktop (`zzp-manager`) dostał **ten sam ciemny „premium" motyw co mobile**, zachowując swój układ
(sidebar + szeroka treść) i emoji-ikony. Zmiana wyłącznie w CSS (motyw jest w pełni tokenowy):
- **`styles/main.css` `:root`/`[data-theme="dark"]`:** paleta jak w mobile (tło `#0A0E14`,
  `--bg-secondary #141A22`, `--bg-card #161D26`, `--border #262F3B`, akcenty orange `#F97A5C` /
  blue `#4C8DFF` / green `#34C77E` / red `#F0564B` / purple `#8B7CF6`, tekst `#EEF3F9`). Dodane
  `--bg-hover`, `--border-soft`, `--radius-lg 18px`, `--radius-pill`, miękkie cienie. Motyw jasny
  też zaktualizowany (spójne akcenty).
- **`styles/dark.css`:** twarde heksy GitHub-dark zamienione na `var(--…)` z nowej palety
  (sidebar, inputy, modal, nav active, pin, timer-bar, tabele).
- **Komponenty (`main.css`):** dodana bazowa reguła `.card` (wcześniej brak — tylko cień!),
  `.kpi-card`/`.chart-card`/`.table-container` → `--radius-lg` + `--shadow`, `.badge` → pill
  (`--radius-pill`, waga 700), `.btn`/inputy/`.search-input` → `--radius` (12px), primary z poświatą,
  `.nav-item` większy promień + waga 600 aktywnej. Reszta stron dziedziczy przez tokeny.
- **Uwaga:** desktop **nie ma auto-deployu** (to aplikacja Electron uruchamiana lokalnie `npm start`);
  weryfikacja przez zrzut z Chromium (render powłoki + dashboardu z realnym CSS). Właściciel widzi
  efekt po `git pull` + `npm start`. Font Inter/JetBrains Mono z Google Fonts (w zrzucie fallback
  systemowy — bez wpływu na paletę/układ).

### Poprawka YouTube Analytics API (ZROBIONE)
Synchronizacja YT rzucała `Unknown identifier (rpm) given in field parameters.metrics`.
- **Przyczyna:** `youtube-api.js` prosił API o metryki, które w YouTube Analytics API **nie istnieją**: `rpm` i `impressionClickThroughRate` (to pojęcia z YouTube Studio, nie z API).
- **Fix:** metryki rozbite na `CORE_METRICS` (views, estimatedMinutesWatched, subscribersGained/Lost — zawsze) i `MONETARY_METRICS` (estimatedRevenue, cpm — osobne zapytanie z **miękkim fallbackiem**: przy braku zakresu/monetyzacji przychody = 0, reszta i tak się synchronizuje). **RPM liczony lokalnie** (`estimatedRevenue / views * 1000`). CTR z API niedostępny → 0.
- **Zakres OAuth:** dodano `yt-analytics-monetary.readonly` (do przychodów). Wymaga **ponownego połączenia** konta (Rozłącz → połącz), by zgoda objęła nowy zakres; przychody z API pojawią się tylko dla kanału w YPP — inaczej przez „Importuj CSV AdSense".

---

## 6. Kolejne kroki (backlog)

Zrezygnowano (decyzja użytkownika): **proformy**, **zniżka/zaliczka na fakturze**.

### Do zaprogramowania (priorytet malejąco)
1. **Kredytnoty** (faktury korygujące) — akcja z poziomu faktury
2. **Oferty (offertes)** + konwersja oferta→faktura
3. **Język faktury per faktura** — szablon PDF w NL/EN/PL
4. **Koszty 2.0 — reszta:** wiele stawek VAT w jednym dokumencie kosztu (samo „wiele załączników" + filtr + split-view już zrobione)
5. Viewer: nawigacja „Poprzedni/Następny" z autozapisem (odłożona); pasek zoom nad canvas pdf.js
6. Kalendarzowy widok godzinówki + pole przerwy; wysyłka e-mail z aplikacji (SMTP/Gmail); AI-asysta opisów
7. **Katalog produktów w mobile** (kilometrówka mobilna już zrobiona) + ewentualny mobilny edytor pozycji katalogu

**Zrobione już z dawnego backlogu:** kalibracja parsera godzin (testy 6/6), wiele załączników do kosztów, filtr „nieuzupełnione", **viewer dokumentu (pdf.js) w fakturach i kosztach**, **kilometrówka w mobile + sync**, **data sprzedaży/zapłaty + presety opisu w mobile**, **podgląd dokumentu (PDF paragonu / faktura HTML) w mobile**.

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
- **Podgląd PDF renderujemy przez pdf.js do `<canvas>`** (`src/renderer/js/pdfviewer.js`,
  `window.PdfViewer.render(container, dataUrl)`), NIE przez `<embed>`/`<iframe>`.
- **Budowanie instalatora Windows** = `npm run build` w `zzp-manager` (electron-builder, config w `package.json` → pole `build`; NSIS, ikona `src/assets/icon.ico`, output `release/`). **Pułapka:** rozpakowanie `winCodeSign` tworzy symlinki macOS, które Windows blokuje bez Trybu dewelopera → build pada („Cannot create symbolic link"). Obejście (bez uprawnień admina): rozpakować `winCodeSign-2.6.0.7z` do `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0` **z pominięciem folderu `darwin`** (`7za x ... -xr!darwin`) — builder użyje gotowego cache. Po jednorazowym przygotowaniu cache kolejne buildy działają. Instalator jest **niepodpisany** → SmartScreen pokaże ostrzeżenie („Więcej informacji → Uruchom mimo to").
- **Mobile — nowy store IndexedDB** = dopisz nazwę do `CACHE_STORES` w `idb.js` **oraz podnieś `DB_VERSION`**
  (inaczej `onupgradeneeded` nie utworzy magazynu i `getAll` rzuci). Nowa encja synchronizowana offline
  wymaga też: `repo.push*/create*/list*`, typu w `outbox.js`, gałęzi w `sync.js flushOutbox` (z remapem FK).
- **Mobile pdf.js** = `src/lib/pdfPreview.js` (`renderPdf`), pdfjs-dist@3.11.174, worker importowany jako
  `pdfjs-dist/build/pdf.worker.min.js?url` (Vite emituje osobny asset). Obraz → `<img>`, PDF → canvas.
- **Dane sprzedawcy w mobile** (podgląd faktury) są w `src/lib/companyProfile.js` (`COMPANY`) — desktop
  NIE synchronizuje ich do chmury, więc to osobna, ręcznie uzupełniana kopia; puste pola pomijamy.
  Wbudowany PDFium w tym Electronie renderował pustą (szarą) powierzchnię dla blob:/data:
  PDF — niezależnie od `plugins:true` i CSP. pdf.js (UMD z CDN `cdn.jsdelivr.net`,
  wersja 3.11.174) rysuje strony do canvas.
  - Dane PDF przekazywać jako **bajty** (`getDocument({data})`) — bez fetch (zgodne z
    `connect-src 'none'`). Bajty: z IPC `util:readFileAsDataUrl` (koszty) lub
    `invoices:renderPreviewPDF` (faktura, żywy PDF).
  - Worker pdf.js: cross-origin Worker blokowany → pdf.js spada do „fake worker"
    (ładuje `pdf.worker.min.js` przez `<script>`, `script-src cdn.jsdelivr.net` OK).
  - Obrazy załączników (png/jpg) nadal jako `<img src="data:…">` (img-src data:).
  - `plugins:true` + CSP `object-src/frame-src blob:` zostały (nie szkodzą), ale to
    pdf.js jest właściwym rozwiązaniem. CSP jest w DWÓCH plikach: `<meta>` w
    `src/renderer/index.html` (restrykcyjny, stosowany) i nagłówek w `main.js`.
  - Diagnostyka renderera: `webContents.on('console-message')` → stdout (main.js).
- **Zawsze po skończonej czynności aktualizować ten `CLAUDE.md`** (życzenie właściciela).
- Git na Windows ostrzega o LF→CRLF — to nieszkodliwe.
- Reverse charge (Google Ireland): `btw_reverse_charge=1`, BTW=0, w UBL kategoria `AE`.
