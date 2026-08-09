// Dane sprzedawcy (Twoja firma) — DOMYŚLNY SZABLON / FALLBACK do podglądu faktury.
// Źródłem prawdy jest teraz CHMURA (tabela `company_profile`) zasilana z aplikacji na
// komputerze; telefon pobiera je przez `getCompany()` w `src/data/settings.js`. Te pola
// służą tylko jako wartości domyślne, gdy chmura jest pusta i nie ma kopii offline
// (puste pola po prostu nie pokażą się w podglądzie — nic nie jest zmyślane).
export const COMPANY = {
  name: 'Dave Media YT',
  address: '',       // np. 'Voorbeeldstraat 1'
  postcode: '',      // np. '1234 AB'
  city: '',          // np. 'Amsterdam'
  country: 'Nederland',
  kvk_number: '',    // numer KvK
  btw_number: '',    // numer BTW (NL........B..)
  iban: '',          // IBAN do przelewu
  email: '',
  phone: ''
};
