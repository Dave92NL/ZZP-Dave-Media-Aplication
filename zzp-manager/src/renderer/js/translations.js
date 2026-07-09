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
  'Nie': { en: 'Sun', nl: 'Zo' },

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
  'BTW odliczalna':       { en: 'VAT deductible',         nl: 'BTW aftrekbaar' },
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
  '💾 Zapisz zmiany':  { en: '💾 Save Changes',  nl: '💾 Opslaan' },
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
  'Nie':                    { en: 'No',                 nl: 'Nee' },
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
  'W toku':       { en: 'In Progress', nl: 'In behandeling' },
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
window.i18n = { t, tSub, tLabel, setLanguage, getLanguage, applyTranslations, init };
window.t = t;
