// Supabase Edge Function: send-due-reminders
// Codziennie (uruchamiana przez pg_cron — patrz docs/push-setup.md) sprawdza
// faktury po terminie płatności i wysyła powiadomienie Web Push na wszystkie
// zarejestrowane urządzenia (tabela public.push_subscriptions).
//
// Sekrety wymagane (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (np. mailto:ty@example.com)
// SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY są wstrzykiwane automatycznie.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (_req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!;
  const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
  const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';
  // Pełny adres hostowanej PWA (GitHub Pages), np.
  // https://dave92nl.github.io/ZZP-Dave-Media-Aplication/ — używany jako cel kliknięcia.
  const SITE_URL = Deno.env.get('SITE_URL') ?? '/';

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return json({ error: 'Brak kluczy VAPID w sekretach funkcji.' }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const today = new Date().toISOString().slice(0, 10);

  // Faktury po terminie: due_date < dziś, nieopłacone i niebędące szkicem/anulowane.
  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('id, invoice_number, due_date, total, total_eur, status')
    .lt('due_date', today)
    .not('status', 'in', '("paid","cancelled","draft")');

  if (invErr) return json({ error: 'Odczyt faktur: ' + invErr.message }, 500);
  if (!invoices || invoices.length === 0) return json({ sent: 0, overdue: 0 });

  const overdueCount = invoices.length;
  const total = invoices.reduce((s, i) => s + Number(i.total_eur ?? i.total ?? 0), 0);
  const payload = JSON.stringify({
    title: '🔴 Faktury po terminie',
    body: `${overdueCount} nieopłaconych faktur na ${total.toFixed(2)} €`,
    url: SITE_URL.replace(/\/?$/, '/') + '#invoices',
    tag: 'due-invoices'
  });

  const { data: subs, error: subErr } = await supabase.from('push_subscriptions').select('*');
  if (subErr) return json({ error: 'Odczyt subskrypcji: ' + subErr.message }, 500);

  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      );
      sent++;
    } catch (err) {
      // 404/410 = subskrypcja wygasła → posprzątaj
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      }
    }
  }

  return json({ sent, overdue: overdueCount, total });
});
