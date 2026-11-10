// What the code editor knows about C/C++ on the ATmega328P: the Arduino
// functions and classes (with a short explanation), the registers of the chip,
// and the functions, variables and structs of the program itself. From that it
// completes while typing (members after "lcd." by the variable's type), shows
// the parameters of the call the cursor is in, and explains a word on hover.

import { syntaxTree } from '@codemirror/language';
import { StateField, type EditorState, type Extension } from '@codemirror/state';
import { hoverTooltip, showTooltip, type Tooltip } from '@codemirror/view';
import { autocompletion, snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import type { SourceFile } from '../mcu/sketch.ts';

// ---- the library ----

export interface Fn {
  name: string;
  /** return type, '' for a constructor */
  ret: string;
  params: string;
  doc?: string;
}

/** "void digitalWrite(uint8_t pin, uint8_t value)" */
function fn(sig: string, doc?: string): Fn {
  const m = /^(.*?)\s*\b([A-Za-z_]\w*)\((.*)\)$/.exec(sig)!;
  return { ret: m[1], name: m[2], params: m[3], doc };
}

const ARDUINO_FNS: Fn[] = [
  fn('void pinMode(uint8_t pin, uint8_t mode)', 'Legt fest, ob ein Pin Eingang (INPUT, INPUT_PULLUP) oder Ausgang (OUTPUT) ist.'),
  fn('void digitalWrite(uint8_t pin, uint8_t value)', 'Schaltet einen Ausgang auf HIGH (5 V) oder LOW (0 V).'),
  fn('int digitalRead(uint8_t pin)', 'Liest einen Eingang: HIGH oder LOW.'),
  fn('int analogRead(uint8_t pin)', 'Misst die Spannung an A0 … A5: 0 … 1023 für 0 … 5 V.'),
  fn('void analogWrite(uint8_t pin, int value)', 'PWM mit 0 … 255 an D3, D5, D6, D9, D10, D11: Helligkeit, Drehzahl.'),
  fn('void analogReference(uint8_t mode)', 'Bezugsspannung des ADC: DEFAULT (5 V), INTERNAL (1,1 V) oder EXTERNAL (AREF).'),
  fn('void delay(unsigned long ms)', 'Wartet die angegebene Zahl Millisekunden.'),
  fn('void delayMicroseconds(unsigned int us)', 'Wartet Mikrosekunden (bis etwa 16000).'),
  fn('unsigned long millis()', 'Millisekunden seit dem Start; zum Warten ohne delay().'),
  fn('unsigned long micros()', 'Mikrosekunden seit dem Start (in Schritten von 4 µs).'),
  fn('void tone(uint8_t pin, unsigned int frequency, unsigned long duration)', 'Rechteckton mit der Frequenz in Hz an einem Pin; ohne Dauer bis noTone().'),
  fn('void noTone(uint8_t pin)', 'Beendet den Ton an dem Pin.'),
  fn('unsigned long pulseIn(uint8_t pin, uint8_t state, unsigned long timeout)', 'Misst, wie lange ein Puls (HIGH oder LOW) dauert, in µs.'),
  fn('void shiftOut(uint8_t dataPin, uint8_t clockPin, uint8_t bitOrder, uint8_t value)', 'Schiebt ein Byte Bit für Bit hinaus, z. B. in ein 74HC595.'),
  fn('uint8_t shiftIn(uint8_t dataPin, uint8_t clockPin, uint8_t bitOrder)', 'Liest ein Byte Bit für Bit ein.'),
  fn('void attachInterrupt(uint8_t interrupt, void (*isr)(), int mode)', 'Ruft isr auf, wenn sich D2 oder D3 ändert (mode: CHANGE, RISING, FALLING, LOW).'),
  fn('void detachInterrupt(uint8_t interrupt)', 'Schaltet den Interrupt wieder ab.'),
  fn('int digitalPinToInterrupt(uint8_t pin)', 'Interrupt-Nummer eines Pins: D2 → 0, D3 → 1.'),
  fn('void interrupts()', 'Erlaubt Interrupts wieder.'),
  fn('void noInterrupts()', 'Sperrt Interrupts, z. B. beim Lesen gemeinsamer Variablen.'),
  fn('long map(long value, long fromLow, long fromHigh, long toLow, long toHigh)', 'Rechnet einen Wert von einem Bereich in einen anderen um, z. B. 0…1023 → 0…255.'),
  fn('T constrain(T x, T low, T high)', 'Begrenzt x auf den Bereich low … high.'),
  fn('T min(T a, T b)', 'Der kleinere der beiden Werte.'),
  fn('T max(T a, T b)', 'Der größere der beiden Werte.'),
  fn('T abs(T x)', 'Betrag (ohne Vorzeichen).'),
  fn('T sq(T x)', 'Quadrat x · x.'),
  fn('double sqrt(double x)', 'Quadratwurzel.'),
  fn('double pow(double base, double exponent)', 'Potenz.'),
  fn('double sin(double rad)', 'Sinus (Winkel im Bogenmaß).'),
  fn('double cos(double rad)', 'Kosinus (Winkel im Bogenmaß).'),
  fn('long random(long min, long max)', 'Zufallszahl von min bis max − 1.'),
  fn('void randomSeed(unsigned long seed)', 'Startwert der Zufallszahlen, z. B. randomSeed(analogRead(A5)).'),
  fn('int bitRead(T value, uint8_t bit)', 'Liest ein Bit (0 = niederwertigstes).'),
  fn('void bitWrite(T value, uint8_t bit, uint8_t on)', 'Setzt ein Bit auf 0 oder 1.'),
  fn('void bitSet(T value, uint8_t bit)', 'Setzt ein Bit auf 1.'),
  fn('void bitClear(T value, uint8_t bit)', 'Setzt ein Bit auf 0.'),
  fn('unsigned int bit(uint8_t n)', 'Der Wert des Bits n: 1 << n.'),
  fn('uint8_t highByte(T value)', 'Das obere Byte eines 16-Bit-Werts.'),
  fn('uint8_t lowByte(T value)', 'Das untere Byte.'),
  fn('const __FlashStringHelper* F(const char* text)', 'Lässt einen festen Text im Flash statt im knappen RAM: Serial.print(F("…")).'),
];

const AVR_FNS: Fn[] = [
  fn('uint8_t _BV(uint8_t bit)', 'Bitmaske: _BV(PB5) = 1 << PB5.'),
  fn('void _delay_ms(double ms)', 'Wartet Millisekunden (avr-libc, braucht <util/delay.h>; F_CPU ist der Takt).'),
  fn('void _delay_us(double us)', 'Wartet Mikrosekunden (avr-libc, <util/delay.h>).'),
  fn('void sei()', 'Erlaubt Interrupts (<avr/interrupt.h>).'),
  fn('void cli()', 'Sperrt Interrupts.'),
  fn('ISR(vector)', 'Interrupt-Routine, z. B. ISR(TIMER1_COMPA_vect) { … }'),
  fn('bool bit_is_set(sfr, uint8_t bit)', 'Ob ein Bit in einem Register gesetzt ist.'),
  fn('bool bit_is_clear(sfr, uint8_t bit)', 'Ob ein Bit in einem Register gelöscht ist.'),
  fn('void loop_until_bit_is_set(sfr, uint8_t bit)', 'Wartet, bis das Bit gesetzt ist.'),
  fn('void loop_until_bit_is_clear(sfr, uint8_t bit)', 'Wartet, bis das Bit gelöscht ist.'),
  fn('uint8_t pgm_read_byte(const void* address)', 'Liest ein Byte aus dem Flash (PROGMEM, <avr/pgmspace.h>).'),
  fn('uint16_t pgm_read_word(const void* address)', 'Liest zwei Bytes aus dem Flash.'),
  fn('uint8_t eeprom_read_byte(const uint8_t* address)', 'Liest ein Byte aus dem EEPROM (<avr/eeprom.h>).'),
  fn('void eeprom_write_byte(uint8_t* address, uint8_t value)', 'Schreibt ein Byte ins EEPROM.'),
];

interface ClassDef {
  doc: string;
  ctor?: Fn[];
  members: Fn[];
}

const PRINT: Fn[] = [
  fn('size_t print(value, int format)', 'Gibt Text oder eine Zahl aus; format: DEC, HEX, BIN oder Nachkommastellen.'),
  fn('size_t println(value, int format)', 'Wie print, danach ein Zeilenumbruch.'),
  fn('size_t write(uint8_t byte)', 'Sendet ein einzelnes Byte (Zeichen).'),
];

const STREAM: Fn[] = [
  ...PRINT,
  fn('int available()', 'Wie viele empfangene Zeichen bereitliegen.'),
  fn('int read()', 'Das nächste empfangene Zeichen, -1 wenn keines da ist.'),
  fn('int peek()', 'Das nächste Zeichen, ohne es abzuholen.'),
  fn('long parseInt()', 'Liest die nächste Ganzzahl aus dem Empfang.'),
  fn('float parseFloat()', 'Liest die nächste Kommazahl.'),
  fn('String readString()', 'Liest alles Empfangene als Text (wartet setTimeout lang).'),
  fn('String readStringUntil(char terminator)', "Liest Text bis zum Zeichen, z. B. '\\n'."),
  fn('size_t readBytes(char* buffer, size_t length)', 'Liest mehrere Zeichen in einen Puffer.'),
  fn('void setTimeout(unsigned long ms)', 'Wie lange die read-…-Funktionen warten (Standard 1000 ms).'),
  fn('bool find(const char* target)', 'Liest, bis der Text gefunden ist.'),
  fn('void flush()', 'Wartet, bis alles gesendet ist.'),
];

const CLASSES: Record<string, ClassDef> = {
  HardwareSerial: {
    doc: 'Die serielle Schnittstelle (USART0, D0/D1); was gesendet wird, zeigt der serielle Monitor.',
    members: [fn('void begin(unsigned long baud)', 'Startet die Schnittstelle, z. B. Serial.begin(9600).'), fn('void end()', 'Beendet die Schnittstelle.'), fn('int availableForWrite()', 'Freier Platz im Sendepuffer.'), ...STREAM],
  },
  SoftwareSerial: {
    doc: 'Eine serielle Schnittstelle an beliebigen Pins (<SoftwareSerial.h>).',
    ctor: [fn('SoftwareSerial(uint8_t rxPin, uint8_t txPin)')],
    members: [fn('void begin(long baud)', 'Startet die Schnittstelle.'), fn('bool listen()', 'Macht diese Schnittstelle zur empfangenden.'), ...STREAM],
  },
  LiquidCrystal: {
    doc: 'Textdisplay mit HD44780-Controller, z. B. 16x2 (<LiquidCrystal.h>).',
    ctor: [
      fn('LiquidCrystal(uint8_t rs, uint8_t enable, uint8_t d4, uint8_t d5, uint8_t d6, uint8_t d7)', '4-Bit-Anschluss, RW an GND.'),
      fn('LiquidCrystal(uint8_t rs, uint8_t rw, uint8_t enable, uint8_t d4, uint8_t d5, uint8_t d6, uint8_t d7)', '4-Bit-Anschluss mit RW.'),
    ],
    members: [
      fn('void begin(uint8_t cols, uint8_t rows)', 'Startet das Display, z. B. lcd.begin(16, 2).'),
      fn('void clear()', 'Löscht alles, Cursor nach oben links.'),
      fn('void home()', 'Cursor nach oben links.'),
      fn('void setCursor(uint8_t col, uint8_t row)', 'Setzt die Schreibposition: Spalte und Zeile ab 0.'),
      ...PRINT,
      fn('void cursor()', 'Zeigt den Strich-Cursor.'),
      fn('void noCursor()', 'Versteckt den Cursor.'),
      fn('void blink()', 'Blinkender Block-Cursor.'),
      fn('void noBlink()', 'Kein blinkender Cursor.'),
      fn('void display()', 'Schaltet die Anzeige an.'),
      fn('void noDisplay()', 'Schaltet die Anzeige aus (der Text bleibt erhalten).'),
      fn('void scrollDisplayLeft()', 'Schiebt alles eine Stelle nach links.'),
      fn('void scrollDisplayRight()', 'Schiebt alles eine Stelle nach rechts.'),
      fn('void autoscroll()', 'Neue Zeichen schieben den Text weiter.'),
      fn('void noAutoscroll()', 'Kein Weiterschieben.'),
      fn('void leftToRight()', 'Schreibrichtung nach rechts.'),
      fn('void rightToLeft()', 'Schreibrichtung nach links.'),
      fn('void createChar(uint8_t location, uint8_t charmap[])', 'Eigenes Zeichen 0 … 7 aus 8 Zeilen à 5 Bit; ausgeben mit lcd.write(byte(n)).'),
    ],
  },
  Servo: {
    doc: 'Modellbau-Servo an einem Pin (<Servo.h>).',
    ctor: [fn('Servo()')],
    members: [
      fn('uint8_t attach(int pin, int minUs, int maxUs)', 'Verbindet den Servo mit einem Pin; min/max Pulsbreite optional.'),
      fn('void write(int angle)', 'Fährt auf den Winkel 0 … 180 °.'),
      fn('void writeMicroseconds(int us)', 'Pulsbreite direkt in µs (etwa 1000 … 2000).'),
      fn('int read()', 'Der zuletzt geschriebene Winkel.'),
      fn('bool attached()', 'Ob der Servo mit einem Pin verbunden ist.'),
      fn('void detach()', 'Löst den Servo vom Pin.'),
    ],
  },
  Stepper: {
    doc: 'Schrittmotor an 2 oder 4 Pins (<Stepper.h>).',
    ctor: [fn('Stepper(int stepsPerRevolution, int pin1, int pin2, int pin3, int pin4)')],
    members: [fn('void setSpeed(long rpm)', 'Drehzahl in Umdrehungen pro Minute.'), fn('void step(int steps)', 'Dreht um so viele Schritte (negativ: rückwärts); wartet, bis fertig.')],
  },
  EEPROMClass: {
    doc: 'Der EEPROM: 1024 Bytes, die beim Abschalten erhalten bleiben (<EEPROM.h>).',
    members: [
      fn('uint8_t read(int address)', 'Liest ein Byte.'),
      fn('void write(int address, uint8_t value)', 'Schreibt ein Byte.'),
      fn('void update(int address, uint8_t value)', 'Schreibt nur, wenn sich der Wert ändert (schont den EEPROM).'),
      fn('T& get(int address, T& data)', 'Liest eine Variable beliebigen Typs.'),
      fn('const T& put(int address, const T& data)', 'Schreibt eine Variable beliebigen Typs.'),
      fn('uint16_t length()', 'Größe in Bytes.'),
    ],
  },
  TwoWire: {
    doc: 'Der I²C-Bus an A4 (SDA) und A5 (SCL) (<Wire.h>).',
    members: [
      fn('void begin(uint8_t address)', 'Startet den Bus; mit Adresse als Slave.'),
      fn('void beginTransmission(uint8_t address)', 'Beginnt eine Übertragung an ein Gerät.'),
      fn('uint8_t endTransmission()', 'Sendet; 0 heißt: hat geklappt.'),
      fn('size_t write(uint8_t data)', 'Ein Byte in die Übertragung.'),
      fn('uint8_t requestFrom(uint8_t address, uint8_t quantity)', 'Fordert Bytes von einem Gerät an.'),
      fn('int available()', 'Wie viele Bytes angekommen sind.'),
      fn('int read()', 'Das nächste angekommene Byte.'),
      fn('void setClock(uint32_t hz)', 'Takt des Busses, z. B. 400000.'),
      fn('void onReceive(void (*handler)(int))', 'Slave: Funktion für ankommende Daten.'),
      fn('void onRequest(void (*handler)())', 'Slave: Funktion, wenn der Master Daten will.'),
    ],
  },
  SPIClass: {
    doc: 'Der SPI-Bus an D11 (MOSI), D12 (MISO), D13 (SCK) (<SPI.h>).',
    members: [
      fn('void begin()', 'Startet den Bus.'),
      fn('uint8_t transfer(uint8_t data)', 'Sendet ein Byte und liefert das gleichzeitig empfangene.'),
      fn('void beginTransaction(SPISettings settings)', 'Takt, Bitfolge und Modus für die folgenden Übertragungen.'),
      fn('void endTransaction()', 'Gibt den Bus frei.'),
      fn('void end()', 'Beendet den Bus.'),
    ],
  },
  String: {
    doc: 'Text, der wachsen kann (Arduino-Klasse).',
    ctor: [fn('String(value)')],
    members: [
      fn('unsigned int length()', 'Anzahl der Zeichen.'),
      fn('char charAt(unsigned int index)', 'Das Zeichen an der Stelle.'),
      fn('int indexOf(String text)', 'Wo der Text vorkommt, -1 wenn nicht.'),
      fn('String substring(unsigned int from, unsigned int to)', 'Ein Teil des Texts.'),
      fn('long toInt()', 'Wandelt in eine Ganzzahl.'),
      fn('float toFloat()', 'Wandelt in eine Kommazahl.'),
      fn('void trim()', 'Entfernt Leerzeichen am Anfang und Ende.'),
      fn('void toUpperCase()', 'Großbuchstaben.'),
      fn('void toLowerCase()', 'Kleinbuchstaben.'),
      fn('bool equals(String text)', 'Ob die Texte gleich sind.'),
      fn('bool startsWith(String text)', 'Ob der Text so beginnt.'),
      fn('bool endsWith(String text)', 'Ob der Text so endet.'),
      fn('void replace(String from, String to)', 'Ersetzt Textstellen.'),
      fn('const char* c_str()', 'Als C-Zeichenkette.'),
      fn('bool concat(value)', 'Hängt etwas an.'),
    ],
  },
};

/** objects the libraries make */
const OBJECTS: Record<string, string> = { Serial: 'HardwareSerial', EEPROM: 'EEPROMClass', Wire: 'TwoWire', SPI: 'SPIClass' };

const CONSTANTS: [string, string][] = [
  ['HIGH', '1: 5 V'],
  ['LOW', '0: 0 V'],
  ['INPUT', 'Eingang (hochohmig)'],
  ['OUTPUT', 'Ausgang'],
  ['INPUT_PULLUP', 'Eingang mit Pull-up (offen = HIGH)'],
  ['LED_BUILTIN', '13: die LED auf dem Uno'],
  ...[0, 1, 2, 3, 4, 5].map((n): [string, string] => [`A${n}`, `analoger Eingang ${n}`]),
  ['CHANGE', 'Interrupt bei jeder Änderung'],
  ['RISING', 'Interrupt bei LOW → HIGH'],
  ['FALLING', 'Interrupt bei HIGH → LOW'],
  ['MSBFIRST', 'höchstes Bit zuerst'],
  ['LSBFIRST', 'niedrigstes Bit zuerst'],
  ['DEC', 'Ausgabe dezimal'],
  ['HEX', 'Ausgabe hexadezimal'],
  ['BIN', 'Ausgabe binär'],
  ['DEFAULT', 'Bezugsspannung 5 V'],
  ['INTERNAL', 'Bezugsspannung 1,1 V'],
  ['EXTERNAL', 'Bezugsspannung an AREF'],
  ['PI', '3,14159…'],
  ['F_CPU', 'Takt in Hz'],
  ['true', ''],
  ['false', ''],
  ['NULL', ''],
];

const TYPES = ['void', 'bool', 'boolean', 'byte', 'char', 'int', 'long', 'short', 'float', 'double', 'word', 'unsigned', 'signed', 'size_t', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t', 'int8_t', 'int16_t', 'int32_t', 'int64_t'];
const KEYWORDS = ['const', 'static', 'volatile', 'struct', 'class', 'enum', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'default', 'sizeof', 'typedef', 'public', 'private', 'PROGMEM'];

const REGISTERS: [string, string][] = [
  ...['B', 'C', 'D'].flatMap((p): [string, string][] => [
    [`DDR${p}`, `Richtung der Pins an Port ${p}: 1 = Ausgang`],
    [`PORT${p}`, `Ausgänge an Port ${p} (bei Eingängen: Pull-up)`],
    [`PIN${p}`, `Eingänge an Port ${p} lesen (1 schreiben schaltet um)`],
  ]),
  ...'TCCR0A TCCR0B TCNT0 OCR0A OCR0B TIMSK0 TIFR0 TCCR1A TCCR1B TCCR1C TCNT1 OCR1A OCR1B ICR1 TIMSK1 TIFR1 TCCR2A TCCR2B TCNT2 OCR2A OCR2B TIMSK2 TIFR2'.split(' ').map((r): [string, string] => [r, 'Timer']),
  ...'ADMUX ADCSRA ADCSRB ADC ADCL ADCH DIDR0'.split(' ').map((r): [string, string] => [r, 'Analog-Digital-Wandler']),
  ...'UCSR0A UCSR0B UCSR0C UBRR0 UBRR0H UBRR0L UDR0'.split(' ').map((r): [string, string] => [r, 'serielle Schnittstelle (USART0)']),
  ...'EICRA EIMSK EIFR PCICR PCIFR PCMSK0 PCMSK1 PCMSK2'.split(' ').map((r): [string, string] => [r, 'externe Interrupts']),
  ...'SPCR SPSR SPDR'.split(' ').map((r): [string, string] => [r, 'SPI']),
  ...'TWBR TWCR TWDR TWSR TWAR'.split(' ').map((r): [string, string] => [r, 'I²C (TWI)']),
  ...'SREG MCUSR WDTCSR SMCR PRR EECR EEDR EEAR ACSR'.split(' ').map((r): [string, string] => [r, 'Steuerung']),
];

const BITS = [
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((n) => `PB${n}`),
  ...[0, 1, 2, 3, 4, 5, 6].map((n) => `PC${n}`),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((n) => `PD${n}`),
  ...'WGM00 WGM01 WGM02 WGM10 WGM11 WGM12 WGM13 WGM20 WGM21 WGM22 CS00 CS01 CS02 CS10 CS11 CS12 CS20 CS21 CS22 COM0A0 COM0A1 COM0B0 COM0B1 COM1A0 COM1A1 COM1B0 COM1B1 COM2A0 COM2A1 COM2B0 COM2B1 TOIE0 OCIE0A OCIE0B TOIE1 OCIE1A OCIE1B ICIE1 TOIE2 OCIE2A OCIE2B TOV0 OCF0A OCF0B TOV1 OCF1A OCF1B ICF1 TOV2 OCF2A OCF2B'.split(' '),
  ...'REFS0 REFS1 ADLAR MUX0 MUX1 MUX2 MUX3 ADEN ADSC ADATE ADIF ADIE ADPS0 ADPS1 ADPS2'.split(' '),
  ...'RXC0 TXC0 UDRE0 FE0 DOR0 UPE0 U2X0 RXCIE0 TXCIE0 UDRIE0 RXEN0 TXEN0 UCSZ00 UCSZ01 UCSZ02 USBS0 UPM00 UPM01'.split(' '),
  ...'ISC00 ISC01 ISC10 ISC11 INT0 INT1 INTF0 INTF1 PCIE0 PCIE1 PCIE2 SPE SPIE MSTR CPOL CPHA SPR0 SPR1 SPIF SE SM0 SM1 SM2'.split(' '),
];

const VECTORS = 'INT0_vect INT1_vect PCINT0_vect PCINT1_vect PCINT2_vect WDT_vect TIMER2_COMPA_vect TIMER2_COMPB_vect TIMER2_OVF_vect TIMER1_CAPT_vect TIMER1_COMPA_vect TIMER1_COMPB_vect TIMER1_OVF_vect TIMER0_COMPA_vect TIMER0_COMPB_vect TIMER0_OVF_vect SPI_STC_vect USART_RX_vect USART_UDRE_vect USART_TX_vect ADC_vect EE_READY_vect ANALOG_COMP_vect TWI_vect'.split(' ');

const HEADERS: [string, string][] = [
  ['Arduino.h', 'die Arduino-Funktionen (in .ino-Dateien von selbst dabei)'],
  ['LiquidCrystal.h', 'Textdisplays mit HD44780'],
  ['Servo.h', 'Modellbau-Servos'],
  ['Stepper.h', 'Schrittmotoren'],
  ['EEPROM.h', 'dauerhafter Speicher'],
  ['Wire.h', 'I²C-Bus'],
  ['SPI.h', 'SPI-Bus'],
  ['SoftwareSerial.h', 'serielle Schnittstelle an beliebigen Pins'],
  ['avr/io.h', 'die Register des ATmega328P'],
  ['avr/interrupt.h', 'ISR(), sei(), cli()'],
  ['avr/pgmspace.h', 'Daten im Flash (PROGMEM)'],
  ['avr/eeprom.h', 'EEPROM ohne Arduino'],
  ['avr/sleep.h', 'Schlafmodi'],
  ['avr/wdt.h', 'Watchdog'],
  ['util/delay.h', '_delay_ms(), _delay_us()'],
  ['stdint.h', 'uint8_t und Co.'],
  ['stdbool.h', 'bool in C'],
  ['stdlib.h', 'atoi, itoa, abs …'],
  ['string.h', 'strlen, strcpy, memset …'],
  ['stdio.h', 'sprintf …'],
  ['math.h', 'sin, cos, sqrt …'],
];

// ---- the program's own symbols ----

export interface ProgramSymbol {
  name: string;
  kind: 'function' | 'variable' | 'macro' | 'type';
  /** type of a variable, return type of a function */
  type: string;
  params?: string;
  file: string;
  line: number;
}

export interface ProgramInfo {
  symbols: ProgramSymbol[];
  /** variable name -> type name (without const, pointers) */
  varTypes: Map<string, string>;
  /** struct or class name -> its fields and methods */
  types: Map<string, ProgramSymbol[]>;
}

const NOT_A_TYPE = new Set(['return', 'else', 'case', 'goto', 'new', 'delete', 'throw', 'typedef', 'using', 'namespace', 'if', 'while', 'for', 'switch', 'do', 'sizeof', 'struct', 'class', 'enum', 'public', 'private', 'protected', 'operator', 'template']);
const NOT_A_NAME = new Set([...NOT_A_TYPE, 'const', 'static', 'volatile', 'unsigned', 'signed', 'long', 'short', 'int', 'char', 'void']);

/** Comments and string contents become spaces, so line numbers stay. */
export function blankOut(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, (m) => (m.startsWith('"') ? `"${m.slice(1, -1).replace(/[^\n]/g, ' ')}"` : m.replace(/[^\n]/g, ' ')));
}

const lineAt = (text: string, index: number) => text.slice(0, index).split('\n').length;
const baseType = (type: string) => type.replace(/\b(const|static|volatile|extern|struct|class|unsigned|signed)\b/g, '').replace(/[*&\s]/g, '');

const TYPE = String.raw`((?:(?:const|static|volatile|extern|unsigned|signed|long|short|struct|class)\s+)*[A-Za-z_]\w*(?:<[^<>;{}]*>)?)`;
/** between type and name: blanks, or a * or & */
const SEP = String.raw`(\s*[*&]+\s*|\s+)`;
const FUNC = new RegExp(String.raw`(?:^|[;{}\n])\s*(?:(?:inline|extern)\s+)*${TYPE}${SEP}([A-Za-z_]\w*)\s*\(([^()]*)\)\s*(?:const\s*)?([{;])`, 'g');
const VAR = new RegExp(String.raw`(?:^|[;{}(,\n])\s*${TYPE}${SEP}([A-Za-z_]\w*)\s*(\[[^\]]*\]\s*)?(?=[=;,)\[:]|\()`, 'g');
const DEFINE = /^[ \t]*#[ \t]*define[ \t]+([A-Za-z_]\w*)(\([^)]*\))?[ \t]*(.*)$/gm;
const STRUCT = /\b(?:struct|class)\s+([A-Za-z_]\w*)\s*(?::[^{;]*)?\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;

/**
 * `params`: the parameters of functions count as variables (they are, inside
 * the function); `lines`: lines before `text` in its file.
 */
function scanText(text: string, file: string, known: Set<string>, out: ProgramSymbol[], params = true, lines = 0) {
  const lineAt = (index: number) => lines + text.slice(0, index).split('\n').length;
  for (const m of text.matchAll(DEFINE)) out.push({ name: m[1], kind: 'macro', type: m[3].trim().slice(0, 40), params: m[2]?.slice(1, -1), file, line: lineAt(m.index) });
  for (const m of text.matchAll(FUNC)) {
    const [, type, ptr, name, list] = m;
    const last = type.split(/\s+/).pop()!;
    if (NOT_A_TYPE.has(last) || NOT_A_NAME.has(name)) continue;
    // "LiquidCrystal lcd(12, 11, 5, 4, 3, 2);" is an object, not a prototype
    if (known.has(baseType(type)) && m[5] === ';') continue;
    out.push({ name, kind: 'function', type: `${type}${ptr.trim()}`, params: list.trim(), file, line: lineAt(m.index + m[0].indexOf(name)) });
  }
  const vars = params ? text : text.replace(/\([^()]*\)/g, (p) => `(${p.slice(1, -1).replace(/[^\n]/g, ' ')})`);
  for (const m of vars.matchAll(VAR)) {
    const [whole, type, ptr, name, array] = m;
    const last = type.split(/\s+/).pop()!;
    if (NOT_A_TYPE.has(last) || NOT_A_NAME.has(name) || last === name) continue;
    // "void f(" is a function, "Servo s(" or "String t(" an object
    const after = vars[m.index + whole.length];
    if (after === '(' && !known.has(baseType(type))) continue;
    out.push({ name, kind: 'variable', type: `${type}${ptr.trim()}${array ? '[]' : ''}`, file, line: lineAt(m.index + whole.lastIndexOf(name)) });
  }
}

/** Functions, variables, macros and structs of all files. */
export function scanProgram(files: SourceFile[]): ProgramInfo {
  const texts = files.map((f) => ({ file: f.name, text: blankOut(f.content) }));
  const types = new Map<string, ProgramSymbol[]>();
  const known = new Set([...Object.keys(CLASSES)]);
  for (const { text } of texts) for (const m of text.matchAll(STRUCT)) known.add(m[1]);
  const symbols: ProgramSymbol[] = [];
  for (const { file, text } of texts) {
    for (const m of text.matchAll(STRUCT)) {
      const members: ProgramSymbol[] = [];
      scanText(m[2], file, known, members, false, lineAt(text, m.index + m[0].indexOf('{')) - 1);
      types.set(m[1], members);
      symbols.push({ name: m[1], kind: 'type', type: 'struct', file, line: lineAt(text, m.index) });
    }
    scanText(text, file, known, symbols);
  }
  const varTypes = new Map<string, string>();
  for (const s of symbols) if (s.kind === 'variable') varTypes.set(s.name, baseType(s.type).replace(/\[\]$/, ''));
  return { symbols, varTypes, types };
}

let cache: { key: string; info: ProgramInfo } | undefined;

function programInfo(files: SourceFile[]): ProgramInfo {
  const key = files.map((f) => `${f.name}\u0000${f.content}`).join('\u0001');
  if (cache?.key !== key) cache = { key, info: scanProgram(files) };
  return cache.info;
}

// ---- completion ----

const fnCompletion = (f: Fn, boost = 0): Completion =>
  snippetCompletion(f.params.trim() ? `${f.name}(\${})` : `${f.name}()`, {
    label: f.name,
    detail: `(${f.params})`,
    info: () => fnInfo([f]),
    type: f.ret === '' ? 'class' : 'function',
    boost,
  });

function fnInfo(fns: Fn[]): HTMLElement {
  const el = document.createElement('div');
  el.className = 'cm-bb-info';
  for (const f of fns) {
    const sig = document.createElement('code');
    sig.textContent = `${f.ret ? `${f.ret} ` : ''}${f.name}(${f.params})`;
    el.appendChild(sig);
  }
  const doc = fns.find((f) => f.doc)?.doc;
  if (doc) {
    const p = document.createElement('div');
    p.textContent = doc;
    el.appendChild(p);
  }
  return el;
}

const textInfo = (title: string, doc?: string) => () => {
  const el = document.createElement('div');
  el.className = 'cm-bb-info';
  const c = document.createElement('code');
  c.textContent = title;
  el.appendChild(c);
  if (doc) {
    const p = document.createElement('div');
    p.textContent = doc;
    el.appendChild(p);
  }
  return el;
};

/** one entry per name (overloads share it) */
const unique = (fns: Fn[]) => [...new Map(fns.map((f) => [f.name, f])).values()];

const GLOBALS: Completion[] = [
  ...unique(ARDUINO_FNS).map((f) => fnCompletion(f, 2)),
  ...CONSTANTS.map(([label, doc]): Completion => ({ label, detail: doc, type: 'constant', boost: 1 })),
  ...Object.entries(OBJECTS).map(([label, cls]): Completion => ({ label, detail: cls, info: textInfo(cls, CLASSES[cls].doc), type: 'variable', boost: 2 })),
  ...Object.entries(CLASSES).map(([label, c]): Completion => ({ label, detail: 'Klasse', info: textInfo(label, c.doc), type: 'class', boost: 1 })),
  ...TYPES.map((label): Completion => ({ label, type: 'type' })),
  ...KEYWORDS.map((label): Completion => ({ label, type: 'keyword', boost: -1 })),
  snippetCompletion('void setup() {\n\t${}\n}\n\nvoid loop() {\n\t\n}\n', { label: 'setup', detail: 'setup() und loop()', type: 'keyword', boost: 3 }),
  snippetCompletion('for (int ${i} = 0; ${i} < ${10}; ${i}++) {\n\t${}\n}', { label: 'for', detail: 'Zählschleife', type: 'keyword', boost: 2 }),
  snippetCompletion('if (${}) {\n\t\n}', { label: 'if', detail: 'Bedingung', type: 'keyword', boost: 2 }),
  snippetCompletion('if (${}) {\n\t\n} else {\n\t\n}', { label: 'ifelse', detail: 'Bedingung mit else', type: 'keyword', boost: 1 }),
  snippetCompletion('while (${}) {\n\t\n}', { label: 'while', detail: 'Schleife', type: 'keyword', boost: 2 }),
  snippetCompletion('switch (${}) {\n\tcase 0:\n\t\tbreak;\n\tdefault:\n\t\tbreak;\n}', { label: 'switch', detail: 'Fallunterscheidung', type: 'keyword', boost: 1 }),
  snippetCompletion('ISR(${TIMER1_COMPA_vect}) {\n\t\n}', { label: 'ISR', detail: '(vector)', info: () => fnInfo([AVR_FNS.find((f) => f.name === 'ISR')!]), type: 'function' }),
  ...AVR_FNS.filter((f) => f.name !== 'ISR').map((f) => fnCompletion(f, -1)),
  ...REGISTERS.map(([label, doc]): Completion => ({ label, detail: doc, type: 'variable', boost: -2 })),
  ...BITS.map((label): Completion => ({ label, detail: 'Bit', type: 'constant', boost: -3 })),
  ...VECTORS.map((label): Completion => ({ label, detail: 'Interrupt-Vektor', type: 'constant', boost: -3 })),
];

const SYMBOL_TYPE: Record<ProgramSymbol['kind'], string> = { function: 'function', variable: 'variable', macro: 'constant', type: 'class' };

function symbolCompletion(s: ProgramSymbol): Completion {
  const where = `${s.file}:${s.line}`;
  if (s.kind === 'function')
    return snippetCompletion(s.params && s.params !== 'void' ? `${s.name}(\${})` : `${s.name}()`, {
      label: s.name,
      detail: `(${s.params ?? ''})`,
      info: textInfo(`${s.type} ${s.name}(${s.params ?? ''})`, where),
      type: 'function',
      boost: 4,
    });
  return { label: s.name, detail: s.kind === 'macro' ? (s.params !== undefined ? `(${s.params})` : s.type) : s.type, info: textInfo(s.kind === 'macro' ? `#define ${s.name}` : `${s.type} ${s.name}`, where), type: SYMBOL_TYPE[s.kind], boost: 4 };
}

/** what can follow "name." */
function membersOf(info: ProgramInfo, object: string): { fns: Fn[]; own: ProgramSymbol[] } | undefined {
  const type = OBJECTS[object] ?? info.varTypes.get(object);
  if (!type) return undefined;
  const cls = CLASSES[type];
  if (cls) return { fns: cls.members, own: [] };
  const own = info.types.get(type);
  return own ? { fns: [], own } : undefined;
}

function inCommentOrString(state: EditorState, pos: number): boolean {
  const node = syntaxTree(state).resolveInner(pos, -1);
  return /Comment|String|CharLiteral|RawString/.test(node.name) && !/SystemLibString/.test(node.name);
}

/** all files of the program, with the text of the file being edited as it is in `state` */
export type FilesOf = (state: EditorState) => SourceFile[];

function complete(files: FilesOf, ctx: CompletionContext): CompletionResult | null {
  const { state, pos } = ctx;
  const line = state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from);

  // #include <…> and "…"
  const inc = /#\s*include\s*[<"]([\w./]*)$/.exec(before);
  if (inc) return { from: pos - inc[1].length, options: HEADERS.map(([label, detail]) => ({ label, detail, type: 'namespace' })), validFor: /^[\w./]*$/ };
  if (inCommentOrString(state, pos)) return null;

  const info = programInfo(files(state));
  // members: "lcd.", "Serial.", "p->"
  const member = /([A-Za-z_]\w*)(?:\[[^\]]*\])?\s*(\.|->)\s*(\w*)$/.exec(before);
  if (member) {
    const m = membersOf(info, member[1]);
    if (!m) return null;
    return {
      from: pos - member[3].length,
      options: [...unique(m.fns).map((f) => fnCompletion(f, 1)), ...m.own.map(symbolCompletion)],
      validFor: /^\w*$/,
    };
  }

  const word = ctx.matchBefore(/#?\w+/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  // no list while typing a number
  if (/^\d/.test(word.text)) return null;
  const own = new Map<string, Completion>();
  for (const s of info.symbols) if (!own.has(s.name)) own.set(s.name, symbolCompletion(s));
  // the class names of the program also make objects: "Ampel a;"
  return { from: word.from, options: [...own.values(), ...GLOBALS.filter((g) => !own.has(g.label))], validFor: /^#?\w*$/ };
}

// ---- the call the cursor is in ----

function signaturesFor(info: ProgramInfo, name: string, object?: string): Fn[] {
  if (object) {
    const m = membersOf(info, object);
    return [...(m?.fns.filter((f) => f.name === name) ?? []), ...(m?.own.filter((s) => s.kind === 'function' && s.name === name).map(symbolFn) ?? [])];
  }
  const own = info.symbols.filter((s) => (s.kind === 'function' || (s.kind === 'macro' && s.params !== undefined)) && s.name === name).map(symbolFn);
  if (own.length) return own;
  const cls = CLASSES[name];
  if (cls?.ctor) return cls.ctor;
  return [...ARDUINO_FNS, ...AVR_FNS].filter((f) => f.name === name);
}

const symbolFn = (s: ProgramSymbol): Fn => ({ name: s.name, ret: s.kind === 'macro' ? '#define' : s.type, params: s.params ?? '', doc: `${s.file}:${s.line}` });

/** splits "int a, void (*f)(int), long b" at the commas of the top level */
export function splitParams(params: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of params) {
    if (c === '(' || c === '[' || c === '<') depth++;
    else if (c === ')' || c === ']' || c === '>') depth--;
    if (c === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export interface CallSite {
  name: string;
  object?: string;
  /** index of the argument the cursor is in */
  arg: number;
  /** position of the "(" */
  open: number;
}

/** The innermost call around `pos` in `text` (the code before the cursor). */
export function callAt(text: string): CallSite | null {
  const t = blankOut(text);
  let depth = 0;
  let arg = 0;
  for (let i = t.length - 1; i >= 0 && i > t.length - 3000; i--) {
    const c = t[i];
    if (c === ')' || c === ']') depth++;
    else if (c === '[') depth--;
    else if (c === '(') {
      if (depth > 0) {
        depth--;
        continue;
      }
      const m = /(?:([A-Za-z_]\w*)\s*(?:\.|->)\s*)?([A-Za-z_]\w*)\s*$/.exec(t.slice(Math.max(0, i - 200), i));
      if (!m || NOT_A_TYPE.has(m[2])) return null;
      return { name: m[2], object: m[1], arg, open: i };
    } else if (depth === 0 && c === ',') arg++;
    else if (depth === 0 && (c === ';' || c === '{' || c === '}')) return null;
  }
  return null;
}

function signatureDom(fns: Fn[], arg: number): HTMLElement {
  const el = document.createElement('div');
  el.className = 'cm-bb-signature';
  const fit = fns.find((f) => splitParams(f.params).length > arg) ?? fns[0];
  const sig = document.createElement('code');
  const params = splitParams(fit.params);
  sig.append(`${fit.name}(`);
  params.forEach((p, i) => {
    if (i) sig.append(', ');
    if (i === arg) {
      const b = document.createElement('b');
      b.textContent = p;
      sig.appendChild(b);
    } else sig.append(p);
  });
  sig.append(')');
  el.appendChild(sig);
  if (fit.doc) {
    const d = document.createElement('div');
    d.textContent = fit.doc;
    el.appendChild(d);
  }
  if (fns.length > 1) {
    const n = document.createElement('div');
    n.className = 'cm-bb-more';
    n.textContent = `+${fns.length - 1}: ${fns
      .filter((f) => f !== fit)
      .map((f) => `${f.name}(${f.params})`)
      .join(' · ')}`;
    el.appendChild(n);
  }
  return el;
}

function signatureField(files: FilesOf) {
  const compute = (state: EditorState): Tooltip | null => {
    const sel = state.selection.main;
    if (!sel.empty) return null;
    const call = callAt(state.sliceDoc(Math.max(0, sel.head - 3000), sel.head));
    if (!call) return null;
    const fns = signaturesFor(programInfo(files(state)), call.name, call.object);
    if (!fns.length) return null;
    return { pos: sel.head, above: true, strictSide: true, arrow: false, create: () => ({ dom: signatureDom(fns, call.arg) }) };
  };
  return StateField.define<Tooltip | null>({
    create: compute,
    update: (v, tr) => (tr.docChanged || tr.selection ? compute(tr.state) : v),
    provide: (f) => showTooltip.from(f),
  });
}

// ---- hover ----

function hover(files: FilesOf) {
  return hoverTooltip((view, pos) => {
    const { from, to, text } = view.state.doc.lineAt(pos);
    let a = pos - from;
    let b = a;
    while (a > 0 && /\w/.test(text[a - 1])) a--;
    while (b < text.length && /\w/.test(text[b])) b++;
    if (a === b) return null;
    const word = text.slice(a, b);
    const object = /([A-Za-z_]\w*)\s*(?:\.|->)\s*$/.exec(text.slice(0, a))?.[1];
    const info = programInfo(files(view.state));
    let dom: HTMLElement | undefined;
    const fns = signaturesFor(info, word, object);
    if (fns.length) dom = fnInfo(fns);
    else {
      const own = info.symbols.find((s) => s.name === word);
      const constant = CONSTANTS.find(([c]) => c === word) ?? REGISTERS.find(([r]) => r === word);
      if (own) dom = textInfo(own.kind === 'macro' ? `#define ${own.name} ${own.type}` : `${own.type} ${own.name}`, `${own.file}:${own.line}`)();
      else if (constant) dom = textInfo(constant[0], constant[1])();
      else if (OBJECTS[word]) dom = textInfo(`${OBJECTS[word]} ${word}`, CLASSES[OBJECTS[word]].doc)();
      else if (CLASSES[word]) dom = textInfo(word, CLASSES[word].doc)();
    }
    if (!dom) return null;
    return { pos: from + a, end: Math.min(from + b, to), above: true, create: () => ({ dom: dom! }) };
  });
}

/** Completion, parameter help and hover for one file of the program. */
export function codeIntel(files: FilesOf): Extension[] {
  return [autocompletion({ override: [(ctx) => complete(files, ctx)], icons: true, activateOnTypingDelay: 50, maxRenderedOptions: 80 }), signatureField(files), hover(files)];
}
