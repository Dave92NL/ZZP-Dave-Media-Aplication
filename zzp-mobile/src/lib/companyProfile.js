// Dane sprzedawcy (Twoja firma) na potrzeby podglądu dokumentu faktury na telefonie.
// Desktop trzyma te dane w ustawieniach (SQLite) i NIE synchronizuje ich do chmury,
// dlatego telefon musi mieć własną kopię. Uzupełnij poniższe pola swoimi danymi —
// puste pola po prostu nie pokażą się w podglądzie (nic nie jest zmyślane).
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
