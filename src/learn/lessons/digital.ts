// Lessons on digital circuits: logic gates built from transistors and the
// NE555 as a clock generator that makes an LED blink.

import type { LineGeom, SymbolDef, TextGeom } from '../../model/types.ts';
import { CircuitBuilder } from '../build.ts';
import {
  all,
  any,
  battery,
  change,
  connected,
  current,
  elko,
  extend,
  heading,
  ledV,
  place,
  product,
  property,
  quiz,
  resistorH,
  resistorV,
  spiceDirective,
  switchV,
  t,
  value,
  type LessonDef,
} from './kit.ts';

// ---- 14. logic gates -------------------------------------------------------------------------------

/**
 * Rails and columns of the two gates. Each gate has its input A on the left
 * and B on the right (the transistor for B is mirrored), so no wire crosses
 * another one.
 */
const LOGIC = {
  rail: 128,
  ground: 656,
  /** base heights of the upper (A) and lower (B) transistor of the AND gate */
  a: 400,
  b: 528,
  /** collector / emitter column of the AND gate */
  and: 336,
  /** collector / emitter columns of the two transistors of the OR gate */
  or1: 784,
  or2: 912,
};

/** Switch S from the +5 V rail down to an input node, pull-down R to ground below it. */
function input(b: CircuitBuilder, s: string, r: string, x: number, node: number) {
  const { rail, ground } = LOGIC;
  const sw = switchV(b, s, { x, y: rail + 32 }, false);
  const pd = resistorV(b, r, { x, y: node + 16 }, '47k');
  b.wire({ x, y: rail }, b.pin(sw, 1));
  b.wire(b.pin(sw, 2), b.pin(pd, 1));
  b.wire(b.pin(pd, 2), { x, y: ground });
}

const logicTitle = t('Logikgatter: UND und ODER', 'Logic gates: AND and OR');

export const logicGates: LessonDef = {
  id: 'logic-gates',
  topic: 'digital',
  level: 2,
  minutes: 12,
  title: logicTitle,
  summary: t(
    'Zwei Transistoren in Reihe ergeben ein UND, zwei parallel ein ODER: Baue das ODER fertig und stelle die Wahrheitstabellen mit Schaltern auf.',
    'Two transistors in series make an AND, two in parallel an OR: finish the OR and work out the truth tables with switches.',
  ),
  start: (library, lang) => {
    const b = new CircuitBuilder(library);
    heading(b, lang, logicTitle, t('Links ein UND-Gatter. Schließe rechts Q4 parallel zu Q3 an, dann wird es ein ODER.', 'On the left an AND gate. On the right, connect Q4 in parallel to Q3 to make an OR.'));
    const { rail, ground, a, b: yb, and, or1, or2 } = LOGIC;
    const v1 = battery(b, 'V1', { x: 64, y: 352 }, 5);
    b.wire(b.pin(v1, '+'), { x: 64, y: rail }, { x: 1088, y: rail });
    b.wire(b.pin(v1, '-'), { x: 64, y: ground }, { x: 1088, y: ground });
    b.ground({ x: 64, y: ground });

    // AND: Q1 and Q2 in series under the LED D1
    b.text(and - 64, 112, lang === 'de' ? 'UND (AND)' : 'AND', 12, true);
    input(b, 'S1', 'R1', 160, a);
    input(b, 'S2', 'R2', 512, yb);
    const r5 = resistorV(b, 'R5', { x: and, y: rail + 16 }, '330');
    const d1 = ledV(b, 'D1', { x: and, y: 256 });
    const q1 = place(b, 'elektor-npn', 'Q1', { x: and, y: a - 48 }, { pin: 1, value: 'BC548' });
    const q2 = place(b, 'elektor-npn', 'Q2', { x: and, y: yb - 48 }, { pin: 1, value: 'BC548', mirrorH: true });
    const r3 = resistorH(b, 'R3', { x: 192, y: a }, '10k');
    const r4 = resistorH(b, 'R4', { x: and + 48, y: yb }, '10k');
    b.wire({ x: and, y: rail }, b.pin(r5, 1));
    b.wire(b.pin(r5, 2), b.pin(d1, 'A'));
    b.wire(b.pin(d1, 'K'), b.pin(q1, 'C'));
    b.wire(b.pin(q1, 'E'), b.pin(q2, 'C'));
    b.wire(b.pin(q2, 'E'), { x: and, y: ground });
    b.wire({ x: 160, y: a }, b.pin(r3, 1));
    b.wire(b.pin(r3, 2), b.pin(q1, 'B'));
    b.wire(b.pin(q2, 'B'), b.pin(r4, 1));
    b.wire(b.pin(r4, 2), { x: 512, y: yb });
    b.text(136, a - 8, 'A', 12, true);
    b.text(528, yb - 8, 'B', 12, true);

    // OR: Q3 and (still loose) Q4 side by side under the LED D2
    const mid = (or1 + or2) / 2;
    b.text(mid - 48, 112, lang === 'de' ? 'ODER (OR)' : 'OR', 12, true);
    input(b, 'S3', 'R6', 608, a);
    input(b, 'S4', 'R7', 1088, a);
    const r10 = resistorV(b, 'R10', { x: mid, y: rail + 16 }, '330');
    const d2 = ledV(b, 'D2', { x: mid, y: 256 });
    const q3 = place(b, 'elektor-npn', 'Q3', { x: or1, y: a - 48 }, { pin: 1, value: 'BC548' });
    place(b, 'elektor-npn', 'Q4', { x: or2, y: a - 48 }, { pin: 1, value: 'BC548', mirrorH: true });
    const r8 = resistorH(b, 'R8', { x: 640, y: a }, '10k');
    // the base resistors of the mirrored transistors sit right at their base pins
    const r9 = resistorH(b, 'R9', { x: or2 + 48, y: a }, '10k');
    b.wire({ x: mid, y: rail }, b.pin(r10, 1));
    b.wire(b.pin(r10, 2), b.pin(d2, 'A'));
    b.wire(b.pin(d2, 'K'), { x: mid, y: 336 }, { x: or1, y: 336 }, b.pin(q3, 'C'));
    b.wire(b.pin(q3, 'E'), { x: or1, y: ground });
    b.wire({ x: 608, y: a }, b.pin(r8, 1));
    b.wire(b.pin(r8, 2), b.pin(q3, 'B'));
    b.wire(b.pin(r9, 2), { x: 1088, y: a });
    b.text(584, a - 8, 'A', 12, true);
    b.text(1104, a - 8, 'B', 12, true);
    return b.doc();
  },
  steps: [
    {
      live: true,
      text: t(
        '**Nur zwei Zustände.**\n\nIn der Digitaltechnik zählt nur, ob eine Spannung **hoch** oder **niedrig** ist: 5 V bedeutet **1** (HIGH), 0 V bedeutet **0** (LOW). Die Schalter S1 und S2 erzeugen die Eingänge A und B des UND-Gatters links, S3 und S4 die des ODER-Gatters rechts.',
        '**Only two states.**\n\nIn digital electronics all that counts is whether a voltage is **high** or **low**: 5 V means **1** (HIGH), 0 V means **0** (LOW). The switches S1 and S2 produce the inputs A and B of the AND gate on the left, S3 and S4 those of the OR gate on the right.',
      ),
      check: quiz(
        t('Welchen Pegel hat der Eingang A, solange S1 offen ist?', 'What level is input A at while S1 is open?'),
        [
          t('5 V, also 1 (HIGH)', '5 V, i.e. 1 (HIGH)'),
          t('0 V, also 0 (LOW) – R1 zieht ihn auf Masse', '0 V, i.e. 0 (LOW) – R1 pulls it to ground'),
          t('irgendwo dazwischen, er schwebt', 'somewhere in between, it floats'),
          t('2,5 V', '2.5 V'),
        ],
        1,
      ),
      explain: t(
        'Ein offener Schalter liefert gar keine Spannung – der Eingang würde ohne R1 „in der Luft hängen“, und schon eine Berührung könnte ihn umschalten. Der **Pull-down-Widerstand** R1 (47 kΩ) zieht ihn sicher auf 0 V. Ist S1 geschlossen, liegen 5 V an; durch R1 fließen dann nur gut 0,1 mA.',
        'An open switch supplies no voltage at all – without R1 the input would be “floating”, and even a touch could flip it. The **pull-down resistor** R1 (47 kΩ) pulls it safely to 0 V. With S1 closed the input is at 5 V; R1 then carries only about 0.1 mA.',
      ),
    },
    {
      live: true,
      text: t(
        '**Teste das UND-Gatter.**\n\nKlicke im Live-Modus auf S1 und S2. Probiere zuerst nur einen Schalter, dann beide. Am Ende sollen beide geschlossen sein und D1 leuchten.',
        '**Test the AND gate.**\n\nClick S1 and S2 in live mode. Try only one switch first, then both. In the end both are to be closed and D1 lit.',
      ),
      check: all(property('S1', 'closed', 'true'), property('S2', 'closed', 'true'), current('D1', 0.005, 0.03)),
      hint: t('Ein Klick schaltet einen Schalter um. Über jedem Schalter steht *ON* oder *OFF*.', 'A click toggles a switch. Above every switch it says *ON* or *OFF*.'),
      explain: t(
        'Jeder Eingang steuert über einen 10-kΩ-Widerstand einen Transistor auf (wie in der Lektion *Der Transistor als Schalter*). Q1 und Q2 liegen **in Reihe**: Strom fließt durch D1 nur, wenn **beide** leiten. Mit einem einzigen Schalter bleibt die LED dunkel.',
        'Each input turns a transistor on through a 10 kΩ resistor (as in the lesson *The transistor as a switch*). Q1 and Q2 are **in series**: current flows through D1 only if **both** conduct. With a single switch the LED stays dark.',
      ),
    },
    {
      text: t('**Die Wahrheitstabelle.**', '**The truth table.**'),
      check: quiz(
        t('Bei welchen Eingängen leuchtet D1 (Ausgang Y = 1)?', 'For which inputs does D1 light up (output Y = 1)?'),
        [
          t('wenn A oder B (oder beide) 1 sind', 'if A or B (or both) are 1'),
          t('nur wenn A und B beide 1 sind', 'only if A and B are both 1'),
          t('nur wenn A und B beide 0 sind', 'only if A and B are both 0'),
          t('wenn genau einer der Eingänge 1 ist', 'if exactly one of the inputs is 1'),
        ],
        1,
      ),
      explain: t(
        'Das ist die **UND-Verknüpfung** (AND), geschrieben $Y = A ∧ B$. Ihre Wahrheitstabelle:\n\n- A = 0, B = 0 → Y = 0\n- A = 0, B = 1 → Y = 0\n- A = 1, B = 0 → Y = 0\n- A = 1, B = 1 → Y = 1\n\nEin Alltagsbeispiel: Eine Presse startet nur, wenn beide Hände auf ihren Tastern liegen.',
        'This is the **AND function**, written $Y = A ∧ B$. Its truth table:\n\n- A = 0, B = 0 → Y = 0\n- A = 0, B = 1 → Y = 0\n- A = 1, B = 0 → Y = 0\n- A = 1, B = 1 → Y = 1\n\nAn everyday example: a press only starts while both hands are on their buttons.',
      ),
    },
    {
      text: t(
        '**Baue das ODER fertig.**\n\nRechts steuert S3 den Transistor Q3. Q4 hängt schon an S4, aber Kollektor (C) und Emitter (E) sind noch frei. Schalte Q4 **parallel** zu Q3: Verbinde C von Q4 mit dem Kollektor von Q3 und E von Q4 mit der Masseleitung unten.',
        '**Finish the OR.**\n\nOn the right, S3 controls the transistor Q3. Q4 is already connected to S4, but its collector (C) and emitter (E) are still free. Connect Q4 **in parallel** to Q3: join the C of Q4 to the collector of Q3 and the E of Q4 to the ground wire at the bottom.',
      ),
      check: all(connected('Q4', 'C', 'Q3', 'C'), connected('Q4', 'E', 'Q3', 'E')),
      hint: t(
        'Werkzeug *Leitung* (Taste W): eine Leitung vom oberen Anschluss von Q4 hoch zur Leitung unter D2, eine vom unteren Anschluss senkrecht nach unten zur Masseleitung.',
        '*Wire* tool (key W): one wire from the top pin of Q4 up to the wire below D2, one from the bottom pin straight down to the ground wire.',
      ),
      explain: t(
        'Jetzt hat der Strom durch D2 zwei Wege nach Masse: über Q3 **oder** über Q4. Es genügt, wenn einer der beiden Transistoren leitet.',
        'Now the current through D2 has two paths to ground: through Q3 **or** through Q4. It is enough for one of the two transistors to conduct.',
      ),
    },
    {
      live: true,
      text: t(
        '**Teste das ODER-Gatter.**\n\nSchließe **nur einen** der beiden Schalter S3 oder S4 und sieh nach, ob D2 leuchtet.',
        '**Test the OR gate.**\n\nClose **only one** of the two switches S3 or S4 and see whether D2 lights up.',
      ),
      check: all(any(all(property('S3', 'closed', 'true'), property('S4', 'closed', 'false')), all(property('S3', 'closed', 'false'), property('S4', 'closed', 'true'))), current('D2', 0.005, 0.03)),
      hint: t('Leuchtet D2 nur mit S3, aber nicht mit S4, ist Q4 noch nicht an beiden Enden angeschlossen.', 'If D2 lights up with S3 but not with S4, Q4 is not yet connected at both ends.'),
      explain: t(
        'Das ist die **ODER-Verknüpfung** (OR), $Y = A ∨ B$: Y ist 1, sobald mindestens ein Eingang 1 ist – auch wenn beide 1 sind. Merke: **In Reihe ergibt UND, parallel ergibt ODER** – das gilt für Schalter genauso wie für Transistoren.',
        'This is the **OR function**, $Y = A ∨ B$: Y is 1 as soon as at least one input is 1 – also when both are. Remember: **in series makes AND, in parallel makes OR** – for switches just as for transistors.',
      ),
    },
    {
      text: t('**Und das Gegenteil?**', '**And the opposite?**'),
      check: quiz(
        t(
          'Ein NICHT-Gatter (Inverter) soll seine LED einschalten, wenn der Eingang 0 ist, und ausschalten, wenn er 1 ist. Wie geht das mit einem Transistor?',
          'A NOT gate (inverter) is to switch its LED on when the input is 0 and off when it is 1. How do you do that with one transistor?',
        ),
        [
          t('Der Transistor kommt parallel zur LED: Leitet er, fließt der Strom an der LED vorbei.', 'The transistor goes in parallel to the LED: when it conducts, the current bypasses the LED.'),
          t('Man baut den Transistor umgedreht ein.', 'You fit the transistor the other way round.'),
          t('Man polt die LED falsch herum.', 'You reverse the LED.'),
          t('Das geht nur mit einem Logik-IC.', 'That only works with a logic IC.'),
        ],
        0,
      ),
      explain: t(
        'Hinter dem Vorwiderstand liegen LED und Transistor parallel nach Masse. Bei Eingang 0 sperrt der Transistor, der Strom fließt durch die LED. Bei Eingang 1 leitet er und zieht die Spannung an der LED fast auf 0 V – sie geht aus. Setzt du einen Inverter hinter ein UND, entsteht ein **NAND**; daraus allein lässt sich jede andere Logik bauen. Logik-ICs wie der 74HC00 (vier NAND-Gatter) arbeiten nach demselben Prinzip, nur mit winzigen MOSFETs statt einzelner Transistoren.',
        'After the series resistor, LED and transistor both go to ground in parallel. With input 0 the transistor blocks and the current flows through the LED. With input 1 it conducts and pulls the voltage across the LED almost to 0 V – the LED goes out. Put an inverter after an AND and you get a **NAND**; from NANDs alone every other logic can be built. Logic ICs such as the 74HC00 (four NAND gates) work on the same principle, only with tiny MOSFETs instead of single transistors.',
      ),
    },
  ],
  solve: (doc, library) =>
    change(
      extend(doc, library, (b, find) => {
        const q4 = find('Q4');
        const c = b.pin(q4, 'C');
        const e = b.pin(q4, 'E');
        b.wire(c, { x: c.x, y: 336 }, { x: (LOGIC.or1 + LOGIC.or2) / 2, y: 336 });
        b.wire(e, { x: e.x, y: LOGIC.ground });
      }),
      { S1: { props: { closed: 'true' } }, S2: { props: { closed: 'true' } }, S4: { props: { closed: 'true' } } },
    ),
};

// ---- 15. a blinking light with the NE555 -------------------------------------------------------------

/**
 * Simplified behavioural model of the NE555: the internal 3 x 5 kΩ divider,
 * two comparators (THRES above CONT resets, TRIG below CONT/2 sets, RESET low
 * resets), a flip-flop made of two switches and a memory capacitor (node 11 =
 * 1 V while reset), and the discharge transistor and push-pull output as
 * switches. Transistor level macromodels such as the one of the NE555 sample
 * get stuck at the thresholds in long, slow transient runs; this one keeps
 * blinking for any length of the slow motion window and matches
 * f = 1.44 / ((R1 + 2 R2) C) within about 1 %.
 */
const NE555_MODEL = `* NE555 timer, simplified behavioural model (BlackBoard lessons)
* pins: 1 GND, 2 TRIG, 3 OUT, 4 RESET, 5 CONT, 6 THRES, 7 DISC, 8 VCC
.SUBCKT NE555 1 2 3 4 5 6 7 8
RD1 8 5 5k
RD2 5 9 5k
RD3 9 1 5k
BR 10 1 V = 0.5 + 0.5*tanh(50*(V(6)-V(5))) + 0.5 + 0.5*tanh(20*(0.7-V(4,1)))
BS 13 1 V = 0.5 + 0.5*tanh(50*(V(9)-V(2)))
VONE 12 1 DC 1
SR 12 11 10 1 SWL
SS 11 1 13 1 SWL
CQ 11 1 1u
SDIS 7 1 11 1 SWDIS
SHI 8 3 1 11 SWHI
SLO 3 1 11 1 SWLO
.MODEL SWL SW(VT=0.5 VH=0 RON=1 ROFF=1T)
.MODEL SWDIS SW(VT=0.5 VH=0.05 RON=10 ROFF=1G)
.MODEL SWHI SW(VT=-0.5 VH=0.05 RON=20 ROFF=1G)
.MODEL SWLO SW(VT=0.5 VH=0.05 RON=10 ROFF=1G)
.ENDS NE555`;

const pinLine = (x1: number, y1: number, x2: number, y2: number, thickness = 2): LineGeom => ({ kind: 'line', x1, y1, x2, y2, color: '#000000', thickness, startType: 'STRAIGHT', endType: 'STRAIGHT' });
const label = (x: number, y: number, text: string, fontSize = 10, textType: TextGeom['textType'] = 'TEXT'): TextGeom => ({
  kind: 'text',
  x,
  y,
  text,
  font: 'Arial',
  fontSize,
  rotation: 0,
  textType,
  color: '#000000',
});

/**
 * NE555 in the usual block layout with every pin on the 16 grid (the library's
 * timer symbols have pins between grid points and no working model):
 * DIS, THR, TRIG on the left, RESET and VCC on top, OUT on the right, CV and GND below.
 */
export const NE555_SYMBOL: SymbolDef = {
  name: 'NE555',
  filename: 'NE555.xml',
  category: 'Active',
  width: 192,
  height: 224,
  value: 'NE555',
  customModel: true,
  spiceType: 'SUBCIRCUIT',
  model: { name: 'NE555', content: NE555_MODEL, type: 'SUBCIRCUIT' },
  pins: [
    { num: 1, x: 128, y: 224, name: 'GND', orientation: 'BOTTOM_RIGHT' },
    { num: 2, x: 0, y: 160, name: 'TRIG', orientation: 'TOP_LEFT' },
    { num: 3, x: 192, y: 112, name: 'OUT', orientation: 'BOTTOM_RIGHT' },
    { num: 4, x: 64, y: 0, name: 'RESET', orientation: 'TOP_LEFT' },
    { num: 5, x: 64, y: 224, name: 'CV', orientation: 'BOTTOM_LEFT' },
    { num: 6, x: 0, y: 112, name: 'THR', orientation: 'TOP_LEFT' },
    { num: 7, x: 0, y: 64, name: 'DIS', orientation: 'TOP_LEFT' },
    { num: 8, x: 128, y: 0, name: 'VCC', orientation: 'TOP_LEFT' },
  ],
  shapes: [
    pinLine(0, 64, 32, 64),
    pinLine(0, 112, 32, 112),
    pinLine(0, 160, 32, 160),
    pinLine(64, 0, 64, 32),
    pinLine(128, 0, 128, 32),
    pinLine(160, 112, 192, 112),
    pinLine(64, 192, 64, 224),
    pinLine(128, 192, 128, 224),
    { kind: 'box', x: 32, y: 32, w: 128, h: 160, color: '#000000', thickness: 2, style: 'OUTLINED' },
    label(37, 68, 'DIS'),
    label(37, 116, 'THR'),
    label(37, 164, 'TRIG'),
    label(61, 46, 'R'),
    label(118, 46, 'VCC'),
    label(135, 116, 'OUT'),
    label(58, 187, 'CV'),
    label(117, 187, 'GND'),
    label(21, 60, '7'),
    label(21, 108, '6'),
    label(21, 156, '2'),
    label(68, 20, '4'),
    label(132, 20, '8'),
    label(174, 108, '3'),
    label(68, 216, '5'),
    label(132, 216, '1'),
    label(86, 96, 'X1', 13, 'NAME'),
    label(76, 142, 'NE555', 12, 'VALUE'),
  ],
};

/** rails of the blinker and the column of the timing parts */
const BLINK = { rail: 128, ground: 528, rc: 288, dis: { x: 416, y: 240 } };

const blinkTitle = t('Blinklicht mit dem NE555', 'A blinking light with the NE555');

export const blinker555: LessonDef = {
  id: 'blinker-555',
  topic: 'digital',
  level: 2,
  minutes: 12,
  title: blinkTitle,
  summary: t(
    'Der Timer-IC NE555 lässt eine LED blinken. Finde heraus, welche Bauteile den Takt bestimmen, und lass sie genau einmal pro Sekunde blinken.',
    'The NE555 timer IC makes an LED blink. Find out which parts set the pace and make it blink once per second.',
  ),
  start: (library, lang) => {
    const b = new CircuitBuilder([...library, NE555_SYMBOL]);
    heading(b, lang, blinkTitle, t('Stelle R2 und C1 so ein, dass D1 etwa einmal pro Sekunde blinkt. Shift+T zeigt die Zeitlupe.', 'Set R2 and C1 so that D1 blinks about once per second. Shift+T shows slow motion.'));
    const { rail, ground, rc, dis } = BLINK;
    const v1 = battery(b, 'V1', { x: 96, y: 272 }, 9);
    const x1 = b.add('NE555', 'X1', dis, { pin: 7 });
    const r1 = resistorV(b, 'R1', { x: rc, y: rail + 16 }, '1k');
    const r2 = resistorV(b, 'R2', { x: rc, y: dis.y + 16 }, '10k');
    const c1 = elko(b, 'C1', { x: rc, y: 400 }, '10µ');
    const c2 = b.add('C11-Kondensator groß stehend_1a.xml', 'C2', b.pin(x1, 5), { pin: 1, value: '10n' });
    const r3 = resistorH(b, 'R3', { x: 640, y: b.pin(x1, 3).y }, '470');
    const d1 = ledV(b, 'D1', { x: 800, y: b.pin(x1, 3).y });
    // supply: VCC and RESET (not used, so tied high) on the rail
    b.wire(b.pin(v1, '+'), { x: 96, y: rail }, { x: b.pin(x1, 8).x, y: rail }, b.pin(x1, 8));
    b.wire({ x: b.pin(x1, 4).x, y: rail }, b.pin(x1, 4));
    // timing: VCC -> R1 -> DIS -> R2 -> C1, THR and TRIG on C1
    b.wire({ x: rc, y: rail }, b.pin(r1, 1));
    b.wire(b.pin(r1, 2), b.pin(r2, 1));
    b.wire({ x: rc, y: dis.y }, b.pin(x1, 7));
    b.wire(b.pin(r2, 2), b.pin(c1, 1));
    const thr = b.pin(x1, 6);
    const trig = b.pin(x1, 2);
    b.wire({ x: rc, y: 368 }, { x: 368, y: 368 }, { x: 368, y: thr.y }, thr);
    b.wire({ x: 368, y: trig.y }, trig);
    // output: R3 and the LED
    b.wire(b.pin(x1, 3), b.pin(r3, 1));
    b.wire(b.pin(r3, 2), b.pin(d1, 'A'));
    // ground
    b.wire(b.pin(v1, '-'), { x: 96, y: ground }, { x: 800, y: ground }, b.pin(d1, 'K'));
    b.wire(b.pin(c1, 2), { x: rc, y: ground });
    b.wire(b.pin(c2, 2), { x: b.pin(c2, 2).x, y: ground });
    b.wire(b.pin(x1, 1), { x: b.pin(x1, 1).x, y: ground });
    b.ground({ x: 96, y: ground });
    spiceDirective(b, 48, 592, '.tran 1m 3');
    b.text(144, 592, lang === 'de' ? '← Zeitlupe: die ersten 3 s, in 6 s abgespielt' : '← slow motion: the first 3 s, played back over 6 s', 11);
    return b.doc();
  },
  steps: [
    {
      text: t(
        '**Der NE555 als Taktgeber.**\n\nDer NE555 (X1) ist ein **Timer-IC**. Er vergleicht die Spannung an C1 mit 1/3 und 2/3 der Betriebsspannung und schaltet danach seinen Ausgang OUT (Pin 3) ein oder aus. Am Ausgang hängt die LED D1 mit ihrem Vorwiderstand R3.',
        '**The NE555 as a clock.**\n\nThe NE555 (X1) is a **timer IC**. It compares the voltage across C1 with 1/3 and 2/3 of the supply voltage and switches its output OUT (pin 3) on or off accordingly. The output drives the LED D1 with its series resistor R3.',
      ),
      check: quiz(
        t('Welche Bauteile bestimmen, wie schnell die LED blinkt?', 'Which parts set how fast the LED blinks?'),
        [t('R3 und D1', 'R3 and D1'), t('R1, R2 und C1', 'R1, R2 and C1'), t('nur C2', 'only C2'), t('die Batterie V1', 'the battery V1')],
        1,
      ),
      explain: t(
        'C1 lädt sich über R1 und R2 auf, der Ausgang ist dabei an. Erreicht C1 **2/3 der Betriebsspannung** (6 V bei 9 V), schaltet der NE555 den Ausgang aus und verbindet Pin 7 (DIS, *discharge*) mit Masse: C1 entlädt sich jetzt über R2. Bei **1/3** (3 V) schaltet der Ausgang wieder ein, Pin 7 lässt los, und C1 lädt sich erneut auf. C2 an Pin 5 stabilisiert nur die interne Vergleichsspannung, R3 begrenzt den LED-Strom.',
        'C1 charges through R1 and R2 while the output is on. When C1 reaches **2/3 of the supply voltage** (6 V at 9 V), the NE555 switches the output off and connects pin 7 (DIS, *discharge*) to ground: C1 now discharges through R2. At **1/3** (3 V) the output switches on again, pin 7 lets go and C1 charges once more. C2 on pin 5 only steadies the internal reference voltage, R3 limits the LED current.',
      ),
    },
    {
      text: t(
        '**Sieh ihn blinken.**\n\nDrücke **Shift+T** oder klicke oben auf die Uhr neben *Live*: Die Zeitlupe simuliert die ersten 3 s nach dem Einschalten und spielt sie in 6 s ab, also halb so schnell wie in echt. D1 leuchtet, solange der Ausgang an ist. Beobachte die Spannung an C1.',
        '**Watch it blink.**\n\nPress **Shift+T** or click the clock next to *Live* at the top: slow motion simulates the first 3 s after switching on and plays them back over 6 s, i.e. at half speed. D1 is lit while the output is on. Watch the voltage across C1.',
      ),
      check: quiz(
        t('Zwischen welchen Spannungen pendelt die Spannung an C1?', 'Between which voltages does the voltage across C1 swing?'),
        [t('zwischen 0 V und 9 V', 'between 0 V and 9 V'), t('zwischen 3 V und 6 V', 'between 3 V and 6 V'), t('zwischen 4,5 V und 9 V', 'between 4.5 V and 9 V'), t('sie bleibt konstant', 'it stays constant')],
        1,
      ),
      hint: t('Die Spannung steht an der Leitung, die C1 mit THR und TRIG verbindet. Ganz am Anfang startet C1 bei 0 V – achte auf die Werte danach.', 'The voltage is shown on the wire that joins C1 to THR and TRIG. At the very start C1 begins at 0 V – watch the values after that.'),
      explain: t(
        'Nur beim ersten Laden startet C1 bei 0 V – darum ist das erste Leuchten etwas länger. Danach pendelt er zwischen 1/3 und 2/3 von 9 V, also zwischen **3 V und 6 V**. Der Ausgang springt dabei zwischen fast 0 V und fast 9 V hin und her: ein **Rechtecksignal**. Eine solche Schaltung heißt **astabile Kippstufe** – sie hat keinen stabilen Zustand und kippt ständig hin und her.',
        'Only the first charge starts at 0 V – that is why the first flash is a little longer. After that C1 swings between 1/3 and 2/3 of 9 V, i.e. between **3 V and 6 V**. The output jumps between almost 0 V and almost 9 V: a **square wave**. Such a circuit is called an **astable multivibrator** – it has no stable state and keeps flipping back and forth.',
      ),
    },
    {
      text: t(
        '**Berechne die Frequenz.**\n\nFür diese Schaltung gilt $f = 1,44 / ((R1 + 2 · R2) · C1)$.',
        '**Calculate the frequency.**\n\nFor this circuit $f = 1.44 / ((R1 + 2 · R2) · C1)$.',
      ),
      check: quiz(
        t('R1 = 1 kΩ, R2 = 10 kΩ, C1 = 10 µF. Wie oft blinkt D1 pro Sekunde?', 'R1 = 1 kΩ, R2 = 10 kΩ, C1 = 10 µF. How often does D1 blink per second?'),
        [t('etwa 0,7-mal', 'about 0.7 times'), t('etwa 1,4-mal', 'about 1.4 times'), t('etwa 7-mal', 'about 7 times'), t('etwa 70-mal', 'about 70 times')],
        2,
      ),
      hint: t('$(R1 + 2 · R2) · C1 = 21 kΩ · 10 µF = 0,21 s$.', '$(R1 + 2 · R2) · C1 = 21 kΩ · 10 µF = 0.21 s$.'),
      explain: t(
        '$f = 1,44 / 0,21 s ≈ 6,9 Hz$. Die Formel steckt in den beiden Zeiten: Das Laden über R1 + R2 dauert $t_1 = 0,69 · (R1 + R2) · C1 ≈ 76 ms$ (LED an), das Entladen über R2 $t_2 = 0,69 · R2 · C1 ≈ 69 ms$ (LED aus). 0,69 ist ln 2 – so viele Zeitkonstanten braucht C1 von 1/3 bis 2/3. Zusammen ergibt das $f = 1 / (t_1 + t_2)$.',
        '$f = 1.44 / 0.21 s ≈ 6.9 Hz$. The formula comes from the two times: charging through R1 + R2 takes $t_1 = 0.69 · (R1 + R2) · C1 ≈ 76 ms$ (LED on), discharging through R2 $t_2 = 0.69 · R2 · C1 ≈ 69 ms$ (LED off). 0.69 is ln 2 – that many time constants C1 needs from 1/3 to 2/3. Together $f = 1 / (t_1 + t_2)$.',
      ),
    },
    {
      text: t(
        '**Lass D1 einmal pro Sekunde blinken.**\n\nR1 bleibt bei 1 kΩ. Ändere R2, C1 oder beide so, dass $(R1 + 2 · R2) · C1$ etwa 1,44 s ergibt.',
        '**Make D1 blink once per second.**\n\nR1 stays at 1 kΩ. Change R2, C1 or both so that $(R1 + 2 · R2) · C1$ comes to about 1.44 s.',
      ),
      check: all(value('R1', 900, 1100), value('C1', 1e-6, 220e-6), product(['R2', 'C1'], 0.62, 0.8)),
      hint: t(
        'Weil R1 klein ist, gilt fast $2 · R2 · C1 ≈ 1,44 s$, also $R2 · C1 ≈ 0,7 s$. Zum Beispiel R2 = 68 kΩ bei C1 = 10 µF oder R2 = 15 kΩ bei C1 = 47 µF.',
        'Since R1 is small, almost $2 · R2 · C1 ≈ 1.44 s$, so $R2 · C1 ≈ 0.7 s$. For example R2 = 68 kΩ with C1 = 10 µF, or R2 = 15 kΩ with C1 = 47 µF.',
      ),
      explain: t(
        'Mit R2 = 68 kΩ und C1 = 10 µF ist $f = 1,44 / (137 kΩ · 10 µF) ≈ 1,05 Hz$. Sieh dir die Zeitlupe noch einmal an: In den 3 s simulierter Zeit leuchtet D1 jetzt dreimal auf. Mit größeren Elkos und Widerständen schafft der NE555 auch Takte von vielen Minuten.',
        'With R2 = 68 kΩ and C1 = 10 µF, $f = 1.44 / (137 kΩ · 10 µF) ≈ 1.05 Hz$. Watch the slow motion view again: in the 3 s of simulated time D1 now lights up three times. With larger capacitors and resistors the NE555 also manages periods of many minutes.',
      ),
    },
    {
      text: t(
        '**Wie lange an, wie lange aus?**\n\nD1 ist an, solange C1 über R1 + R2 lädt, und aus, solange er sich über R2 entlädt.',
        '**How long on, how long off?**\n\nD1 is on while C1 charges through R1 + R2 and off while it discharges through R2.',
      ),
      check: quiz(
        t('Wie verhalten sich bei R1 = 1 kΩ und R2 = 68 kΩ die An- und die Auszeit?', 'With R1 = 1 kΩ and R2 = 68 kΩ, how do the on and off times compare?'),
        [
          t('D1 ist viel länger an als aus.', 'D1 is on much longer than off.'),
          t('An und Aus dauern fast gleich lang.', 'On and off last almost equally long.'),
          t('D1 ist viel länger aus als an.', 'D1 is off much longer than on.'),
          t('D1 blitzt jeweils nur ganz kurz auf.', 'D1 only flashes very briefly each time.'),
        ],
        1,
      ),
      explain: t(
        'Der **Tastgrad** ist der Anteil der Anzeit an der Periode: $D = (R1 + R2) / (R1 + 2 · R2) = 69 kΩ / 137 kΩ ≈ 0,5$, also 50 %. Weil R1 klein gegen R2 ist, sind beide Zeiten fast gleich. Mit R1 = R2 wäre D1 zwei Drittel der Zeit an. Unter 50 % kommt diese Schaltung nie, weil das Laden über R1 + R2 immer länger dauert als das Entladen über R2 – dafür bräuchte man eine Diode parallel zu R2.',
        'The **duty cycle** is the share of the on time in the period: $D = (R1 + R2) / (R1 + 2 · R2) = 69 kΩ / 137 kΩ ≈ 0.5$, i.e. 50 %. Since R1 is small compared with R2, both times are almost equal. With R1 = R2, D1 would be on two thirds of the time. This circuit never gets below 50 %, because charging through R1 + R2 always takes longer than discharging through R2 – for that you would need a diode across R2.',
      ),
    },
    {
      text: t('**Was macht C1?**', '**What does C1 do?**'),
      check: quiz(
        t('Was passiert, wenn du C1 verdoppelst?', 'What happens if you double C1?'),
        [
          t('D1 blinkt doppelt so schnell.', 'D1 blinks twice as fast.'),
          t('D1 blinkt halb so schnell, der Tastgrad bleibt gleich.', 'D1 blinks half as fast, the duty cycle stays the same.'),
          t('D1 leuchtet heller.', 'D1 shines more brightly.'),
          t('Nichts, den Takt gibt der NE555 vor.', 'Nothing, the NE555 sets the pace.'),
        ],
        1,
      ),
      explain: t(
        'C1 ist der **Zeitspeicher**: Doppelte Kapazität braucht doppelt so viel Ladung, um von 3 V auf 6 V zu kommen. An- und Auszeit verdoppeln sich beide, die Frequenz halbiert sich, das Verhältnis bleibt. Der NE555 selbst vergleicht nur Spannungen und schaltet – den Takt bestimmt das RC-Glied. Taktgeber in Digitalschaltungen arbeiten nach demselben Prinzip, nur viel schneller.',
        'C1 is the **timing store**: twice the capacitance needs twice the charge to get from 3 V to 6 V. On and off time both double, the frequency halves, the ratio stays. The NE555 itself only compares voltages and switches – the RC network sets the pace. Clock generators in digital circuits work on the same principle, only much faster.',
      ),
    },
  ],
  solve: (doc) => change(doc, { R2: { value: '68k' } }),
};

export const DIGITAL: LessonDef[] = [logicGates, blinker555];
