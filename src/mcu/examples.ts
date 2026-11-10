// Ready-made firmware for the ATmega328P, so the microcontroller can be tried
// without the Arduino IDE. The programs are small AVR assembly programs (the
// avr8js assembler turns them into machine code when one is picked); each
// comes with the Arduino sketch that does the same, to read along.

import { toHex } from './hex.ts';

export type ExampleId = 'blink' | 'button' | 'chaser' | 'dimmer' | 'serial' | 'demo';

export interface McuExample {
  id: ExampleId;
  /** the Arduino sketch doing the same */
  sketch: string;
  asm: string;
}

const BLINK = `; Blink: LED an D13 (PB5) im Sekundentakt
    sbi 0x04, 5          ; DDRB: D13 ist Ausgang
    ldi r16, 0x7A        ; OCR1A = 31249: 0,5 s bei 16 MHz / 256
    sts 0x89, r16
    ldi r16, 0x11
    sts 0x88, r16
    ldi r16, 0x0C        ; TCCR1B: CTC, Takt / 256
    sts 0x81, r16
loop:
    sbis 0x16, 1         ; warten auf OCF1A
    rjmp loop
    ldi r16, 0x02
    out 0x16, r16        ; Flag loeschen
    in r16, 0x05
    ldi r17, 0x20
    eor r16, r17
    out 0x05, r16        ; D13 umschalten
    rjmp loop
`;

const BUTTON = `; Taster an D2 (gegen GND) schaltet die LED an D13
    sbi 0x04, 5          ; D13 Ausgang
    sbi 0x0B, 2          ; Pull-up an D2
loop:
    sbic 0x09, 2         ; D2 low = gedrueckt?
    rjmp off
    sbi 0x05, 5          ; LED an
    rjmp loop
off:
    cbi 0x05, 5          ; LED aus
    rjmp loop
`;

const CHASER = `; Lauflicht ueber D8..D13 (PB0..PB5)
    ldi r16, 0x3F
    out 0x04, r16        ; PB0..PB5 Ausgaenge
    ldi r16, 0x24        ; OCR1A = 9374: 150 ms
    sts 0x89, r16
    ldi r16, 0x9E
    sts 0x88, r16
    ldi r16, 0x0C        ; CTC, Takt / 256
    sts 0x81, r16
    ldi r17, 0x01
next:
    out 0x05, r17
wait:
    sbis 0x16, 1
    rjmp wait
    ldi r16, 0x02
    out 0x16, r16
    lsl r17
    cpi r17, 0x40
    brne next
    ldi r17, 0x01
    rjmp next
`;

const DIMMER = `; Poti an A0 stellt die Helligkeit der LED an D9 ein (PWM)
    sbi 0x04, 1          ; D9 (PB1, OC1A) Ausgang
    ldi r16, 0x81        ; TCCR1A: OC1A nicht invertierend, Fast PWM 8 Bit
    sts 0x80, r16
    ldi r16, 0x0B        ; TCCR1B: Fast PWM, Takt / 64 (976 Hz)
    sts 0x81, r16
    ldi r16, 0x60        ; ADMUX: Referenz AVCC, linksbuendig, Kanal A0
    sts 0x7C, r16
    ldi r16, 0x87        ; ADCSRA: ADC an, Takt / 128
    sts 0x7A, r16
loop:
    lds r16, 0x7A
    ori r16, 0x40        ; Wandlung starten
    sts 0x7A, r16
wait:
    lds r16, 0x7A
    sbrc r16, 6          ; fertig, wenn ADSC wieder 0 ist
    rjmp wait
    lds r17, 0x79        ; ADCH: die oberen 8 Bit
    clr r18
    sts 0x89, r18        ; OCR1A = Messwert
    sts 0x88, r17
    rjmp loop
`;

const GREETING = 'Hallo von BlackBoard!\r\n';

const SERIAL = `; Serielle Schnittstelle, 9600 Baud: Begruessung, dann Echo
    ldi r16, 0x08
    out 0x3E, r16        ; Stack ans RAM-Ende
    ldi r16, 0xFF
    out 0x3D, r16
    clr r16
    sts 0xC5, r16        ; UBRR0 = 103: 9600 Baud bei 16 MHz
    ldi r16, 103
    sts 0xC4, r16
    ldi r16, 0x18        ; Empfaenger und Sender an
    sts 0xC1, r16
    ldi r16, 0x06        ; 8 Datenbits, keine Paritaet, 1 Stoppbit
    sts 0xC2, r16
${[...GREETING].map((c) => `    ldi r16, ${c.charCodeAt(0)}\n    rcall send`).join('\n')}
loop:
    lds r16, 0xC0
    sbrs r16, 7          ; Zeichen empfangen?
    rjmp loop
    lds r16, 0xC6
    rcall send           ; zuruecksenden
    rjmp loop
send:
    lds r17, 0xC0
    sbrs r17, 5          ; Sendepuffer frei?
    rjmp send
    sts 0xC6, r16
    ret
`;

const DEMO = `; Demo: Poti an A0 dimmt die LED an D9, die LED an D13 blinkt,
; bei gedruecktem Taster an D2 viermal so schnell
    sbi 0x04, 1          ; D9 Ausgang
    sbi 0x04, 5          ; D13 Ausgang
    sbi 0x0B, 2          ; Pull-up an D2
    ldi r16, 0x81        ; Timer1: Fast PWM 8 Bit auf D9
    sts 0x80, r16
    ldi r16, 0x0B        ; Takt / 64: 976 Hz, ebenso oft ein Ueberlauf
    sts 0x81, r16
    ldi r16, 0x60        ; ADC: Referenz AVCC, linksbuendig, Kanal A0
    sts 0x7C, r16
    ldi r16, 0xC7        ; ADC an und erste Wandlung starten
    sts 0x7A, r16
    clr r24
    clr r25
loop:
    lds r16, 0x7A
    sbrc r16, 6          ; Wandlung fertig?
    rjmp timer
    lds r17, 0x79        ; Messwert -> Helligkeit
    clr r18
    sts 0x89, r18
    sts 0x88, r17
    ori r16, 0x40        ; naechste Wandlung
    sts 0x7A, r16
timer:
    sbis 0x16, 0         ; Timer-Ueberlauf?
    rjmp loop
    ldi r16, 0x01
    out 0x16, r16
    adiw r24, 1
    ldi r20, 0xE8        ; 488 Ueberlaeufe = 0,5 s
    ldi r21, 0x01
    sbic 0x09, 2         ; Taster gedrueckt (D2 low)?
    rjmp compare
    ldi r20, 0x7A        ; dann 122 = 0,125 s
    ldi r21, 0x00
compare:
    cp r24, r20
    cpc r25, r21
    brlo loop
    clr r24
    clr r25
    in r16, 0x05
    ldi r17, 0x20
    eor r16, r17
    out 0x05, r16        ; D13 umschalten
    rjmp loop
`;

export const EXAMPLES: McuExample[] = [
  {
    id: 'blink',
    asm: BLINK,
    sketch: `void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
}`,
  },
  {
    id: 'button',
    asm: BUTTON,
    sketch: `void setup() {
  pinMode(13, OUTPUT);
  pinMode(2, INPUT_PULLUP);
}

void loop() {
  digitalWrite(13, digitalRead(2) == LOW);
}`,
  },
  {
    id: 'chaser',
    asm: CHASER,
    sketch: `void setup() {
  for (int pin = 8; pin <= 13; pin++) pinMode(pin, OUTPUT);
}

void loop() {
  for (int pin = 8; pin <= 13; pin++) {
    digitalWrite(pin, HIGH);
    delay(150);
    digitalWrite(pin, LOW);
  }
}`,
  },
  {
    id: 'dimmer',
    asm: DIMMER,
    sketch: `void setup() {}

void loop() {
  analogWrite(9, analogRead(A0) / 4);
}`,
  },
  {
    id: 'serial',
    asm: SERIAL,
    sketch: `void setup() {
  Serial.begin(9600);
  Serial.println("${GREETING.trim()}");
}

void loop() {
  if (Serial.available()) Serial.write(Serial.read());
}`,
  },
  {
    id: 'demo',
    asm: DEMO,
    sketch: `void setup() {
  pinMode(13, OUTPUT);
  pinMode(2, INPUT_PULLUP);
}

void loop() {
  analogWrite(9, analogRead(A0) / 4);
  int pause = digitalRead(2) == LOW ? 125 : 500;
  digitalWrite(13, (millis() / pause) % 2);
}`,
  },
];

export const exampleById = (id: string) => EXAMPLES.find((e) => e.id === id);

/** Machine code of an example as Intel HEX (the assembler is only loaded when needed). */
export async function exampleHex(id: ExampleId): Promise<string> {
  const ex = exampleById(id);
  if (!ex) throw new Error(`unknown example ${id}`);
  const { assemble } = await import('avr8js/dist/esm/utils/assembler.js');
  const { bytes, errors } = assemble(ex.asm);
  if (errors.length) throw new Error(errors.join('\n'));
  return toHex(bytes);
}
