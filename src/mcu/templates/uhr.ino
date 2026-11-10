// Uhr mit Datum und Wochentag auf einem LCD 16x2 (HD44780)
//
// Anschluss wie in der LCD-Demo: RS→D2, RW→D3, E→D4, D4…D7→D8…D11,
// VSS und K an GND, VDD und A an +5V, V0 an GND (Kontrast).
//
// Stellen, wahlweise:
//  - drei Taster von D5, D6 und D7 nach GND:
//      D5 „Stellen“: Stunde → Minute → Tag → Monat → Jahr → fertig
//      D6 „+“, D7 „−“ (gedrückt halten zählt schnell weiter)
//  - im seriellen Monitor eintippen: 14:30  oder  14:30:15  oder  24.12.2026
//
// Den Takt gibt Timer 1: genau ein Interrupt pro Sekunde, egal was loop()
// gerade tut. So geht die Uhr so genau wie der Quarz. Sommer- und Winterzeit
// stellt sie selbst um, wie eine Funkuhr.

#include <LiquidCrystal.h>

LiquidCrystal lcd(2, 3, 4, 8, 9, 10, 11);  // RS, RW, E, D4..D7

const uint8_t TASTE_STELLEN = 5;
const uint8_t TASTE_PLUS = 6;
const uint8_t TASTE_MINUS = 7;

// Startzeit ist der Moment des Übersetzens. Der BlackBoard-Compiler läuft in
// UTC, die Uhr rechnet daraus MEZ oder MESZ. In der Arduino-IDE ist es schon
// die Ortszeit, dann false.
const bool UEBERSETZT_IN_UTC = true;
// so lange dauern Übersetzen und Hochladen ungefähr
const uint8_t VORLAUF_S = 2;

volatile uint8_t neueSekunden = 0;  // zählt der Interrupt hoch

uint8_t stunde, minute, sekunde;
uint8_t tag, monat;
uint16_t jahr;

enum Feld : uint8_t { KEINS, STUNDE, MINUTE, TAG, MONAT, JAHR };
Feld stellen = KEINS;

// Ende Oktober geht die Uhr von 3 auf 2 Uhr zurück, aber nur einmal
bool zurueckgestellt = false;

const char* const WOCHENTAG[] = {"So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"};

// ein Taster: entprellt, beim Halten mit Wiederholung. Typen stehen vor der
// ersten Funktion, sonst kennt die Arduino-IDE sie in den Prototypen nicht.
struct Taste {
  uint8_t pin;
  bool unten;  // zuletzt gelesen (entprellt)
  bool gilt;   // dieser Druck zählt
  unsigned long seit;
  unsigned long wieder;
};

// Am Anfang „unten“: ein Taster zählt erst, wenn er einmal losgelassen war.
// Der Pull-up hebt den Pin erst einen Moment nach dem Start auf HIGH.
Taste tStellen = {TASTE_STELLEN, true, false, 0, 0};
Taste tPlus = {TASTE_PLUS, true, false, 0, 0};
Taste tMinus = {TASTE_MINUS, true, false, 0, 0};

ISR(TIMER1_COMPA_vect) {
  neueSekunden++;
}

// ---- Kalender ----

bool schaltjahr(uint16_t j) {
  return (j % 4 == 0 && j % 100 != 0) || j % 400 == 0;
}

uint8_t tageImMonat(uint8_t m, uint16_t j) {
  static const uint8_t TAGE[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
  return m == 2 && schaltjahr(j) ? 29 : TAGE[m - 1];
}

// 0 = Sonntag (Verfahren von Sakamoto)
uint8_t wochentag(uint8_t t, uint8_t m, uint16_t j) {
  static const uint8_t K[] = {0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4};
  if (m < 3) j--;
  return (j + j / 4 - j / 100 + j / 400 + K[m - 1] + t) % 7;
}

void naechsterTag() {
  zurueckgestellt = false;
  if (++tag > tageImMonat(monat, jahr)) {
    tag = 1;
    if (++monat > 12) {
      monat = 1;
      jahr++;
    }
  }
}

void naechsteSekunde() {
  if (++sekunde < 60) return;
  sekunde = 0;
  if (++minute < 60) return;
  minute = 0;
  if (++stunde < 24) return;
  stunde = 0;
  naechsterTag();
}

// ---- Sommerzeit ----

// der letzte Sonntag im März oder Oktober (beide haben 31 Tage)
uint8_t letzterSonntag(uint8_t m, uint16_t j) {
  return 31 - wochentag(31, m, j);
}

// MESZ gilt vom letzten Sonntag im März bis zum letzten Sonntag im Oktober,
// jeweils ab 1:00 UTC; die Uhrzeit hier ist UTC
bool sommerzeitNachUtc() {
  if (monat < 3 || monat > 10) return false;
  if (monat > 3 && monat < 10) return true;
  uint8_t s = letzterSonntag(monat, jahr);
  bool danach = tag > s || (tag == s && stunde >= 1);
  return monat == 3 ? danach : !danach;
}

// zur vollen Stunde: Ende März 2 → 3 Uhr, Ende Oktober 3 → 2 Uhr
void zeitumstellung() {
  if (minute || sekunde || (monat != 3 && monat != 10) || tag != letzterSonntag(monat, jahr)) return;
  if (monat == 3 && stunde == 2) {
    stunde = 3;
  } else if (monat == 10 && stunde == 3 && !zurueckgestellt) {
    stunde = 2;
    zurueckgestellt = true;
  }
}

// ---- Startzeit ----

// __DATE__ ist z. B. "Nov 10 2026", __TIME__ "19:42:07"
void zeitVomUebersetzen() {
  const char* d = __DATE__;
  const char* t = __TIME__;
  const char NAMEN[] = "JanFebMarAprMayJunJulAugSepOctNovDec";
  char m[4] = {d[0], d[1], d[2], 0};
  monat = (strstr(NAMEN, m) - NAMEN) / 3 + 1;
  tag = atoi(d + 4);
  jahr = atoi(d + 7);
  stunde = atoi(t);
  minute = atoi(t + 3);
  sekunde = atoi(t + 6);
  long vor = VORLAUF_S;
  if (UEBERSETZT_IN_UTC) {
    bool sommer = sommerzeitNachUtc();
    vor += (sommer ? 2 : 1) * 3600L;
    for (long s = 0; s < vor; s++) naechsteSekunde();
    // nach 1:00 UTC am Umstellungstag im Oktober ist schon zurückgestellt
    zurueckgestellt = !sommer && monat == 10 && tag == letzterSonntag(10, jahr);
  } else {
    for (long s = 0; s < vor; s++) naechsteSekunde();
  }
}

// ---- Timer 1: ein Interrupt pro Sekunde ----

void sekundenTakt() {
  noInterrupts();
  TCCR1A = 0;  // die Arduino-Voreinstellung (PWM) abschalten
  TCNT1 = 0;
#if F_CPU / 256 <= 65536
  TCCR1B = _BV(WGM12) | _BV(CS12);  // CTC, Takt / 256
  OCR1A = F_CPU / 256 - 1;          // 16 MHz: 62499
#else
  TCCR1B = _BV(WGM12) | _BV(CS12) | _BV(CS10);  // CTC, Takt / 1024
  OCR1A = F_CPU / 1024 - 1;
#endif
  TIMSK1 = _BV(OCIE1A);
  interrupts();
}

// ---- Taster ----

// true im Moment des Drückens; mit `halten` nach 600 ms alle 120 ms wieder
bool gedrueckt(Taste& t, bool halten) {
  bool jetztUnten = digitalRead(t.pin) == LOW;
  unsigned long jetzt = millis();
  if (jetztUnten != t.unten && jetzt - t.seit > 25) {
    t.unten = jetztUnten;
    t.gilt = jetztUnten;
    t.seit = jetzt;
    t.wieder = jetzt + 600;
    return jetztUnten;
  }
  if (halten && t.gilt && t.unten && (long)(jetzt - t.wieder) >= 0) {
    t.wieder = jetzt + 120;
    return true;
  }
  return false;
}

void aendern(int8_t d) {
  switch (stellen) {
    case STUNDE: stunde = (stunde + 24 + d) % 24; sekunde = 0; break;
    case MINUTE: minute = (minute + 60 + d) % 60; sekunde = 0; break;
    case TAG: {
      uint8_t n = tageImMonat(monat, jahr);
      tag = (tag - 1 + n + d) % n + 1;
      break;
    }
    case MONAT: monat = (monat - 1 + 12 + d) % 12 + 1; break;
    case JAHR: jahr = constrain(jahr + d, 2000, 2099); break;
    default: return;
  }
  // z. B. 31. Januar → Februar
  if (tag > tageImMonat(monat, jahr)) tag = tageImMonat(monat, jahr);
}

bool tastenAbfragen() {
  bool geaendert = false;
  if (gedrueckt(tStellen, false)) {
    stellen = stellen == JAHR ? KEINS : (Feld)(stellen + 1);
    geaendert = true;
  }
  if (stellen != KEINS) {
    if (gedrueckt(tPlus, true)) aendern(+1), geaendert = true;
    if (gedrueckt(tMinus, true)) aendern(-1), geaendert = true;
  }
  return geaendert;
}

// ---- serieller Monitor: 14:30, 14:30:15 oder 24.12.2026 ----

void zeigeSeriell() {
  char s[32];
  snprintf(s, sizeof s, "Gestellt: %02d:%02d:%02d %02d.%02d.%04u", stunde, minute, sekunde, tag, monat, jahr);
  Serial.println(s);
}

bool seriellAbfragen() {
  if (!Serial.available()) return false;
  String zeile = Serial.readStringUntil('\n');
  zeile.trim();
  int a, b, c = 0;
  if (sscanf(zeile.c_str(), "%d:%d:%d", &a, &b, &c) >= 2 && a >= 0 && a < 24 && b >= 0 && b < 60 && c >= 0 && c < 60) {
    stunde = a;
    minute = b;
    sekunde = c;
  } else if (sscanf(zeile.c_str(), "%d.%d.%d", &a, &b, &c) == 3 && b >= 1 && b <= 12 && c >= 2000 && c <= 2099 && a >= 1 && a <= tageImMonat(b, c)) {
    tag = a;
    monat = b;
    jahr = c;
  } else {
    Serial.println(F("Bitte so: 14:30 oder 14:30:15 oder 24.12.2026"));
    return false;
  }
  zeigeSeriell();
  return true;
}

// ---- Anzeige ----

// das Feld, das gerade gestellt wird, blinkt
void verstecken(char* zeile, uint8_t von, uint8_t bis) {
  for (uint8_t i = von; i <= bis; i++) zeile[i] = ' ';
}

void anzeigen(bool sichtbar) {
  char oben[17];
  char unten[17];
  snprintf(oben, sizeof oben, "    %02d:%02d:%02d    ", stunde, minute, sekunde);
  snprintf(unten, sizeof unten, " %s %02d.%02d.%04u  ", WOCHENTAG[wochentag(tag, monat, jahr)], tag, monat, jahr);
  if (!sichtbar) {
    switch (stellen) {
      case STUNDE: verstecken(oben, 4, 5); break;
      case MINUTE: verstecken(oben, 7, 8); break;
      case TAG: verstecken(unten, 4, 5); break;
      case MONAT: verstecken(unten, 7, 8); break;
      case JAHR: verstecken(unten, 10, 13); break;
      default: break;
    }
  }
  lcd.setCursor(0, 0);
  lcd.print(oben);
  lcd.setCursor(0, 1);
  lcd.print(unten);
}

void setup() {
  pinMode(TASTE_STELLEN, INPUT_PULLUP);
  pinMode(TASTE_PLUS, INPUT_PULLUP);
  pinMode(TASTE_MINUS, INPUT_PULLUP);
  Serial.begin(9600);
  Serial.setTimeout(50);
  lcd.begin(16, 2);
  zeitVomUebersetzen();
  sekundenTakt();
  Serial.println(F("Uhr stellen: 14:30 oder 14:30:15 oder 24.12.2026 eingeben"));
  anzeigen(true);
}

void loop() {
  noInterrupts();
  uint8_t n = neueSekunden;
  neueSekunden = 0;
  interrupts();
  bool neu = n > 0;
  while (n--) {
    naechsteSekunde();
    zeitumstellung();
  }

  if (tastenAbfragen()) neu = true;
  if (seriellAbfragen()) neu = true;

  // beim Stellen blinkt das Feld zweimal pro Sekunde
  static bool warSichtbar = true;
  bool sichtbar = stellen == KEINS || (millis() / 250) % 2 == 0;
  if (neu || sichtbar != warSichtbar) anzeigen(sichtbar);
  warSichtbar = sichtbar;
}
