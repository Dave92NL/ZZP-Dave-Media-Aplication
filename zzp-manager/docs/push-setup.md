# Powiadomienia push + wdrożenie PWA (Faza D)

Ten dokument opisuje, jak włączyć powiadomienia o fakturach po terminie na telefonie.
Push w PWA **wymaga HTTPS**, więc najpierw wystawiamy wersję mobilną pod adresem HTTPS,
a potem konfigurujemy klucze VAPID i funkcję wysyłkową w Supabase.

Kolejność: **1) tabele → 2) hosting HTTPS → 3) klucze VAPID → 4) funkcja Supabase → 5) harmonogram (cron) → 6) test.**

---

## 1. Tabela subskrypcji w Supabase

Jeśli jeszcze nie uruchomiłeś zaktualizowanego schematu, wykonaj w Supabase → SQL Editor
zawartość `zzp-manager/docs/supabase-schema.sql` (zawiera tabelę `push_subscriptions`).
⚠️ Skrypt odtwarza tabele od zera — po nim zrób „Wyślij" w ZZP Manager, żeby odtworzyć dane.

---

## 2. Hosting wersji mobilnej przez HTTPS

Push i „Dodaj do ekranu głównego" nie działają przez `http://` w sieci lokalnej — potrzebny HTTPS.
Najprościej (za darmo) — **Cloudflare Pages / Netlify / Vercel**:

```bash
cd zzp-mobile
npm run build          # tworzy folder dist/
```

Wgraj folder `dist/` na wybrany hosting (drag & drop w panelu Netlify, albo `vercel`, albo `wrangler pages deploy dist`).
W ustawieniach projektu hostingu dodaj zmienne środowiskowe budowania (jeśli budujesz w chmurze):
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY` (ten ostatni z kroku 3).

> Dostaniesz adres typu `https://zzp-mobile.pages.dev` — to jego otwierasz na telefonie.

**iPhone (iOS 16.4+):** otwórz adres w Safari → przycisk **Udostępnij** → **„Do ekranu początkowego"**.
Uruchom aplikację z ikony na ekranie głównym (nie z Safari) — dopiero wtedy push zadziała.
**Android (Chrome):** push działa od razu; instalacja PWA opcjonalna.

---

## 3. Klucze VAPID

Wygeneruj parę kluczy (jednorazowo):

```bash
npx web-push generate-vapid-keys
```

Otrzymasz `Public Key` i `Private Key`.
- **Public Key** → wpisz do `zzp-mobile/.env.local` jako `VITE_VAPID_PUBLIC_KEY=...`
  (i do zmiennych budowania na hostingu z kroku 2), potem przebuduj/wgraj ponownie.
- **Private Key** → będzie sekretem funkcji Supabase (krok 4). Nie umieszczaj go we froncie.

---

## 4. Funkcja Supabase `send-due-reminders`

Kod jest w `supabase/functions/send-due-reminders/index.ts`. Wdrożenie przez Supabase CLI:

```bash
# jednorazowo: instalacja i logowanie
npm i -g supabase
supabase login
supabase link --project-ref <TWÓJ_PROJECT_REF>   # ref z URL projektu

# sekrety (klucz prywatny VAPID + adres kontaktowy)
supabase secrets set VAPID_PUBLIC_KEY="<public>" VAPID_PRIVATE_KEY="<private>" VAPID_SUBJECT="mailto:ty@example.com"

# wdrożenie funkcji
supabase functions deploy send-due-reminders
```

`SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` Supabase wstrzykuje automatycznie — nie ustawiaj ich ręcznie.

Test ręczny (powinno zwrócić `{ "sent": N, "overdue": M }`):

```bash
curl -X POST "https://<PROJECT_REF>.functions.supabase.co/send-due-reminders" \
  -H "Authorization: Bearer <ANON_KEY>"
```

---

## 5. Harmonogram — codzienne uruchomienie (pg_cron)

W Supabase → SQL Editor. Włącz rozszerzenia i zaplanuj wywołanie funkcji co dzień o 8:00:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'due-reminders-daily',
  '0 8 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/send-due-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <ANON_KEY>',
      'Content-Type', 'application/json'
    )
  );
  $$
);
```

Podmień `<PROJECT_REF>` i `<ANON_KEY>`. Aby zmienić lub usunąć harmonogram:
`select cron.unschedule('due-reminders-daily');`

---

## 6. Test na telefonie

1. Otwórz aplikację z HTTPS (na iPhone — z ikony na ekranie głównym).
2. Menu **☰ Więcej → 🔔 Włącz powiadomienia** → zezwól na powiadomienia.
   (Subskrypcja zapisze się w tabeli `push_subscriptions`.)
3. Ustaw jakąś fakturę tak, by miała `due_date` w przeszłości i status inny niż `paid`.
4. Wywołaj funkcję ręcznie (curl z kroku 4) lub poczekaj na cron.
5. Na telefonie powinno pojawić się powiadomienie „🔴 Faktury po terminie".

---

## Wariant awaryjny (bez chmury): wysyłka z desktopu

Zamiast pg_cron można wyzwalać `send-due-reminders` z aplikacji desktop przy synchronizacji
(np. raz dziennie, przy starcie). Zaleta: brak konfiguracji cron. Wada: działa tylko gdy
komputer jest włączony. Wystarczy z desktopu wykonać ten sam `POST` do URL funkcji.
Domyślnie rekomendowany jest wariant z pg_cron (kroki 4–5), bo działa niezależnie od komputera.
