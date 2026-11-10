// Lessons on analog circuits with the instrument bench: the RC time constant
// and the RC low pass.

import type { Doc, SymbolDef } from '../../model/types.ts';
import { INSTRUMENT_DEFS } from '../../spice/instruments.ts';
import { CircuitBuilder } from '../build.ts';
import { change, heading, product, quiz, resistorH, t, value, type Lang, type LessonDef } from './kit.ts';
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

// ---- 10. the RC time constant ----------------------------------------------------------------------

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
      check: product('R1', 'C1', 0.9e-3, 1.1e-3),
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

// ---- 11. the RC low pass on the bench ---------------------------------------------------------------

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

export const ANALOG: LessonDef[] = [rcTimeConstant, rcLowpassBench];
