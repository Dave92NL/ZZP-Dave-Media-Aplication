# Audyt efaktura.nl vs ZZP Manager

Data: 2026-07-09. Źródło: 10 zrzutów ekranu panelu efaktura.nl (konto Dave Media YT).
Cel: zastąpić płatny abonament efaktura.nl własną aplikacją — lista brakujących funkcji
i rozwiązań UX wartych odwzorowania (funkcjonalnie, własną implementacją — bez kopiowania
ich kodu/grafiki).

---

## 1. Co efaktura.nl ma w menu

Główne: **Faktury, Proformy, Oferty, Godzinówka, Koszty, Kilometrówka**
Zarządzaj: **Klienci, Produkty, Ogłoszenia, Statystyki**
Dół: Zaproś znajomego (referral), Ustawienia, Wyloguj. UI wielojęzyczne (NL/EN/RO/RU/HU/DE/FR/SK/UA).

## 2. Parytet — to już mamy (często lepiej)

| Obszar | efaktura.nl | ZZP Manager |
|---|---|---|
| Faktury + reverse charge (Google Ireland) | ✅ | ✅ |
| Duplikowanie faktury („Wystaw podobną") | ✅ | ✅ `invoices.duplicate` |
| Koszty z załącznikiem | ✅ | ✅ (1 plik) |
| Klienci, Projekty | ✅ | ✅ |
| Rejestr godzin | ✅ kalendarz | ✅ lista + licznik (desktop i mobile) |
| Statystyki/wykresy | ✅ | ✅ raporty |
| **Import ich XML/PDF** | — | ✅ (nasza przewaga) |
| **Tryb offline + push mobile** | ❌ | ✅ (nasza przewaga) |
| **Kalkulator podatkowy NL, urencriterium** | ❌ | ✅ (nasza przewaga) |
| **Brak abonamentu, dane lokalnie** | ❌ (€/mies.) | ✅ |

## 3. Braki funkcjonalne — backlog rozwoju

### P1 — duża wartość, umiarkowany koszt
1. **QR kod płatności EPC na fakturze PDF** — skan w aplikacji bankowej wykonuje przelew
   (kwota+IBAN+tytuł). Widoczne w stopce ich PDF. U nas: pdfkit + generator EPC QR.
2. **Katalog produktów/usług** — pozycje faktur wybierane z bazy zamiast wpisywania
   (tabela `products`: nazwa, jednostka, cena netto, stawka BTW).
3. **Kilometrówka** — rejestr przejazdów (data, trasa, km, cel, klient/projekt), stawka
   €0,23/km, raport roczny do odliczenia podatkowego. Osobny moduł + ekran mobile.
4. **Eksport faktury do UBL/Peppol XML** — mamy import, brak eksportu ("Pobierz XML" u nich).
   Ważne dla księgowego i przyszłego obowiązku e-fakturowania.
5. **Przypomnienie o płatności + wezwanie do zapłaty** — akcje per faktura, generują
   e-mail z szablonu (u nas min. `mailto:`/kopiuj treść; docelowo SMTP).
6. **Data sprzedaży (leverdatum)** — osobne pole na fakturze obok daty wystawienia
   (u nich jako opcjonalne „Dodaj datę sprzedaży").

### P2 — rozszerzenia dokumentów
7. **Oferty (offertes)** + konwersja oferta → faktura.
8. **Proformy** + konwersja proforma → faktura.
9. **Kredytnota** (faktura korygująca) — akcja z poziomu faktury.
10. **Zniżka** i **zaliczka** na fakturze (linki „Dodaj zniżkę" / „Dodaj zaliczkę" przy sumach).
11. **Język faktury per faktura/klient** — szablon PDF w NL/EN/PL (dropdown „Język faktury").
12. **Weryfikacja VIES** numeru BTW klienta (bezpłatne API UE) + zapis potwierdzenia PDF;
    znacznik „Klient zweryfikowany w bazie VIES" na podglądzie faktury.
13. **Koszty: wiele stawek VAT w jednym dokumencie** (wiersze 21%/9%/0% + suma) oraz
    **wiele załączników** (PDF + XML + zdjęcia; u nas dziś 1 plik `receipt_path`).
14. **Filtr „Nieuzupełnione"** dla kosztów (dokumenty wymagające uzupełnienia danych).

### P3 — nice-to-have
15. **Widok kalendarza dla godzinówki** + pole **przerwy** we wpisie (u nich „05:30 godzin
    (00:45 przerwy)"); zbiorcze fakturowanie godzin (✓ na zafakturowanych wpisach).
16. **Wysyłka e-mail z aplikacji** (SMTP/Gmail API) zamiast ręcznego załączania PDF.
17. **Wysyłka przez Peppol** — wymaga płatnego access pointu; odłożyć.
18. **AI-asysta opisów** (u nich ikona ✨ przy polach opisu) — u nas np. Claude API.
19. **Statystyki: porównanie rok-do-roku, filtr klient/produkt, przełącznik zakresu.**

## 4. UX warte odwzorowania (własną implementacją)

- **Kebab menu (⋮) przy wierszu faktury** z kompletem akcji: Podgląd, Drukuj, PDF, XML,
  Oznacz jako (nie)zapłaconą, Wyślij e-mailem, Przypomnienie, Wezwanie, Wystaw podobną,
  Edytuj, Kredytnota, Usuń.
- **Edytor kosztu w układzie split-view**: podgląd dokumentu (PDF/zdjęcie) po lewej,
  formularz po prawej; miniatury wielu załączników nad podglądem; nawigacja
  „poprzedni/następny koszt" z autozapisem — błyskawiczne przeglądanie stosu paragonów.
- **Podgląd faktury jako strona**: dokument w centrum, pasek akcji po prawej
  (Wyślij, PDF, Udostępnij) + metadane (edytowano przez, VIES, data wystawienia).
- **Kafelki podsumowania** na górze statystyk (Faktury netto / VAT / Kilometry / Godziny)
  z przełącznikiem zakresu; wykres zapłacone vs niezapłacone.
- **Kalendarz godzin** z wpisami jako wydarzenia i dymkiem szczegółów (czas, przerwa, opis,
  edytuj/usuń).
- **Formularz faktury**: stawka VAT jako usuwalny chip („Odwrotne obciążenie ✕"),
  automatyczne przeliczanie ceny z VAT, przycisk ➕ dodania pozycji.

## 5. Rekomendowana kolejność (pod nasz przypadek: YouTube/Google, faktury reverse charge co miesiąc)

1. Katalog produktów (pozycja „advertentieruimte YouTube" jednym kliknięciem)
2. Kilometrówka (odliczenia podatkowe)
3. QR EPC + data sprzedaży + eksport UBL (kompletność faktury)
4. Koszty: wiele załączników + split-view + multi-VAT
5. Przypomnienia/wezwania, oferty/proformy/kredytnoty
6. Kalendarz godzin + przerwy
