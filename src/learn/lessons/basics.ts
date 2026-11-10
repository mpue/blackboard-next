// Lessons on the basics: the closed circuit, Ohm's law, series and parallel
// connections, the voltage divider and the potentiometer.

import { CircuitBuilder } from '../build.ts';
import {
  all,
  battery,
  between,
  change,
  current,
  extend,
  heading,
  ledLoop,
  ledV,
  notConnected,
  place,
  property,
  quiz,
  resistorH,
  resistorV,
  t,
  value,
  voltage,
  type LessonDef,
} from './kit.ts';

// ---- 1. the first circuit ----------------------------------------------------------------------

const firstCircuitTitle = t('Dein erster Stromkreis', 'Your first circuit');

export const firstCircuit: LessonDef = {
  id: 'first-circuit',
  topic: 'basics',
  level: 1,
  minutes: 5,
  title: firstCircuitTitle,
  summary: t(
    'Batterie, Schalter, Widerstand und LED: Schließe den Stromkreis und bring die LED zum Leuchten.',
    'Battery, switch, resistor and LED: close the circuit and make the LED light up.',
  ),
  start: (library, lang) => {
    const b = new CircuitBuilder(library);
    heading(b, lang, firstCircuitTitle, t('Schalte S1 ein (im Live-Modus anklicken) und beobachte die LED D1.', 'Turn on S1 (click it in live mode) and watch the LED D1.'));
    ledLoop(b, { volts: 9, r: '470', closed: false });
    return b.doc();
  },
  steps: [
    {
      live: true,
      text: t(
        '**Schau dir die Schaltung an.**\n\nDie Batterie V1 (9 V) liefert die Spannung. Der Widerstand R1 begrenzt den Strom, die rote LED D1 soll leuchten. Der Schalter S1 unter der LED ist noch offen.\n\nDie Live-Werte sind eingeschaltet: Die Farbe der Leitungen zeigt, welche Spannung sie führen.',
        '**Take a look at the circuit.**\n\nThe battery V1 (9 V) provides the voltage. The resistor R1 limits the current, the red LED D1 is supposed to light up. The switch S1 below the LED is still open.\n\nLive values are on: the colour of the wires shows their voltage.',
      ),
      explain: t(
        'Jeder Stromkreis braucht eine **Quelle** (hier die Batterie), einen **Verbraucher** (die LED) und einen **geschlossenen Weg** für den Strom: vom Pluspol durch die Bauteile zurück zum Minuspol. Das Symbol GND (Masse) markiert den Bezugspunkt mit 0 V.',
        'Every circuit needs a **source** (here the battery), a **load** (the LED) and a **closed path** for the current: from the positive terminal through the parts back to the negative terminal. The GND (ground) symbol marks the reference point at 0 V.',
      ),
    },
    {
      live: true,
      text: t(
        '**Schließe den Schalter S1.**\n\nKlicke im Schaltplan direkt auf den Schalter. Solange die Live-Werte an sind, schaltet ein Klick ihn um.',
        '**Close the switch S1.**\n\nClick right on the switch in the schematic. While live values are on, a click toggles it.',
      ),
      check: property('S1', 'closed', 'true'),
      hint: t(
        'Die Live-Werte müssen eingeschaltet sein (Schaltfläche *Live* oben). Klicke dann mitten auf das Schaltersymbol S1 rechts unten.',
        'Live values have to be on (the *Live* button at the top). Then click the middle of the switch symbol S1 at the bottom right.',
      ),
      explain: t(
        'Jetzt ist der Stromkreis **geschlossen**: Es gibt einen durchgehenden Weg von + über R1, D1 und S1 zurück zu −. Nur dann kann Strom fließen. Die wandernden Punkte auf den Leitungen zeigen die Stromrichtung – technisch gesehen von + nach −.',
        'Now the circuit is **closed**: there is a continuous path from + through R1, D1 and S1 back to −. Only then can a current flow. The moving dots on the wires show the direction of the current – conventionally from + to −.',
      ),
    },
    {
      live: true,
      text: t(
        '**Die LED leuchtet.**\n\nMit geschlossenem S1 fließt Strom durch die LED. Ab etwa 5 mA leuchtet sie deutlich. Sieh dir in den Live-Werten an, wie groß der Strom ist.',
        '**The LED lights up.**\n\nWith S1 closed a current flows through the LED. From about 5 mA on it lights up clearly. Look at the live values to see how large the current is.',
      ),
      check: current('D1', 0.005, 0.03),
      hint: t('Ist S1 wirklich geschlossen? Ein zweiter Klick öffnet ihn wieder.', 'Is S1 really closed? A second click opens it again.'),
      explain: t(
        'Es fließen etwa 15 mA. An der roten LED fallen etwa 1,9 V ab, am Widerstand der Rest: $I = (9 V − 1,9 V) / 470 Ω ≈ 15 mA$.\n\nIn einem Stromkreis ohne Abzweigungen (einer **Reihenschaltung**) fließt **überall derselbe Strom** – durch die Batterie, R1, D1 und S1.',
        'About 15 mA flow. The red LED takes about 1.9 V, the resistor the rest: $I = (9 V − 1.9 V) / 470 Ω ≈ 15 mA$.\n\nIn a circuit without branches (a **series circuit**) **the same current flows everywhere** – through the battery, R1, D1 and S1.',
      ),
    },
    {
      text: t('**Was passiert beim Ausschalten?**', '**What happens when you switch off?**'),
      check: quiz(
        t('Was passiert, wenn du S1 wieder öffnest?', 'What happens when you open S1 again?'),
        [
          t('Die LED leuchtet schwächer, weil weniger Spannung anliegt.', 'The LED gets dimmer because there is less voltage.'),
          t('Die LED geht aus, weil der Stromkreis unterbrochen ist.', 'The LED goes out because the circuit is broken.'),
          t('Die LED leuchtet weiter, der Strom fließt über GND zurück.', 'The LED stays on, the current returns through GND.'),
          t('Die Batterie wird kurzgeschlossen.', 'The battery is short-circuited.'),
        ],
        1,
      ),
      explain: t(
        'Ein offener Schalter ist eine Lücke im Stromkreis. Ohne geschlossenen Weg kann nirgends Strom fließen – egal, an welcher Stelle der Kreis unterbrochen ist. Probier es aus: Klick noch einmal auf S1.',
        'An open switch is a gap in the circuit. Without a closed path no current can flow anywhere – no matter where the circuit is broken. Try it: click S1 once more.',
      ),
    },
    {
      text: t('**Wozu ist R1 da?**', '**What is R1 for?**'),
      check: quiz(
        t('Welche Aufgabe hat der Widerstand R1?', 'What does the resistor R1 do?'),
        [
          t('Er speichert Energie für die LED.', 'It stores energy for the LED.'),
          t('Er sorgt dafür, dass der Strom nur in eine Richtung fließt.', 'It makes the current flow in one direction only.'),
          t('Er begrenzt den Strom, damit die LED nicht überlastet wird.', 'It limits the current so the LED is not overloaded.'),
          t('Er erhöht die Spannung an der LED.', 'It raises the voltage across the LED.'),
        ],
        2,
      ),
      explain: t(
        'Sobald eine LED leitet, hat sie kaum noch Widerstand. Direkt an 9 V würde ein viel zu großer Strom fließen und sie zerstören. Der **Vorwiderstand** nimmt die überschüssige Spannung auf (hier etwa 7 V) und legt so den Strom fest. Wie man ihn berechnet, lernst du in der Lektion *LED-Vorwiderstand*.',
        'Once an LED conducts it has hardly any resistance left. Connected straight to 9 V, far too much current would flow and destroy it. The **series resistor** takes the excess voltage (here about 7 V) and so sets the current. How to calculate it is shown in the lesson *LED series resistor*.',
      ),
    },
  ],
  solve: (doc) => change(doc, { S1: { props: { closed: 'true' } } }),
};

// ---- 2. Ohm's law --------------------------------------------------------------------------------

/** Battery on the left, one vertical resistor on the right. */
function singleResistor(b: CircuitBuilder, volts: number, r: string): void {
  const v1 = battery(b, 'V1', { x: 96, y: 208 }, volts);
  const r1 = resistorV(b, 'R1', { x: 320, y: 192 }, r);
  b.wire(b.pin(v1, '+'), { x: 96, y: 160 }, { x: 320, y: 160 }, b.pin(r1, 1));
  b.wire(b.pin(r1, 2), { x: 320, y: 320 }, { x: 96, y: 320 }, b.pin(v1, '-'));
  b.ground({ x: 96, y: 320 });
}

const ohmsLawTitle = t('Das ohmsche Gesetz', "Ohm's law");

export const ohmsLaw: LessonDef = {
  id: 'ohms-law',
  topic: 'basics',
  level: 1,
  minutes: 8,
  title: ohmsLawTitle,
  summary: t(
    'U = R · I: Berechne Ströme und stelle mit dem passenden Widerstand genau den Strom ein, den du willst.',
    'U = R · I: calculate currents and set exactly the current you want with the right resistor.',
  ),
  start: (library, lang) => {
    const b = new CircuitBuilder(library);
    heading(b, lang, ohmsLawTitle, t('Berechne den Strom durch R1 und stelle danach 9 mA und 3 mA ein.', 'Calculate the current through R1, then set 9 mA and 3 mA.'));
    singleResistor(b, 9, '1.8k');
    return b.doc();
  },
  steps: [
    {
      live: true,
      text: t(
        '**Berechne den Strom durch R1.**\n\nDie Batterie liefert $U = 9 V$, der Widerstand hat $R = 1,8 kΩ$. Nach dem ohmschen Gesetz ist $I = U / R$. Rechne zuerst selbst und vergleiche dann mit den Live-Werten im Schaltplan.',
        '**Calculate the current through R1.**\n\nThe battery supplies $U = 9 V$, the resistor has $R = 1.8 kΩ$. By Ohm\'s law $I = U / R$. Work it out yourself first, then compare with the live values in the schematic.',
      ),
      check: quiz(
        t('Welcher Strom fließt durch R1?', 'Which current flows through R1?'),
        [t('0,5 mA', '0.5 mA'), t('5 mA', '5 mA'), t('16,2 mA', '16.2 mA'), t('50 mA', '50 mA')],
        1,
      ),
      hint: t('1,8 kΩ sind 1800 Ω. Rechne 9 V : 1800 Ω.', '1.8 kΩ is 1800 Ω. Work out 9 V ÷ 1800 Ω.'),
      explain: t(
        '$I = U / R = 9 V / 1800 Ω = 0,005 A = 5 mA$.\n\nDas **ohmsche Gesetz** $U = R · I$ verbindet drei Größen: die Spannung *U* in Volt (V), den Widerstand *R* in Ohm (Ω) und den Strom *I* in Ampere (A). Kennst du zwei davon, kannst du die dritte ausrechnen:\n\n- $I = U / R$\n- $R = U / I$\n- $U = R · I$',
        '$I = U / R = 9 V / 1800 Ω = 0.005 A = 5 mA$.\n\n**Ohm\'s law** $U = R · I$ links three quantities: the voltage *U* in volts (V), the resistance *R* in ohms (Ω) and the current *I* in amperes (A). Know two of them and you can calculate the third:\n\n- $I = U / R$\n- $R = U / I$\n- $U = R · I$',
      ),
    },
    {
      live: true,
      text: t(
        '**Stelle einen Strom von 9 mA ein.**\n\nÄndere den Wert von R1 so, dass genau 9 mA fließen. Die Spannung bleibt 9 V.',
        '**Set a current of 9 mA.**\n\nChange the value of R1 so that exactly 9 mA flow. The voltage stays at 9 V.',
      ),
      check: all(value('R1', 990, 1010), current('R1', 0.0089, 0.0091)),
      hint: t(
        'Rechne $R = U / I = 9 V / 9 mA$. Zum Ändern klickst du R1 an und trägst im Eigenschaften-Panel rechts unter *Wert* die Zahl ein, z. B. `2200` oder `2.2k`.',
        'Work out $R = U / I = 9 V / 9 mA$. To change it, click R1 and type the number into *Value* in the properties panel on the right, e.g. `2200` or `2.2k`.',
      ),
      explain: t(
        '$R = U / I = 9 V / 0,009 A = 1000 Ω = 1 kΩ$.\n\nDer Widerstand ist kleiner geworden, der Strom größer. Bei gleicher Spannung gilt: **Halber Widerstand – doppelter Strom.** Strom und Widerstand sind umgekehrt proportional.',
        '$R = U / I = 9 V / 0.009 A = 1000 Ω = 1 kΩ$.\n\nThe resistance went down, the current went up. At a fixed voltage: **half the resistance – twice the current.** Current and resistance are inversely proportional.',
      ),
    },
    {
      live: true,
      text: t(
        '**Und jetzt nur noch 3 mA.**\n\nWelchen Wert braucht R1 für 3 mA? Ändere R1 entsprechend.',
        '**And now only 3 mA.**\n\nWhich value does R1 need for 3 mA? Change R1 accordingly.',
      ),
      check: all(value('R1', 2970, 3030), current('R1', 0.00295, 0.00305)),
      hint: t('Ein Drittel des Stroms braucht den dreifachen Widerstand. Als Wert kannst du `3k` eingeben.', 'A third of the current needs three times the resistance. You can enter `3k` as the value.'),
      explain: t(
        '$R = 9 V / 3 mA = 3 kΩ$: dreifacher Widerstand, ein Drittel des Stroms.\n\nIn der Praxis gibt es nicht jeden Wert zu kaufen. Widerstände gibt es in **Normreihen**, etwa E12 mit 1,0 – 1,2 – 1,5 – 1,8 – 2,2 – 2,7 – 3,3 – 3,9 – 4,7 – 5,6 – 6,8 – 8,2. Die 3 kΩ findest du in der feineren E24-Reihe.',
        '$R = 9 V / 3 mA = 3 kΩ$: three times the resistance, a third of the current.\n\nIn practice you cannot buy every value. Resistors come in **preferred series** such as E12 with 1.0 – 1.2 – 1.5 – 1.8 – 2.2 – 2.7 – 3.3 – 3.9 – 4.7 – 5.6 – 6.8 – 8.2. 3 kΩ is part of the finer E24 series.',
      ),
    },
    {
      text: t('**Doppelte Spannung.**', '**Twice the voltage.**'),
      check: quiz(
        t(
          'Was passiert mit dem Strom, wenn du die Batteriespannung auf 18 V verdoppelst und R1 bei 3 kΩ bleibt?',
          'What happens to the current if you double the battery voltage to 18 V and R1 stays at 3 kΩ?',
        ),
        [
          t('Er halbiert sich auf 1,5 mA.', 'It halves to 1.5 mA.'),
          t('Er bleibt bei 3 mA.', 'It stays at 3 mA.'),
          t('Er verdoppelt sich auf 6 mA.', 'It doubles to 6 mA.'),
          t('Er vervierfacht sich auf 12 mA.', 'It quadruples to 12 mA.'),
        ],
        2,
      ),
      explain: t(
        '$I = U / R = 18 V / 3 kΩ = 6 mA$. Bei festem Widerstand ist der Strom **proportional** zur Spannung: doppelte Spannung, doppelter Strom. Probier es aus – V1 anklicken und im Eigenschaften-Panel die Gleichspannung ändern.',
        '$I = U / R = 18 V / 3 kΩ = 6 mA$. With a fixed resistance the current is **proportional** to the voltage: twice the voltage, twice the current. Try it – click V1 and change the DC voltage in the properties panel.',
      ),
    },
    {
      text: t('**Wie warm wird R1?**', '**How warm does R1 get?**'),
      check: quiz(
        t('Welche Leistung setzt R1 bei 9 V und 3 mA in Wärme um?', 'How much power does R1 turn into heat at 9 V and 3 mA?'),
        [t('27 mW', '27 mW'), t('2,7 W', '2.7 W'), t('3 mW', '3 mW'), t('0,27 mW', '0.27 mW')],
        0,
      ),
      hint: t('Die elektrische Leistung ist $P = U · I$.', 'Electrical power is $P = U · I$.'),
      explain: t(
        '$P = U · I = 9 V · 3 mA = 27 mW$. Ein gewöhnlicher Widerstand verträgt 250 mW (1/4 W) – also kein Problem. Mit dem ohmschen Gesetz kannst du die Leistung auch als $P = I² · R$ oder $P = U² / R$ ausrechnen.',
        '$P = U · I = 9 V · 3 mA = 27 mW$. An ordinary resistor handles 250 mW (1/4 W) – no problem at all. With Ohm\'s law you can also write the power as $P = I² · R$ or $P = U² / R$.',
      ),
    },
  ],
  solve: (doc) => change(doc, { R1: { value: '3k' } }),
  stages: { 1: (doc) => change(doc, { R1: { value: '1k' } }) },
};

// ---- 3. series and parallel ------------------------------------------------------------------------

/** rails of both circuits and the column of the loose resistor R4 */
const SP = { top: 176, bottom: 336, r3: 608, r4: 704 };

const seriesParallelTitle = t('Reihen- und Parallelschaltung', 'Series and parallel circuits');

export const seriesParallel: LessonDef = {
  id: 'series-parallel',
  topic: 'basics',
  level: 1,
  minutes: 10,
  title: seriesParallelTitle,
  summary: t(
    'Zwei Widerstände hintereinander oder nebeneinander: Wie verteilen sich Strom und Spannung?',
    'Two resistors one after the other or side by side: how are current and voltage shared?',
  ),
  start: (library, lang) => {
    const b = new CircuitBuilder(library);
    heading(b, lang, seriesParallelTitle, t('Links eine Reihenschaltung. Schalte rechts R4 parallel zu R3.', 'On the left a series circuit. On the right, connect R4 in parallel to R3.'));
    const { top, bottom } = SP;
    b.text(64, 136, lang === 'de' ? 'Reihenschaltung' : 'Series', 12, true);
    b.text(480, 136, lang === 'de' ? 'Parallelschaltung' : 'Parallel', 12, true);
    // series: V1 -> R1 -> R2 -> ground
    const v1 = battery(b, 'V1', { x: 96, y: 224 }, 9);
    const r1 = resistorH(b, 'R1', { x: 160, y: top }, '1k');
    const r2 = resistorV(b, 'R2', { x: 320, y: 208 }, '1k');
    b.wire(b.pin(v1, '+'), { x: 96, y: top }, b.pin(r1, 1));
    b.wire(b.pin(r1, 2), { x: 320, y: top }, b.pin(r2, 1));
    b.wire(b.pin(r2, 2), { x: 320, y: bottom }, { x: 96, y: bottom }, b.pin(v1, '-'));
    b.ground({ x: 96, y: bottom });
    // parallel: V2 -> R3, R4 still loose
    const v2 = battery(b, 'V2', { x: 512, y: 224 }, 9);
    const r3 = resistorV(b, 'R3', { x: SP.r3, y: 208 }, '1k');
    resistorV(b, 'R4', { x: SP.r4, y: 208 }, '1k');
    b.wire(b.pin(v2, '+'), { x: 512, y: top }, { x: SP.r3, y: top }, b.pin(r3, 1));
    b.wire(b.pin(r3, 2), { x: SP.r3, y: bottom }, { x: 512, y: bottom }, b.pin(v2, '-'));
    b.ground({ x: 512, y: bottom });
    return b.doc();
  },
  steps: [
    {
      live: true,
      text: t(
        '**Die Reihenschaltung (links).**\n\nR1 und R2 (je 1 kΩ) liegen hintereinander an 9 V. Der Strom muss durch beide Widerstände hindurch.',
        '**The series circuit (left).**\n\nR1 and R2 (1 kΩ each) are connected one after the other to 9 V. The current has to pass through both resistors.',
      ),
      check: quiz(
        t('Welcher Strom fließt durch V1, R1 und R2?', 'Which current flows through V1, R1 and R2?'),
        [
          t('9 mA', '9 mA'),
          t('4,5 mA', '4.5 mA'),
          t('18 mA', '18 mA'),
          t('durch R1 9 mA, durch R2 4,5 mA', '9 mA through R1, 4.5 mA through R2'),
        ],
        1,
      ),
      hint: t('In Reihe addieren sich die Widerstände: $R_{ges} = R1 + R2$.', 'In series the resistances add up: $R_{tot} = R1 + R2$.'),
      explain: t(
        'In der **Reihenschaltung** addieren sich die Widerstände: $R_{ges} = R1 + R2 = 2 kΩ$, also $I = 9 V / 2 kΩ = 4,5 mA$. Durch alle Bauteile fließt **derselbe Strom**, die Spannung teilt sich auf: An R1 und R2 liegen je 4,5 V.',
        'In a **series circuit** the resistances add up: $R_{tot} = R1 + R2 = 2 kΩ$, so $I = 9 V / 2 kΩ = 4.5 mA$. **The same current** flows through all parts, the voltage is shared: R1 and R2 get 4.5 V each.',
      ),
    },
    {
      text: t(
        '**Baue die Parallelschaltung (rechts).**\n\nR3 hängt schon an V2. Verbinde R4 so, dass er **neben** R3 liegt: oberes Ende an die obere Leitung, unteres Ende an die untere Leitung.',
        '**Build the parallel circuit (right).**\n\nR3 is already connected to V2. Connect R4 so that it sits **next to** R3: top end to the upper wire, bottom end to the lower wire.',
      ),
      check: all(between('R4', ['R3', 1], ['R3', 2]), notConnected('R3', 1, 'R3', 2)),
      hint: t(
        'Wähle das Werkzeug *Leitung* (Taste W) und zieh eine Leitung vom oberen Anschluss von R4 zur oberen Leitung, dann eine vom unteren Anschluss zur unteren Leitung.',
        'Pick the *Wire* tool (key W) and draw a wire from the top pin of R4 to the upper wire, then one from the bottom pin to the lower wire.',
      ),
      explain: t(
        'In der **Parallelschaltung** liegen beide Widerstände an **derselben Spannung**, hier 9 V. Der Strom teilt sich an der Abzweigung auf und fließt danach wieder zusammen.',
        'In a **parallel circuit** both resistors see **the same voltage**, here 9 V. The current splits at the junction and joins again afterwards.',
      ),
    },
    {
      text: t(
        '**Sag den Gesamtstrom voraus.**\n\nR3 und R4 haben je 1 kΩ und liegen beide an 9 V.',
        '**Predict the total current.**\n\nR3 and R4 are 1 kΩ each and both are connected to 9 V.',
      ),
      check: quiz(
        t('Wie viel Strom liefert die Batterie V2 jetzt insgesamt?', 'How much current does the battery V2 supply in total now?'),
        [t('4,5 mA', '4.5 mA'), t('9 mA', '9 mA'), t('18 mA', '18 mA'), t('36 mA', '36 mA')],
        2,
      ),
      hint: t('Rechne den Strom durch jeden Widerstand einzeln aus und addiere.', 'Work out the current through each resistor on its own and add them up.'),
      explain: t(
        'Durch jeden Widerstand fließen $9 V / 1 kΩ = 9 mA$, zusammen **18 mA**. Der Gesamtwiderstand ist also nur $9 V / 18 mA = 500 Ω$ – kleiner als jeder einzelne! Für die Parallelschaltung gilt $1/R_{ges} = 1/R3 + 1/R4$, für zwei Widerstände $R_{ges} = R3 · R4 / (R3 + R4)$.',
        'Each resistor carries $9 V / 1 kΩ = 9 mA$, together **18 mA**. So the total resistance is only $9 V / 18 mA = 500 Ω$ – smaller than either one! For a parallel circuit $1/R_{tot} = 1/R3 + 1/R4$, for two resistors $R_{tot} = R3 · R4 / (R3 + R4)$.',
      ),
    },
    {
      live: true,
      text: t(
        '**Prüfe deine Vorhersage.**\n\nDie Live-Werte zeigen den Strom durch V2. Passt er zu deiner Rechnung?',
        '**Check your prediction.**\n\nThe live values show the current through V2. Does it match your calculation?',
      ),
      check: current('V2', 0.017, 0.019),
      hint: t('Zeigt V2 nur 9 mA, ist R4 noch nicht an beiden Enden angeschlossen.', 'If V2 shows only 9 mA, R4 is not yet connected at both ends.'),
      explain: t(
        'Die Simulation bestätigt es: V2 liefert 18 mA, durch R3 und R4 fließen je 9 mA. Das ist die **Knotenregel** (1. kirchhoffsches Gesetz): Was in einen Knoten hineinfließt, fließt auch wieder heraus, $I_{ges} = I_3 + I_4$.',
        'The simulation confirms it: V2 supplies 18 mA, R3 and R4 carry 9 mA each. This is the **junction rule** (Kirchhoff\'s current law): whatever flows into a node flows out again, $I_{tot} = I_3 + I_4$.',
      ),
    },
    {
      text: t('**Noch ein Widerstand parallel.**', '**One more resistor in parallel.**'),
      check: quiz(
        t('Was passiert mit dem Gesamtwiderstand, wenn du einen dritten Widerstand mit 1 kΩ parallel schaltest?', 'What happens to the total resistance if you add a third 1 kΩ resistor in parallel?'),
        [
          t('Er steigt auf 3 kΩ.', 'It rises to 3 kΩ.'),
          t('Er bleibt bei 500 Ω.', 'It stays at 500 Ω.'),
          t('Er sinkt auf 0 Ω.', 'It drops to 0 Ω.'),
          t('Er sinkt auf etwa 333 Ω.', 'It drops to about 333 Ω.'),
        ],
        3,
      ),
      explain: t(
        'Jeder weitere Zweig ist ein zusätzlicher Weg für den Strom: Der Gesamtstrom steigt auf 27 mA, der Gesamtwiderstand sinkt auf $1 kΩ / 3 ≈ 333 Ω$. Merke: **In Reihe wächst der Widerstand, parallel sinkt er.** Übrigens sind auch die Steckdosen im Haus alle parallel an 230 V angeschlossen.',
        'Every extra branch is one more path for the current: the total current rises to 27 mA, the total resistance drops to $1 kΩ / 3 ≈ 333 Ω$. Remember: **in series the resistance grows, in parallel it shrinks.** By the way, all the sockets in a house are connected in parallel to the mains.',
      ),
    },
  ],
  solve: (doc, library) =>
    extend(doc, library, (b, find) => {
      const r4 = find('R4');
      const p1 = b.pin(r4, 1);
      const p2 = b.pin(r4, 2);
      b.wire(p1, { x: p1.x, y: SP.top }, { x: SP.r3, y: SP.top });
      b.wire(p2, { x: p2.x, y: SP.bottom }, { x: SP.r3, y: SP.bottom });
    }),
};

// ---- 4. the voltage divider -----------------------------------------------------------------------

const voltageDividerTitle = t('Der Spannungsteiler', 'The voltage divider');

export const voltageDivider: LessonDef = {
  id: 'voltage-divider',
  topic: 'basics',
  level: 1,
  minutes: 10,
  title: voltageDividerTitle,
  summary: t(
    'Zwei Widerstände teilen eine Spannung: Mach aus 9 V genau 3 V – und sieh, was eine Last daraus macht.',
    'Two resistors divide a voltage: turn 9 V into exactly 3 V – and see what a load does to it.',
  ),
  start: (library, lang) => {
    const b = new CircuitBuilder(library);
    heading(b, lang, voltageDividerTitle, t('Wähle R2 so, dass am Mittelpunkt U_aus genau 3 V anliegen.', 'Choose R2 so that the middle point U_out is at exactly 3 V.'));
    const top = 160;
    const bottom = 560;
    const v1 = battery(b, 'V1', { x: 96, y: 320 }, 9);
    const r1 = resistorV(b, 'R1', { x: 320, y: 192 }, '10k');
    const r2 = resistorV(b, 'R2', { x: 320, y: 400 }, '10k');
    const s1 = b.add('elektor-EIN-Schalter-klein', 'S1', { x: 512, y: 368 }, { pin: 1, props: { closed: 'false' } });
    const rl = resistorV(b, 'RL', { x: 512, y: 464 }, '10k');
    b.wire(b.pin(v1, '+'), { x: 96, y: top }, { x: 320, y: top }, b.pin(r1, 1));
    b.wire(b.pin(r1, 2), b.pin(r2, 1));
    b.wire({ x: 320, y: 336 }, { x: 512, y: 336 }, b.pin(s1, 1));
    b.wire(b.pin(s1, 2), b.pin(rl, 1));
    b.wire(b.pin(v1, '-'), { x: 96, y: bottom }, b.pin(rl, 2));
    b.wire(b.pin(r2, 2), { x: 320, y: bottom });
    b.ground({ x: 96, y: bottom });
    b.text(352, 328, lang === 'de' ? 'U_aus' : 'U_out', 12, true);
    b.text(560, 528, lang === 'de' ? 'Last' : 'load', 12);
    return b.doc();
  },
  steps: [
    {
      live: true,
      text: t(
        '**Zwei gleiche Widerstände.**\n\nR1 und R2 haben je 10 kΩ und liegen in Reihe an 9 V. Die Last RL ist über den offenen Schalter S1 noch abgetrennt.',
        '**Two equal resistors.**\n\nR1 and R2 are 10 kΩ each, connected in series to 9 V. The load RL is still disconnected by the open switch S1.',
      ),
      check: quiz(
        t('Welche Spannung erwartest du am Mittelpunkt $U_{aus}$ (gegen Masse)?', 'Which voltage do you expect at the middle point $U_{out}$ (against ground)?'),
        [t('9 V', '9 V'), t('4,5 V', '4.5 V'), t('3 V', '3 V'), t('0 V', '0 V')],
        1,
      ),
      explain: t(
        'Durch beide Widerstände fließt derselbe Strom $I = 9 V / 20 kΩ = 0,45 mA$, an jedem fallen also $U = R · I = 4,5 V$ ab. Allgemein gilt die **Spannungsteiler-Formel** $U_{aus} = U · R2 / (R1 + R2)$.',
        'The same current $I = 9 V / 20 kΩ = 0.45 mA$ flows through both resistors, so each one takes $U = R · I = 4.5 V$. In general the **voltage divider formula** is $U_{out} = U · R2 / (R1 + R2)$.',
      ),
    },
    {
      live: true,
      text: t(
        '**Mach aus 9 V genau 3 V.**\n\nÄndere R2 so, dass am Mittelpunkt 3 V anliegen (2,9 V bis 3,1 V). R1 bleibt bei 10 kΩ.',
        '**Turn 9 V into exactly 3 V.**\n\nChange R2 so that the middle point is at 3 V (2.9 V to 3.1 V). R1 stays at 10 kΩ.',
      ),
      check: voltage(['R2', 1], 2.9, 3.1),
      hint: t(
        '3 V sind ein Drittel von 9 V. Also muss R2 ein Drittel des Gesamtwiderstands ausmachen – halb so groß wie R1.',
        '3 V is a third of 9 V. So R2 has to be a third of the total resistance – half as large as R1.',
      ),
      explain: t(
        '$U_{aus} = 9 V · 5 kΩ / (10 kΩ + 5 kΩ) = 3 V$. Es kommt nur auf das **Verhältnis** der Widerstände an (solange am Ausgang nichts angeschlossen ist). 5 kΩ gibt es nicht in der E12-Reihe; 5,1 kΩ aus der E24-Reihe ergibt 3,04 V.',
        '$U_{out} = 9 V · 5 kΩ / (10 kΩ + 5 kΩ) = 3 V$. Only the **ratio** of the resistors matters (as long as nothing is connected to the output). 5 kΩ is not in the E12 series; 5.1 kΩ from the E24 series gives 3.04 V.',
      ),
    },
    {
      live: true,
      text: t(
        '**Schließe eine Last an.**\n\nRL (10 kΩ) steht für ein Gerät, das du mit den 3 V versorgen willst. Klicke auf S1, um es anzuschließen, und beobachte $U_{aus}$.',
        '**Connect a load.**\n\nRL (10 kΩ) stands for a device you want to supply with the 3 V. Click S1 to connect it and watch $U_{out}$.',
      ),
      check: property('S1', 'closed', 'true'),
      hint: t('Ein Klick auf das Schaltersymbol S1 schaltet es um, solange die Live-Werte an sind.', 'A click on the switch symbol S1 toggles it while live values are on.'),
    },
    {
      live: true,
      text: t('**Was macht die Last?**\n\nSieh dir $U_{aus}$ mit geschlossenem S1 an.', '**What does the load do?**\n\nLook at $U_{out}$ with S1 closed.'),
      check: quiz(
        t('Was ist mit $U_{aus}$ passiert?', 'What happened to $U_{out}$?'),
        [
          t('Nichts – ein Spannungsteiler liefert immer 3 V.', 'Nothing – a voltage divider always delivers 3 V.'),
          t('Sie ist auf etwa 2,25 V gesunken.', 'It dropped to about 2.25 V.'),
          t('Sie ist auf 4,5 V gestiegen.', 'It rose to 4.5 V.'),
          t('Sie ist auf 0 V gefallen.', 'It fell to 0 V.'),
        ],
        1,
      ),
      explain: t(
        'RL liegt **parallel** zu R2. Zusammen ergeben sie nur noch $5 kΩ · 10 kΩ / (5 kΩ + 10 kΩ) ≈ 3,3 kΩ$ – das Verhältnis stimmt nicht mehr, $U_{aus}$ sinkt auf etwa 2,25 V. Ein Spannungsteiler ist nur dann genau, wenn der Laststrom klein gegen den **Querstrom** durch R1 und R2 ist.',
        'RL is **in parallel** with R2. Together they make only $5 kΩ · 10 kΩ / (5 kΩ + 10 kΩ) ≈ 3.3 kΩ$ – the ratio is off and $U_{out}$ drops to about 2.25 V. A voltage divider is only accurate if the load current is small compared with the **cross current** through R1 and R2.',
      ),
    },
    {
      live: true,
      text: t(
        '**Mach den Teiler belastbarer.**\n\nSetze R1 auf 1 kΩ und wähle R2 so, dass $U_{aus}$ **mit** angeschlossener Last zwischen 2,75 V und 3,15 V liegt.',
        '**Make the divider stiffer.**\n\nSet R1 to 1 kΩ and choose R2 so that $U_{out}$ is between 2.75 V and 3.15 V **with** the load connected.',
      ),
      check: all(property('S1', 'closed', 'true'), value('R1', 900, 1100), voltage(['R2', 1], 2.75, 3.15)),
      hint: t('Mit R1 = 1 kΩ passt R2 = 470 Ω oder 510 Ω. S1 bleibt geschlossen.', 'With R1 = 1 kΩ, R2 = 470 Ω or 510 Ω works. Keep S1 closed.'),
      explain: t(
        'Jetzt fließen etwa 6 mA Querstrom, aber nur 0,3 mA durch die Last – sie verschiebt das Verhältnis kaum, $U_{aus} ≈ 2,9 V$. Faustregel: **Der Querstrom sollte mindestens zehnmal so groß sein wie der Laststrom.** Der Preis ist ein höherer Stromverbrauch. Für eine wirklich stabile Spannung nimmt man eine Z-Diode oder einen Spannungsregler.',
        'Now about 6 mA of cross current flow, but only 0.3 mA through the load – it hardly shifts the ratio, $U_{out} ≈ 2.9 V$. Rule of thumb: **the cross current should be at least ten times the load current.** The price is a higher current consumption. For a really stable voltage you use a Zener diode or a voltage regulator.',
      ),
    },
  ],
  solve: (doc) => change(doc, { R1: { value: '1k' }, R2: { value: '510' }, S1: { props: { closed: 'true' } } }),
};

// ---- 5. the potentiometer ----------------------------------------------------------------------------

const potentiometerTitle = t('Das Potentiometer', 'The potentiometer');

export const potentiometer: LessonDef = {
  id: 'potentiometer',
  topic: 'basics',
  level: 1,
  minutes: 7,
  title: potentiometerTitle,
  summary: t(
    'Ein verstellbarer Spannungsteiler dimmt eine LED: Zieh am Schleifer und stelle den Strom ein.',
    'An adjustable voltage divider dims an LED: drag the wiper and set the current.',
  ),
  start: (library, lang) => {
    const b = new CircuitBuilder(library);
    heading(b, lang, potentiometerTitle, t('Zieh im Live-Modus am Schleifer von P1 und dimme die LED D1.', 'In live mode, drag the wiper of P1 and dim the LED D1.'));
    const top = 160;
    const bottom = 448;
    const v1 = battery(b, 'V1', { x: 96, y: 256 }, 9);
    // pin 3 on top (+9 V), pin 1 at the bottom (ground), wiper (pin 2) leaving to the right
    const p1 = place(b, 'Pot', 'P1', { x: 288, y: 224 }, { pin: 3, rotation: 90, mirrorH: true, value: '1k', props: { wiper: '0.1' } });
    const r1 = resistorH(b, 'R1', { x: 384, y: 224 }, '330');
    const d1 = ledV(b, 'D1', { x: 544, y: 256 });
    b.wire(b.pin(v1, '+'), { x: 96, y: top }, { x: 288, y: top }, b.pin(p1, 3));
    b.wire(b.pin(p1, 2), b.pin(r1, 1));
    b.wire(b.pin(r1, 2), { x: 544, y: 224 }, b.pin(d1, 'A'));
    b.wire(b.pin(d1, 'K'), { x: 544, y: bottom }, { x: 96, y: bottom }, b.pin(v1, '-'));
    b.wire(b.pin(p1, 1), { x: 288, y: bottom });
    b.ground({ x: 96, y: bottom });
    return b.doc();
  },
  steps: [
    {
      live: true,
      text: t(
        '**Schalte die LED mit dem Poti ein.**\n\nIm Live-Modus erscheint neben P1 ein Schieberegler. Zieh den Knopf langsam nach oben, bis die LED leuchtet (über 1 mA).',
        '**Turn the LED on with the pot.**\n\nIn live mode a slider appears next to P1. Slowly drag its knob upwards until the LED lights up (more than 1 mA).',
      ),
      check: current('D1', 0.001, 0.03),
      hint: t(
        'Der Regler läuft neben dem Poti-Körper. Ganz unten (Pin 1) liegt der Schleifer an Masse, ganz oben (Pin 3) an +9 V.',
        'The slider runs alongside the pot body. At the bottom (pin 1) the wiper is at ground, at the top (pin 3) at +9 V.',
      ),
      explain: t(
        'Ein **Potentiometer** (kurz Poti) ist ein Widerstand mit einem beweglichen Abgriff, dem **Schleifer**. Er teilt den Widerstand in zwei Teile – wie R1 und R2 beim Spannungsteiler. Je weiter oben der Schleifer steht, desto höher ist seine Spannung.',
        'A **potentiometer** (pot for short) is a resistor with a movable tap, the **wiper**. It splits the resistance into two parts – like R1 and R2 in the voltage divider. The higher the wiper, the higher its voltage.',
      ),
    },
    {
      live: true,
      text: t(
        '**Stelle einen LED-Strom zwischen 5 mA und 8 mA ein.**\n\nVerschiebe den Schleifer, bis der Strom durch D1 in diesem Bereich liegt.',
        '**Set an LED current between 5 mA and 8 mA.**\n\nMove the wiper until the current through D1 is in this range.',
      ),
      check: current('D1', 0.005, 0.008),
      hint: t('Der passende Bereich liegt etwas oberhalb der Mitte. Den Strom durch D1 zeigen die Live-Werte.', 'The right range is a little above the middle. The live values show the current through D1.'),
      explain: t(
        'Die LED leuchtet erst, wenn die Spannung am Schleifer über ihre Durchlassspannung steigt (rot etwa 1,9 V). Darüber wächst der Strom gleichmäßig mit: R1 setzt die Spannung, die über die Durchlassspannung hinausgeht, in Strom um: $I = (U_{Schleifer} − U_F) / R1$.',
        'The LED only lights up once the wiper voltage rises above its forward voltage (red: about 1.9 V). Above that the current grows steadily: R1 turns the voltage beyond the forward voltage into current: $I = (U_{wiper} − U_F) / R1$.',
      ),
    },
    {
      live: true,
      text: t('**Der belastete Schleifer.**', '**The loaded wiper.**'),
      check: quiz(
        t(
          'Steht der Schleifer genau in der Mitte, liegen an ihm nicht 4,5 V, sondern nur etwa 3,4 V. Warum?',
          'With the wiper exactly in the middle it is not at 4.5 V but only at about 3.4 V. Why?',
        ),
        [
          t('Weil das Poti kaputt ist.', 'Because the pot is broken.'),
          t('Weil der LED-Zweig parallel zum unteren Teil des Potis liegt und ihn belastet.', 'Because the LED branch is in parallel with the lower part of the pot and loads it.'),
          t('Weil die Batterie leer wird.', 'Because the battery is running down.'),
          t('Weil der Strom immer den kürzesten Weg nimmt.', 'Because current always takes the shortest path.'),
        ],
        1,
      ),
      explain: t(
        'R1 und D1 liegen parallel zum unteren Teil des Potis – genau wie die Last RL beim Spannungsteiler. Deshalb sinkt die Schleiferspannung. Ein Poti mit kleinerem Widerstand wäre belastbarer, verbraucht aber mehr Strom.',
        'R1 and D1 are in parallel with the lower part of the pot – just like the load RL in the voltage divider. That is why the wiper voltage drops. A pot with a lower resistance would be stiffer but would draw more current.',
      ),
    },
    {
      text: t('**Warum trotzdem R1?**', '**Why R1 anyway?**'),
      check: quiz(
        t('Warum braucht die LED trotz Poti den Vorwiderstand R1?', 'Why does the LED still need the series resistor R1 with the pot?'),
        [
          t('Ganz oben läge die volle Batteriespannung an der LED – ohne R1 flösse viel zu viel Strom.', 'At the top the full battery voltage would reach the LED – without R1 far too much current would flow.'),
          t('Damit das Poti nicht warm wird.', 'So that the pot does not get warm.'),
          t('Damit die LED in beide Richtungen leuchtet.', 'So that the LED lights up in both directions.'),
          t('R1 ist eigentlich überflüssig.', 'R1 is actually unnecessary.'),
        ],
        0,
      ),
      explain: t(
        'Am oberen Anschlag ist der Schleifer direkt mit +9 V verbunden. Ohne R1 würde nichts den Strom begrenzen und die LED wäre sofort hinüber. Mit R1 fließen höchstens $(9 V − 2 V) / 330 Ω ≈ 21 mA$.',
        'At the top end the wiper is connected straight to +9 V. Without R1 nothing would limit the current and the LED would be gone in an instant. With R1 at most $(9 V − 2 V) / 330 Ω ≈ 21 mA$ flow.',
      ),
    },
  ],
  solve: (doc) => change(doc, { P1: { props: { wiper: '0.62' } } }),
};

export const BASICS: LessonDef[] = [firstCircuit, ohmsLaw, seriesParallel, voltageDivider, potentiometer];
