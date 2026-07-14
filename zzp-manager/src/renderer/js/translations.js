'use strict';

/* ═══════════════════════════════════════════════════════════════
   Translations — ZZP Manager
   Languages: pl (default), en, nl

   Strategy: MutationObserver watches #page-content. On any change,
   translatePage() walks all text nodes + attributes and replaces
   known Polish strings with EN/NL equivalents.
   This way NO page file needs to be modified.
   ═══════════════════════════════════════════════════════════════ */

let _lang = 'pl';
let _translating = false;
let _debounceTimer = null;
let _maxWaitTimer = null;
let _observer = null;

// ── Runtime ────────────────────────────────────────────────────
function setLanguage(lang) {
  if (!['pl','en','nl'].includes(lang)) return;
  _lang = lang;
  document.documentElement.setAttribute('data-lang', lang);
  _updateNav();
  _setupObserver(); // ensure observer is active for future DOM changes
  applyTranslations();
}

function getLanguage() { return _lang; }

// Mapowanie kodu języka aplikacji na locale BCP-47 dla Intl/toLocaleDateString —
// używane wszędzie tam, gdzie strony renderują daty/miesiące ręcznie (np. karta
// szczegółów wpisu czasu, nagłówek kalendarza) zamiast przez DOM_MAP/PATTERN_RULES.
function localeForLang() {
  return _lang === 'nl' ? 'nl-NL' : _lang === 'en' ? 'en-GB' : 'pl-PL';
}

function t(key, vars) {
  const entry = NAV_KEYS[key];
  if (!entry) return key;
  let str = entry[_lang] || entry['pl'] || key;
  if (vars) for (const [k, v] of Object.entries(vars)) str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  return str;
}

function tSub(key) {
  return (NAV_KEYS[key]?.pl) || '';
}

function tLabel(key) {
  const main = t(key);
  if (_lang === 'nl') {
    const sub = tSub(key);
    if (sub && sub !== main) return `${main}<span class="lang-sub">${sub}</span>`;
  }
  return main;
}

// ── Navigation keys (for sidebar & settings) ──────────────────
const NAV_KEYS = {
  'nav.dashboard':  { pl: 'Dashboard',       en: 'Dashboard',       nl: 'Dashboard' },
  'nav.time':       { pl: 'Czas pracy',       en: 'Time Tracking',   nl: 'Tijdregistratie' },
  'nav.invoices':   { pl: 'Faktury',          en: 'Invoices',        nl: 'Facturen' },
  'nav.expenses':   { pl: 'Koszty',           en: 'Expenses',        nl: 'Kosten' },
  'nav.mileage':    { pl: 'Kilometrówka',     en: 'Mileage',         nl: 'Kilometerregistratie' },
  'nav.tax':        { pl: 'Podatki',          en: 'Taxes',           nl: 'Belastingen' },
  'nav.reports':    { pl: 'Raporty',          en: 'Reports',         nl: 'Rapporten' },
  'nav.projects':   { pl: 'Projekty',         en: 'Projects',        nl: 'Projecten' },
  'nav.contacts':   { pl: 'Kontakty',         en: 'Contacts',        nl: 'Contacten' },
  'nav.tasks':      { pl: 'Zadania',          en: 'Tasks',           nl: 'Taken' },
  'nav.notes':      { pl: 'Notatnik',         en: 'Notes',           nl: 'Notities' },
  'nav.youtube':    { pl: 'YouTube',          en: 'YouTube',         nl: 'YouTube' },
  'nav.reminders':  { pl: 'Przypomnienia',    en: 'Reminders',       nl: 'Herinneringen' },
  'nav.settings':   { pl: 'Ustawienia',       en: 'Settings',        nl: 'Instellingen' },
};

// ══════════════════════════════════════════════════════════════
// DIRECT STRING MAP  { 'Polish text': { en: '...', nl: '...' } }
// Keys = exact trimmed text node content that appears in DOM
// ══════════════════════════════════════════════════════════════
const DOM_MAP = {
  // ── Page titles ────────────────────────────────────────────
  '🏠 Dashboard':                   { en: '🏠 Dashboard',                     nl: '🏠 Dashboard' },
  '📄 Faktury':                     { en: '📄 Invoices',                       nl: '📄 Facturen' },
  '⏱️ Czas pracy':                  { en: '⏱️ Time Tracking',                  nl: '⏱️ Tijdregistratie' },
  '💸 Koszty firmowe':              { en: '💸 Business Expenses',              nl: '💸 Zakelijke kosten' },
  '🧮 Kalkulator podatkowy':        { en: '🧮 Tax Calculator',                 nl: '🧮 Belastingcalculator' },
  '📊 Raporty finansowe':           { en: '📊 Financial Reports',              nl: '📊 Financiële rapporten' },
  '📁 Projekty':                    { en: '📁 Projects',                       nl: '📁 Projecten' },
  '👥 Kontakty / CRM':              { en: '👥 Contacts / CRM',                 nl: '👥 Contacten / CRM' },
  '✅ Zadania':                     { en: '✅ Tasks',                          nl: '✅ Taken' },
  '📝 Notatnik':                    { en: '📝 Notes',                          nl: '📝 Notities' },
  '🎬 YouTube / AdSense Analytics': { en: '🎬 YouTube / AdSense Analytics',    nl: '🎬 YouTube / AdSense Analytics' },
  '🔔 Przypomnienia':               { en: '🔔 Reminders',                      nl: '🔔 Herinneringen' },
  '⚙️ Ustawienia':                  { en: '⚙️ Settings',                       nl: '⚙️ Instellingen' },

  // ── Common buttons ─────────────────────────────────────────
  '+ Nowa faktura':                 { en: '+ New Invoice',                     nl: '+ Nieuwe factuur' },
  '+ Nowy projekt':                 { en: '+ New Project',                     nl: '+ Nieuw project' },
  '+ Nowy kontakt':                 { en: '+ New Contact',                     nl: '+ Nieuw contact' },
  '+ Nowe zadanie':                 { en: '+ New Task',                        nl: '+ Nieuwe taak' },
  '+ Nowe przypomnienie':           { en: '+ New Reminder',                    nl: '+ Nieuwe herinnering' },
  '+ Dodaj koszt':                  { en: '+ Add Expense',                     nl: '+ Kosten toevoegen' },
  '+ Dodaj notatke':                { en: '+ New Note',                        nl: '+ Nieuwe notitie' },
  '+ Dodaj notatkę':                { en: '+ New Note',                        nl: '+ Nieuwe notitie' },
  '+ Dodaj wpis':                   { en: '+ Add Entry',                       nl: '+ Invoer toevoegen' },
  '+ Dodaj pierwszy koszt':         { en: '+ Add first expense',               nl: '+ Eerste kosten toevoegen' },
  '▶ Start timer':                  { en: '▶ Start Timer',                     nl: '▶ Timer starten' },
  '▶ START':                        { en: '▶ START',                           nl: '▶ START' },
  '⏸ PAUZA':                        { en: '⏸ PAUSE',                           nl: '⏸ PAUZE' },
  '⏹ STOP':                         { en: '⏹ STOP',                            nl: '⏹ STOP' },
  '💾 Zapisz':                      { en: '💾 Save',                           nl: '💾 Opslaan' },
  '💾 Zapisz zmiany':               { en: '💾 Save Changes',                   nl: '💾 Wijzigingen opslaan' },
  'Zapisz':                         { en: 'Save',                              nl: 'Opslaan' },
  'Anuluj':                         { en: 'Cancel',                            nl: 'Annuleren' },
  'Potwierdź':                      { en: 'Confirm',                           nl: 'Bevestigen' },
  '✕ Wyczyść':                      { en: '✕ Clear',                           nl: '✕ Wissen' },
  'Wszystkie →':                    { en: 'All →',                             nl: 'Alle →' },
  'Wszystkie faktury →':            { en: 'All invoices →',                    nl: 'Alle facturen →' },
  '📤 Eksportuj':                   { en: '📤 Export',                         nl: '📤 Exporteren' },
  '🔄 Przelicz':                    { en: '🔄 Recalculate',                    nl: '🔄 Herberekenen' },
  '📊 Generuj':                     { en: '📊 Generate',                       nl: '📊 Genereren' },
  '📤 CSV':                         { en: '📤 CSV',                             nl: '📤 CSV' },
  '📊 Excel':                       { en: '📊 Excel',                          nl: '📊 Excel' },
  '📄 PDF':                         { en: '📄 PDF',                             nl: '📄 PDF' },
  '+ Importuj ręcznie':             { en: '+ Add Manually',                    nl: '+ Handmatig toevoegen' },
  '📥 Importuj CSV':                { en: '📥 Import CSV',                     nl: '📥 CSV importeren' },
  '📥 Import XML/PDF':              { en: '📥 Import XML/PDF',                 nl: '📥 XML/PDF importeren' },
  'Import z efaktura.nl':           { en: 'Import from efaktura.nl',           nl: 'Importeren uit efaktura.nl' },
  '📥 Import faktur z efaktura.nl': { en: '📥 Import invoices from efaktura.nl', nl: '📥 Facturen importeren uit efaktura.nl' },
  '📥 Import kosztów z efaktura.nl':{ en: '📥 Import expenses from efaktura.nl', nl: '📥 Kosten importeren uit efaktura.nl' },
  'Importuj zaznaczone':            { en: 'Import selected',                   nl: 'Geselecteerde importeren' },
  'Analizuję…':                     { en: 'Analysing…',                        nl: 'Analyseren…' },
  'Znaleziono':                     { en: 'Found',                             nl: 'Gevonden' },
  'gotowe':                         { en: 'ready',                             nl: 'gereed' },
  'błędy':                          { en: 'errors',                            nl: 'fouten' },
  'Błąd parsowania':                { en: 'Parse error',                       nl: 'Parsefout' },
  'Wymaga sprawdzenia':             { en: 'Needs review',                      nl: 'Controle vereist' },
  'Zaimportowano':                  { en: 'Imported',                          nl: 'Geïmporteerd' },
  'pominięto':                      { en: 'skipped',                           nl: 'overgeslagen' },
  'Kategoria zostanie ustawiona na': { en: 'Category will be set to',          nl: 'Categorie wordt ingesteld op' },
  '🔄 Resetuj dane YT':             { en: '🔄 Reset YT Data',                  nl: '🔄 YT-data wissen' },
  '✅ Oznacz jako wykonane':         { en: '✅ Mark as done',                   nl: '✅ Markeer als gedaan' },
  '⊞ Karty':                        { en: '⊞ Cards',                          nl: '⊞ Kaarten' },
  '≡ Tabela':                       { en: '≡ Table',                           nl: '≡ Tabel' },
  '≡ Lista':                        { en: '≡ List',                            nl: '≡ Lijst' },
  '📅 Kalendarz':                   { en: '📅 Calendar',                       nl: '📅 Kalender' },
  '🔒 Zablokuj':                    { en: '🔒 Lock',                           nl: '🔒 Vergrendelen' },

  // ── Filter / select options ────────────────────────────────
  'Wszystkie miesiące':             { en: 'All months',                        nl: 'Alle maanden' },
  'Wszystkie statusy':              { en: 'All statuses',                      nl: 'Alle statussen' },
  'Wszystkie kategorie':            { en: 'All categories',                    nl: 'Alle categorieën' },
  'Wszystkie projekty':             { en: 'All projects',                      nl: 'Alle projecten' },
  'Wszyscy klienci':                { en: 'All clients',                       nl: 'Alle klanten' },
  'Wszystkie':                      { en: 'All',                               nl: 'Alle' },
  'Aktywne':                        { en: 'Active',                            nl: 'Actief' },
  'Aktywni':                        { en: 'Active',                            nl: 'Actief' },
  'Nieaktywni':                     { en: 'Inactive',                          nl: 'Inactief' },

  // ── Months (Polish) ────────────────────────────────────────
  'Styczeń':    { en: 'January',   nl: 'Januari' },
  'Luty':       { en: 'February',  nl: 'Februari' },
  'Marzec':     { en: 'March',     nl: 'Maart' },
  'Kwiecień':   { en: 'April',     nl: 'April' },
  'Maj':        { en: 'May',       nl: 'Mei' },
  'Czerwiec':   { en: 'June',      nl: 'Juni' },
  'Lipiec':     { en: 'July',      nl: 'Juli' },
  'Sierpień':   { en: 'August',    nl: 'Augustus' },
  'Wrzesień':   { en: 'September', nl: 'September' },
  'Październik':{ en: 'October',   nl: 'Oktober' },
  'Listopad':   { en: 'November',  nl: 'November' },
  'Grudzień':   { en: 'December',  nl: 'December' },

  // ── Days of week ───────────────────────────────────────────
  'Pon': { en: 'Mon', nl: 'Ma' }, 'Wto': { en: 'Tue', nl: 'Di' },
  'Śro': { en: 'Wed', nl: 'Wo' }, 'Czw': { en: 'Thu', nl: 'Do' },
  'Pią': { en: 'Fri', nl: 'Vr' }, 'Sob': { en: 'Sat', nl: 'Za' },
  'Ndz': { en: 'Sun', nl: 'Zo' },

  // ── Status labels ──────────────────────────────────────────
  'Robocza':              { en: 'Draft',          nl: 'Concept' },
  'Robocze':              { en: 'Drafts',         nl: 'Concepten' },
  'Wysłana':              { en: 'Sent',           nl: 'Verzonden' },
  'Wysłane':              { en: 'Sent',           nl: 'Verzonden' },
  'Zapłacona':            { en: 'Paid',           nl: 'Betaald' },
  'Zapłacone':            { en: 'Paid',           nl: 'Betaald' },
  'Przeterminowana':      { en: 'Overdue',        nl: 'Verlopen' },
  'Przeterminowane':      { en: 'Overdue',        nl: 'Verlopen' },
  'Anulowana':            { en: 'Cancelled',      nl: 'Geannuleerd' },
  'Anulowane':            { en: 'Cancelled',      nl: 'Geannuleerd' },
  'Aktywny':              { en: 'Active',         nl: 'Actief' },
  'Nieaktywny':           { en: 'Inactive',       nl: 'Inactief' },
  'Do zrobienia':         { en: 'To do',          nl: 'Te doen' },
  'W toku':               { en: 'In progress',    nl: 'In behandeling' },
  'Ukończone':            { en: 'Done',           nl: 'Klaar' },
  'Ukończony':            { en: 'Completed',      nl: 'Voltooid' },
  'Wstrzymany':           { en: 'Paused',         nl: 'Gepauzeerd' },
  'Zakończony':           { en: 'Completed',      nl: 'Voltooid' },
  'Anulowany':            { en: 'Cancelled',      nl: 'Geannuleerd' },
  '✅ Odwołane':          { en: '✅ Dismissed',   nl: '✅ Gesloten' },
  '🔴 Pilne':             { en: '🔴 Urgent',      nl: '🔴 Urgent' },
  '🟡 Zbliżające się':    { en: '🟡 Upcoming',    nl: '🟡 Aankomend' },
  '🟢 Przyszłe':          { en: '🟢 Future',      nl: '🟢 Toekomstig' },
  'PILNE':                { en: 'URGENT',         nl: 'DRINGEND' },
  'WYSOKI':               { en: 'HIGH',           nl: 'HOOG' },
  'ŚREDNI':               { en: 'MEDIUM',         nl: 'GEMIDDELD' },
  'NISKI':                { en: 'LOW',            nl: 'LAAG' },

  // ── Table headers ──────────────────────────────────────────
  'Data':          { en: 'Date',         nl: 'Datum' },
  'Numer':         { en: 'Number',       nl: 'Nummer' },
  'Nr faktury':    { en: 'Invoice No.',  nl: 'Factuurnr.' },
  'Klient':        { en: 'Client',       nl: 'Klant' },
  'Projekt':       { en: 'Project',      nl: 'Project' },
  'Termin':        { en: 'Due Date',     nl: 'Vervaldatum' },
  'Kwota':         { en: 'Amount',       nl: 'Bedrag' },
  'Status':        { en: 'Status',       nl: 'Status' },
  'Akcje':         { en: 'Actions',      nl: 'Acties' },
  'Kategoria':     { en: 'Category',     nl: 'Categorie' },
  'Opis':          { en: 'Description',  nl: 'Omschrijving' },
  'BTW':           { en: 'VAT',          nl: 'BTW' },
  'Dostawca':      { en: 'Vendor',       nl: 'Leverancier' },
  'Paragon':       { en: 'Receipt',      nl: 'Bon' },
  'Typ':           { en: 'Type',         nl: 'Type' },
  'Tytuł':         { en: 'Title',        nl: 'Titel' },
  'Godzina':       { en: 'Time',         nl: 'Tijd' },
  'Czas':          { en: 'Duration',     nl: 'Duur' },
  'Godziny':       { en: 'Hours',        nl: 'Uren' },
  'Billable':      { en: 'Billable',     nl: 'Factureerbaar' },
  'Fact.':         { en: 'Bill.',        nl: 'Fact.' },
  'Priorytet':     { en: 'Priority',     nl: 'Prioriteit' },
  'Nazwa':         { en: 'Name',         nl: 'Naam' },
  'Email':         { en: 'Email',        nl: 'E-mail' },
  'Miesiąc':       { en: 'Month',        nl: 'Maand' },
  'Przychody':     { en: 'Income',       nl: 'Inkomsten' },
  'Koszty':        { en: 'Expenses',     nl: 'Kosten' },
  'Zysk':          { en: 'Profit',       nl: 'Winst' },
  'Zmiana %':      { en: 'Change %',     nl: 'Wijziging %' },
  'Marża %':       { en: 'Margin %',     nl: 'Marge %' },
  'SUMA':          { en: 'TOTAL',        nl: 'TOTAAL' },

  // ── Form labels ────────────────────────────────────────────
  'Data *':               { en: 'Date *',                 nl: 'Datum *' },
  'Kategoria *':          { en: 'Category *',             nl: 'Categorie *' },
  'Opis *':               { en: 'Description *',          nl: 'Omschrijving *' },
  'Tytuł *':              { en: 'Title *',                nl: 'Titel *' },
  'Tytuł':                { en: 'Title',                  nl: 'Titel' },
  'Dostawca':             { en: 'Vendor',                 nl: 'Leverancier' },
  'Notatki':              { en: 'Notes',                  nl: 'Notities' },
  'Kwota brutto (€) *':   { en: 'Gross amount (€) *',     nl: 'Bruto bedrag (€) *' },
  'Stawka BTW':           { en: 'VAT rate',               nl: 'BTW-tarief' },
  'Kwota BTW':            { en: 'VAT amount',             nl: 'BTW-bedrag' },
  'Kwota netto':          { en: 'Net amount',             nl: 'Netto bedrag' },
  'Odliczalny podatkowo': { en: 'Tax deductible',         nl: 'Fiscaal aftrekbaar' },
  'BTW odliczalna':       { en: 'Deductible VAT',         nl: 'Aftrekbare BTW' },
  'Powtarzaj':            { en: 'Repeat',                 nl: 'Herhalen' },
  'Opis (opcjonalnie)':   { en: 'Description (optional)', nl: 'Omschrijving (optioneel)' },
  'Rok podatkowy:':       { en: 'Tax year:',              nl: 'Belastingjaar:' },
  'Projekt':              { en: 'Project',                nl: 'Project' },
  'Pomodoro':             { en: 'Pomodoro',               nl: 'Pomodoro' },
  'Własny czas':          { en: 'Free mode',              nl: 'Vrije modus' },

  // ── Recurrence options ──────────────────────────────────────
  'Nie':        { en: 'No',        nl: 'Nee' },
  'Co miesiąc': { en: 'Monthly',   nl: 'Maandelijks' },
  'Co kwartał': { en: 'Quarterly', nl: 'Kwartaal' },
  'Co rok':     { en: 'Yearly',    nl: 'Jaarlijks' },

  // ── Reminder type labels ───────────────────────────────────
  'BTW aangifte':  { en: 'VAT Return',        nl: 'BTW-aangifte' },
  'ICP opgaaf':    { en: 'ICP Declaration',   nl: 'ICP-opgaaf' },
  'Faktura':       { en: 'Invoice',           nl: 'Factuur' },
  'Własne':        { en: 'Custom',            nl: 'Eigen' },

  // ── Dashboard KPI labels ───────────────────────────────────
  '💰 Przychody — ten miesiąc':     { en: '💰 Income — this month',     nl: '💰 Inkomen — deze maand' },
  '📋 Przychody YTD':               { en: '📋 Income YTD',               nl: '📋 Inkomen YTD' },
  '⏱️ Godziny — ten miesiąc':       { en: '⏱️ Hours — this month',       nl: '⏱️ Uren — deze maand' },
  '💸 Koszty — ten miesiąc':        { en: '💸 Expenses — this month',    nl: '💸 Kosten — deze maand' },
  '📅 Najbliższy termin':           { en: '📅 Next Deadline',             nl: '📅 Volgende deadline' },
  'Brak':                           { en: 'None',                        nl: 'Geen' },
  '🔔 Nadchodzące terminy':         { en: '🔔 Upcoming Deadlines',       nl: '🔔 Aankomende deadlines' },
  '🔴 Przeterminowane faktury':     { en: '🔴 Overdue Invoices',         nl: '🔴 Verlopen facturen' },
  '✅ Brak przeterminowanych faktur!': { en: '✅ No overdue invoices!',  nl: '✅ Geen verlopen facturen!' },
  'Brak aktywnych przypomnień.':    { en: 'No active reminders.',        nl: 'Geen actieve herinneringen.' },
  'Przychody vs Koszty — 12 miesięcy': { en: 'Income vs Expenses — 12 months', nl: 'Inkomsten vs Kosten — 12 maanden' },
  'Koszty wg kategorii':            { en: 'Expenses by Category',        nl: 'Kosten per categorie' },
  'Godziny pracy — ostatnie 6 miesięcy': { en: 'Work Hours — last 6 months', nl: 'Werkuren — afgelopen 6 maanden' },
  'Brak kosztów w tym miesiącu':    { en: 'No expenses this month',      nl: 'Geen kosten deze maand' },
  'Brak kosztów':                   { en: 'No expenses',                 nl: 'Geen kosten' },
  'Brak danych':                    { en: 'No data',                     nl: 'Geen gegevens' },

  // ── Dashboard quick action buttons ────────────────────────
  '+ Nowa faktura':   { en: '+ New Invoice',    nl: '+ Nieuwe factuur' },
  '▶ Start timer':    { en: '▶ Start Timer',    nl: '▶ Timer starten' },
  '+ Dodaj koszt':    { en: '+ Add Expense',    nl: '+ Kosten toevoegen' },
  '+ Nowe zadanie':   { en: '+ New Task',       nl: '+ Nieuwe taak' },

  // ── Invoices ───────────────────────────────────────────────
  'Nr faktury':           { en: 'Invoice No.',     nl: 'Factuurnr.' },
  'Data wystawienia':     { en: 'Issue Date',      nl: 'Factuurdatum' },
  'Termin płatności':     { en: 'Payment Due',     nl: 'Betalingsdatum' },
  'Kwota brutto':         { en: 'Gross Amount',    nl: 'Bruto bedrag' },
  'Suma':                 { en: 'Total',           nl: 'Totaal' },
  'Łącznie:':             { en: 'Total:',          nl: 'Totaal:' },
  'Łącznie':              { en: 'Total',           nl: 'Totaal' },
  'Fakturowane':          { en: 'Billable',        nl: 'Factureerbaar' },
  'Niefakturowane':       { en: 'Non-billable',    nl: 'Niet-factureerbaar' },
  'Duplikuj':             { en: 'Duplicate',       nl: 'Dupliceren' },
  'Oznacz jako zapłaconą':{ en: 'Mark as paid',    nl: 'Markeer als betaald' },
  'Eksportuj PDF':        { en: 'Export PDF',      nl: 'PDF exporteren' },
  'Nowa faktura':         { en: 'New Invoice',     nl: 'Nieuwe factuur' },
  'Edytuj fakturę':       { en: 'Edit Invoice',    nl: 'Factuur bewerken' },
  'Pozycje faktury':      { en: 'Invoice Items',   nl: 'Factuurregels' },
  '+ Dodaj pozycję':      { en: '+ Add Item',      nl: '+ Regel toevoegen' },
  'Sztuk':                { en: 'Pcs',             nl: 'Stk' },
  'Netto':                { en: 'Net',             nl: 'Netto' },
  'BTW 21%':              { en: 'VAT 21%',         nl: 'BTW 21%' },
  'BTW 9%':               { en: 'VAT 9%',          nl: 'BTW 9%' },
  'BTW 0%':               { en: 'VAT 0%',          nl: 'BTW 0%' },
  'Odwrócony VAT':        { en: 'Reverse charge',  nl: 'BTW verlegd' },

  // ── Expenses ───────────────────────────────────────────────
  'Suma kosztów':      { en: 'Total Expenses',   nl: 'Totale kosten' },
  'BTW odliczalna':    { en: 'Deductible VAT',   nl: 'Aftrekbare BTW' },
  'Koszty odliczalne': { en: 'Deductible Costs', nl: 'Aftrekbare kosten' },
  'Wpisów':            { en: 'Entries',          nl: 'Invoeren' },
  'Brak kosztów dla wybranych filtrów.': { en: 'No expenses for selected filters.', nl: 'Geen kosten voor geselecteerde filters.' },
  '✏️ Edytuj koszt':   { en: '✏️ Edit Expense',  nl: '✏️ Kosten bewerken' },
  '+ Dodaj koszt firmowy': { en: '+ Add Business Expense', nl: '+ Zakelijke kosten toevoegen' },
  '💾 Zapisz zmiany':  { en: '💾 Save Changes',  nl: '💾 Wijzigingen opslaan' },
  'Brak':              { en: 'None',             nl: 'Geen' },

  // ── Expense categories ─────────────────────────────────────
  'Sprzęt IT':              { en: 'IT Equipment',       nl: 'IT-apparatuur' },
  'Internet / Telefon':     { en: 'Internet / Phone',   nl: 'Internet / Telefoon' },
  'Oprogramowanie / Licencje': { en: 'Software / Licenses', nl: 'Software / Licenties' },
  'Transport / Paliwo':     { en: 'Transport / Fuel',   nl: 'Transport / Brandstof' },
  'Biuro / Materiały':      { en: 'Office / Supplies',  nl: 'Kantoor / Materialen' },
  'Marketing / Reklama':    { en: 'Marketing / Ads',    nl: 'Marketing / Reclame' },
  'Księgowość / Prawnik':   { en: 'Accounting / Lawyer',nl: 'Boekhouding / Advocaat' },
  'Szkolenia / Kursy':      { en: 'Training / Courses', nl: 'Training / Cursussen' },
  'Inne':                   { en: 'Other',              nl: 'Overig' },

  // ── Time tracking ──────────────────────────────────────────
  'Timer':                  { en: 'Timer',              nl: 'Timer' },
  '⏱ Timer':               { en: '⏱ Timer',            nl: '⏱ Timer' },
  'Ręczny wpis':            { en: 'Manual Entry',       nl: 'Handmatige invoer' },
  'Wpis ręczny':            { en: 'Manual Entry',       nl: 'Handmatige invoer' },
  'Godzina od:':            { en: 'From:',              nl: 'Van:' },
  'Godzina do:':            { en: 'To:',                nl: 'Tot:' },
  'Czas (minuty):':         { en: 'Duration (min):',    nl: 'Duur (min):' },
  'Fakturowane?':           { en: 'Billable?',          nl: 'Factureerbaar?' },
  'Tak':                    { en: 'Yes',                nl: 'Ja' },
  'Wszystkie kategorie':    { en: 'All categories',     nl: 'Alle categorieën' },
  '📤 Eksport czasu pracy': { en: '📤 Export Time Report', nl: '📤 Tijdrapport exporteren' },
  'Zakres':                 { en: 'Range',              nl: 'Periode' },
  'Format':                 { en: 'Format',             nl: 'Formaat' },
  'Grupowanie':             { en: 'Grouping',           nl: 'Groepering' },
  'Per dzień':              { en: 'By day',             nl: 'Per dag' },
  'Per projekt':            { en: 'By project',         nl: 'Per project' },
  'Per kategoria':          { en: 'By category',        nl: 'Per categorie' },

  // ── Time categories ─────────────────────────────────────────
  'YouTube/Archiwum Zła':       { en: 'YouTube/Content',   nl: 'YouTube/Content' },
  'Edycja wideo':               { en: 'Video Editing',     nl: 'Videobewerking' },
  'Research/Scenariusz':        { en: 'Research/Script',   nl: 'Onderzoek/Script' },
  'Administracja ZZP':          { en: 'ZZP Admin',         nl: 'ZZP Administratie' },
  'Marketing/Social Media':     { en: 'Marketing/Social',  nl: 'Marketing/Social' },
  'IT/Techniczne':              { en: 'IT/Technical',      nl: 'IT/Technisch' },

  // ── Reports ────────────────────────────────────────────────
  'Miesięczny':                 { en: 'Monthly',           nl: 'Maandelijks' },
  'Kwartalny':                  { en: 'Quarterly',         nl: 'Kwartaal' },
  'Roczny':                     { en: 'Annual',            nl: 'Jaarlijks' },
  'Rok do roku':                { en: 'Year over Year',    nl: 'Jaar op jaar' },
  'PRZYCHODY':                  { en: 'INCOME',            nl: 'INKOMSTEN' },
  'KOSZTY':                     { en: 'EXPENSES',          nl: 'KOSTEN' },
  'CZAS PRACY':                 { en: 'WORK HOURS',        nl: 'WERKUREN' },
  'Faktury (zapłacone)':        { en: 'Invoices (paid)',   nl: 'Facturen (betaald)' },
  'AdSense / YouTube':          { en: 'AdSense / YouTube', nl: 'AdSense / YouTube' },
  'Suma przychodów':            { en: 'Total Income',      nl: 'Totale inkomsten' },
  'Suma kosztów':               { en: 'Total Expenses',    nl: 'Totale kosten' },
  'Zysk netto':                 { en: 'Net Profit',        nl: 'Nettowinst' },
  'Marża netto':                { en: 'Net Margin',        nl: 'Nettomarge' },
  'Łączne godziny':             { en: 'Total Hours',       nl: 'Totale uren' },
  'PODSUMOWANIE KWARTAŁU':      { en: 'QUARTERLY SUMMARY', nl: 'KWARTAALOVERZICHT' },
  'PER MIESIĄC':                { en: 'PER MONTH',         nl: 'PER MAAND' },
  'Godziny łącznie':            { en: 'Total Hours',       nl: 'Totale uren' },
  'Szczegóły miesięczne':       { en: 'Monthly Details',   nl: 'Maandelijks overzicht' },
  'Przychody vs Koszty — per miesiąc': { en: 'Income vs Expenses — per month', nl: 'Inkomsten vs Kosten — per maand' },
  'Przychody łącznie':          { en: 'Total Income',      nl: 'Totale inkomsten' },
  'Koszty łącznie':             { en: 'Total Expenses',    nl: 'Totale kosten' },
  'Generowanie raportu…':       { en: 'Generating report…', nl: 'Rapport genereren…' },

  // ── Tax ────────────────────────────────────────────────────
  'Inkomstenbelasting':         { en: 'Income Tax',        nl: 'Inkomstenbelasting' },
  'Przeliczanie…':              { en: 'Calculating…',      nl: 'Berekenen…' },
  'Szacowany podatek':          { en: 'Estimated Tax',     nl: 'Geschatte belasting' },
  'Rezerwa miesięczna':         { en: 'Monthly Reserve',   nl: 'Maandelijkse reserve' },
  'Urencriterium':              { en: 'Hours Criterion',   nl: 'Urencriterium' },
  'Stawki podatkowe':           { en: 'Tax Rates',         nl: 'Belastingtarieven' },

  // ── Projects ───────────────────────────────────────────────
  'W toku':       { en: 'In progress', nl: 'In behandeling' },
  'Wstrzymany':   { en: 'Paused',      nl: 'Gepauzeerd' },
  'Zakończony':   { en: 'Completed',   nl: 'Voltooid' },
  'Anulowany':    { en: 'Cancelled',   nl: 'Geannuleerd' },
  'Budżet:':      { en: 'Budget:',     nl: 'Budget:' },
  'Godzin:':      { en: 'Hours:',      nl: 'Uren:' },
  'Klient:':      { en: 'Client:',     nl: 'Klant:' },
  'Brak projektów.':  { en: 'No projects.', nl: 'Geen projecten.' },
  'Brak klientów.':   { en: 'No clients.',  nl: 'Geen klanten.' },
  'Nowy projekt':     { en: 'New Project',  nl: 'Nieuw project' },
  'Edytuj projekt':   { en: 'Edit Project', nl: 'Project bewerken' },

  // ── Contacts ───────────────────────────────────────────────
  'Brak kontaktów.':  { en: 'No contacts.',  nl: 'Geen contacten.' },
  'Nowy kontakt':     { en: 'New Contact',   nl: 'Nieuw contact' },
  'Email':            { en: 'Email',         nl: 'E-mail' },
  'Telefon':          { en: 'Phone',         nl: 'Telefoon' },
  'Spotkanie':        { en: 'Meeting',       nl: 'Vergadering' },
  'Notatka':          { en: 'Note',          nl: 'Notitie' },
  'Interakcje':       { en: 'Interactions',  nl: 'Interacties' },
  'Pliki':            { en: 'Files',         nl: 'Bestanden' },

  // ── Tasks ──────────────────────────────────────────────────
  'Nowe zadanie':   { en: 'New Task',       nl: 'Nieuwe taak' },
  'Edytuj zadanie': { en: 'Edit Task',      nl: 'Taak bewerken' },
  'Brak zadań.':    { en: 'No tasks.',      nl: 'Geen taken.' },
  'Brak zadań dla wybranych filtrów.': { en: 'No tasks for selected filters.', nl: 'Geen taken voor geselecteerde filters.' },

  // ── Notes ──────────────────────────────────────────────────
  'Notatki':          { en: 'Notes',         nl: 'Notities' },
  'Nowa notatka':     { en: 'New Note',      nl: 'Nieuwe notitie' },
  'Brak notatek.':    { en: 'No notes.',     nl: 'Geen notities.' },
  'Przypnij':         { en: 'Pin',           nl: 'Vastmaken' },
  'Przypiąć':         { en: 'Pin',           nl: 'Vastmaken' },
  'Odpnij':           { en: 'Unpin',         nl: 'Losmaken' },
  'Tagi:':            { en: 'Tags:',         nl: 'Tags:' },
  'Szukaj notatek…':  { en: 'Search notes…', nl: 'Notities zoeken…' },

  // ── YouTube ────────────────────────────────────────────────
  'Wyświetlenia':         { en: 'Views',           nl: 'Weergaven' },
  'Czas oglądania (h)':   { en: 'Watch Time (h)',  nl: 'Kijktijd (u)' },
  'Subskrybenci netto':   { en: 'Net Subscribers', nl: 'Netto abonnees' },
  'Przychody AdSense':    { en: 'AdSense Revenue', nl: 'AdSense inkomsten' },
  'Zaimportuj dane':      { en: 'Import Data',     nl: 'Gegevens importeren' },
  'Historia importów':    { en: 'Import History',  nl: 'Importgeschiedenis' },
  'Brak danych. Importuj plik CSV z YouTube Studio.': { en: 'No data. Import CSV from YouTube Studio.', nl: 'Geen gegevens. Importeer CSV uit YouTube Studio.' },
  'Zaimportowano':        { en: 'Imported',        nl: 'Geïmporteerd' },
  'wierszy':              { en: 'rows',            nl: 'rijen' },

  // ── Reminders ──────────────────────────────────────────────
  'Brak przypomnień':          { en: 'No reminders',          nl: 'Geen herinneringen' },
  'Pilne (≤7 dni)':            { en: 'Urgent (≤7 days)',       nl: 'Urgent (≤7 dagen)' },
  'Odwołane':                  { en: 'Dismissed',             nl: 'Gesloten' },
  'Nowe przypomnienie':        { en: 'New Reminder',          nl: 'Nieuwe herinnering' },
  'Edytuj przypomnienie':      { en: 'Edit Reminder',         nl: 'Herinnering bewerken' },
  '💾 Zapisz':                 { en: '💾 Save',               nl: '💾 Opslaan' },

  // ── Settings ───────────────────────────────────────────────
  'Profil firmy':              { en: 'Company Profile',       nl: 'Bedrijfsprofiel' },
  'Faktury':                   { en: 'Invoices',              nl: 'Facturen' },
  'Czas pracy':                { en: 'Time Tracking',         nl: 'Tijdregistratie' },
  'Podatki':                   { en: 'Taxes',                 nl: 'Belastingen' },
  'Backup':                    { en: 'Backup',                nl: 'Back-up' },
  'Wygląd':                    { en: 'Appearance',            nl: 'Uiterlijk' },
  'Bezpieczeństwo':            { en: 'Security',              nl: 'Beveiliging' },
  'Dane':                      { en: 'Data',                  nl: 'Gegevens' },
  'Dane firmy':                { en: 'Company Data',          nl: 'Bedrijfsgegevens' },
  'Ustawienia faktur':         { en: 'Invoice Settings',      nl: 'Factuurinstellingen' },
  'Ustawienia czasu pracy':    { en: 'Time Settings',         nl: 'Tijdinstellingen' },
  'Ustawienia backupu':        { en: 'Backup Settings',       nl: 'Back-upinstellingen' },
  'Motyw':                     { en: 'Theme',                 nl: 'Thema' },
  '🌙 Ciemny':                 { en: '🌙 Dark',              nl: '🌙 Donker' },
  '☀️ Jasny':                  { en: '☀️ Light',             nl: '☀️ Licht' },
  'Zmiana PIN':                { en: 'Change PIN',            nl: 'PIN wijzigen' },
  'Auto-blokada':              { en: 'Auto-lock',             nl: 'Automatisch vergrendelen' },
  'Strefa niebezpieczna':      { en: 'Danger Zone',          nl: 'Gevaarlijke zone' },
  'Eksport danych':            { en: 'Data Export',           nl: 'Gegevens exporteren' },
  'Import danych':             { en: 'Data Import',           nl: 'Gegevens importeren' },

  // ── Loading / empty states ─────────────────────────────────
  'Ładowanie…':               { en: 'Loading…',              nl: 'Laden…' },
  'Ładowanie...':             { en: 'Loading...',            nl: 'Laden...' },
  'Ładowanie wykresu…':       { en: 'Loading chart…',        nl: 'Grafiek laden…' },

  // ── Import CSV wizard ──────────────────────────────────────
  'Kolumna daty *':           { en: 'Date column *',         nl: 'Datumkolom *' },
  'Kolumna kwoty *':          { en: 'Amount column *',       nl: 'Bedragkolom *' },
  'Kolumna opisu':            { en: 'Description column',    nl: 'Omschrijvingskolom' },
  'Kolumna waluty':           { en: 'Currency column',       nl: 'Valutakolom' },
  'Domyślna waluta (gdy brak kolumny)': { en: 'Default currency (if no column)', nl: 'Standaardvaluta (als geen kolom)' },
  'Źródło (nazwa w raportach)': { en: 'Source (name in reports)', nl: 'Bron (naam in rapporten)' },
  '— nie mapuj —':            { en: '— skip —',              nl: '— overslaan —' },
  '👁 Podgląd pierwszych wierszy': { en: '👁 Preview first rows', nl: '👁 Voorbeeld eerste rijen' },
  '✅ Importuj':              { en: '✅ Import',              nl: '✅ Importeren' },

  // ── Misc ───────────────────────────────────────────────────
  'Łącznie':    { en: 'Total',    nl: 'Totaal' },
  'Brak':       { en: 'None',     nl: 'Geen' },
  'Rok':        { en: 'Year',     nl: 'Jaar' },
  'termin:':    { en: 'due:',     nl: 'datum:' },
  'Przych.':    { en: 'Inc.',     nl: 'Ink.' },
  'vs ub.m.':   { en: 'vs prev.', nl: 'vs vorig' },

  // ── Common actions ─────────────────────────────────────────
  'Usuń':               { en: 'Delete',           nl: 'Verwijderen' },
  'Edytuj':             { en: 'Edit',             nl: 'Bewerken' },
  'Otwórz':             { en: 'Open',             nl: 'Openen' },
  'Odwołaj':            { en: 'Dismiss',          nl: 'Sluiten' },
  'Oblicz':             { en: 'Calculate',        nl: 'Berekenen' },
  'Zamknij':            { en: 'Close',            nl: 'Sluiten' },
  '🗑 Usuń':            { en: '🗑 Delete',         nl: '🗑 Verwijderen' },
  '✏️ Edytuj':          { en: '✏️ Edit',           nl: '✏️ Bewerken' },
  'Tej operacji nie można cofnąć.': { en: 'This action cannot be undone.', nl: 'Deze actie kan niet ongedaan worden gemaakt.' },

  // ── Invoices — extra ───────────────────────────────────────
  'Brak faktur dla wybranych filtrów.': { en: 'No invoices for selected filters.', nl: 'Geen facturen voor geselecteerde filters.' },
  'Data wyst.':               { en: 'Issue Date',              nl: 'Factuurdatum' },
  'Brutto':                   { en: 'Gross',                   nl: 'Bruto' },
  'Ilość':                    { en: 'Qty',                     nl: 'Aantal' },
  'Jedn.':                    { en: 'Unit',                    nl: 'Eenh.' },
  'Cena netto':               { en: 'Net Price',               nl: 'Netto prijs' },
  'Waluta':                   { en: 'Currency',                nl: 'Valuta' },
  'Kurs EUR':                 { en: 'EUR Rate',                nl: 'EUR koers' },
  'Nr referencyjny klienta':  { en: 'Client Ref. No.',         nl: 'Referentienr. klant' },
  'Suma netto:':               { en: 'Net total:',              nl: 'Netto totaal:' },
  'Data otrzymania płatności': { en: 'Payment Received Date',   nl: 'Ontvangstdatum betaling' },
  'Nr faktury *':             { en: 'Invoice No. *',           nl: 'Factuurnr. *' },
  'Data wystawienia *':       { en: 'Issue Date *',            nl: 'Factuurdatum *' },
  'Termin płatności *':       { en: 'Payment Due *',           nl: 'Betalingsdatum *' },
  'Klient *':                 { en: 'Client *',                nl: 'Klant *' },
  'Projekt (opcjonalnie)':    { en: 'Project (optional)',      nl: 'Project (optioneel)' },

  // ── Time tracking — extra ──────────────────────────────────
  '✏️ Ręczny wpis czasu':     { en: '✏️ Manual Time Entry',     nl: '✏️ Handmatige tijdinvoer' },
  'Godzina od':               { en: 'From',                    nl: 'Van' },
  'Godzina do':               { en: 'To',                      nl: 'Tot' },
  'Czas trwania':             { en: 'Duration',                nl: 'Duur' },
  'Czas trwania (min)':       { en: 'Duration (min)',          nl: 'Duur (min)' },
  'Brak wpisów dla wybranych filtrów.': { en: 'No entries for selected filters.', nl: 'Geen invoeren voor geselecteerde filters.' },
  'Podsumowanie okresu':      { en: 'Period Summary',          nl: 'Periode-overzicht' },
  'Łączne godziny:':          { en: 'Total hours:',            nl: 'Totale uren:' },
  'Billable:':                { en: 'Billable:',               nl: 'Factureerbaar:' },
  'Non-billable:':            { en: 'Non-billable:',           nl: 'Niet-factureerbaar:' },
  'Edytuj wpis czasu':        { en: 'Edit Time Entry',         nl: 'Tijdinvoer bewerken' },
  '🗑 Usuń wpis':              { en: '🗑 Delete Entry',          nl: '🗑 Invoer verwijderen' },
  'Czy na pewno chcesz usunąć ten wpis czasu?': { en: 'Are you sure you want to delete this time entry?', nl: 'Weet je zeker dat je deze tijdinvoer wilt verwijderen?' },
  '✅ na dobrej drodze':       { en: '✅ on track',              nl: '✅ op schema' },
  '⚠️ zagrożone':              { en: '⚠️ at risk',              nl: '⚠️ in gevaar' },

  // ── Projects — extra ───────────────────────────────────────
  'Brak projektów. Utwórz pierwszy projekt.': { en: 'No projects. Create your first project.', nl: 'Geen projecten. Maak je eerste project aan.' },
  'Aktywność:':               { en: 'Activity:',               nl: 'Activiteit:' },
  'Nazwa projektu':           { en: 'Project Name',            nl: 'Projectnaam' },
  'Nazwa projektu *':         { en: 'Project Name *',          nl: 'Projectnaam *' },
  'Przychód':                 { en: 'Income',                  nl: 'Inkomsten' },
  'Data końca':               { en: 'End Date',                nl: 'Einddatum' },
  'Epizod YouTube':           { en: 'YouTube Episode',         nl: 'YouTube-aflevering' },
  'Stawka godzinowa':         { en: 'Hourly Rate',             nl: 'Uurtarief' },
  'Stawka godzinowa (€/h)':   { en: 'Hourly Rate (€/h)',       nl: 'Uurtarief (€/u)' },
  'Data rozpoczęcia':         { en: 'Start Date',              nl: 'Startdatum' },
  'Data zakończenia':         { en: 'End Date',                nl: 'Einddatum' },
  'Brak wpisów czasu dla tego projektu.': { en: 'No time entries for this project.', nl: 'Geen tijdinvoeren voor dit project.' },
  'Brak faktur dla tego projektu.':  { en: 'No invoices for this project.', nl: 'Geen facturen voor dit project.' },
  'Brak kosztów dla tego projektu.': { en: 'No expenses for this project.', nl: 'Geen kosten voor dit project.' },
  'Brak notatek dla tego projektu.': { en: 'No notes for this project.',    nl: 'Geen notities voor dit project.' },

  // ── Tax — extra ────────────────────────────────────────────
  'Szacowany podatek IB netto': { en: 'Estimated Net IB Tax',  nl: 'Geschatte netto IB-belasting' },
  'Rezerwa kwartalna':        { en: 'Quarterly Reserve',       nl: 'Kwartaalreserve' },
  'Scenariusz':               { en: 'Scenario',                nl: 'Scenario' },
  'Podatek':                  { en: 'Tax',                     nl: 'Belasting' },
  'Wybierz kwartał i kliknij Oblicz.': { en: 'Select a quarter and click Calculate.', nl: 'Selecteer een kwartaal en klik op Berekenen.' },
  'Termin złożenia:':         { en: 'Filing deadline:',        nl: 'Inleverdatum:' },

  // ── Reminders — extra ──────────────────────────────────────
  'Następne 7 dni':   { en: 'Next 7 days',   nl: 'Volgende 7 dagen' },
  'Następne 14 dni':  { en: 'Next 14 days',  nl: 'Volgende 14 dagen' },
  'Następne 30 dni':  { en: 'Next 30 days',  nl: 'Volgende 30 dagen' },
  'Następne 60 dni':  { en: 'Next 60 days',  nl: 'Volgende 60 dagen' },
  'Następne 90 dni':  { en: 'Next 90 days',  nl: 'Volgende 90 dagen' },
  'Wszystkie przyszłe': { en: 'All future',  nl: 'Alle toekomstige' },
  'Godzina':          { en: 'Time',          nl: 'Tijd' },

  // ── Tasks — extra ──────────────────────────────────────────
  'Ładowanie kalendarza…':    { en: 'Loading calendar…',       nl: 'Kalender laden…' },
  'Brak wydarzeń.':           { en: 'No events.',              nl: 'Geen evenementen.' },
  'Tytuł zadania':            { en: 'Task title',              nl: 'Taaknaam' },

  // ── Contacts — extra ──────────────────────────────────────
  'Firma':                    { en: 'Company',           nl: 'Bedrijf' },
  'Stanowisko':               { en: 'Position',          nl: 'Functie' },
  'VAT NL':                   { en: 'VAT NL',            nl: 'BTW NL' },
  'Reverse charge':           { en: 'Reverse charge',    nl: 'BTW verlegd' },
  'Brak interakcji.':         { en: 'No interactions.',  nl: 'Geen interacties.' },
  'Brak historii interakcji.':{ en: 'No interaction history.', nl: 'Geen interactiegeschiedenis.' },
  'Brak plików.':             { en: 'No files.',         nl: 'Geen bestanden.' },
  'Brak faktur dla tego klienta.': { en: 'No invoices for this client.', nl: 'Geen facturen voor deze klant.' },
  'Nazwa / Firma':            { en: 'Name / Company',    nl: 'Naam / Bedrijf' },
  'Łączna wartość':           { en: 'Total Value',       nl: 'Totale waarde' },
  'Ostatnia faktura':         { en: 'Last Invoice',      nl: 'Laatste factuur' },
  'Imię i nazwisko':          { en: 'Full Name',         nl: 'Voor- en achternaam' },
  'Imię i nazwisko *':        { en: 'Full Name *',       nl: 'Voor- en achternaam *' },
  'Nazwa firmy':              { en: 'Company Name',      nl: 'Bedrijfsnaam' },
  'Postcode':                 { en: 'Postcode',          nl: 'Postcode' },
  'Numer VAT':                { en: 'VAT Number',        nl: 'BTW-nummer' },
  'Nazwa pliku':              { en: 'File Name',         nl: 'Bestandsnaam' },
  'Rozmiar':                  { en: 'Size',              nl: 'Grootte' },
  'Temat':                    { en: 'Subject',           nl: 'Onderwerp' },
  'Treść':                    { en: 'Content',           nl: 'Inhoud' },

  // ── Notes — extra ──────────────────────────────────────────
  'Zawartość':        { en: 'Content',       nl: 'Inhoud' },
  'Ogólne':           { en: 'General',       nl: 'Algemeen' },
  'Projektowe':       { en: 'Project',       nl: 'Project' },
  'Podgląd':          { en: 'Preview',       nl: 'Voorbeeld' },
  'Wybierz notatkę lub utwórz nową': { en: 'Select a note or create a new one', nl: 'Selecteer een notitie of maak een nieuwe aan' },
  'Brak notatek':     { en: 'No notes',      nl: 'Geen notities' },

  // ── YouTube — extra ────────────────────────────────────────
  'Historia miesięczna':      { en: 'Monthly History',      nl: 'Maandelijkse geschiedenis' },
  'Import CSV':               { en: 'Import CSV',           nl: 'CSV importeren' },
  'Dodaj ręcznie':            { en: 'Add manually',         nl: 'Handmatig toevoegen' },
  'Miesiąc / Rok':            { en: 'Month / Year',         nl: 'Maand / Jaar' },
  'Nowi sub.':                { en: 'New subs.',            nl: 'Nieuwe abon.' },
  'Utraceni sub.':            { en: 'Lost subs.',           nl: 'Verloren abon.' },
  'Przychód AdSense (€)':     { en: 'AdSense Revenue (€)',  nl: 'AdSense inkomsten (€)' },
  'Czas ogl.':                { en: 'Watch time',           nl: 'Kijktijd' },
  'Subskr. ±':                { en: 'Subs. ±',              nl: 'Abon. ±' },
  'Brak danych. Dodaj statystyki lub importuj CSV.': { en: 'No data. Add stats or import CSV.', nl: 'Geen gegevens. Voeg statistieken toe of importeer CSV.' },
  'Brak importów.':           { en: 'No imports.',          nl: 'Geen importhistorie.' },
  'RPM':                      { en: 'RPM',                  nl: 'RPM' },

  // ── Reports — extra ───────────────────────────────────────
  'Koszty wg kategorii Q':    { en: 'Expenses by Category Q',  nl: 'Kosten per categorie K' },

  // ── Reports — YT vs ZZP tab ───────────────────────────────
  '📺 YT vs ZZP':             { en: '📺 YT vs ZZP',            nl: '📺 YT vs ZZP' },
  'ZZP (Faktury)':            { en: 'ZZP (Invoices)',           nl: 'ZZP (Facturen)' },
  'YouTube / AdSense':        { en: 'YouTube / AdSense',        nl: 'YouTube / AdSense' },
  'Inne źródła':              { en: 'Other sources',            nl: 'Overige bronnen' },
  'Udział YouTube':           { en: 'YouTube Share',            nl: 'YouTube-aandeel' },
  'AdSense / YT':             { en: 'AdSense / YT',             nl: 'AdSense / YT' },
  'Inne':                     { en: 'Other',                    nl: 'Overig' },
  'Razem':                    { en: 'Total',                    nl: 'Totaal' },
  '% YT':                     { en: '% YT',                     nl: '% YT' },

  // ── Reports — W&V PDF button ──────────────────────────────
  'Generowanie W&V PDF…':     { en: 'Generating W&V PDF…',      nl: 'W&V PDF genereren…' },
  '📋 W&V PDF zapisany!':     { en: '📋 W&V PDF saved!',         nl: '📋 W&V PDF opgeslagen!' },

  // ── Settings — YouTube API tab ────────────────────────────
  'YouTube API':              { en: 'YouTube API',               nl: 'YouTube API' },
  'Konfiguracja Google Cloud Console': { en: 'Google Cloud Console Configuration', nl: 'Google Cloud Console-configuratie' },
  'Client ID':                { en: 'Client ID',                 nl: 'Client ID' },
  'Client Secret':            { en: 'Client Secret',             nl: 'Client Secret' },
  'Połączenie z kontem YouTube': { en: 'YouTube Account Connection', nl: 'YouTube-accountverbinding' },
  'Status połączenia':        { en: 'Connection Status',         nl: 'Verbindingsstatus' },
  'Ostatnia synchronizacja':  { en: 'Last Sync',                 nl: 'Laatste synchronisatie' },
  '✅ Połączono':             { en: '✅ Connected',               nl: '✅ Verbonden' },
  '❌ Niepołączono':          { en: '❌ Not connected',           nl: '❌ Niet verbonden' },
  '🔗 Połącz konto Google':   { en: '🔗 Connect Google Account', nl: '🔗 Google-account koppelen' },
  '🗑 Rozłącz konto':         { en: '🗑 Disconnect',             nl: '🗑 Ontkoppelen' },
  'Dane API zapisane':        { en: 'API credentials saved',     nl: 'API-gegevens opgeslagen' },
  'Konto Google rozłączone':  { en: 'Google account disconnected', nl: 'Google-account ontkoppeld' },

  // ── YouTube page — sync button ────────────────────────────
  '☁ Synchronizuj YT API':   { en: '☁ Sync YT API',             nl: '☁ YT API synchroniseren' },
  '⏳ Synchronizacja…':      { en: '⏳ Syncing…',                nl: '⏳ Synchroniseren…' },
  'Ostatni sync:':            { en: 'Last sync:',                 nl: 'Laatste sync:' },
  'Połączono — synchronizuj teraz': { en: 'Connected — sync now', nl: 'Verbonden — nu synchroniseren' },

  // ── Dashboard — extra ──────────────────────────────────────
  'Dziś!':                    { en: 'Today!',                  nl: 'Vandaag!' },
  'Podsumowanie':             { en: 'Summary',                 nl: 'Overzicht' },

  // ── Common form labels — extra ─────────────────────────────
  'Pomodoro:':                { en: 'Pomodoro:',               nl: 'Pomodoro:' },
  'Przerwa:':                 { en: 'Break:',                  nl: 'Pauze:' },
  'Szczegóły':                { en: 'Details',                 nl: 'Details' },
  'Telefon':                  { en: 'Phone',                   nl: 'Telefoon' },
  'Adres':                    { en: 'Address',                 nl: 'Adres' },
  'Miasto':                   { en: 'City',                    nl: 'Stad' },
  'Kraj':                     { en: 'Country',                 nl: 'Land' },
  'KvK':                      { en: 'Chamber of Commerce',     nl: 'KvK' },
  'NIP/VAT':                  { en: 'Tax ID/VAT',              nl: 'BTW/KvK nr.' },
  'Numer konta':              { en: 'Account Number',          nl: 'Rekeningnummer' },
  'Strona www':               { en: 'Website',                 nl: 'Website' },
  'Hasło/PIN':                { en: 'Password/PIN',            nl: 'Wachtwoord/PIN' },

  // ── Kilometrówka (mileage) ─────────────────────────────────
  '🚗 Kilometrówka':          { en: '🚗 Mileage',              nl: '🚗 Kilometerregistratie' },
  '+ Dodaj przejazd':         { en: '+ Add Trip',              nl: '+ Rit toevoegen' },
  'Przejazdy':                { en: 'Trips',                   nl: 'Ritten' },
  'Stawka':                   { en: 'Rate',                    nl: 'Tarief' },
  'Trasa':                    { en: 'Route',                   nl: 'Route' },
  'Cel':                      { en: 'Purpose',                 nl: 'Doel' },
  'Klient / projekt':         { en: 'Client / project',        nl: 'Klant / project' },
  'Odliczenie':               { en: 'Deduction',               nl: 'Aftrek' },
  'Brak przejazdów w wybranym okresie.': { en: 'No trips in the selected period.', nl: 'Geen ritten in de geselecteerde periode.' },
  'Nowy przejazd':            { en: 'New Trip',                nl: 'Nieuwe rit' },
  'Edytuj przejazd':          { en: 'Edit Trip',               nl: 'Rit bewerken' },
  'Dystans w jedną stronę (km) *': { en: 'One-way distance (km) *', nl: 'Enkele afstand (km) *' },
  'Skąd':                     { en: 'From',                    nl: 'Vanaf' },
  'Dokąd':                    { en: 'To',                      nl: 'Naar' },
  'Tam i z powrotem (km ×2)': { en: 'Round trip (km ×2)',      nl: 'Retour (km ×2)' },
  'Cel przejazdu':            { en: 'Trip purpose',            nl: 'Doel van de rit' },
  'Klient (opcjonalnie)':     { en: 'Client (optional)',       nl: 'Klant (optioneel)' },
  'Stawka €/km':              { en: 'Rate €/km',               nl: 'Tarief €/km' },
  '🗑 Usuń przejazd':         { en: '🗑 Delete Trip',          nl: '🗑 Rit verwijderen' },
  'Czy na pewno usunąć ten przejazd?': { en: 'Delete this trip?', nl: 'Deze rit verwijderen?' },
  'Kilometry':                { en: 'Kilometres',              nl: 'Kilometers' },

  // ── Katalog produktów ──────────────────────────────────────
  '📦 Produkty':              { en: '📦 Products',             nl: '📦 Producten' },
  '📦 Katalog produktów / usług': { en: '📦 Product / Service Catalogue', nl: '📦 Product- / dienstencatalogus' },
  'Produkty pojawiają się jako lista przy dodawaniu pozycji faktury — jedno kliknięcie zamiast wpisywania.':
    { en: 'Products appear as a list when adding invoice items — one click instead of typing.',
      nl: 'Producten verschijnen als lijst bij het toevoegen van factuurregels — één klik in plaats van typen.' },
  'Jedn.':                    { en: 'Unit',                    nl: 'Eenh.' },
  'Nowy produkt':             { en: 'New Product',             nl: 'Nieuw product' },
  'Nazwa *':                  { en: 'Name *',                  nl: 'Naam *' },
  '💾 Dodaj':                 { en: '💾 Add',                  nl: '💾 Toevoegen' },
  'BTW %':                    { en: 'VAT %',                   nl: 'BTW %' },
  '📦 …lub wybierz z katalogu': { en: '📦 …or pick from catalogue', nl: '📦 …of kies uit catalogus' },
  '⤵ Wstaw':                  { en: '⤵ Insert',               nl: '⤵ Invoegen' },
  '(nieaktywny)':             { en: '(inactive)',              nl: '(inactief)' },

  // ── Faktura — nowe pola/akcje ──────────────────────────────
  'Data sprzedaży / dostawy (leverdatum)': { en: 'Sale / delivery date (leverdatum)', nl: 'Leverdatum' },
  'Data zapłaty (dla zapłaconych)': { en: 'Payment date (for paid)', nl: 'Betaaldatum (voor betaald)' },

  // ── Przypomnienia / wezwania do zapłaty ────────────────────
  '✉️ Przypomnienie / wezwanie do zapłaty': { en: '✉️ Payment reminder / demand', nl: '✉️ Betalingsherinnering / aanmaning' },
  'Rodzaj:':                  { en: 'Type:',                   nl: 'Type:' },
  'Przypomnienie (uprzejme)': { en: 'Reminder (friendly)',     nl: 'Herinnering (vriendelijk)' },
  'Wezwanie do zapłaty (stanowcze)': { en: 'Demand (firm)',    nl: 'Aanmaning (formeel)' },
  'Język:':                   { en: 'Language:',               nl: 'Taal:' },
  'Niderlandzki':             { en: 'Dutch',                   nl: 'Nederlands' },
  'Angielski':                { en: 'English',                 nl: 'Engels' },
  'Polski':                   { en: 'Polish',                  nl: 'Pools' },
  'Do (e-mail klienta)':      { en: 'To (client e-mail)',      nl: 'Aan (e-mail klant)' },
  '📋 Kopiuj treść':          { en: '📋 Copy text',            nl: '📋 Tekst kopiëren' },
  '✉️ Otwórz w programie pocztowym': { en: '✉️ Open in mail app', nl: '✉️ Openen in e-mailprogramma' },

  // ── Import godzinówki ──────────────────────────────────────
  '📥 Import godzin':         { en: '📥 Import Hours',         nl: '📥 Uren importeren' },
  '📥 Import godzinówki z efaktura.nl': { en: '📥 Import hours from efaktura.nl', nl: '📥 Uren importeren uit efaktura.nl' },
  'Kategoria dla importu:':   { en: 'Category for import:',    nl: 'Categorie voor import:' },
  'rozliczalne':              { en: 'billable',                nl: 'factureerbaar' },

  // ── VIES ───────────────────────────────────────────────────
  '⤵ Wypełnij dane z VIES':   { en: '⤵ Fill data from VIES',   nl: '⤵ Gegevens uit VIES invullen' },
  'Wpisz numer VAT.':         { en: 'Enter a VAT number.',     nl: 'Voer een btw-nummer in.' },
  '❌ Numer VAT nieważny lub nieznany w VIES': { en: '❌ VAT number invalid or unknown in VIES', nl: '❌ Btw-nummer ongeldig of onbekend in VIES' },

  // ── ui.js / translator.js ───────────────────────────────────
  'Pilne':                    { en: 'Urgent',                  nl: 'Urgent' },
  'Wysoki':                   { en: 'High',                    nl: 'Hoog' },
  'Średni':                   { en: 'Medium',                  nl: 'Gemiddeld' },
  'Niski':                    { en: 'Low',                     nl: 'Laag' },
  '— wybierz —':              { en: '— select —',              nl: '— kies —' },
  'Dziś':                     { en: 'Today',                   nl: 'Vandaag' },
  'Nie znaleziono pola opisu do tłumaczenia.': { en: 'Description field not found for translation.', nl: 'Omschrijvingsveld niet gevonden om te vertalen.' },
  'Najpierw wpisz opis, potem kliknij tłumaczenie.': { en: 'Enter a description first, then click translate.', nl: 'Vul eerst een omschrijving in en klik dan op vertalen.' },

  // ── page-mileage.js ──────────────────────────────────────────
  '— brak —':                 { en: '— none —',                nl: '— geen —' },
  'Km':                       { en: 'Km',                       nl: 'Km' },
  'Data jest wymagana.':      { en: 'Date is required.',        nl: 'Datum is verplicht.' },
  'Podaj dystans w km.':      { en: 'Enter the distance in km.', nl: 'Voer de afstand in km in.' },
  'Przejazd zaktualizowany.': { en: 'Trip updated.',            nl: 'Rit bijgewerkt.' },
  'Przejazd zapisany.':       { en: 'Trip saved.',              nl: 'Rit opgeslagen.' },
  'Przejazd usunięty.':       { en: 'Trip deleted.',            nl: 'Rit verwijderd.' },

  // ── page-time.js ─────────────────────────────────────────────
  'Przerwa (min)':            { en: 'Break (min)',              nl: 'Pauze (min)' },
  '⚠️ Wykryto bezczynność':   { en: '⚠️ Idle detected',         nl: '⚠️ Inactiviteit gedetecteerd' },
  'Co zrobić z tym czasem?':  { en: 'What do you want to do with this time?', nl: 'Wat wil je met deze tijd doen?' },
  '✅ Dodaj do sesji':        { en: '✅ Add to session',        nl: '✅ Toevoegen aan sessie' },
  '❌ Odejmij czas':          { en: '❌ Subtract time',         nl: '❌ Tijd aftrekken' },
  '⏹ Zatrzymaj':              { en: '⏹ Stop',                   nl: '⏹ Stoppen' },
  'Zatrzymaj timer przed zmianą trybu.': { en: 'Stop the timer before changing mode.', nl: 'Stop de timer voordat je van modus wisselt.' },
  'Czas bezczynności doliczony.': { en: 'Idle time added.',     nl: 'Inactieve tijd toegevoegd.' },
  '🎉 Ukończono pełny cykl Pomodoro (4 sesje)!': { en: '🎉 Completed a full Pomodoro cycle (4 sessions)!', nl: '🎉 Volledige Pomodoro-cyclus voltooid (4 sessies)!' },
  'Podaj czas trwania lub godziny od/do.': { en: 'Enter a duration or from/to times.', nl: 'Voer een duur of van/tot-tijden in.' },
  'Wpis czasu':                { en: 'Time Entry',              nl: 'Tijdinvoer' },
  '🗑 Usuń wpis':              { en: '🗑 Delete Entry',         nl: '🗑 Invoer verwijderen' },
  'Wpis zaktualizowany.':      { en: 'Entry updated.',          nl: 'Invoer bijgewerkt.' },
  'Wpis usunięty.':            { en: 'Entry deleted.',          nl: 'Invoer verwijderd.' },
  'Własny zakres:':            { en: 'Custom range:',           nl: 'Aangepaste periode:' },
  'Podaj zakres dat.':         { en: 'Enter a date range.',     nl: 'Voer een periode in.' },
  '📄 PDF zapisany!':          { en: '📄 PDF saved!',           nl: '📄 PDF opgeslagen!' },
  'CSV wygenerowany.':         { en: 'CSV generated.',          nl: 'CSV gegenereerd.' },
  'Nie zaznaczono żadnych wpisów.': { en: 'No entries selected.', nl: 'Geen invoeren geselecteerd.' },
  '⏳ Analizuję…':             { en: '⏳ Analysing…',           nl: '⏳ Analyseren…' },

  // ── app.js (PIN / onboarding / tray) ────────────────────────
  'Szybki koszt':              { en: 'Quick Expense',           nl: 'Snelle uitgave' },
  'Szybkie zadanie':           { en: 'Quick Task',              nl: 'Snelle taak' },
  'PIN musi mieć minimum 4 cyfry.': { en: 'PIN must be at least 4 digits.', nl: 'PIN moet minimaal 4 cijfers bevatten.' },
  'Zapomniałem PIN':           { en: 'Forgot PIN',              nl: 'PIN vergeten' },
  'Jeśli zapomniałeś PIN, możesz go zresetować kluczem odzyskiwania.': { en: 'If you forgot your PIN, you can reset it with your recovery key.', nl: 'Als je je PIN bent vergeten, kun je deze resetten met je herstelsleutel.' },
  'Klucz odzyskiwania został zapisany w pliku': { en: 'The recovery key was saved to the file', nl: 'De herstelsleutel is opgeslagen in het bestand' },
  'w folderze danych aplikacji podczas konfiguracji.': { en: 'in the application data folder during setup.', nl: 'in de gegevensmap van de applicatie tijdens de installatie.' },
  'Klucz odzyskiwania':        { en: 'Recovery Key',            nl: 'Herstelsleutel' },
  'Zresetuj PIN':              { en: 'Reset PIN',               nl: 'PIN resetten' },
  'PIN zresetowany. Skonfiguruj nowy PIN.': { en: 'PIN reset. Set up a new PIN.', nl: 'PIN gereset. Stel een nieuwe PIN in.' },
  'Ustaw PIN i zakończ ✓':     { en: 'Set PIN & Finish ✓',      nl: 'PIN instellen & afronden ✓' },
  'Dalej →':                   { en: 'Next →',                  nl: 'Volgende →' },
  'Imię i nazwisko jest wymagane.': { en: 'Full name is required.', nl: 'Naam is verplicht.' },
  'PIN musi mieć 4–8 cyfr.':   { en: 'PIN must be 4–8 digits.', nl: 'PIN moet 4-8 cijfers bevatten.' },
  'PINy nie są identyczne.':   { en: "PINs don't match.",       nl: 'PIN-codes komen niet overeen.' },
  'Konfiguracja zakończona! Witaj w ZZP Manager.': { en: 'Setup complete! Welcome to ZZP Manager.', nl: 'Installatie voltooid! Welkom bij ZZP Manager.' },
  'Konfiguracja zakończona! PIN wyłączony.': { en: 'Setup complete! PIN disabled.', nl: 'Installatie voltooid! PIN uitgeschakeld.' },
  'Dane firmy zapisane.':      { en: 'Company data saved.',     nl: 'Bedrijfsgegevens opgeslagen.' },
  'Wprowadź aktualny PIN, aby wyłączyć ochronę:': { en: 'Enter your current PIN to disable protection:', nl: 'Voer je huidige PIN in om de beveiliging uit te schakelen:' },
  'Weryfikacja PIN':           { en: 'PIN Verification',        nl: 'PIN-verificatie' },
  'Nieprawidłowy PIN.':        { en: 'Incorrect PIN.',          nl: 'Onjuiste PIN.' },
  'Ochrona PIN wyłączona.':    { en: 'PIN protection disabled.', nl: 'PIN-beveiliging uitgeschakeld.' },
  'Ochrona PIN włączona.':     { en: 'PIN protection enabled.', nl: 'PIN-beveiliging ingeschakeld.' },
  'Nowe PINy nie są identyczne.': { en: "New PINs don't match.", nl: 'Nieuwe PIN-codes komen niet overeen.' },
  'PIN zmieniony pomyślnie.':  { en: 'PIN changed successfully.', nl: 'PIN succesvol gewijzigd.' },
  'Błąd backupu.':             { en: 'Backup error.',           nl: 'Back-upfout.' },
  'Kwota (€)':                 { en: 'Amount (€)',              nl: 'Bedrag (€)' },

  // ── page-projects.js ─────────────────────────────────────────
  '← Powrót do listy':         { en: '← Back to list',          nl: '← Terug naar lijst' },
  '+ Utwórz':                  { en: '+ Create',                nl: '+ Aanmaken' },
  '📊 Przegląd':                { en: '📊 Overview',             nl: '📊 Overzicht' },
  '⏱ Czas':                    { en: '⏱ Time',                  nl: '⏱ Tijd' },
  '💸 Koszty':                  { en: '💸 Expenses',             nl: '💸 Kosten' },
  '📝 Notatki':                 { en: '📝 Notes',                nl: '📝 Notities' },
  '+ Dodaj wpis czasu':        { en: '+ Add Time Entry',        nl: '+ Tijdinvoer toevoegen' },
  '📝 Otwórz notatnik':        { en: '📝 Open notes',           nl: '📝 Notities openen' },
  '✏️ Edytuj projekt':         { en: '✏️ Edit Project',         nl: '✏️ Project bewerken' },
  'Tytuł jest wymagany.':      { en: 'Title is required.',      nl: 'Titel is verplicht.' },
  'Zadanie dodane.':           { en: 'Task added.',             nl: 'Taak toegevoegd.' },
  'Nazwa projektu jest wymagana.': { en: 'Project name is required.', nl: 'Projectnaam is verplicht.' },
  'Projekt zaktualizowany.':   { en: 'Project updated.',        nl: 'Project bijgewerkt.' },
  'Projekt utworzony.':        { en: 'Project created.',        nl: 'Project aangemaakt.' },
  'Usunąć ten projekt? Powiązane wpisy czasu i koszty pozostaną.': { en: 'Delete this project? Related time entries and expenses will remain.', nl: 'Dit project verwijderen? Gekoppelde tijdinvoeren en kosten blijven behouden.' },
  'Usuń projekt':              { en: 'Delete Project',          nl: 'Project verwijderen' },
  'Projekt usunięty.':         { en: 'Project deleted.',        nl: 'Project verwijderd.' },
  'dziś':                      { en: 'today',                   nl: 'vandaag' },
  'wczoraj':                   { en: 'yesterday',               nl: 'gisteren' },
  'brak aktywności':           { en: 'no activity',             nl: 'geen activiteit' },

  // ── page-contacts.js ─────────────────────────────────────────
  'Brak wyników wyszukiwania.': { en: 'No search results.',     nl: 'Geen zoekresultaten.' },
  'Brak kontaktów. Dodaj pierwszego klienta.': { en: 'No contacts. Add your first client.', nl: 'Geen contacten. Voeg je eerste klant toe.' },
  'Faktury razem':             { en: 'Total Invoices',          nl: 'Totaal facturen' },
  'Suma faktur':               { en: 'Invoice Total',           nl: 'Totaal factuurbedrag' },
  'Zaległe':                   { en: 'Outstanding',             nl: 'Openstaand' },
  '📋 Kontakt':                 { en: '📋 Contact',              nl: '📋 Contact' },
  '💬 Interakcje':              { en: '💬 Interactions',         nl: '💬 Interacties' },
  '📎 Pliki':                   { en: '📎 Files',                nl: '📎 Bestanden' },
  'BTW Reverse Charge':        { en: 'BTW Reverse Charge',      nl: 'BTW verlegd' },
  '+ Nowa interakcja':         { en: '+ New Interaction',       nl: '+ Nieuwe interactie' },
  '📎 Dodaj plik':              { en: '📎 Add File',             nl: '📎 Bestand toevoegen' },
  '✏️ Edytuj klienta':         { en: '✏️ Edit Client',          nl: '✏️ Klant bewerken' },
  '+ Nowy klient':             { en: '+ New Client',            nl: '+ Nieuwe klant' },
  'Nazwa jest wymagana.':      { en: 'Name is required.',       nl: 'Naam is verplicht.' },
  'Dane klienta zapisane.':    { en: 'Client data saved.',      nl: 'Klantgegevens opgeslagen.' },
  'Usunąć tę interakcję?':     { en: 'Delete this interaction?', nl: 'Deze interactie verwijderen?' },
  'Interakcja dodana.':        { en: 'Interaction added.',      nl: 'Interactie toegevoegd.' },
  'Plik dodany.':              { en: 'File added.',             nl: 'Bestand toegevoegd.' },
  'Usunąć plik?':              { en: 'Delete file?',            nl: 'Bestand verwijderen?' },
  'Klient zaktualizowany.':    { en: 'Client updated.',         nl: 'Klant bijgewerkt.' },
  'Klient dodany.':            { en: 'Client added.',           nl: 'Klant toegevoegd.' },
  'Usunąć tego klienta?':      { en: 'Delete this client?',     nl: 'Deze klant verwijderen?' },
  'Usuń klienta':              { en: 'Delete Client',           nl: 'Klant verwijderen' },
  'Klient usunięty.':          { en: 'Client deleted.',         nl: 'Klant verwijderd.' },
  'Uzupełniono dane z VIES — sprawdź i zapisz.': { en: 'Data filled from VIES — check and save.', nl: 'Gegevens ingevuld vanuit VIES — controleer en sla op.' },

  // ── page-tasks.js ────────────────────────────────────────────
  'Brak ukończonych zadań.':   { en: 'No completed tasks.',     nl: 'Geen voltooide taken.' },
  '🎉 Wszystkie zadania ukończone!': { en: '🎉 All tasks completed!', nl: '🎉 Alle taken voltooid!' },
  '🔴 Zadania pilne':           { en: '🔴 Urgent tasks',         nl: '🔴 Urgente taken' },
  '🟠 Wysoki':                  { en: '🟠 High',                 nl: '🟠 Hoog' },
  '🟡 Średni':                  { en: '🟡 Medium',               nl: '🟡 Gemiddeld' },
  '🟢 Niski':                   { en: '🟢 Low',                  nl: '🟢 Laag' },
  '📄 Termin faktury':          { en: '📄 Invoice due date',     nl: '📄 Factuurtermijn' },
  '🔔 Przypomnienie':           { en: '🔔 Reminder',             nl: '🔔 Herinnering' },
  'TERMIN':                    { en: 'DUE',                     nl: 'DEADLINE' },
  '+ Dodaj zadanie na ten dzień': { en: '+ Add task for this day', nl: '+ Taak toevoegen voor deze dag' },
  '✏️ Edytuj zadanie':         { en: '✏️ Edit Task',            nl: '✏️ Taak bewerken' },
  '+ Dodaj':                   { en: '+ Add',                   nl: '+ Toevoegen' },
  'Zadanie zaktualizowane.':   { en: 'Task updated.',           nl: 'Taak bijgewerkt.' },
  'Usunąć to zadanie?':        { en: 'Delete this task?',       nl: 'Deze taak verwijderen?' },
  'Zadanie usunięte.':         { en: 'Task deleted.',           nl: 'Taak verwijderd.' },

  // ── page-notes.js ────────────────────────────────────────────
  '+ Nowa':                    { en: '+ New',                   nl: '+ Nieuw' },
  '— Wybierz projekt —':       { en: '— Select project —',      nl: '— Selecteer project —' },
  'Tytuł jest wymagany':       { en: 'Title is required',       nl: 'Titel is verplicht' },
  'Usunąć tę notatkę? Operacja jest nieodwracalna.': { en: 'Delete this note? This action cannot be undone.', nl: 'Deze notitie verwijderen? Deze actie kan niet ongedaan worden gemaakt.' },
  'PDF wyeksportowany':        { en: 'PDF exported',            nl: 'PDF geëxporteerd' },
  'przed chwilą':              { en: 'just now',                nl: 'zojuist' },
  'Niezapisane zmiany…':       { en: 'Unsaved changes…',        nl: 'Niet-opgeslagen wijzigingen…' },

  // ── page-reminders.js ────────────────────────────────────────
  '📊 Na dashboardzie pokaż:':  { en: '📊 Show on dashboard:',   nl: '📊 Tonen op dashboard:' },

  // ── page-calendar.js ─────────────────────────────────────────
  '🔄 Odśwież':                 { en: '🔄 Refresh',              nl: '🔄 Vernieuwen' },
  '+ Nowe wydarzenie':         { en: '+ New Event',             nl: '+ Nieuw evenement' },
  '✅ Połączono z Google Calendar': { en: '✅ Connected to Google Calendar', nl: '✅ Verbonden met Google Calendar' },
  'ℹ️ Jak skonfigurować Google Calendar API:': { en: 'ℹ️ How to configure Google Calendar API:', nl: 'ℹ️ Google Calendar API configureren:' },
  'Wpisz Client ID i Client Secret': { en: 'Enter Client ID and Client Secret', nl: 'Voer Client ID en Client Secret in' },
  '⏳ Autoryzacja w przeglądarce…': { en: '⏳ Authorizing in browser…', nl: '⏳ Autoriseren in browser…' },
  '✅ Połączono z Google Calendar!': { en: '✅ Connected to Google Calendar!', nl: '✅ Verbonden met Google Calendar!' },
  'Rozłączyć konto Google Calendar? Wydarzenia w Google pozostaną nienaruszone.': { en: 'Disconnect Google Calendar account? Events in Google will remain unaffected.', nl: 'Google Calendar-account loskoppelen? Evenementen in Google blijven ongewijzigd.' },
  'Konto Google Calendar rozłączone': { en: 'Google Calendar account disconnected', nl: 'Google Calendar-account ontkoppeld' },
  'Ładowanie wydarzeń…':       { en: 'Loading events…',         nl: 'Evenementen laden…' },
  'Brak nadchodzących wydarzeń w ciągu najbliższych 60 dni': { en: 'No upcoming events in the next 60 days', nl: 'Geen aankomende evenementen in de komende 60 dagen' },
  'Cały dzień':                { en: 'All day',                 nl: 'Hele dag' },
  'Edytuj wydarzenie':         { en: 'Edit Event',              nl: 'Evenement bewerken' },
  'Nowe wydarzenie':           { en: 'New Event',               nl: 'Nieuw evenement' },
  'Wydarzenie całodniowe':     { en: 'All-day event',           nl: 'Evenement de hele dag' },
  'Data rozpoczęcia *':        { en: 'Start Date *',            nl: 'Startdatum *' },
  'Godzina rozpoczęcia':       { en: 'Start Time',              nl: 'Starttijd' },
  'Data zakończenia *':        { en: 'End Date *',              nl: 'Einddatum *' },
  'Godzina zakończenia':       { en: 'End Time',                nl: 'Eindtijd' },
  'Daty są wymagane':          { en: 'Dates are required',      nl: 'Data zijn verplicht' },
  'Wydarzenie zaktualizowane': { en: 'Event updated',           nl: 'Evenement bijgewerkt' },
  'Wydarzenie dodane':         { en: 'Event added',             nl: 'Evenement toegevoegd' },
  'Usunąć to wydarzenie z Google Calendar?': { en: 'Delete this event from Google Calendar?', nl: 'Dit evenement uit Google Calendar verwijderen?' },
  'Wydarzenie usunięte':       { en: 'Event deleted',           nl: 'Evenement verwijderd' },
  'Niedziela':                 { en: 'Sunday',                  nl: 'Zondag' },
  'Poniedziałek':              { en: 'Monday',                  nl: 'Maandag' },
  'Wtorek':                    { en: 'Tuesday',                 nl: 'Dinsdag' },
  'Środa':                     { en: 'Wednesday',               nl: 'Woensdag' },
  'Czwartek':                  { en: 'Thursday',                nl: 'Donderdag' },
  'Piątek':                    { en: 'Friday',                  nl: 'Vrijdag' },
  'Sobota':                    { en: 'Saturday',                nl: 'Zaterdag' },
  'Jutro':                     { en: 'Tomorrow',                nl: 'Morgen' },

  // ── page-reports.js ──────────────────────────────────────────
  '📋 W&V PDF':                 { en: '📋 W&V PDF',              nl: '📋 W&V PDF' },
  'Eksport niedostępny dla tego widoku.': { en: 'Export not available for this view.', nl: 'Exporteren niet beschikbaar voor deze weergave.' },
  'Przygotowywanie eksportu…': { en: 'Preparing export…',       nl: 'Export voorbereiden…' },

  // ── page-youtube.js ──────────────────────────────────────────
  '🎬 YouTube / AdSense':       { en: '🎬 YouTube / AdSense',    nl: '🎬 YouTube / AdSense' },
  '↺ Odśwież':                  { en: '↺ Refresh',               nl: '↺ Vernieuwen' },
  'Przychody + RPM + wyświetlenia — ': { en: 'Income + RPM + views — ', nl: 'Inkomsten + RPM + weergaven — ' },
  '📂 Importuj CSV AdSense':    { en: '📂 Import AdSense CSV',   nl: '📂 AdSense CSV importeren' },
  'AdSense → Płatności → Historia → Eksport CSV': { en: 'AdSense → Payments → History → Export CSV', nl: 'AdSense → Betalingen → Geschiedenis → CSV exporteren' },
  '📂 Importuj CSV YouTube Analytics': { en: '📂 Import YouTube Analytics CSV', nl: '📂 YouTube Analytics CSV importeren' },
  'Jak pobrać:':               { en: 'How to download:',        nl: 'Hoe te downloaden:' },
  'Ile zarabiasz':             { en: 'How much you earn',       nl: 'Hoeveel je verdient' },
  'Pokaż więcej':              { en: 'Show more',                nl: 'Meer weergeven' },
  'Wykres co miesiąc':         { en: 'Monthly chart',           nl: 'Maandelijkse grafiek' },
  'Eksport ↓':                 { en: 'Export ↓',                 nl: 'Exporteren ↓' },
  '🗑 Wyczyść wszystkie dane YT': { en: '🗑 Clear all YT data',   nl: '🗑 Alle YT-gegevens wissen' },
  'RPM (€)':                   { en: 'RPM (€)',                  nl: 'RPM (€)' },
  'Czas oglądania':            { en: 'Watch Time',               nl: 'Kijktijd' },
  'w tym roku':                { en: 'this year',                nl: 'dit jaar' },
  'Przychód AdSense':          { en: 'AdSense Revenue',          nl: 'AdSense inkomsten' },
  'Śr. RPM':                   { en: 'Avg. RPM',                 nl: 'Gem. RPM' },
  'utraconych':                { en: 'lost',                     nl: 'verloren' },
  'Usunąć wszystkie zaimportowane dane YouTube (statystyki, historia importów, przychody AdSense)?': { en: 'Delete all imported YouTube data (statistics, import history, AdSense revenue)?', nl: 'Alle geïmporteerde YouTube-gegevens verwijderen (statistieken, importgeschiedenis, AdSense-inkomsten)?' },
  'Dane YouTube wyczyszczone': { en: 'YouTube data cleared',     nl: 'YouTube-gegevens gewist' },
  'Statystyki zapisane':       { en: 'Statistics saved',         nl: 'Statistieken opgeslagen' },

  // ── page-expenses.js ─────────────────────────────────────────
  'Pokaż tylko nieuzupełnione': { en: 'Show incomplete only',    nl: 'Alleen onvolledige tonen' },
  'Załączniki':                 { en: 'Attachments',             nl: 'Bijlagen' },
  'Koszt':                      { en: 'Expense',                 nl: 'Uitgave' },
  'Kwota netto (EUR)':          { en: 'Net amount (EUR)',        nl: 'Netto bedrag (EUR)' },
  'Podgląd kosztu':             { en: 'Expense Preview',         nl: 'Uitgave voorbeeld' },
  'Brak załącznika.':           { en: 'No attachment.',          nl: 'Geen bijlage.' },
  'Nie udało się wczytać pliku.': { en: 'Failed to load the file.', nl: 'Bestand kon niet worden geladen.' },
  'Zapisz koszt, aby dodać i podglądać załączniki (paragon / faktura).': { en: 'Save the expense to add and preview attachments (receipt / invoice).', nl: 'Sla de kosten op om bijlagen toe te voegen en te bekijken (bon / factuur).' },
  'Brak załączników. Kliknij „+", aby dodać paragon lub fakturę.': { en: 'No attachments. Click "+" to add a receipt or invoice.', nl: 'Geen bijlagen. Klik op "+" om een bon of factuur toe te voegen.' },
  'Usuń załącznik':             { en: 'Delete attachment',       nl: 'Bijlage verwijderen' },
  'Najpierw zapisz koszt, potem dodasz załączniki.': { en: 'Save the expense first, then add attachments.', nl: 'Sla eerst de kosten op, voeg daarna bijlagen toe.' },
  'Czy na pewno usunąć ten załącznik?': { en: 'Are you sure you want to delete this attachment?', nl: 'Weet je zeker dat je deze bijlage wilt verwijderen?' },
  'Opis jest wymagany.':        { en: 'Description is required.', nl: 'Omschrijving is verplicht.' },
  'Podaj prawidłową kwotę.':    { en: 'Enter a valid amount.',   nl: 'Voer een geldig bedrag in.' },
  'Koszt zaktualizowany.':      { en: 'Expense updated.',        nl: 'Uitgave bijgewerkt.' },
  'Koszt dodany.':              { en: 'Expense added.',          nl: 'Uitgave toegevoegd.' },
  'Czy na pewno usunąć ten koszt?': { en: 'Are you sure you want to delete this expense?', nl: 'Weet je zeker dat je deze uitgave wilt verwijderen?' },
  'Usuń koszt':                 { en: 'Delete expense',          nl: 'Uitgave verwijderen' },
  'Koszt usunięty.':            { en: 'Expense deleted.',        nl: 'Uitgave verwijderd.' },
  'Paragon dodany.':            { en: 'Receipt added.',          nl: 'Bon toegevoegd.' },
  'Nie można otworzyć pliku.':  { en: 'Cannot open the file.',   nl: 'Bestand kan niet worden geopend.' },
  'Plik':                       { en: 'File',                    nl: 'Bestand' },
  'Dodano':                     { en: 'Added',                   nl: 'Toegevoegd' },
  'Brak załączników.':          { en: 'No attachments.',         nl: 'Geen bijlagen.' },
  '📎 Załączniki kosztu':       { en: '📎 Expense Attachments',  nl: '📎 Uitgavebijlagen' },
  'Załącznik usunięty.':        { en: 'Attachment deleted.',     nl: 'Bijlage verwijderd.' },
  'Pominięto — używany plik XML': { en: 'Skipped — XML file used instead', nl: 'Overgeslagen — XML-bestand gebruikt' },
  '— zmień ją po imporcie jeśli potrzeba.': { en: '— change it after import if needed.', nl: '— wijzig dit indien nodig na het importeren.' },

  // ── page-invoices.js ─────────────────────────────────────────
  '💰 Łącznie:':                { en: '💰 Total:',               nl: '💰 Totaal:' },
  '✅ Zapłacono:':              { en: '✅ Paid:',                nl: '✅ Betaald:' },
  '⏳ Oczekuje:':               { en: '⏳ Pending:',             nl: '⏳ In afwachting:' },
  'Faktura nie znaleziona.':    { en: 'Invoice not found.',      nl: 'Factuur niet gevonden.' },
  '— wybierz klienta —':        { en: '— select a client —',     nl: '— kies een klant —' },
  '+ Nowy':                     { en: '+ New',                   nl: '+ Nieuw' },
  '— bez projektu —':           { en: '— no project —',          nl: '— geen project —' },
  'BTW 0% — Reverse Charge (B2B UE)': { en: 'VAT 0% — Reverse Charge (B2B EU)', nl: 'BTW 0% — Verlegd (B2B EU)' },
  'BTW 21% (NL)':               { en: 'VAT 21% (NL)',            nl: 'BTW 21% (NL)' },
  'Brak BTW (eksport)':         { en: 'No VAT (export)',         nl: 'Geen BTW (export)' },
  '💾 Zapisz roboczą':          { en: '💾 Save as Draft',        nl: '💾 Opslaan als concept' },
  '📄 Zapisz i eksportuj PDF':  { en: '📄 Save and Export PDF',  nl: '📄 Opslaan en PDF exporteren' },
  'BTW%':                       { en: 'VAT%',                    nl: 'BTW%' },
  '📝 …lub wstaw opis usługi':  { en: '📝 …or insert a service description', nl: '📝 …of voeg een dienstomschrijving in' },
  'Brak produktów — dodaj pierwszy poniżej.': { en: 'No products — add your first one below.', nl: 'Geen producten — voeg hieronder je eerste product toe.' },
  'Nazwa produktu jest wymagana.': { en: 'Product name is required.', nl: 'Productnaam is verplicht.' },
  'Produkt dodany.':            { en: 'Product added.',          nl: 'Product toegevoegd.' },
  'Produkt usunięty.':          { en: 'Product deleted.',        nl: 'Product verwijderd.' },
  'DO ZAPŁATY:':                { en: 'TOTAL DUE:',              nl: 'TE BETALEN:' },
  'Wybierz klienta i dodaj pozycję, aby zobaczyć podgląd faktury.': { en: 'Select a client and add an item to preview the invoice.', nl: 'Selecteer een klant en voeg een regel toe om de factuur te bekijken.' },
  'Generuję podgląd PDF…':      { en: 'Generating PDF preview…', nl: 'PDF-voorbeeld genereren…' },
  'Dodaj klienta, a następnie wróć do faktur.': { en: 'Add a client, then return to invoices.', nl: 'Voeg een klant toe en keer terug naar facturen.' },
  'Nr faktury jest wymagany.':  { en: 'Invoice number is required.', nl: 'Factuurnummer is verplicht.' },
  'Daty są wymagane.':          { en: 'Dates are required.',     nl: 'Datums zijn verplicht.' },
  'Faktura zaktualizowana.':    { en: 'Invoice updated.',        nl: 'Factuur bijgewerkt.' },
  'Faktura zapisana.':          { en: 'Invoice saved.',          nl: 'Factuur opgeslagen.' },
  '✅ Oznacz jako zapłaconą':   { en: '✅ Mark as Paid',         nl: '✅ Markeer als betaald' },
  '✅ Potwierdź':               { en: '✅ Confirm',              nl: '✅ Bevestigen' },
  'Faktura oznaczona jako zapłacona.': { en: 'Invoice marked as paid.', nl: 'Factuur gemarkeerd als betaald.' },
  '🗑 Usuń fakturę':            { en: '🗑 Delete Invoice',       nl: '🗑 Factuur verwijderen' },
  'Czy na pewno chcesz usunąć fakturę': { en: 'Are you sure you want to delete invoice', nl: 'Weet je zeker dat je factuur' },
  'Faktura usunięta.':          { en: 'Invoice deleted.',        nl: 'Factuur verwijderd.' },
  'Faktura zduplikowana.':      { en: 'Invoice duplicated.',     nl: 'Factuur gedupliceerd.' },
  'Brak pozycji':               { en: 'No items',                nl: 'Geen regels' },
  'BTW (reverse charge)':       { en: 'VAT (reverse charge)',    nl: 'BTW (verlegd)' },
  'Daty':                       { en: 'Dates',                   nl: 'Datums' },
  'Wystawiona':                 { en: 'Issued',                  nl: 'Uitgegeven' },
  'Cena':                       { en: 'Price',                   nl: 'Prijs' },
  'Wartość':                    { en: 'Value',                   nl: 'Waarde' },
  'Do zapłaty':                 { en: 'Amount Due',              nl: 'Te betalen' },
  'Uwagi':                      { en: 'Remarks',                 nl: 'Opmerkingen' },
  '👁 Otwórz PDF':               { en: '👁 Open PDF',             nl: '👁 PDF openen' },
  '📄 Eksportuj PDF':           { en: '📄 Export PDF',           nl: '📄 PDF exporteren' },
  'Skopiowano treść.':          { en: 'Text copied.',            nl: 'Tekst gekopieerd.' },
  'Nie udało się skopiować.':   { en: 'Copy failed.',            nl: 'Kopiëren mislukt.' },
  'Nie udało się otworzyć programu pocztowego.': { en: 'Could not open the mail application.', nl: 'Kon het e-mailprogramma niet openen.' },
  'Generowanie UBL XML…':       { en: 'Generating UBL XML…',     nl: 'UBL XML genereren…' },
  'XML zapisany!':              { en: 'XML saved!',              nl: 'XML opgeslagen!' },
  '🔵 Robocza':                 { en: '🔵 Draft',                nl: '🔵 Concept' },
  '🟡 Wysłana':                 { en: '🟡 Sent',                 nl: '🟡 Verzonden' },
  '🟢 Zapłacona':               { en: '🟢 Paid',                 nl: '🟢 Betaald' },
  '🔴 Przetermn.':              { en: '🔴 Overdue',              nl: '🔴 Verlopen' },
  '⚫ Anulowana':               { en: '⚫ Cancelled',            nl: '⚫ Geannuleerd' },
  'Generowanie PDF…':           { en: 'Generating PDF…',         nl: 'PDF genereren…' },
  'PDF zapisany!':              { en: 'PDF saved!',              nl: 'PDF opgeslagen!' },
  'Odznacz wiersze które chcesz pominąć, a następnie kliknij': { en: 'Uncheck the rows you want to skip, then click', nl: 'Vink de rijen uit die je wilt overslaan en klik daarna op' },
  'Importuj jako':              { en: 'Import as',               nl: 'Importeren als' },
  'zapłacone':                  { en: 'paid',                    nl: 'betaald' },
  '(data wystawienia = data wpłaty) —': { en: '(issue date = payment date) —', nl: '(factuurdatum = betaaldatum) —' },
  'zalecane dla historycznych faktur': { en: 'recommended for historical invoices', nl: 'aanbevolen voor historische facturen' },
  'Podgląd pliku':              { en: 'File preview',            nl: 'Bestandsvoorbeeld' },
  'Wybierz wiersz, aby wyświetlić podgląd pliku PDF/obrazu.': { en: 'Select a row to preview the PDF/image file.', nl: 'Selecteer een rij om het PDF-/afbeeldingsbestand te bekijken.' },
  'Ładowanie podglądu…':        { en: 'Loading preview…',        nl: 'Voorbeeld laden…' },
  'Brak podglądu dla tego typu pliku.': { en: 'No preview available for this file type.', nl: 'Geen voorbeeld beschikbaar voor dit bestandstype.' },

  // ── page-settings.js ─────────────────────────────────────────
  'Tłumaczenia':                { en: 'Translations',            nl: 'Vertalingen' },
  'Synchronizacja / Telefon':   { en: 'Sync / Phone',            nl: 'Synchronisatie / Telefoon' },
  'O aplikacji':                { en: 'About',                   nl: 'Over de app' },
  'Imię / Nazwa *':             { en: 'First name / Name *',     nl: 'Voornaam / Naam *' },
  'KvK-nummer':                 { en: 'KvK Number',              nl: 'KvK-nummer' },
  'BTW-nummer':                 { en: 'VAT Number',              nl: 'BTW-nummer' },
  'IBAN':                       { en: 'IBAN',                    nl: 'IBAN' },
  '🖼 Zmień logo':              { en: '🖼 Change Logo',          nl: '🖼 Logo wijzigen' },
  'Logo ustawione ✅':          { en: 'Logo set ✅',             nl: 'Logo ingesteld ✅' },
  'Brak logo':                  { en: 'No logo',                 nl: 'Geen logo' },
  '💾 Zapisz dane firmy':       { en: '💾 Save Company Data',    nl: '💾 Bedrijfsgegevens opslaan' },
  'Domyślny termin płatności (dni)': { en: 'Default payment term (days)', nl: 'Standaard betalingstermijn (dagen)' },
  'Domyślna waluta':            { en: 'Default currency',        nl: 'Standaardvaluta' },
  'Domyślna stawka BTW (%)':    { en: 'Default VAT rate (%)',    nl: 'Standaard BTW-tarief (%)' },
  'Stopka faktury':             { en: 'Invoice footer',          nl: 'Factuurvoettekst' },
  '💾 Zapisz ustawienia faktur': { en: '💾 Save Invoice Settings', nl: '💾 Factuurinstellingen opslaan' },
  'Domyślna stawka godzinowa (€/h)': { en: 'Default hourly rate (€/h)', nl: 'Standaard uurtarief (€/u)' },
  'Idle detection (min)':       { en: 'Idle detection (min)',    nl: 'Inactiviteitsdetectie (min)' },
  'Czas Pomodoro (min)':        { en: 'Pomodoro duration (min)', nl: 'Pomodoro-duur (min)' },
  'Przerwa krótka (min)':       { en: 'Short break (min)',       nl: 'Korte pauze (min)' },
  'Przerwa długa (min)':        { en: 'Long break (min)',        nl: 'Lange pauze (min)' },
  'Dźwięk końca Pomodoro':      { en: 'Pomodoro end sound',      nl: 'Pomodoro-eindgeluid' },
  '🔔 Włączony':                { en: '🔔 On',                   nl: '🔔 Aan' },
  '🔕 Wyłączony':               { en: '🔕 Off',                  nl: '🔕 Uit' },
  '💾 Zapisz ustawienia czasu': { en: '💾 Save Time Settings',   nl: '💾 Tijdinstellingen opslaan' },
  'Próg I (€)':                 { en: 'Bracket I (€)',           nl: 'Schijf I (€)' },
  'Stawka I (%)':               { en: 'Rate I (%)',              nl: 'Tarief I (%)' },
  'Stawka II (%)':              { en: 'Rate II (%)',             nl: 'Tarief II (%)' },
  'Zelfstandigenaftrek (€)':    { en: 'Zelfstandigenaftrek (€)', nl: 'Zelfstandigenaftrek (€)' },
  'Startersaftrek (€)':         { en: 'Startersaftrek (€)',      nl: 'Startersaftrek (€)' },
  'MKB-winstvrijstelling (%)':  { en: 'MKB-winstvrijstelling (%)', nl: 'MKB-winstvrijstelling (%)' },
  'Heffingskorting max (€)':    { en: 'Heffingskorting max (€)', nl: 'Heffingskorting max (€)' },
  'Arbeidskorting max (€)':     { en: 'Arbeidskorting max (€)',  nl: 'Arbeidskorting max (€)' },
  'Brak historii backupów':     { en: 'No backup history',       nl: 'Geen back-upgeschiedenis' },
  'Backup danych':              { en: 'Data Backup',             nl: 'Gegevensback-up' },
  'Folder docelowy':            { en: 'Target folder',           nl: 'Doelmap' },
  '📂 Zmień':                   { en: '📂 Change',               nl: '📂 Wijzigen' },
  'Automatyczny backup':        { en: 'Automatic backup',        nl: 'Automatische back-up' },
  '✅ Włączony':                { en: '✅ On',                   nl: '✅ Aan' },
  '⬜ Wyłączony':               { en: '⬜ Off',                  nl: '⬜ Uit' },
  'Częstotliwość':              { en: 'Frequency',               nl: 'Frequentie' },
  'Codziennie':                 { en: 'Daily',                   nl: 'Dagelijks' },
  'Co tydzień':                 { en: 'Weekly',                  nl: 'Wekelijks' },
  'Godzina backupu':            { en: 'Backup time',             nl: 'Back-uptijd' },
  'Liczba kopii do zachowania': { en: 'Number of backups to keep', nl: 'Aantal te bewaren back-ups' },
  '💾 Zapisz ustawienia':       { en: '💾 Save Settings',        nl: '💾 Instellingen opslaan' },
  '🔄 Wykonaj backup teraz':    { en: '🔄 Run Backup Now',       nl: '🔄 Nu back-uppen' },
  '📂 Otwórz folder':           { en: '📂 Open Folder',          nl: '📂 Map openen' },
  'Historia backupów':          { en: 'Backup History',          nl: 'Back-upgeschiedenis' },
  'Motyw jest zapisywany automatycznie po kliknięciu.': { en: 'The theme is saved automatically when clicked.', nl: 'Het thema wordt automatisch opgeslagen bij het klikken.' },
  'Wybierz język interfejsu. Przy języku niderlandzkim pod etykietami wyświetlane są polskie tłumaczenia.': { en: 'Choose the interface language. In Dutch, Polish translations are shown under the labels.', nl: 'Kies de interfacetaal. Bij het Nederlands worden onder de labels Poolse vertalingen weergegeven.' },
  'Pływająca ikonka':           { en: 'Floating icon',           nl: 'Zwevend pictogram' },
  'Mała ikonka aplikacji widoczna zawsze na wierzchu nad innymi programami. Przeciągnij, aby zmienić położenie, kliknij aby otworzyć ZZP Manager.': { en: 'A small app icon always on top of other programs. Drag to reposition, click to open ZZP Manager.', nl: "Een klein app-pictogram dat altijd bovenop andere programma's blijft. Sleep om te verplaatsen, klik om ZZP Manager te openen." },
  'Motyw zmieniony':            { en: 'Theme changed',           nl: 'Thema gewijzigd' },
  '🫧 Włączona':                { en: '🫧 On',                   nl: '🫧 Aan' },
  '⬜ Wyłączona':               { en: '⬜ Off',                  nl: '⬜ Uit' },
  'Pływająca ikonka włączona':  { en: 'Floating icon enabled',   nl: 'Zwevend pictogram ingeschakeld' },
  'Pływająca ikonka wyłączona': { en: 'Floating icon disabled',  nl: 'Zwevend pictogram uitgeschakeld' },
  'Obecny PIN':                 { en: 'Current PIN',             nl: 'Huidige PIN' },
  'Nowy PIN (4–8 cyfr)':        { en: 'New PIN (4–8 digits)',    nl: 'Nieuwe PIN (4–8 cijfers)' },
  'Powtórz nowy PIN':           { en: 'Repeat new PIN',          nl: 'Herhaal nieuwe PIN' },
  '🔑 Zmień PIN':               { en: '🔑 Change PIN',           nl: '🔑 PIN wijzigen' },
  '🔓 Wyłącz ochronę PIN':      { en: '🔓 Disable PIN Protection', nl: '🔓 PIN-beveiliging uitschakelen' },
  '🔒 Włącz ochronę PIN':       { en: '🔒 Enable PIN Protection', nl: '🔒 PIN-beveiliging inschakelen' },
  'Zablokuj po bezczynności':   { en: 'Lock after inactivity',   nl: 'Vergrendelen na inactiviteit' },
  '5 minut':                    { en: '5 minutes',               nl: '5 minuten' },
  '15 minut':                   { en: '15 minutes',              nl: '15 minuten' },
  '30 minut':                   { en: '30 minutes',              nl: '30 minuten' },
  'Nigdy':                      { en: 'Never',                   nl: 'Nooit' },
  '⚠️ Strefa niebezpieczna':    { en: '⚠️ Danger Zone',          nl: '⚠️ Gevaarlijke zone' },
  'Przywrócenie ustawień fabrycznych': { en: 'Restoring factory settings', nl: 'Fabrieksinstellingen herstellen' },
  'nieodwracalnie usuwa':       { en: 'irreversibly deletes',    nl: 'verwijdert onherroepelijk' },
  'wszystkie dane: faktury, koszty, klientów, projekty, zadania, czas pracy, notatki i pliki. Ustawienia aplikacji i profil firmy zostaną zresetowane do wartości domyślnych. Aplikacja uruchomi się ponownie.': { en: 'all data: invoices, expenses, clients, projects, tasks, time tracking, notes and files. App settings and the company profile will be reset to defaults. The app will restart.', nl: 'alle gegevens: facturen, kosten, klanten, projecten, taken, tijdregistratie, notities en bestanden. App-instellingen en het bedrijfsprofiel worden teruggezet naar de standaardwaarden. De app wordt opnieuw gestart.' },
  '🔴 Przywróć ustawienia fabryczne': { en: '🔴 Restore Factory Settings', nl: '🔴 Fabrieksinstellingen herstellen' },
  '📥 Import przychodów z CSV': { en: '📥 Import Income from CSV', nl: '📥 Inkomsten importeren uit CSV' },
  'Zaimportuj przychody z innych platform (Upwork, Fiverr, PayPal, Stripe lub dowolny plik CSV). Dane pojawią się natychmiast w raportach i statystykach.': { en: 'Import income from other platforms (Upwork, Fiverr, PayPal, Stripe, or any CSV file). The data will appear immediately in reports and statistics.', nl: 'Importeer inkomsten van andere platforms (Upwork, Fiverr, PayPal, Stripe of een willekeurig CSV-bestand). De gegevens verschijnen direct in rapporten en statistieken.' },
  '📥 Importuj przychody z CSV': { en: '📥 Import Income from CSV', nl: '📥 Inkomsten importeren uit CSV' },
  'Eksportuj wszystkie dane aplikacji do pliku JSON (pełny backup).': { en: 'Export all app data to a JSON file (full backup).', nl: 'Exporteer alle app-gegevens naar een JSON-bestand (volledige back-up).' },
  '📤 Eksportuj wszystkie dane (JSON)': { en: '📤 Export All Data (JSON)', nl: '📤 Alle gegevens exporteren (JSON)' },
  'Przywróć dane z poprzednio wyeksportowanego pliku JSON.': { en: 'Restore data from a previously exported JSON file.', nl: 'Herstel gegevens uit een eerder geëxporteerd JSON-bestand.' },
  '📥 Importuj z pliku JSON':   { en: '📥 Import from JSON File', nl: '📥 Importeren uit JSON-bestand' },
  '⚠️ Reset do ustawień fabrycznych': { en: '⚠️ Reset to Factory Settings', nl: '⚠️ Terugzetten naar fabrieksinstellingen' },
  'Usuwa':                      { en: 'Deletes',                 nl: 'Verwijdert' },
  'wszystkie dane':             { en: 'all data',                nl: 'alle gegevens' },
  'i przywraca aplikację do stanu z pierwszego uruchomienia. Operacja jest': { en: 'and restores the app to its first-run state. This operation is', nl: 'en herstelt de app naar de staat van de eerste opstart. Deze bewerking is' },
  'nieodwracalna':              { en: 'irreversible',            nl: 'onomkeerbaar' },
  '— wykonaj backup przed resetem.': { en: '— make a backup before resetting.', nl: '— maak een back-up voordat je reset.' },
  'ℹ️ Jak skonfigurować YouTube Analytics API:': { en: 'ℹ️ How to configure the YouTube Analytics API:', nl: 'ℹ️ Hoe stel je de YouTube Analytics API in:' },
  '1. Przejdź do':              { en: '1. Go to',                nl: '1. Ga naar' },
  '→ utwórz nowy projekt':      { en: '→ create a new project',  nl: '→ maak een nieuw project' },
  '2. Włącz:':                  { en: '2. Enable:',              nl: '2. Schakel in:' },
  '3. Utwórz':                  { en: '3. Create',               nl: '3. Maak' },
  '4. Dodaj':                   { en: '4. Add',                  nl: '4. Voeg' },
  'jako Authorized redirect URI': { en: 'as the Authorized redirect URI', nl: 'als Authorized redirect URI' },
  '5. Skopiuj Client ID i Client Secret poniżej': { en: '5. Copy the Client ID and Client Secret below', nl: '5. Kopieer hieronder de Client ID en Client Secret' },
  '💾 Zapisz dane':             { en: '💾 Save Credentials',     nl: '💾 Gegevens opslaan' },
  '✅ Aplikacja jest połączona z YouTube Analytics API. Statystyki będą automatycznie odświeżane przy starcie aplikacji oraz codziennie o 10:00.': { en: '✅ The app is connected to the YouTube Analytics API. Stats will refresh automatically on startup and daily at 10:00.', nl: '✅ De app is verbonden met de YouTube Analytics API. Statistieken worden automatisch bijgewerkt bij het opstarten en dagelijks om 10:00.' },
  '❌ Brak połączenia. Wpisz Client ID i Client Secret powyżej, kliknij „Zapisz dane", a następnie „Połącz konto Google".': { en: '❌ Not connected. Enter the Client ID and Client Secret above, click "Save Credentials", then "Connect Google Account".', nl: '❌ Geen verbinding. Vul hierboven de Client ID en Client Secret in, klik op "Gegevens opslaan" en daarna op "Google-account koppelen".' },
  'Brak historii synchronizacji': { en: 'No sync history',       nl: 'Geen synchronisatiegeschiedenis' },
  'Konfiguracja Supabase':      { en: 'Supabase Configuration',  nl: 'Supabase-configuratie' },
  'ℹ️ Jak podłączyć telefon:':  { en: 'ℹ️ How to connect your phone:', nl: 'ℹ️ Hoe koppel je je telefoon:' },
  '1. Załóż darmowe konto na':  { en: '1. Create a free account at', nl: '1. Maak een gratis account aan op' },
  'i utwórz projekt':           { en: 'and create a project',    nl: 'en maak een project aan' },
  '2. Uruchom skrypt SQL ze schematem tabel (Project Settings → SQL Editor)': { en: '2. Run the SQL script with the table schema (Project Settings → SQL Editor)', nl: '2. Voer het SQL-script met het tabelschema uit (Project Settings → SQL Editor)' },
  '3. Utwórz siebie jako użytkownika w Authentication → Users (e-mail + hasło)': { en: '3. Create yourself as a user in Authentication → Users (e-mail + password)', nl: '3. Maak jezelf aan als gebruiker in Authentication → Users (e-mail + wachtwoord)' },
  '4. Skopiuj Project URL i klucz „anon public" (Project Settings → API) poniżej': { en: '4. Copy the Project URL and "anon public" key (Project Settings → API) below', nl: '4. Kopieer hieronder de Project URL en de "anon public"-sleutel (Project Settings → API)' },
  'Klucz „anon public"':        { en: '"anon public" key',       nl: '"anon public"-sleutel' },
  'E-mail (Twoje konto Supabase Auth)': { en: 'E-mail (your Supabase Auth account)', nl: 'E-mail (je Supabase Auth-account)' },
  'Hasło':                      { en: 'Password',                nl: 'Wachtwoord' },
  '💾 Zapisz i połącz':         { en: '💾 Save and Connect',     nl: '💾 Opslaan en verbinden' },
  'Status synchronizacji':      { en: 'Sync Status',             nl: 'Synchronisatiestatus' },
  'Ostatni push':               { en: 'Last push',               nl: 'Laatste push' },
  'Ostatni pull':               { en: 'Last pull',               nl: 'Laatste pull' },
  'Oczekujące zmiany':          { en: 'Pending changes',         nl: 'In behandeling zijnde wijzigingen' },
  '🔄 Synchronizuj teraz':      { en: '🔄 Sync Now',             nl: '🔄 Nu synchroniseren' },
  '⬆️ Wyślij zmiany':          { en: '⬆️ Push Changes',         nl: '⬆️ Wijzigingen verzenden' },
  '⬇️ Pobierz zmiany':         { en: '⬇️ Pull Changes',         nl: '⬇️ Wijzigingen ophalen' },
  'ℹ️ Darmowy projekt Supabase usypia po 7 dniach bez żadnych zapytań — jeśli synchronizacja zawiedzie po dłuższej przerwie, zaloguj się na supabase.com i kliknij „Restore" przy swoim projekcie.': { en: 'ℹ️ A free Supabase project sleeps after 7 days without any queries — if sync fails after a long pause, log in to supabase.com and click "Restore" on your project.', nl: 'ℹ️ Een gratis Supabase-project gaat na 7 dagen zonder verzoeken in slaapstand — als synchronisatie na een lange pauze mislukt, log dan in op supabase.com en klik op "Restore" bij je project.' },
  'Historia synchronizacji':    { en: 'Sync History',            nl: 'Synchronisatiegeschiedenis' },
  'Tłumaczenie opisów na żywo': { en: 'Live Description Translation', nl: 'Live vertaling van omschrijvingen' },
  'ℹ️ Jak to działa:':          { en: 'ℹ️ How it works:',        nl: 'ℹ️ Hoe het werkt:' },
  'Obok pól opisu (pozycje faktury oraz godzinówka) jest ikonka': { en: 'Next to description fields (invoice items and hours) there is an icon', nl: 'Naast omschrijvingsvelden (factuurregels en uren) staat een pictogram' },
  '. Wpisujesz opis po polsku, klikasz ikonkę i wybierasz język (🇳🇱 Niderlandzki / 🇬🇧 Angielski) — treść pola zostaje zastąpiona tłumaczeniem.': { en: '. You type the description in Polish, click the icon and choose a language (🇳🇱 Dutch / 🇬🇧 English) — the field content is replaced with the translation.', nl: '. Je typt de omschrijving in het Pools, klikt op het pictogram en kiest een taal (🇳🇱 Nederlands / 🇬🇧 Engels) — de veldinhoud wordt vervangen door de vertaling.' },
  'Bez klucza działa darmowy silnik': { en: 'Without a key, the free engine', nl: 'Zonder sleutel werkt de gratis engine' },
  '. Aby uzyskać lepszą jakość (zwłaszcza niderlandzki), wklej darmowy klucz': { en: '. For better quality (especially Dutch), paste a free key', nl: '. Voor een betere kwaliteit (vooral Nederlands), plak een gratis sleutel' },
  'poniżej — wtedy tłumaczenia idą przez DeepL, a MyMemory zostaje jako zapas.': { en: 'below — then translations go through DeepL, with MyMemory as a fallback.', nl: 'hieronder — dan lopen vertalingen via DeepL, met MyMemory als reserve.' },
  'Klucz DeepL API (opcjonalny)': { en: 'DeepL API Key (optional)', nl: 'DeepL API-sleutel (optioneel)' },
  'Darmowy plan DeepL: 500 000 znaków/mies. Klucz założysz na deepl.com/pro-api. Klucze „free" kończą się na „:fx".': { en: 'Free DeepL plan: 500,000 characters/month. Get a key at deepl.com/pro-api. "Free" keys end in ":fx".', nl: 'Gratis DeepL-plan: 500.000 tekens/maand. Sleutel aanmaken op deepl.com/pro-api. "Free"-sleutels eindigen op ":fx".' },
  '💾 Zapisz klucz':            { en: '💾 Save Key',             nl: '💾 Sleutel opslaan' },
  'Wersja':                     { en: 'Version',                 nl: 'Versie' },
  'Aplikacja sprawdza aktualizacje automatycznie przy starcie i co 6 godzin. Możesz też sprawdzić od razu.': { en: 'The app checks for updates automatically on startup and every 6 hours. You can also check right now.', nl: 'De app controleert automatisch op updates bij het opstarten en elke 6 uur. Je kunt ook direct controleren.' },
  '🔄 Sprawdź aktualizacje':    { en: '🔄 Check for Updates',    nl: '🔄 Controleren op updates' },
  '⏳ Sprawdzanie aktualizacji…': { en: '⏳ Checking for updates…', nl: '⏳ Controleren op updates…' },
  '✅ Masz najnowszą wersję.':  { en: '✅ You have the latest version.', nl: '✅ Je hebt de nieuwste versie.' },
  'Klucz DeepL zapisany — tłumaczenia będą szły przez DeepL.': { en: 'DeepL key saved — translations will go through DeepL.', nl: 'DeepL-sleutel opgeslagen — vertalingen lopen via DeepL.' },
  'Klucz usunięty — tłumaczenia przez darmowe MyMemory.': { en: 'Key removed — translations via free MyMemory.', nl: 'Sleutel verwijderd — vertalingen via gratis MyMemory.' },
  'Logo zaktualizowane':        { en: 'Logo updated',            nl: 'Logo bijgewerkt' },
  'Ustawienie auto-blokady zapisane': { en: 'Auto-lock setting saved', nl: 'Automatische vergrendeling opgeslagen' },
  'Import z JSON — funkcja w przygotowaniu': { en: 'Import from JSON — feature in progress', nl: 'Importeren uit JSON — functie in ontwikkeling' },
  'Najpierw zapisz Client ID i Client Secret': { en: 'First save the Client ID and Client Secret', nl: 'Sla eerst de Client ID en Client Secret op' },
  '✅ Połączono z YouTube! Dane zostaną zsynchronizowane w tle.': { en: '✅ Connected to YouTube! Data will sync in the background.', nl: '✅ Verbonden met YouTube! Gegevens worden op de achtergrond gesynchroniseerd.' },
  'Rozłączyć konto Google? Statystyki w bazie danych pozostaną nienaruszone.': { en: 'Disconnect Google account? Statistics in the database will remain untouched.', nl: 'Google-account loskoppelen? Statistieken in de database blijven ongewijzigd.' },
  'Wypełnij wszystkie pola (URL, klucz, e-mail, hasło)': { en: 'Fill in all fields (URL, key, e-mail, password)', nl: 'Vul alle velden in (URL, sleutel, e-mail, wachtwoord)' },
  '⏳ Łączenie…':               { en: '⏳ Connecting…',          nl: '⏳ Verbinden…' },
  '✅ Połączono z Supabase!':   { en: '✅ Connected to Supabase!', nl: '✅ Verbonden met Supabase!' },
  '⏳ Synchronizuję…':          { en: '⏳ Syncing…',             nl: '⏳ Synchroniseren…' },
  '✅ Synchronizowanie zakończone': { en: '✅ Synchronising complete', nl: '✅ Synchroniseren voltooid' },
  '✅ Wysyłanie zakończone':    { en: '✅ Sending complete',     nl: '✅ Verzenden voltooid' },
  '✅ Pobieranie zakończone':   { en: '✅ Retrieval complete',   nl: '✅ Ophalen voltooid' },
  'Dane firmy zapisane':        { en: 'Company data saved',      nl: 'Bedrijfsgegevens opgeslagen' },
  'Ustawienia faktur zapisane': { en: 'Invoice settings saved',  nl: 'Factuurinstellingen opgeslagen' },
  'Ustawienia czasu zapisane':  { en: 'Time settings saved',     nl: 'Tijdinstellingen opgeslagen' },
  'Stawki podatkowe zapisane':  { en: 'Tax rates saved',         nl: 'Belastingtarieven opgeslagen' },
  'Ustawienia backupu zapisane': { en: 'Backup settings saved',  nl: 'Back-upinstellingen opgeslagen' },
  'Nowy PIN musi mieć 4–8 cyfr': { en: 'The new PIN must be 4–8 digits', nl: 'De nieuwe PIN moet 4–8 cijfers zijn' },
  'Nowe PINy nie są identyczne': { en: 'The new PINs do not match', nl: 'De nieuwe PIN-codes komen niet overeen' },
  'PIN zmieniony pomyślnie':    { en: 'PIN changed successfully', nl: 'PIN succesvol gewijzigd' },
  'Nieprawidłowy PIN':          { en: 'Incorrect PIN',           nl: 'Onjuiste PIN' },
  'Ochrona PIN wyłączona':      { en: 'PIN protection disabled', nl: 'PIN-beveiliging uitgeschakeld' },
  'Wpisz nowy PIN (4–8 cyfr) w polach powyżej': { en: 'Enter a new PIN (4–8 digits) in the fields above', nl: 'Voer hierboven een nieuwe PIN (4–8 cijfers) in' },
  'PINy nie są identyczne':     { en: 'The PINs do not match',   nl: 'De PIN-codes komen niet overeen' },
  'Ochrona PIN włączona':       { en: 'PIN protection enabled',  nl: 'PIN-beveiliging ingeschakeld' },
  '⚠️ PRZYWRÓCENIE USTAWIEŃ FABRYCZNYCH\n\nTa operacja nieodwracalnie usunie WSZYSTKIE dane:\n• Faktury i pozycje faktur\n• Koszty i paragony\n• Klientów i projekty\n• Zadania, notatki, czas pracy\n• Przychody i statystyki YouTube\n• Profil firmy i ustawienia\n\nAplikacja uruchomi się ponownie. Czy chcesz kontynuować?': { en: '⚠️ RESTORE FACTORY SETTINGS\n\nThis operation will irreversibly delete ALL data:\n• Invoices and invoice items\n• Expenses and receipts\n• Clients and projects\n• Tasks, notes, time tracking\n• YouTube income and statistics\n• Company profile and settings\n\nThe app will restart. Do you want to continue?', nl: '⚠️ FABRIEKSINSTELLINGEN HERSTELLEN\n\nDeze bewerking verwijdert onherroepelijk ALLE gegevens:\n• Facturen en factuurregels\n• Kosten en bonnen\n• Klanten en projecten\n• Taken, notities, tijdregistratie\n• YouTube-inkomsten en statistieken\n• Bedrijfsprofiel en instellingen\n\nDe app wordt opnieuw gestart. Wil je doorgaan?' },
  'Wpisz "RESET" (wielkimi literami), aby potwierdzić:': { en: 'Type "RESET" (in capitals) to confirm:', nl: 'Typ "RESET" (in hoofdletters) om te bevestigen:' },
  'Potwierdź reset':            { en: 'Confirm Reset',           nl: 'Reset bevestigen' },
  'Reset anulowany — wpisany tekst był niepoprawny': { en: 'Reset cancelled — the text entered was incorrect', nl: 'Reset geannuleerd — de ingevoerde tekst was onjuist' },
  'Wprowadź PIN, aby potwierdzić:': { en: 'Enter your PIN to confirm:', nl: 'Voer je PIN in om te bevestigen:' },
  'Nieprawidłowy PIN — reset anulowany': { en: 'Incorrect PIN — reset cancelled', nl: 'Onjuiste PIN — reset geannuleerd' },
  '⏳ Resetowanie…':            { en: '⏳ Resetting…',           nl: '⏳ Resetten…' },
  '✅ Reset wykonany — aplikacja uruchamia się ponownie…': { en: '✅ Reset complete — the app is restarting…', nl: '✅ Reset uitgevoerd — de app wordt opnieuw gestart…' },
  'Język zmieniony na: Polski': { en: 'Language changed to: Polish', nl: 'Taal gewijzigd naar: Pools' },
  'Język zmieniony na: English': { en: 'Language changed to: English', nl: 'Taal gewijzigd naar: Engels' },
  'Język zmieniony na: Nederlands': { en: 'Language changed to: Dutch', nl: 'Taal gewijzigd naar: Nederlands' },
  '📂 Wybierz plik CSV →':      { en: '📂 Choose CSV File →',    nl: '📂 CSV-bestand kiezen →' },
  '⏳ Analizuję...':            { en: '⏳ Analysing...',         nl: '⏳ Analyseren...' },
  'Wybierz plik CSV':           { en: 'Choose a CSV File',       nl: 'Kies een CSV-bestand' },
  'Program automatycznie rozpozna format pliku z platform takich jak': { en: 'The app automatically detects the file format from platforms such as', nl: 'De app herkent automatisch het bestandsformaat van platforms zoals' },
  'lub dowolny CSV.':           { en: 'or any CSV.',             nl: 'of een willekeurige CSV.' },
  'Po wybraniu pliku zostaniesz poproszony o potwierdzenie mapowania kolumn.': { en: 'After choosing a file, you will be asked to confirm the column mapping.', nl: 'Na het kiezen van een bestand word je gevraagd om de kolomtoewijzing te bevestigen.' },
  'Wybierz kolumnę daty':       { en: 'Select the date column',  nl: 'Selecteer de datumkolom' },
  'Wybierz kolumnę kwoty':      { en: 'Select the amount column', nl: 'Selecteer de bedragkolom' },
  '⏳ Importuję...':            { en: '⏳ Importing...',         nl: '⏳ Importeren...' },
  'Dane wyeksportowane':        { en: 'Data exported',           nl: 'Gegevens geëxporteerd' },
};

// ── Placeholder / title attribute map ─────────────────────────
const ATTR_MAP = {
  '🔍 Szukaj nr / klient…':      { en: '🔍 Search no. / client…',    nl: '🔍 Zoek nr. / klant…' },
  '🔍 Szukaj…':                  { en: '🔍 Search…',                  nl: '🔍 Zoeken…' },
  '🔍 Szukaj po nazwie, emailu, VAT…': { en: '🔍 Search by name, email, VAT…', nl: '🔍 Zoek op naam, e-mail, btw…' },
  'Szukaj notatek…':             { en: 'Search notes…',               nl: 'Notities zoeken…' },
  'Nad czym pracujesz?':         { en: 'What are you working on?',    nl: 'Waar werk je aan?' },
  'np. BTW-aangifte Q3':         { en: 'e.g. VAT return Q3',          nl: 'bijv. BTW-aangifte Q3' },
  'np. Licencja Adobe Premiere Pro': { en: 'e.g. Adobe Premiere Pro license', nl: 'bijv. Adobe Premiere Pro-licentie' },
  'np. Adobe Inc.':              { en: 'e.g. Adobe Inc.',             nl: 'bijv. Adobe Inc.' },
  'np. ep.47':                   { en: 'e.g. ep.47',                  nl: 'bijv. ep.47' },
  'Opis zadania…':               { en: 'Task description…',           nl: 'Taakomschrijving…' },
  'Tytuł zadania':               { en: 'Task title',                  nl: 'Taaknaam' },
  'Opis…':                       { en: 'Description…',                nl: 'Omschrijving…' },
  'np. 1h 30m':                  { en: 'e.g. 1h 30m',                 nl: 'bijv. 1u 30m' },
  'Edytuj':                      { en: 'Edit',                        nl: 'Bewerken' },
  'Usuń':                        { en: 'Delete',                      nl: 'Verwijderen' },

  // ── Nowe funkcje: tytuły (tooltips) ────────────────────────
  'Katalog produktów/usług do pozycji faktur': { en: 'Product/service catalogue for invoice items', nl: 'Product-/dienstencatalogus voor factuurregels' },
  'Importuj faktury z efaktura.nl (XML/PDF)': { en: 'Import invoices from efaktura.nl (XML/PDF)', nl: 'Facturen importeren uit efaktura.nl (XML/PDF)' },
  'Importuj godzinówkę z efaktura.nl (PDF/XML)': { en: 'Import hours from efaktura.nl (PDF/XML)', nl: 'Uren importeren uit efaktura.nl (PDF/XML)' },
  'Sprawdź w bazie VIES (UE)':   { en: 'Check in VIES (EU)',           nl: 'Controleer in VIES (EU)' },
  'Eksportuj UBL XML (e-faktura)': { en: 'Export UBL XML (e-invoice)', nl: 'UBL XML exporteren (e-factuur)' },
  'Przypomnienie / wezwanie do zapłaty': { en: 'Payment reminder / demand', nl: 'Betalingsherinnering / aanmaning' },
  'Puste = taka sama jak data wystawienia': { en: 'Empty = same as issue date', nl: 'Leeg = gelijk aan factuurdatum' },
  'Decyduje w którym miesiącu przychód pojawia się w raportach i na dashboardzie. Puste = data wystawienia.':
    { en: 'Determines which month the income appears in reports and on the dashboard. Empty = issue date.',
      nl: 'Bepaalt in welke maand de inkomsten in rapporten en op het dashboard verschijnen. Leeg = factuurdatum.' },

  // ── Nowe funkcje: placeholdery ─────────────────────────────
  'np. Advertentieruimte YouTube': { en: 'e.g. YouTube ad space',     nl: 'bijv. YouTube-advertentieruimte' },
  'np. Montaż — odcinek 12':     { en: 'e.g. Editing — episode 12',   nl: 'bijv. Montage — aflevering 12' },
  'np. Alphen aan den Rijn':     { en: 'e.g. Alphen aan den Rijn',    nl: 'bijv. Alphen aan den Rijn' },
  'np. Amsterdam':               { en: 'e.g. Amsterdam',              nl: 'bijv. Amsterdam' },
  'np. nagranie materiału, spotkanie z klientem': { en: 'e.g. filming, client meeting', nl: 'bijv. opname, klantafspraak' },
  'Co robiłeś?':                 { en: 'What did you do?',             nl: 'Wat heb je gedaan?' },
  'np. 2.5':                     { en: 'e.g. 2.5',                    nl: 'bijv. 2.5' },
  'np. IE6388047V':              { en: 'e.g. IE6388047V',             nl: 'bijv. IE6388047V' },
  'brak e-maila w kontakcie':    { en: 'no e-mail in contact',        nl: 'geen e-mail in contact' },
  'Imię i nazwisko lub firma':   { en: 'Name or company',             nl: 'Naam of bedrijf' },

  // ── translator.js ────────────────────────────────────────────
  'Przetłumacz opis na polski':       { en: 'Translate description to Polish',  nl: 'Vertaal omschrijving naar het Pools' },
  'Przetłumacz opis na niderlandzki': { en: 'Translate description to Dutch',   nl: 'Vertaal omschrijving naar het Nederlands' },
  'Przetłumacz opis na angielski':    { en: 'Translate description to English', nl: 'Vertaal omschrijving naar het Engels' },

  // ── page-mileage.js / page-time.js ──────────────────────────
  'Tam i z powrotem':            { en: 'Round trip',                  nl: 'Retour' },
  'np. 24.5':                    { en: 'e.g. 24.5',                   nl: 'bijv. 24,5' },
  'np. 45':                      { en: 'e.g. 45',                     nl: 'bijv. 45' },
  'Kliknij, aby zobaczyć szczegóły': { en: 'Click to see details',    nl: 'Klik voor details' },

  // ── app.js ───────────────────────────────────────────────────
  'Wklej klucz odzyskiwania...': { en: 'Paste your recovery key...',  nl: 'Plak je herstelsleutel...' },
  'Zakup sprzętu...':            { en: 'Equipment purchase...',       nl: 'Apparatuuraankoop...' },
  'Zadanie...':                  { en: 'Task...',                     nl: 'Taak...' },

  // ── page-contacts.js ─────────────────────────────────────────
  'Temat interakcji':            { en: 'Interaction subject',         nl: 'Onderwerp interactie' },
  'Szczegóły…':                  { en: 'Details…',                    nl: 'Details…' },

  // ── page-notes.js ────────────────────────────────────────────
  'Tytuł notatki…':              { en: 'Note title…',                 nl: 'Titel van notitie…' },
  'Eksportuj .md':                { en: 'Export .md',                 nl: '.md exporteren' },
  '+ dodaj tag':                  { en: '+ add tag',                  nl: '+ tag toevoegen' },
  'Pogrubienie':                  { en: 'Bold',                       nl: 'Vet' },
  'Kursywa':                      { en: 'Italic',                     nl: 'Cursief' },
  'Nagłówek':                     { en: 'Heading',                    nl: 'Kop' },
  'Nagłówek 3':                   { en: 'Heading 3',                  nl: 'Kop 3' },
  'Lista':                        { en: 'List',                       nl: 'Lijst' },
  'Lista num.':                   { en: 'Numbered list',              nl: 'Genummerde lijst' },
  'Kod':                          { en: 'Code',                       nl: 'Code' },
  'Link':                         { en: 'Link',                       nl: 'Link' },
  'Linia':                        { en: 'Horizontal rule',            nl: 'Horizontale lijn' },
  'Pisz w Markdown…':             { en: 'Write in Markdown…',         nl: 'Schrijf in Markdown…' },

  // ── page-calendar.js ─────────────────────────────────────────
  'Odśwież wydarzenia':           { en: 'Refresh events',             nl: 'Evenementen vernieuwen' },
  'np. Spotkanie z klientem':     { en: 'e.g. Client meeting',        nl: 'bijv. Klantafspraak' },

  // ── page-expenses.js / page-invoices.js ─────────────────────
  'Importuj faktury kosztowe z efaktura.nl (XML/PDF)': { en: 'Import cost invoices from efaktura.nl (XML/PDF)', nl: 'Kostenfacturen importeren uit efaktura.nl (XML/PDF)' },
  'Kliknij, aby zobaczyć podgląd': { en: 'Click to preview',          nl: 'Klik voor voorbeeld' },
  'Dodaj załącznik':              { en: 'Add attachment',            nl: 'Bijlage toevoegen' },
  'Oznacz zapłaconą':             { en: 'Mark as paid',               nl: 'Markeer als betaald' },
  'Otwórz PDF':                   { en: 'Open PDF',                   nl: 'PDF openen' },
  'Usuń pozycję':                 { en: 'Remove item',                nl: 'Regel verwijderen' },
  'Opis pozycji…':                { en: 'Item description…',          nl: 'Regelomschrijving…' },

  // ── page-settings.js ─────────────────────────────────────────
  'Nie ustawiono':                { en: 'Not set',                    nl: 'Niet ingesteld' },
  'np. Upwork':                   { en: 'e.g. Upwork',                nl: 'bijv. Upwork' },
};

// ── Pattern rules for dynamic strings ─────────────────────────
// Each rule: { test(text) -> bool, translate(text, lang) -> string }
const PATTERN_RULES = [
  // "Rok 2026" → "Year 2026" / "Jaar 2026"
  {
    re: /^Rok (\d{4})$/,
    en: (m) => `Year ${m[1]}`,
    nl: (m) => `Jaar ${m[1]}`
  },
  // "▲ 5.3% vs ub.m." / "▼ 2.1% vs ub.m."
  {
    re: /^([▲▼]) ([\d.]+)% vs ub\.m\.$/,
    en: (m) => `${m[1]} ${m[2]}% vs prev.`,
    nl: (m) => `${m[1]} ${m[2]}% vs vorig`
  },
  // "za 7 dni"
  {
    re: /^za (\d+) (dzień|dni)$/i,
    en: (m) => `in ${m[1]} day${m[1]==='1'?'':'s'}`,
    nl: (m) => `over ${m[1]} dag${m[1]==='1'?'':'en'}`
  },
  // "7 dni po terminie"
  {
    re: /^(\d+) (dzień|dni) po terminie$/i,
    en: (m) => `${m[1]} day${m[1]==='1'?'':'s'} overdue`,
    nl: (m) => `${m[1]} dag${m[1]==='1'?'':'en'} verlopen`
  },
  // "Rezerwa: €X/mies."
  {
    re: /^Rezerwa: (.*?)\/mies\.$/,
    en: (m) => `Reserve: ${m[1]}/mo.`,
    nl: (m) => `Reserve: ${m[1]}/mnd.`
  },
  // "Xh Ymin" → keep as is (numbers don't need translation)
  // "Xh Ym" stays
  // "X / 1225h YTD" pattern
  {
    re: /^([\d.]+)h \/ 1225h YTD$/,
    en: (m) => `${m[1]}h / 1225h YTD`,
    nl: (m) => `${m[1]}u / 1225u YTD`
  },
  // "Szacowany podatek IB XXXX" / "🧾 Podatek IB — szacowany XXXX"
  {
    re: /^🧾 Podatek IB — szacowany (\d+)$/,
    en: (m) => `🧾 Estimated IB Tax — ${m[1]}`,
    nl: (m) => `🧾 Geschatte IB-belasting — ${m[1]}`
  },
  // "Raport roczny XXXX"
  {
    re: /^📆 Raport roczny (\d+)$/,
    en: (m) => `📆 Annual Report ${m[1]}`,
    nl: (m) => `📆 Jaarrapport ${m[1]}`
  },
  // "Q1 2026" etc.
  {
    re: /^📅 Q(\d) (\d{4})$/,
    en: (m) => `📅 Q${m[1]} ${m[2]}`,
    nl: (m) => `📅 Q${m[1]} ${m[2]}`
  },
  // "XXXX Przych." (YoY table)
  {
    re: /^(\d{4}) Przych\.$/,
    en: (m) => `${m[1]} Inc.`,
    nl: (m) => `${m[1]} Ink.`
  },
  // "XXXX Zysk" (YoY)
  {
    re: /^(\d{4}) Zysk$/,
    en: (m) => `${m[1]} Profit`,
    nl: (m) => `${m[1]} Winst`
  },
  // "XXXX Przychody" (chart/YoY labels)
  {
    re: /^(\d{4}) Przychody$/,
    en: (m) => `${m[1]} Income`,
    nl: (m) => `${m[1]} Inkomsten`
  },
  // "Ten miesiąc (lipiec 2026)"
  {
    re: /^Ten miesiąc \((.*?)\)$/,
    en: (m) => `This month (${m[1]})`,
    nl: (m) => `Deze maand (${m[1]})`
  },
  // "Ten rok (XXXX)"
  {
    re: /^Ten rok \((\d+)\)$/,
    en: (m) => `This year (${m[1]})`,
    nl: (m) => `Dit jaar (${m[1]})`
  },
  // "📄 Miesiąc Rok" in monthly report title
  {
    re: /^📄 (\w+) (\d{4})$/,
    en: (m) => `📄 ${_translateMonth(m[1], 'en')} ${m[2]}`,
    nl: (m) => `📄 ${_translateMonth(m[1], 'nl')} ${m[2]}`
  },
  // "📈 XXXX vs YYYY"
  {
    re: /^📈 (\d{4}) vs (\d{4})$/,
    en: (m) => `📈 ${m[1]} vs ${m[2]}`,
    nl: (m) => `📈 ${m[1]} vs ${m[2]}`
  },
  // "Zelfstandigenaftrek 2026"
  {
    re: /^Zelfstandigenaftrek (\d{4})$/,
    en: (m) => `Self-employment deduction ${m[1]}`,
    nl: (m) => `Zelfstandigenaftrek ${m[1]}`
  },
  // "Urencriterium: 1200.5h / 1225h"
  {
    re: /^Urencriterium: ([\d.]+)h \/ ([\d.]+)h$/,
    en: (m) => `Hours criterion: ${m[1]}h / ${m[2]}h`,
    nl: (m) => `Urencriterium: ${m[1]}u / ${m[2]}u`
  },
  // "Przychody / Koszty — Q3"
  {
    re: /^Przychody \/ Koszty — Q(\d)$/,
    en: (m) => `Income / Expenses — Q${m[1]}`,
    nl: (m) => `Inkomsten / Kosten — Q${m[1]}`
  },
  // "Pozostało: 800h w 8 mies. = 100.0h/mies."
  {
    re: /^Pozostało: ([\d.]+)h w (\d+) mies\. = ([\d.]+)h\/mies\.$/,
    en: (m) => `Remaining: ${m[1]}h in ${m[2]} mo. = ${m[3]}h/mo.`,
    nl: (m) => `Resterend: ${m[1]}u in ${m[2]} mnd. = ${m[3]}u/mnd.`
  },
  // "Urencriterium XXXX" (section header in time summary)
  {
    re: /^Urencriterium (\d{4})$/,
    en: (m) => `Hours Criterion ${m[1]}`,
    nl: (m) => `Urencriterium ${m[1]}`
  },
  // "Faktura: INV-XXXX" in mark-paid modal
  {
    re: /^Faktura: (.+)$/,
    en: (m) => `Invoice: ${m[1]}`,
    nl: (m) => `Factuur: ${m[1]}`
  },
  // "Czy na pewno chcesz usunąć fakturę XXX?"
  {
    re: /^Czy na pewno chcesz usunąć fakturę (.+)\?$/,
    en: (m) => `Are you sure you want to delete invoice ${m[1]}?`,
    nl: (m) => `Weet je zeker dat je factuur ${m[1]} wilt verwijderen?`
  },
  // "X wpisów" (entry count)
  {
    re: /^(\d+) wpis(ów|y)?$/,
    en: (m) => `${m[1]} entr${m[1]==='1'?'y':'ies'}`,
    nl: (m) => `${m[1]} invoer${m[1]==='1'?'':'en'}`
  },
  // Kafelki kilometrówki: "Kilometry 2026" / "Odliczenie 2026"
  {
    re: /^Kilometry (\d{4})$/,
    en: (m) => `Kilometres ${m[1]}`,
    nl: (m) => `Kilometers ${m[1]}`
  },
  {
    re: /^Odliczenie (\d{4})$/,
    en: (m) => `Deduction ${m[1]}`,
    nl: (m) => `Aftrek ${m[1]}`
  },
  // VIES: "✅ Ważny numer VAT — NAZWA FIRMY"
  {
    re: /^✅ Ważny numer VAT — (.+)$/,
    en: (m) => `✅ Valid VAT number — ${m[1]}`,
    nl: (m) => `✅ Geldig btw-nummer — ${m[1]}`
  },
  {
    re: /^✅ Ważny numer VAT$/,
    en: () => '✅ Valid VAT number',
    nl: () => '✅ Geldig btw-nummer'
  },
  // VIES loading
  {
    re: /^⏳ Sprawdzam w bazie VIES…$/,
    en: () => '⏳ Checking VIES…',
    nl: () => '⏳ VIES controleren…'
  },
];

function _translateMonth(plMonth, lang) {
  const entry = DOM_MAP[plMonth];
  return entry ? (entry[lang] || plMonth) : plMonth;
}

// ══════════════════════════════════════════════════════════════
// DOM TRANSLATOR
// ══════════════════════════════════════════════════════════════

function _translateText(text) {
  if (!text || !text.trim()) return null;
  const trimmed = text.trim();

  // 1. Exact match
  const exact = DOM_MAP[trimmed];
  if (exact && exact[_lang]) return text.replace(trimmed, exact[_lang]);

  // 2. Pattern rules
  for (const rule of PATTERN_RULES) {
    const m = trimmed.match(rule.re);
    if (m) {
      const translated = rule[_lang](m);
      if (translated) return text.replace(trimmed, translated);
    }
  }

  return null;
}

function _translateRoot(root) {
  // ── 1. Text nodes ──────────────────────────────────────
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const replacements = [];
  let node;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent) continue;
    const tag = parent.tagName;
    // Skip script/style/input
    if (tag === 'SCRIPT' || tag === 'STYLE') continue;
    // Skip already-translated lang-sub spans
    if (parent.classList?.contains('lang-sub')) continue;
    const text = node.textContent;
    if (!text.trim()) continue;
    const translated = _translateText(text);
    if (translated !== null && translated !== text) {
      replacements.push({ node, translated });
    }
  }
  for (const { node, translated } of replacements) {
    node.textContent = translated;
  }

  // ── 2. Placeholder attributes ──────────────────────────
  root.querySelectorAll('[placeholder]').forEach(el => {
    const orig = el.getAttribute('placeholder');
    const tr = ATTR_MAP[orig]?.[_lang] || DOM_MAP[orig]?.[_lang];
    if (tr) el.setAttribute('placeholder', tr);
  });

  // ── 3. Title attributes ────────────────────────────────
  root.querySelectorAll('[title]').forEach(el => {
    const orig = el.getAttribute('title');
    const tr = ATTR_MAP[orig]?.[_lang] || DOM_MAP[orig]?.[_lang];
    if (tr) el.setAttribute('title', tr);
  });
}

function applyTranslations() {
  if (_lang === 'pl') return;
  const root = document.getElementById('page-content');
  if (!root || _translating) return;

  _translating = true;
  try {
    _translateRoot(root);
    // Also translate modal if open
    const modalBody = document.getElementById('modal-body');
    const modalOverlay = document.getElementById('modal-overlay');
    if (modalBody && modalOverlay && !modalOverlay.classList.contains('hidden')) {
      const titleEl = document.getElementById('modal-title');
      if (titleEl) {
        const tr = _translateText(titleEl.textContent);
        if (tr) titleEl.textContent = tr;
      }
      _translateRoot(modalBody);
      // Also translate modal footer
      const modalFooter = document.getElementById('modal-footer');
      if (modalFooter) _translateRoot(modalFooter);
    }
    // Ekran blokady PIN i kreator onboardingu żyją POZA #page-content (osobne
    // overlaye w index.html) — bez tego nigdy nie były tłumaczone.
    const lockScreen = document.getElementById('lock-screen');
    if (lockScreen) _translateRoot(lockScreen);
    const onboarding = document.getElementById('onboarding');
    if (onboarding) _translateRoot(onboarding);
  } finally {
    _translating = false;
  }
}

// ── MutationObserver: auto-translate on DOM changes ────────────
function _setupObserver() {
  const root = document.getElementById('page-content');
  if (!root || _observer) return;

  _observer = new MutationObserver(() => {
    if (_lang === 'pl' || _translating) return;
    // Debounce: wait 150ms idle, but never wait more than 900ms
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
      clearTimeout(_maxWaitTimer);
      _maxWaitTimer = null;
      applyTranslations();
    }, 150);
    if (!_maxWaitTimer) {
      _maxWaitTimer = setTimeout(() => {
        clearTimeout(_debounceTimer);
        _maxWaitTimer = null;
        applyTranslations();
      }, 900);
    }
  });

  _observer.observe(root, { childList: true, subtree: true, characterData: false });

  // Also watch modal-body for when modals open/change content
  const modalBody = document.getElementById('modal-body');
  if (modalBody) {
    _observer.observe(modalBody, { childList: true, subtree: true, characterData: false });
  }

  // Lock-screen / onboarding — poza #page-content, ale też pokazują dynamiczne
  // komunikaty (np. błąd PIN) wstawiane przez app.js po fakcie.
  const lockScreen = document.getElementById('lock-screen');
  if (lockScreen) _observer.observe(lockScreen, { childList: true, subtree: true, characterData: false });
  const onboarding = document.getElementById('onboarding');
  if (onboarding) _observer.observe(onboarding, { childList: true, subtree: true, characterData: false });
}

// ── Sidebar nav update ─────────────────────────────────────────
function _updateNav() {
  const navMap = {
    dashboard: 'nav.dashboard', time: 'nav.time', invoices: 'nav.invoices',
    expenses: 'nav.expenses', tax: 'nav.tax', reports: 'nav.reports',
    projects: 'nav.projects', contacts: 'nav.contacts', tasks: 'nav.tasks',
    notes: 'nav.notes', youtube: 'nav.youtube', reminders: 'nav.reminders',
    settings: 'nav.settings', mileage: 'nav.mileage',
  };

  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    const key = navMap[el.dataset.page];
    if (!key) return;
    const labelEl = el.querySelector('.nav-label');
    if (!labelEl) return;
    const main = t(key);
    if (_lang === 'nl') {
      const sub = tSub(key);
      if (sub && sub !== main) {
        labelEl.innerHTML = `${main}<span class="lang-sub">${sub}</span>`;
        return;
      }
    }
    labelEl.textContent = main;
  });
}

// ── Init ───────────────────────────────────────────────────────
async function init() {
  try {
    const lang = await window.api.settings.get('language') || 'pl';
    setLanguage(lang);
  } catch {
    setLanguage('pl');
  }
  // Wait for DOM to be ready, then setup observer
  const trySetup = () => {
    if (document.getElementById('page-content')) {
      _setupObserver();
    } else {
      setTimeout(trySetup, 200);
    }
  };
  trySetup();
}

// ── Public API ─────────────────────────────────────────────────
// Tłumaczenie pojedynczego stringa poza DOM (np. treść toasta, etykieta wykresu
// Chart.js na <canvas> — obie te rzeczy są poza zasięgiem MutationObserver).
// Zwraca oryginał, jeśli brak dopasowania w DOM_MAP/PATTERN_RULES lub język=pl.
function translateText(text) {
  if (_lang === 'pl') return text;
  return _translateText(text) ?? text;
}

window.i18n = { t, tSub, tLabel, setLanguage, getLanguage, localeForLang, applyTranslations, translateText, init };
window.t = t;
