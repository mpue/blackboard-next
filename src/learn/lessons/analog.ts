// Lessons on analog circuits: the RC time constant and the RC low pass with
// the instrument bench, charging a capacitor in slow motion.

import type { Doc, SymbolDef } from '../../model/types.ts';
import { INSTRUMENT_DEFS } from '../../spice/instruments.ts';
import { CircuitBuilder } from '../build.ts';
import { battery, change, elko, heading, product, property, quiz, resistorH, spiceDirective, switchV, t, value, type Lang, type LessonDef } from './kit.ts';
import type { L10n } from '../types.ts';

/** upright film capacitor whose designator and value are drawn next to it */
const CAPACITOR = 'C11-Kondensator groß stehend_1a.xml';

interface BenchOptions {
  title: L10n;
  task: L10n;
  r: string;
  c: string;
  /** function generator settings and the value shown on it */
  fgen: Record<string, string>;
  fgenValue: string;
  scope: Record<string, string>;
  /** multimeter (AC volts) across the capacitor */
  dmm: boolean;
}

/**
 * Instrument bench like the bench demo: function generator FG1 -> R1 -> C1 to
 * ground, oscilloscope OSC1 with CH1 on the input and CH2 on the capacitor,
 * optionally a multimeter DMM1 across C1. The instruments are not part of
 * symbols.json, so they are added to the library here.
 */
function rcBench(library: SymbolDef[], lang: Lang, o: BenchOptions): Doc {
  const b = new CircuitBuilder([...library, ...Object.values(INSTRUMENT_DEFS)]);
  heading(b, lang, o.title, o.task);
  const signal = 336;
  const rail = 480;
  const fg = b.add('Function generator', 'FG1', { x: 224, y: signal }, { pin: 1, value: o.fgenValue, props: o.fgen });
  const r1 = resistorH(b, 'R1', { x: 288, y: signal }, o.r);
  const c1 = b.add(CAPACITOR, 'C1', { x: 480, y: signal }, { pin: 1, value: o.c });
  b.wire(b.pin(fg, 1), b.pin(r1, 1));
  b.wire(b.pin(r1, 2), b.pin(c1, 1));
  // x of the oscilloscope and of its ground lead
  let scopeX = 608;
  if (o.dmm) {
    // above the signal line, so its leads do not cross the instrument
    const dmm = b.add('Multimeter', 'DMM1', { x: 560, y: signal - 48 }, { pin: 1, props: { dmmMode: 'VAC' } });
    b.wire(b.pin(dmm, 1), { x: 560, y: signal }, b.pin(c1, 1));
    b.wire(b.pin(dmm, 2), { x: b.pin(dmm, 2).x, y: rail });
    scopeX = 688;
  }
  const gndX = scopeX - 32;
  const osc = b.add('Oscilloscope', 'OSC1', { x: scopeX, y: 144 }, { pin: 1, props: o.scope });
  // ground rail: generator COM, capacitor and oscilloscope GND (both instruments are earthed)
  const com = b.pin(fg, 2);
  b.wire(com, { x: 240, y: com.y }, { x: 240, y: rail }, { x: gndX, y: rail });
  b.wire(b.pin(c1, 2), { x: 480, y: rail });
  b.wire(b.pin(osc, 3), { x: gndX, y: b.pin(osc, 3).y }, { x: gndX, y: rail });
  b.ground({ x: 352, y: rail });
  // CH1 on the generator output, CH2 on the capacitor
  b.wire(b.pin(osc, 1), { x: 256, y: b.pin(osc, 1).y }, { x: 256, y: signal });
  b.wire(b.pin(osc, 2), { x: 432, y: b.pin(osc, 2).y }, { x: 432, y: signal });
  return b.doc();
}

// ---- 11. the RC time constant ----------------------------------------------------------------------

const rcTitle = t('Die Zeitkonstante τ = R · C', 'The time constant τ = R · C');

export const rcTimeConstant: LessonDef = {
  id: 'rc-time-constant',
  topic: 'analog',
  level: 2,
  minutes: 10,
  title: rcTitle,
  summary: t(
    'Ein Kondensator lädt sich über einen Widerstand nicht sofort auf. Stelle eine Zeitkonstante von 1 ms ein und sieh dir die Ladekurve an.',
    'A capacitor charging through a resistor takes its time. Set a time constant of 1 ms and look at the charging curve.',
  ),
  start: (library, lang) =>
    rcBench(library, lang, {
      title: rcTitle,
      task: t('Stelle R1 und C1 so ein, dass τ = R · C = 1 ms ergibt. F5 öffnet den Messplatz.', 'Set R1 and C1 so that τ = R · C = 1 ms. F5 opens the bench.'),
      r: '10k',
      c: '1µ',
      fgen: { shape: 'SQUARE', frequency: '100', frequencyUnit: 'HZ', acAmplitude: '2.5', dcOffset: '2.5', duty: '50' },
      fgenValue: '100 Hz',
      scope: { timeDiv: '0.002', ch1Div: '2', ch2Div: '2', ch1Pos: '-2', ch2Pos: '-2', trigSource: '1', trigLevel: '2.5', trigEdge: 'rise' },
      dmm: false,
    }),
  steps: [
    {
      text: t(
        '**Wie groß ist τ jetzt?**\n\nDer Funktionsgenerator FG1 liefert ein Rechteck zwischen 0 V und 5 V mit 100 Hz. Er lädt C1 über R1 immer wieder auf und entlädt ihn. Wie schnell das geht, bestimmt die **Zeitkonstante** $τ = R · C$.',
        '**How large is τ now?**\n\nThe function generator FG1 supplies a square wave between 0 V and 5 V at 100 Hz. It charges C1 through R1 again and again and discharges it. How fast that happens is set by the **time constant** $τ = R · C$.',
      ),
      check: quiz(
        t('R1 = 10 kΩ, C1 = 1 µF. Wie groß ist τ?', 'R1 = 10 kΩ, C1 = 1 µF. How large is τ?'),
        [t('10 µs', '10 µs'), t('1 ms', '1 ms'), t('10 ms', '10 ms'), t('10 s', '10 s')],
        2,
      ),
      hint: t('$10 kΩ · 1 µF = 10 000 Ω · 0,000001 F$. Ohm mal Farad ergibt Sekunden.', '$10 kΩ · 1 µF = 10,000 Ω · 0.000001 F$. Ohms times farads gives seconds.'),
      explain: t(
        '$τ = 10 kΩ · 1 µF = 0,01 s = 10 ms$. In einer Halbperiode des 100-Hz-Rechtecks (5 ms) lädt sich C1 also nur zu einem kleinen Teil auf.',
        '$τ = 10 kΩ · 1 µF = 0.01 s = 10 ms$. So within half a period of the 100 Hz square wave (5 ms) C1 charges only a little.',
      ),
    },
    {
      text: t(
        '**Stelle τ = 1 ms ein.**\n\nÄndere R1, C1 oder beide so, dass $R · C = 1 ms$ ergibt. Es gibt mehrere richtige Lösungen.',
        '**Set τ = 1 ms.**\n\nChange R1, C1 or both so that $R · C = 1 ms$. There are several correct solutions.',
      ),
      check: product(['R1', 'C1'], 0.9e-3, 1.1e-3),
      hint: t(
        'Zum Beispiel R1 = 1 kΩ bei C1 = 1 µF, oder R1 = 10 kΩ bei C1 = 100 nF. Werte gibst du als `1k`, `100n` oder `1µ` ein.',
        'For example R1 = 1 kΩ with C1 = 1 µF, or R1 = 10 kΩ with C1 = 100 nF. Enter values as `1k`, `100n` or `1µ`.',
      ),
      explain: t(
        'Ob großer Widerstand und kleiner Kondensator oder umgekehrt – für die Zeit zählt nur das **Produkt** R · C. Ein großer Widerstand lässt nur wenig Ladestrom durch, ein großer Kondensator braucht viel Ladung: Beides macht das Laden langsamer.',
        'Large resistor and small capacitor or the other way round – only the **product** R · C counts for the timing. A large resistor lets only a small charging current through, a large capacitor needs a lot of charge: both make charging slower.',
      ),
    },
    {
      text: t(
        '**Wann sind 63 % erreicht?**\n\nSpringt die Eingangsspannung von 0 V auf 5 V, steigt die Spannung an C1 erst schnell, dann immer langsamer.',
        '**When is 63 % reached?**\n\nWhen the input jumps from 0 V to 5 V, the voltage across C1 rises quickly at first, then more and more slowly.',
      ),
      check: quiz(
        t('Nach welcher Zeit hat C1 etwa 63 % der Endspannung erreicht, also etwa 3,2 V?', 'After what time has C1 reached about 63 % of the final voltage, i.e. about 3.2 V?'),
        [t('nach 0,63 ms', 'after 0.63 ms'), t('nach τ = 1 ms', 'after τ = 1 ms'), t('nach 5 ms', 'after 5 ms'), t('sofort', 'immediately')],
        1,
      ),
      explain: t(
        'Die Ladekurve folgt $U_C = U · (1 − e^{−t/τ})$. Nach **einer Zeitkonstante** sind 63 % erreicht, nach 2τ 86 %, nach 3τ 95 % und nach 5τ über 99 %. Beim Entladen ist es umgekehrt: Nach τ sind noch 37 % übrig.',
        'The charging curve follows $U_C = U · (1 − e^{−t/τ})$. After **one time constant** 63 % are reached, after 2τ 86 %, after 3τ 95 % and after 5τ more than 99 %. Discharging works the other way round: after τ, 37 % are left.',
      ),
    },
    {
      text: t(
        '**Sieh dir die Ladekurve an.**\n\nDrücke F5 (Simulieren): Der Messplatz öffnet sich. Kanal 1 zeigt das Rechteck des Generators, Kanal 2 die Spannung an C1.',
        '**Look at the charging curve.**\n\nPress F5 (Simulate): the bench opens. Channel 1 shows the generator\'s square wave, channel 2 the voltage across C1.',
      ),
      check: quiz(
        t(
          'Eine Halbperiode des 100-Hz-Rechtecks dauert 5 ms. Wie weit lädt sich C1 bei τ = 1 ms in dieser Zeit auf?',
          'Half a period of the 100 Hz square wave lasts 5 ms. How far does C1 charge in that time with τ = 1 ms?',
        ),
        [
          t('auf etwa 63 %', 'to about 63 %'),
          t('auf etwa 86 %', 'to about 86 %'),
          t('praktisch vollständig (über 99 %)', 'practically completely (over 99 %)'),
          t('gar nicht', 'not at all'),
        ],
        2,
      ),
      explain: t(
        '5 ms sind 5τ: C1 erreicht praktisch die vollen 5 V, bevor das Rechteck wieder umschaltet. Auf dem Oszilloskop siehst du die typische Lade- und Entladekurve. Dreh am Generator die Frequenz hoch, etwa auf 1 kHz: Dann bleibt keine Zeit mehr zum vollständigen Laden.',
        '5 ms are 5τ: C1 reaches practically the full 5 V before the square wave switches again. The oscilloscope shows the typical charging and discharging curve. Turn the generator frequency up to about 1 kHz: then there is no time left to charge completely.',
      ),
    },
    {
      text: t('**Rechne mit τ.**', '**Calculate with τ.**'),
      check: quiz(
        t('Welche Spannung hat C1 2 ms (also 2τ) nach dem Sprung auf 5 V?', 'What is the voltage across C1 2 ms (that is 2τ) after the step to 5 V?'),
        [t('etwa 4,3 V', 'about 4.3 V'), t('etwa 2,5 V', 'about 2.5 V'), t('etwa 3,2 V', 'about 3.2 V'), t('genau 5 V', 'exactly 5 V')],
        0,
      ),
      explain: t(
        'Nach 2τ sind 86 % erreicht: $5 V · 0,86 ≈ 4,3 V$. RC-Glieder findest du überall, wo es um Zeit geht: Verzögerungen, das Entprellen von Tastern, Taktgeber wie der NE555 und Filter.',
        'After 2τ, 86 % are reached: $5 V · 0.86 ≈ 4.3 V$. RC networks are everywhere timing matters: delays, debouncing push buttons, oscillators like the NE555 and filters.',
      ),
    },
  ],
  solve: (doc) => change(doc, { R1: { value: '1k' } }),
};

// ---- 12. charging a capacitor in slow motion ------------------------------------------------------------

const chargingTitle = t('Den Kondensator laden', 'Charging a capacitor');

/** column of the capacitor and the bottom wire */
const CHARGE = { top: 160, bottom: 416, c: 416 };

export const capacitorCharging: LessonDef = {
  id: 'capacitor-charging',
  topic: 'analog',
  level: 2,
  minutes: 10,
  title: chargingTitle,
  summary: t(
    'Schließe den Schalter und sieh in Zeitlupe zu, wie sich ein Kondensator über einen Widerstand auflädt: erst schnell, dann immer langsamer.',
    'Close the switch and watch in slow motion how a capacitor charges through a resistor: quickly at first, then more and more slowly.',
  ),
  start: (library, lang) => {
    const b = new CircuitBuilder(library);
    heading(b, lang, chargingTitle, t('Schließe S1 und sieh dir in der Zeitlupe (Shift+T) an, wie sich C1 auflädt.', 'Close S1 and watch C1 charge in slow motion (Shift+T).'));
    const { top, bottom, c } = CHARGE;
    const s1 = switchV(b, 'S1', { x: 96, y: 176 }, false);
    const v1 = battery(b, 'V1', { x: 96, y: 288 }, 9);
    const r1 = resistorH(b, 'R1', { x: 192, y: top }, '4.7k');
    const c1 = elko(b, 'C1', { x: c, y: 240 }, '100µ');
    b.wire(b.pin(s1, 1), { x: 96, y: top }, b.pin(r1, 1));
    b.wire(b.pin(s1, 2), b.pin(v1, '+'));
    b.wire(b.pin(r1, 2), { x: c, y: top }, b.pin(c1, 1));
    b.wire(b.pin(c1, 2), { x: c, y: bottom }, { x: 96, y: bottom }, b.pin(v1, '-'));
    b.ground({ x: 96, y: bottom });
    spiceDirective(b, 48, 496, '.tran 1m 600m');
    b.text(176, 496, lang === 'de' ? '← Zeitlupe: die ersten 600 ms nach dem Einschalten' : '← slow motion: the first 600 ms after switching on', 11);
    return b.doc();
  },
  steps: [
    {
      live: true,
      text: t(
        '**Schließe den Schalter S1.**\n\nDie Batterie V1 (9 V) soll den Kondensator C1 (100 µF) über den Widerstand R1 (4,7 kΩ) aufladen. Die Live-Werte sind eingeschaltet – klicke auf S1, um ihn zu schließen.',
        '**Close the switch S1.**\n\nThe battery V1 (9 V) is to charge the capacitor C1 (100 µF) through the resistor R1 (4.7 kΩ). Live values are on – click S1 to close it.',
      ),
      check: property('S1', 'closed', 'true'),
      hint: t('Klicke mitten auf das Schaltersymbol S1 links oben. Über dem Schalter steht dann *ON*.', 'Click the middle of the switch symbol S1 at the top left. *ON* then appears above the switch.'),
      explain: t(
        'Die Live-Werte zeigen sofort 9 V an C1 und keinen Strom mehr. Sie zeigen nämlich den **Endzustand**, den Gleichstrom-Arbeitspunkt: Ein voller Kondensator lässt keinen Gleichstrom durch, er wirkt wie eine Unterbrechung. Was *dazwischen* passiert, zeigt dir erst die Zeitlupe.',
        'The live values immediately show 9 V across C1 and no current any more. That is because they show the **final state**, the DC operating point: a charged capacitor lets no direct current through, it acts like a gap. What happens *in between* only the slow motion view shows you.',
      ),
    },
    {
      text: t(
        '**Schalte die Zeitlupe ein.**\n\nDrücke **Shift+T** oder klicke oben auf die Uhr neben *Live*. Die Simulation berechnet die ersten 600 ms nach dem Einschalten und spielt sie in 6 s ab – zehnmal langsamer, immer wieder von vorn. Oben links läuft die Zeit *t* mit. Beobachte die Spannung an C1 und die Strompunkte.',
        '**Switch on slow motion.**\n\nPress **Shift+T** or click the clock next to *Live* at the top. The simulation computes the first 600 ms after switching on and plays them back over 6 s – ten times slower, over and over. The time *t* runs at the top left. Watch the voltage across C1 and the current dots.',
      ),
      check: quiz(
        t('Wie verändert sich der Ladestrom durch R1?', 'How does the charging current through R1 change?'),
        [
          t('Er bleibt gleich, bis C1 voll ist.', 'It stays the same until C1 is full.'),
          t('Er ist am Anfang am größten und wird dann immer kleiner.', 'It is largest at the start and then gets smaller and smaller.'),
          t('Er beginnt bei null und steigt dann an.', 'It starts at zero and then rises.'),
          t('Er wechselt ständig die Richtung.', 'It keeps changing direction.'),
        ],
        1,
      ),
      hint: t('Achte auf die Strompunkte auf den Leitungen und auf die Stromanzeige unter R1: Wie schnell laufen sie am Anfang, wie schnell am Ende?', 'Watch the current dots on the wires and the current shown below R1: how fast do they move at the start, how fast at the end?'),
      explain: t(
        'Im ersten Moment ist C1 leer (0 V): Die ganzen 9 V liegen an R1, es fließen $I = 9 V / 4,7 kΩ ≈ 1,9 mA$. Je voller C1 wird, desto weniger Spannung bleibt für R1 – und desto kleiner wird der Strom. Darum lädt sich C1 erst schnell und dann immer langsamer auf.',
        'At the first moment C1 is empty (0 V): the full 9 V are across R1, so $I = 9 V / 4.7 kΩ ≈ 1.9 mA$ flow. The fuller C1 gets, the less voltage is left for R1 – and the smaller the current. That is why C1 charges quickly at first and then more and more slowly.',
      ),
    },
    {
      text: t(
        '**Wie groß ist die Zeitkonstante?**\n\nWie schnell sich C1 auflädt, bestimmt die **Zeitkonstante** $τ = R · C$.',
        '**How large is the time constant?**\n\nHow fast C1 charges is set by the **time constant** $τ = R · C$.',
      ),
      check: quiz(
        t('R1 = 4,7 kΩ, C1 = 100 µF. Wie groß ist τ?', 'R1 = 4.7 kΩ, C1 = 100 µF. How large is τ?'),
        [t('47 ms', '47 ms'), t('0,47 s', '0.47 s'), t('4,7 s', '4.7 s'), t('470 s', '470 s')],
        1,
      ),
      hint: t('$4700 Ω · 0,0001 F$ – Ohm mal Farad ergibt Sekunden.', '$4700 Ω · 0.0001 F$ – ohms times farads gives seconds.'),
      explain: t(
        '$τ = 4,7 kΩ · 100 µF = 0,47 s$. Nach einer Zeitkonstante ist C1 zu 63 % geladen. Die 600 ms der Zeitlupe sind nur gut eine Zeitkonstante: Am Ende zeigt C1 erst etwa 6,5 V (72 %). Ganz voll wäre er nach etwa 5τ ≈ 2,4 s.',
        '$τ = 4.7 kΩ · 100 µF = 0.47 s$. After one time constant C1 is 63 % charged. The 600 ms of the slow motion view are only a little more than one time constant: at the end C1 shows only about 6.5 V (72 %). It would be full after about 5τ ≈ 2.4 s.',
      ),
    },
    {
      text: t(
        '**Stelle τ = 100 ms ein.**\n\nC1 soll innerhalb der 600 ms der Zeitlupe ganz voll werden. Ändere R1 so, dass $τ = R · C = 100 ms$ ergibt. C1 bleibt bei 100 µF.',
        '**Set τ = 100 ms.**\n\nC1 is to get completely full within the 600 ms of the slow motion view. Change R1 so that $τ = R · C = 100 ms$. C1 stays at 100 µF.',
      ),
      check: product(['R1', 'C1'], 0.09, 0.11),
      hint: t('$R = τ / C = 0,1 s / 0,0001 F$. Den Wert trägst du im Eigenschaften-Panel unter *Wert* ein, z. B. `1k`.', '$R = τ / C = 0.1 s / 0.0001 F$. Type the value into *Value* in the properties panel, e.g. `1k`.'),
      explain: t(
        '$R1 = 0,1 s / 100 µF = 1 kΩ$. Sieh dir die Zeitlupe noch einmal an: Jetzt beginnt der Ladestrom mit $9 V / 1 kΩ = 9 mA$, und nach etwa 500 ms ist C1 praktisch voll.',
        '$R1 = 0.1 s / 100 µF = 1 kΩ$. Watch the slow motion view again: now the charging current starts at $9 V / 1 kΩ = 9 mA$, and after about 500 ms C1 is practically full.',
      ),
    },
    {
      text: t(
        '**Lies die Ladekurve ab.**\n\nBeobachte in der Zeitlupe die Zeit *t* oben links und die Spannung an C1.',
        '**Read the charging curve.**\n\nIn the slow motion view, watch the time *t* at the top left and the voltage across C1.',
      ),
      check: quiz(
        t('Wann erreicht C1 etwa 5,7 V, also 63 % der Batteriespannung?', 'When does C1 reach about 5.7 V, i.e. 63 % of the battery voltage?'),
        [t('nach 63 ms', 'after 63 ms'), t('nach 100 ms, also nach τ', 'after 100 ms, i.e. after τ'), t('nach 300 ms', 'after 300 ms'), t('nach 500 ms', 'after 500 ms')],
        1,
      ),
      explain: t(
        'Die Ladekurve folgt $U_C = U · (1 − e^{−t/τ})$:\n\n- nach 1τ (100 ms): 63 % ≈ 5,7 V\n- nach 2τ (200 ms): 86 % ≈ 7,8 V\n- nach 3τ (300 ms): 95 % ≈ 8,6 V\n- nach 5τ (500 ms): über 99 %\n\nAls Faustregel gilt ein Kondensator nach **5τ** als voll.',
        'The charging curve follows $U_C = U · (1 − e^{−t/τ})$:\n\n- after 1τ (100 ms): 63 % ≈ 5.7 V\n- after 2τ (200 ms): 86 % ≈ 7.8 V\n- after 3τ (300 ms): 95 % ≈ 8.6 V\n- after 5τ (500 ms): over 99 %\n\nAs a rule of thumb a capacitor counts as full after **5τ**.',
      ),
    },
    {
      text: t('**Doppelter Widerstand.**', '**Twice the resistance.**'),
      check: quiz(
        t('Was ändert sich, wenn du R1 auf 2 kΩ verdoppelst?', 'What changes if you double R1 to 2 kΩ?'),
        [
          t('C1 lädt sich nur noch auf 4,5 V auf.', 'C1 only charges to 4.5 V.'),
          t('Das Laden dauert doppelt so lange, am Ende sind es trotzdem 9 V.', 'Charging takes twice as long, but it still ends at 9 V.'),
          t('Das Laden geht doppelt so schnell.', 'Charging is twice as fast.'),
          t('Nichts, τ hängt nur von C1 ab.', 'Nothing, τ only depends on C1.'),
        ],
        1,
      ),
      explain: t(
        'Mit 2 kΩ ist $τ = 200 ms$: Der Anfangsstrom halbiert sich auf 4,5 mA, und C1 braucht doppelt so lange. Die Endspannung bleibt 9 V – sie hängt nur von der Batterie ab. Probier es aus: Mit 2 kΩ ist C1 nach den 600 ms (3τ) erst zu 95 % voll. Solche RC-Glieder erzeugen Verzögerungen, zum Beispiel für ein Licht, das nach dem Einschalten langsam angeht.',
        'With 2 kΩ, $τ = 200 ms$: the initial current halves to 4.5 mA and C1 takes twice as long. The final voltage stays at 9 V – it only depends on the battery. Try it: with 2 kΩ, C1 is only 95 % full after the 600 ms (3τ). RC networks like this create delays, for example for a light that comes on slowly after switching on.',
      ),
    },
  ],
  solve: (doc) => change(doc, { S1: { props: { closed: 'true' } }, R1: { value: '1k' } }),
};

// ---- 13. the RC low pass on the bench ---------------------------------------------------------------

const lowpassTitle = t('RC-Tiefpass am Messplatz', 'RC low pass on the bench');

export const rcLowpassBench: LessonDef = {
  id: 'rc-lowpass-bench',
  topic: 'analog',
  level: 2,
  minutes: 12,
  title: lowpassTitle,
  summary: t(
    'Funktionsgenerator, Oszilloskop und Multimeter: Stelle die Grenzfrequenz auf 1 kHz ein und miss, wie der Tiefpass hohe Frequenzen dämpft.',
    'Function generator, oscilloscope and multimeter: set the cut-off frequency to 1 kHz and measure how the low pass attenuates high frequencies.',
  ),
  start: (library, lang) =>
    rcBench(library, lang, {
      title: lowpassTitle,
      task: t('Ändere C1 so, dass die Grenzfrequenz 1 kHz beträgt (R1 = 1 kΩ). F5 öffnet den Messplatz.', 'Change C1 so that the cut-off frequency is 1 kHz (R1 = 1 kΩ). F5 opens the bench.'),
      r: '1k',
      c: '100n',
      fgen: { shape: 'SIN', frequency: '1000', frequencyUnit: 'HZ', acAmplitude: '2', dcOffset: '0' },
      fgenValue: '1 kHz',
      scope: { timeDiv: '0.0002', ch1Div: '1', ch2Div: '1', ch1Pos: '1.5', ch2Pos: '-1.5', trigSource: '1', trigLevel: '0', trigEdge: 'rise' },
      dmm: true,
    }),
  steps: [
    {
      text: t(
        '**Der Messplatz.**\n\nDer Funktionsgenerator FG1 speist einen Sinus (1 kHz, 2 V Amplitude) in den Tiefpass aus R1 und C1. Das Oszilloskop zeigt auf Kanal 1 den Eingang und auf Kanal 2 den Ausgang, das Multimeter misst die Wechselspannung an C1. Drücke F5, um die Geräte zu sehen.',
        '**The bench.**\n\nThe function generator FG1 feeds a sine wave (1 kHz, 2 V amplitude) into the low pass made of R1 and C1. The oscilloscope shows the input on channel 1 and the output on channel 2, the multimeter measures the AC voltage across C1. Press F5 to see the instruments.',
      ),
      check: quiz(
        t('Wie groß ist die Grenzfrequenz $f_g = 1 / (2π · R · C)$ mit R1 = 1 kΩ und C1 = 100 nF?', 'What is the cut-off frequency $f_c = 1 / (2π · R · C)$ with R1 = 1 kΩ and C1 = 100 nF?'),
        [t('etwa 160 Hz', 'about 160 Hz'), t('etwa 1,6 kHz', 'about 1.6 kHz'), t('etwa 16 kHz', 'about 16 kHz'), t('etwa 10 kHz', 'about 10 kHz')],
        1,
      ),
      explain: t(
        '$f_g = 1 / (2π · 1 kΩ · 100 nF) ≈ 1,59 kHz$. Signale weit unterhalb von $f_g$ lässt der Tiefpass fast ungeschwächt durch, oberhalb dämpft er sie immer stärker.',
        '$f_c = 1 / (2π · 1 kΩ · 100 nF) ≈ 1.59 kHz$. Signals well below $f_c$ pass the low pass almost unchanged, above it they are attenuated more and more.',
      ),
    },
    {
      text: t(
        '**Stelle $f_g$ = 1 kHz ein.**\n\nR1 bleibt bei 1 kΩ. Welchen Wert braucht C1 für eine Grenzfrequenz von 1 kHz? Ändere C1.',
        '**Set $f_c$ = 1 kHz.**\n\nR1 stays at 1 kΩ. Which value does C1 need for a cut-off frequency of 1 kHz? Change C1.',
      ),
      check: value('C1', 150e-9, 170e-9),
      hint: t(
        'Stell die Formel um: $C = 1 / (2π · R · f_g) = 1 / (2π · 1000 Ω · 1000 Hz)$. Normwerte in der Nähe sind 150 nF (E12) und 160 nF (E24).',
        'Rearrange the formula: $C = 1 / (2π · R · f_c) = 1 / (2π · 1000 Ω · 1000 Hz)$. Standard values nearby are 150 nF (E12) and 160 nF (E24).',
      ),
      explain: t(
        '$C = 1 / (2π · 1 kΩ · 1 kHz) ≈ 159 nF$. Mit 150 nF liegt $f_g$ bei 1,06 kHz, mit 160 nF bei 995 Hz – beides nah genug.',
        '$C = 1 / (2π · 1 kΩ · 1 kHz) ≈ 159 nF$. With 150 nF $f_c$ is 1.06 kHz, with 160 nF 995 Hz – both close enough.',
      ),
    },
    {
      text: t(
        '**Was passiert bei der Grenzfrequenz?**\n\nDer Generator steht auf 1 kHz – also jetzt fast genau auf $f_g$. Vergleiche auf dem Oszilloskop die Amplituden von Kanal 1 und Kanal 2.',
        '**What happens at the cut-off frequency?**\n\nThe generator is set to 1 kHz – now almost exactly $f_c$. Compare the amplitudes of channel 1 and channel 2 on the oscilloscope.',
      ),
      check: quiz(
        t('Wie groß ist die Ausgangsamplitude bei $f = f_g$ im Vergleich zum Eingang?', 'How large is the output amplitude at $f = f_c$ compared with the input?'),
        [
          t('genauso groß (100 %)', 'just as large (100 %)'),
          t('halb so groß (50 %, −6 dB)', 'half as large (50 %, −6 dB)'),
          t('etwa 71 % (1/√2, −3 dB)', 'about 71 % (1/√2, −3 dB)'),
          t('null', 'zero'),
        ],
        2,
      ),
      explain: t(
        'Bei der Grenzfrequenz sind die Spannungen an R1 und C1 gleich groß, aber um 90° gegeneinander verschoben. Der Ausgang erreicht $1/√2 ≈ 0,707$ der Eingangsamplitude, das sind **−3 dB**. Das Multimeter zeigt etwa 1 V statt 1,41 V (der Effektivwert von 2 V Amplitude). Außerdem läuft der Ausgang dem Eingang um 45° hinterher.',
        'At the cut-off frequency the voltages across R1 and C1 are equal in size but shifted by 90° against each other. The output reaches $1/√2 ≈ 0.707$ of the input amplitude, that is **−3 dB**. The multimeter shows about 1 V instead of 1.41 V (the RMS value of a 2 V amplitude). The output also lags the input by 45°.',
      ),
    },
    {
      text: t(
        '**Dreh am Frequenzknopf.**\n\nIm Messplatz hat der Funktionsgenerator einen Knopf *Frequenz*. Zieh ihn mit der Maus nach oben oder unten (oder nimm das Mausrad) und stelle etwa 10 kHz ein. Kanal 2 und das Multimeter folgen live.',
        '**Turn the frequency knob.**\n\nOn the bench the function generator has a *Frequency* knob. Drag it up or down with the mouse (or use the mouse wheel) and set about 10 kHz. Channel 2 and the multimeter follow live.',
      ),
      check: quiz(
        t('Was zeigt das Multimeter bei 10 kHz ungefähr an?', 'Roughly what does the multimeter show at 10 kHz?'),
        [t('etwa 1,41 V – wie am Eingang', 'about 1.41 V – like the input'), t('etwa 1 V', 'about 1 V'), t('etwa 0,14 V', 'about 0.14 V'), t('genau 0 V', 'exactly 0 V')],
        2,
      ),
      explain: t(
        'Oberhalb von $f_g$ fällt die Ausgangsspannung um den Faktor 10 pro Frequenzdekade (**−20 dB pro Dekade**): Bei 10 kHz kommen nur noch etwa 10 % durch. Daher der Name *Tiefpass*: Tiefe Frequenzen passieren, hohe werden gedämpft.',
        'Above $f_c$ the output falls by a factor of 10 per decade of frequency (**−20 dB per decade**): at 10 kHz only about 10 % get through. Hence the name *low pass*: low frequencies pass, high ones are attenuated.',
      ),
    },
    {
      text: t('**Wozu braucht man das?**', '**What is it used for?**'),
      check: quiz(
        t('Wofür setzt man einen Tiefpass typischerweise ein?', 'What is a low pass typically used for?'),
        [
          t('Um Rauschen und hochfrequente Störungen aus einem Signal zu filtern.', 'To filter noise and high frequency interference out of a signal.'),
          t('Um eine Gleichspannung zu erhöhen.', 'To raise a DC voltage.'),
          t('Um hohe Töne lauter zu machen.', 'To make high notes louder.'),
          t('Um Strom zu sparen.', 'To save current.'),
        ],
        0,
      ),
      explain: t(
        'Tiefpässe glätten Signale: Sie entfernen Rauschen, Störungen von Schaltnetzteilen oder die Pulse einer PWM, sodass deren Mittelwert übrig bleibt. Vertauschst du R und C, entsteht ein **Hochpass**, der tiefe Frequenzen dämpft.',
        'Low passes smooth signals: they remove noise, interference from switching power supplies or the pulses of a PWM signal, leaving its average. Swap R and C and you get a **high pass** that attenuates low frequencies.',
      ),
    },
  ],
  solve: (doc) => change(doc, { C1: { value: '150n' } }),
};

export const ANALOG: LessonDef[] = [rcTimeConstant, capacitorCharging, rcLowpassBench];
