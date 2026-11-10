// Lessons on semiconductors: the diode, the LED series resistor, Zener
// stabilisation and the transistor as a switch.

import { CircuitBuilder } from '../build.ts';
import {
  all,
  battery,
  between,
  change,
  connected,
  current,
  extend,
  heading,
  ledV,
  notConnected,
  property,
  quiz,
  resistorH,
  resistorV,
  t,
  value,
  voltage,
  type LessonDef,
} from './kit.ts';

// ---- 6. the diode ------------------------------------------------------------------------------------

const diodeTitle = t('Die Diode: ein Ventil für Strom', 'The diode: a valve for current');

export const diode: LessonDef = {
  id: 'diode',
  topic: 'semiconductors',
  level: 1,
  minutes: 7,
  title: diodeTitle,
  summary: t(
    'Eine Diode lässt Strom nur in eine Richtung durch. Dreh sie um und sieh, was passiert.',
    'A diode lets current pass in one direction only. Turn it around and see what happens.',
  ),
  start: (library, lang) => {
    const b = new CircuitBuilder(library);
    heading(b, lang, diodeTitle, t('Beobachte die LED D2, dann dreh die Diode D1 um.', 'Watch the LED D2, then turn the diode D1 around.'));
    const top = 160;
    const bottom = 320;
    const v1 = battery(b, 'V1', { x: 96, y: 208 }, 9);
    const r1 = resistorH(b, 'R1', { x: 160, y: top }, '1k');
    // silicon diode with its 1N4148 model; unlike the plain "Diode" symbol it shows designator and value
    const d1 = b.add('elektor-DUS.xml', 'D1', { x: 304, y: top }, { pin: 1, value: '1N4148' });
    const d2 = ledV(b, 'D2', { x: 448, y: 192 });
    b.wire(b.pin(v1, '+'), { x: 96, y: top }, b.pin(r1, 1));
    b.wire(b.pin(r1, 2), b.pin(d1, 'A'));
    b.wire(b.pin(d1, 'K'), { x: 448, y: top }, b.pin(d2, 'A'));
    b.wire(b.pin(d2, 'K'), { x: 448, y: bottom }, { x: 96, y: bottom }, b.pin(v1, '-'));
    b.ground({ x: 96, y: bottom });
    return b.doc();
  },
  steps: [
    {
      live: true,
      text: t(
        '**Die Diode in Durchlassrichtung.**\n\nDas Dreieck von D1 zeigt in Stromrichtung: Die Anode (A) liegt Richtung +, die Kathode (K, der Strich) Richtung −. Die LED D2 leuchtet. Vergleiche in den Live-Werten die Spannungen links und rechts von D1.',
        '**The diode in forward direction.**\n\nThe triangle of D1 points in the direction of the current: the anode (A) faces +, the cathode (K, the bar) faces −. The LED D2 is lit. Compare the live voltages left and right of D1.',
      ),
      check: quiz(
        t('Wie viel Spannung fällt an der leitenden Diode D1 ab?', 'How much voltage drops across the conducting diode D1?'),
        [
          t('0 V – sie leitet ja.', '0 V – it is conducting, after all.'),
          t('etwa 0,7 V', 'about 0.7 V'),
          t('etwa 1,9 V', 'about 1.9 V'),
          t('die vollen 9 V', 'the full 9 V'),
        ],
        1,
      ),
      hint: t('Links von D1 liegen etwa 2,6 V, rechts etwa 1,9 V. Die Differenz fällt an D1 ab.', 'Left of D1 there are about 2.6 V, right of it about 1.9 V. The difference drops across D1.'),
      explain: t(
        'Eine Silizium-Diode wie die 1N4148 braucht in Durchlassrichtung etwa **0,6 V bis 0,7 V**, bevor nennenswert Strom fließt: die **Durchlassspannung** $U_F$. Danach steigt der Strom steil an, die Spannung bleibt fast gleich. Auch LEDs sind Dioden, nur mit höherer Durchlassspannung (rot etwa 1,9 V).',
        'A silicon diode like the 1N4148 needs about **0.6 V to 0.7 V** in forward direction before any noticeable current flows: the **forward voltage** $U_F$. Beyond that the current rises steeply while the voltage hardly changes. LEDs are diodes too, just with a higher forward voltage (red: about 1.9 V).',
      ),
    },
    {
      text: t(
        '**Dreh die Diode um.**\n\nWähle D1 aus und spiegle sie, sodass die Kathode (der Strich) zu R1 zeigt.',
        '**Turn the diode around.**\n\nSelect D1 and flip it so that the cathode (the bar) faces R1.',
      ),
      check: all(connected('D1', 'K', 'R1', 2), connected('D1', 'A', 'D2', 'A')),
      hint: t(
        'Klick D1 an und drück X (horizontal spiegeln) – zweimal R (drehen) geht auch. Beide Anschlüsse müssen danach weiter an ihren Leitungen hängen.',
        'Click D1 and press X (flip horizontally) – pressing R (rotate) twice works too. Both pins must still touch their wires afterwards.',
      ),
      explain: t(
        'Jetzt zeigt die Kathode zum Pluspol und die Anode zum Minuspol: Die Diode ist in **Sperrrichtung** gepolt.',
        'Now the cathode faces the positive terminal and the anode the negative one: the diode is **reverse biased**.',
      ),
    },
    {
      live: true,
      text: t(
        '**Beobachte den Strom.**\n\nSieh dir in den Live-Werten den Strom durch D1 und die LED an.',
        '**Watch the current.**\n\nLook at the live current through D1 and the LED.',
      ),
      check: current('D1', 0, 1e-6),
      explain: t(
        'Es fließt praktisch kein Strom mehr – nur ein winziger **Sperrstrom** von wenigen Nanoampere. Die LED bleibt dunkel. Die Diode wirkt wie ein **Rückschlagventil**: Strom fließt nur von der Anode zur Kathode.',
        'Practically no current flows any more – only a tiny **reverse current** of a few nanoamperes. The LED stays dark. The diode works like a **check valve**: current only flows from the anode to the cathode.',
      ),
    },
    {
      live: true,
      text: t('**Wo ist die Spannung geblieben?**', '**Where did the voltage go?**'),
      check: quiz(
        t('Wo liegen jetzt die 9 V der Batterie?', 'Where are the 9 V of the battery now?'),
        [
          t('am Widerstand R1', 'across the resistor R1'),
          t('an der LED D2', 'across the LED D2'),
          t('zum größten Teil an der sperrenden Diode D1', 'mostly across the blocking diode D1'),
          t('nirgends – ohne Strom gibt es keine Spannung', 'nowhere – without current there is no voltage'),
        ],
        2,
      ),
      explain: t(
        'Ohne Strom fällt an R1 keine Spannung ab ($U = R · I = 0$). Fast die ganze Batteriespannung liegt an der Diode in Sperrrichtung, in der Simulation knapp 8 V; den Rest hält die LED, die ja auch kaum Strom bekommt. Jede Diode verträgt nur eine bestimmte **Sperrspannung** (1N4148: 100 V) – darüber bricht sie durch.',
        'Without current there is no voltage across R1 ($U = R · I = 0$). Almost the whole battery voltage sits across the reverse biased diode, just under 8 V in the simulation; the LED, which hardly gets any current either, holds the rest. Every diode withstands only a certain **reverse voltage** (1N4148: 100 V) – beyond that it breaks down.',
      ),
    },
    {
      text: t('**Wozu ist das gut?**', '**What is it good for?**'),
      check: quiz(
        t('Wofür ist eine Diode in Reihe zur Batterie nützlich?', 'What is a diode in series with the battery useful for?'),
        [
          t('Als Verpolungsschutz: Bei falsch angeschlossener Batterie fließt kein Strom.', 'As reverse polarity protection: with the battery connected the wrong way no current flows.'),
          t('Um die Spannung zu verdoppeln.', 'To double the voltage.'),
          t('Um die Batterie schneller zu laden.', 'To charge the battery faster.'),
          t('Um Wechselstrom zu erzeugen.', 'To generate alternating current.'),
        ],
        0,
      ),
      explain: t(
        'Genau: Eine Diode in der Zuleitung schützt eine Schaltung vor falsch gepolter Spannung (**Verpolungsschutz**) – sie kostet dafür etwa 0,7 V. Weitere typische Aufgaben: Wechselspannung gleichrichten und als Freilaufdiode Relais oder Motoren schützen.',
        'Exactly: a diode in the supply line protects a circuit against reversed polarity (**reverse polarity protection**) – at the cost of about 0.7 V. Other typical jobs: rectifying AC and protecting relays or motors as a flyback diode.',
      ),
    },
  ],
  solve: (doc) => change(doc, { D1: { mirrorH: true } }),
};

// ---- 7. the LED series resistor --------------------------------------------------------------------

const ledResistorTitle = t('Den LED-Vorwiderstand berechnen', 'Calculating the LED series resistor');

export const ledResistor: LessonDef = {
  id: 'led-resistor',
  topic: 'semiconductors',
  level: 1,
  minutes: 8,
  title: ledResistorTitle,
  summary: t(
    'Eine rote LED an 5 V mit 10 mA: Berechne den Vorwiderstand, wähle einen Normwert und prüfe das Ergebnis.',
    'A red LED on 5 V at 10 mA: calculate the series resistor, pick a standard value and check the result.',
  ),
  start: (library, lang) => {
    const b = new CircuitBuilder(library);
    heading(b, lang, ledResistorTitle, t('Berechne R1 für 10 mA und wähle einen Normwert.', 'Calculate R1 for 10 mA and choose a standard value.'));
    const top = 160;
    const bottom = 320;
    const v1 = battery(b, 'V1', { x: 96, y: 208 }, 5);
    const r1 = resistorH(b, 'R1', { x: 160, y: top }, '100');
    const d1 = ledV(b, 'D1', { x: 352, y: 192 });
    b.wire(b.pin(v1, '+'), { x: 96, y: top }, b.pin(r1, 1));
    b.wire(b.pin(r1, 2), { x: 352, y: top }, b.pin(d1, 'A'));
    b.wire(b.pin(d1, 'K'), { x: 352, y: bottom }, { x: 96, y: bottom }, b.pin(v1, '-'));
    b.ground({ x: 96, y: bottom });
    return b.doc();
  },
  steps: [
    {
      live: true,
      text: t(
        '**Zu viel Strom?**\n\nR1 hat nur 100 Ω. Sieh dir in den Live-Werten den Strom durch die LED D1 an. Eine Standard-LED verträgt dauerhaft höchstens etwa 20 mA.',
        '**Too much current?**\n\nR1 is only 100 Ω. Look at the live current through the LED D1. A standard LED handles at most about 20 mA continuously.',
      ),
      check: quiz(
        t('Wie beurteilst du den Strom?', 'How do you rate the current?'),
        [
          t('Etwa 10 mA – genau richtig.', 'About 10 mA – just right.'),
          t('Etwa 30 mA – zu viel, die LED altert schnell oder geht kaputt.', 'About 30 mA – too much, the LED ages quickly or fails.'),
          t('0 mA – die LED ist falsch herum eingebaut.', '0 mA – the LED is the wrong way round.'),
          t('Etwa 50 A – die Batterie explodiert gleich.', 'About 50 A – the battery is about to explode.'),
        ],
        1,
      ),
      explain: t(
        '$I = (5 V − 2 V) / 100 Ω ≈ 30 mA$ – deutlich mehr als die 20 mA, für die die LED gebaut ist. Sie leuchtet sehr hell, wird aber heiß und altert schnell.',
        '$I = (5 V − 2 V) / 100 Ω ≈ 30 mA$ – well above the 20 mA the LED is made for. It shines very brightly but gets hot and ages quickly.',
      ),
    },
    {
      text: t(
        '**Berechne den Vorwiderstand.**\n\nDie rote LED hat eine Durchlassspannung von $U_F ≈ 1,9 V$ und soll mit $I = 10 mA$ leuchten. Am Widerstand muss der Rest der Batteriespannung abfallen.',
        '**Calculate the series resistor.**\n\nThe red LED has a forward voltage of $U_F ≈ 1.9 V$ and should run at $I = 10 mA$. The resistor has to take the rest of the battery voltage.',
      ),
      check: quiz(
        t('Welchen Wert braucht R1?', 'Which value does R1 need?'),
        [t('190 Ω', '190 Ω'), t('310 Ω', '310 Ω'), t('500 Ω', '500 Ω'), t('3,1 kΩ', '3.1 kΩ')],
        1,
      ),
      hint: t('$R = (U − U_F) / I$. Achtung: 10 mA sind 0,01 A.', '$R = (U − U_F) / I$. Careful: 10 mA is 0.01 A.'),
      explain: t(
        '$R = (U − U_F) / I = (5 V − 1,9 V) / 0,01 A = 310 Ω$.\n\nDas ist die wichtigste Formel für LEDs: Der Widerstand nimmt die Differenz zwischen Versorgungsspannung und LED-Spannung auf und legt damit den Strom fest.',
        '$R = (U − U_F) / I = (5 V − 1.9 V) / 0.01 A = 310 Ω$.\n\nThis is the most important formula for LEDs: the resistor takes the difference between the supply voltage and the LED voltage and so sets the current.',
      ),
    },
    {
      text: t(
        '**Wähle einen Normwert.**\n\n310 Ω kann man nicht kaufen. Nimm den passenden Wert aus der E12-Reihe und trage ihn bei R1 ein.',
        '**Choose a standard value.**\n\nYou cannot buy 310 Ω. Take the matching value from the E12 series and enter it for R1.',
      ),
      check: value('R1', 300, 360),
      hint: t(
        'Die E12-Werte um 310 Ω: 270 Ω – 330 Ω – 390 Ω. Nimm im Zweifel den **nächstgrößeren** Wert, dann wird der Strom etwas kleiner statt größer.',
        'The E12 values around 310 Ω: 270 Ω – 330 Ω – 390 Ω. When in doubt take the **next larger** value, so the current gets a little smaller rather than larger.',
      ),
      explain: t(
        '330 Ω ist der passende Normwert. Widerstände gibt es in **Normreihen**: E12 hat zwölf Werte pro Dekade (1,0 – 1,2 – 1,5 – 1,8 – 2,2 – 2,7 – 3,3 – 3,9 – 4,7 – 5,6 – 6,8 – 8,2), jeweils mal 1, 10, 100 … Ω.',
        '330 Ω is the matching standard value. Resistors come in **preferred series**: E12 has twelve values per decade (1.0 – 1.2 – 1.5 – 1.8 – 2.2 – 2.7 – 3.3 – 3.9 – 4.7 – 5.6 – 6.8 – 8.2), each times 1, 10, 100 … Ω.',
      ),
    },
    {
      live: true,
      text: t(
        '**Prüfe den Strom.**\n\nMit dem Normwert fließen nicht mehr genau 10 mA. Sieh in den Live-Werten nach – der Strom sollte zwischen 8 mA und 11 mA liegen.',
        '**Check the current.**\n\nWith the standard value it is no longer exactly 10 mA. Look at the live values – the current should be between 8 mA and 11 mA.',
      ),
      check: current('D1', 0.008, 0.011),
      explain: t(
        '$I = (5 V − 1,9 V) / 330 Ω ≈ 9,4 mA$ – nah genug an 10 mA. Den Unterschied siehst du an der Helligkeit kaum, denn das Auge empfindet Helligkeit ungefähr logarithmisch.',
        '$I = (5 V − 1.9 V) / 330 Ω ≈ 9.4 mA$ – close enough to 10 mA. You can hardly see the difference in brightness, because the eye perceives brightness roughly logarithmically.',
      ),
    },
    {
      text: t('**Wie warm wird R1?**', '**How warm does R1 get?**'),
      check: quiz(
        t('Welche Leistung setzt R1 in Wärme um?', 'How much power does R1 turn into heat?'),
        [t('etwa 0,3 mW', 'about 0.3 mW'), t('etwa 3 W', 'about 3 W'), t('etwa 29 mW', 'about 29 mW'), t('etwa 0,5 W', 'about 0.5 W')],
        2,
      ),
      hint: t('An R1 liegen etwa 3,1 V, es fließen etwa 9,4 mA. $P = U · I$.', 'R1 sees about 3.1 V and carries about 9.4 mA. $P = U · I$.'),
      explain: t(
        '$P = U_R · I = 3,1 V · 9,4 mA ≈ 29 mW$. Ein üblicher Widerstand mit 0,25 W (1/4 W) reicht also locker. Bei größeren Strömen oder Spannungen solltest du die Leistung aber immer nachrechnen.',
        '$P = U_R · I = 3.1 V · 9.4 mA ≈ 29 mW$. An ordinary 0.25 W (1/4 W) resistor is plenty. With larger currents or voltages you should always check the power, though.',
      ),
    },
  ],
  solve: (doc) => change(doc, { R1: { value: '330' } }),
};

// ---- 8. the Zener diode ---------------------------------------------------------------------------------

const zenerTitle = t('Spannung stabilisieren mit der Z-Diode', 'Stabilising a voltage with a Zener diode');

export const zener: LessonDef = {
  id: 'zener',
  topic: 'semiconductors',
  level: 2,
  minutes: 10,
  title: zenerTitle,
  summary: t(
    'Eine Z-Diode hält die Spannung konstant: Aus 12 V werden stabile 5,6 V – auch wenn die Batterie nachlässt.',
    'A Zener diode keeps the voltage constant: 12 V become a stable 5.6 V – even when the battery runs down.',
  ),
  start: (library, lang) => {
    const b = new CircuitBuilder(library);
    heading(b, lang, zenerTitle, t('Wähle R1 so, dass am Ausgang U_aus stabile 5,6 V anliegen.', 'Choose R1 so that the output U_out is a stable 5.6 V.'));
    const top = 160;
    const bottom = 352;
    const v1 = battery(b, 'V1', { x: 96, y: 224 }, 12);
    const r1 = resistorH(b, 'R1', { x: 160, y: top }, '2.2k');
    // cathode on top: the Zener diode works in reverse direction
    const d1 = b.add('ZD# Z-Diode', 'D1', { x: 320, y: 208 }, { pin: 2, rotation: 270, value: '5V6' });
    const rl = resistorV(b, 'RL', { x: 448, y: 208 }, '1k');
    b.wire(b.pin(v1, '+'), { x: 96, y: top }, b.pin(r1, 1));
    b.wire(b.pin(r1, 2), { x: 448, y: top }, b.pin(rl, 1));
    b.wire({ x: 320, y: top }, b.pin(d1, 'K'));
    b.wire(b.pin(d1, 'A'), { x: 320, y: bottom });
    b.wire(b.pin(rl, 2), { x: 448, y: bottom }, { x: 96, y: bottom }, b.pin(v1, '-'));
    b.ground({ x: 96, y: bottom });
    b.text(368, 152, lang === 'de' ? 'U_aus' : 'U_out', 12, true);
    return b.doc();
  },
  steps: [
    {
      live: true,
      text: t(
        '**Die Schaltung.**\n\nDie Z-Diode D1 ist in **Sperrrichtung** eingebaut: Kathode nach oben, Richtung +. RL (1 kΩ) ist der Verbraucher. Sieh dir die Ausgangsspannung $U_{aus}$ an – sie liegt nur bei etwa 3,75 V.',
        '**The circuit.**\n\nThe Zener diode D1 is connected in **reverse direction**: cathode up, towards +. RL (1 kΩ) is the load. Look at the output voltage $U_{out}$ – it is only about 3.75 V.',
      ),
      check: quiz(
        t('Warum tut die Z-Diode bei 3,75 V nichts?', 'Why does the Zener diode do nothing at 3.75 V?'),
        [
          t('Sie ist falsch herum eingebaut.', 'It is connected the wrong way round.'),
          t('Sie leitet in Sperrrichtung erst ab ihrer Z-Spannung von 5,6 V.', 'In reverse direction it only conducts above its Zener voltage of 5.6 V.'),
          t('Sie braucht Wechselspannung.', 'It needs alternating voltage.'),
          t('Sie ist für 12 V zu klein.', 'It is too small for 12 V.'),
        ],
        1,
      ),
      explain: t(
        'Eine **Z-Diode** wird in Sperrrichtung bei einer genau festgelegten Spannung leitend, der **Z-Spannung** $U_Z$. Darunter sperrt sie. Ohne sie bilden R1 und RL einen Spannungsteiler: $U_{aus} = 12 V · 1 kΩ / (2,2 kΩ + 1 kΩ) = 3,75 V$.',
        'A **Zener diode** starts to conduct in reverse direction at a precisely defined voltage, the **Zener voltage** $U_Z$. Below it, it blocks. Without it, R1 and RL form a voltage divider: $U_{out} = 12 V · 1 kΩ / (2.2 kΩ + 1 kΩ) = 3.75 V$.',
      ),
    },
    {
      live: true,
      text: t(
        '**Wähle R1 passend.**\n\nDurch R1 muss der Laststrom (5,6 mA durch RL) **plus** ein Mindeststrom für die Z-Diode (etwa 5 mA) fließen. Ändere R1 so, dass $U_{aus}$ zwischen 5,3 V und 5,9 V liegt.',
        '**Choose R1.**\n\nR1 has to carry the load current (5.6 mA through RL) **plus** a minimum current for the Zener diode (about 5 mA). Change R1 so that $U_{out}$ is between 5.3 V and 5.9 V.',
      ),
      check: voltage(['RL', 1], 5.3, 5.9),
      hint: t(
        '$R1 = (U − U_Z) / (I_L + I_Z) = (12 V − 5,6 V) / (5,6 mA + 5 mA) ≈ 600 Ω$. Ein etwas kleinerer Normwert wie 470 Ω oder 330 Ω gibt Reserve.',
        '$R1 = (U − U_Z) / (I_L + I_Z) = (12 V − 5.6 V) / (5.6 mA + 5 mA) ≈ 600 Ω$. A slightly smaller standard value like 470 Ω or 330 Ω leaves some margin.',
      ),
      explain: t(
        'Mit z. B. 470 Ω fließen durch R1 $(12 V − 5,6 V) / 470 Ω ≈ 13,6 mA$. Davon nimmt RL 5,6 mA, den Rest (etwa 8 mA) leitet die Z-Diode nach Masse ab. So bleibt $U_{aus}$ bei 5,6 V.',
        'With 470 Ω, for example, R1 carries $(12 V − 5.6 V) / 470 Ω ≈ 13.6 mA$. RL takes 5.6 mA of it, the Zener diode sends the rest (about 8 mA) to ground. That holds $U_{out}$ at 5.6 V.',
      ),
    },
    {
      text: t('**Was erwartest du?**\n\nGleich lässt du die Batterie von 12 V auf 9 V absinken.', '**What do you expect?**\n\nNext you will let the battery drop from 12 V to 9 V.'),
      check: quiz(
        t('Was passiert mit $U_{aus}$, wenn V1 nur noch 9 V liefert?', 'What happens to $U_{out}$ when V1 only supplies 9 V?'),
        [
          t('Sie bleibt fast bei 5,6 V – durch die Z-Diode fließt einfach weniger Strom.', 'It stays at almost 5.6 V – the Zener diode simply carries less current.'),
          t('Sie sinkt im gleichen Verhältnis auf 4,2 V.', 'It drops in proportion to 4.2 V.'),
          t('Sie steigt an.', 'It rises.'),
          t('Die Z-Diode wird zerstört.', 'The Zener diode is destroyed.'),
        ],
        0,
      ),
    },
    {
      live: true,
      text: t(
        '**Lass die Batterie nachlassen.**\n\nStelle bei V1 die Gleichspannung auf 9 V und beobachte $U_{aus}$.',
        '**Let the battery run down.**\n\nSet the DC voltage of V1 to 9 V and watch $U_{out}$.',
      ),
      check: all(voltage(['V1', '+'], 8.9, 9.1), voltage(['RL', 1], 5.3, 5.9)),
      hint: t(
        'V1 anklicken und im Eigenschaften-Panel *Gleichspannung (V)* auf 9 setzen (den Wert-Text am besten auf `9V`). Sinkt $U_{aus}$ unter 5,3 V, ist R1 zu groß: Bei 9 V reicht der Strom dann nicht mehr für Last und Z-Diode.',
        'Click V1 and set *DC voltage (V)* to 9 in the properties panel (best change the value text to `9V` as well). If $U_{out}$ drops below 5.3 V, R1 is too large: at 9 V the current is no longer enough for the load and the Zener diode.',
      ),
      explain: t(
        '$U_{aus}$ bleibt fast unverändert bei 5,6 V, obwohl die Eingangsspannung um 3 V gefallen ist. Die Differenz übernimmt R1; die Z-Diode leitet jetzt nur noch etwa 1,7 mA statt 8 mA ab (bei R1 = 470 Ω). Das ist **Stabilisierung**: Die Z-Diode passt ihren Strom so an, dass die Spannung konstant bleibt.',
        '$U_{out}$ stays at almost 5.6 V although the input dropped by 3 V. R1 takes the difference; the Zener diode now carries only about 1.7 mA instead of 8 mA (with R1 = 470 Ω). That is **stabilisation**: the Zener diode adjusts its current so that the voltage stays constant.',
      ),
    },
    {
      text: t('**Wo ist die Grenze?**', '**Where is the limit?**'),
      check: quiz(
        t(
          'Was passiert, wenn die Eingangsspannung so weit sinkt, dass durch R1 weniger Strom fließt, als RL braucht?',
          'What happens if the input drops so far that R1 carries less current than RL needs?',
        ),
        [
          t('$U_{aus}$ bleibt trotzdem bei 5,6 V.', '$U_{out}$ stays at 5.6 V regardless.'),
          t('Die Ausgangsspannung wird negativ.', 'The output voltage becomes negative.'),
          t('Die Z-Diode sperrt und $U_{aus}$ sinkt mit der Eingangsspannung.', 'The Zener diode blocks and $U_{out}$ falls with the input.'),
          t('Die Z-Diode leitet dann in Durchlassrichtung.', 'The Zener diode then conducts in forward direction.'),
        ],
        2,
      ),
      explain: t(
        'Dann reicht der Strom nicht mehr für die Last, die Z-Diode sperrt und $U_{aus}$ sinkt mit. Mit R1 = 470 Ω passiert das unter etwa $5,6 V + 5,6 mA · 470 Ω ≈ 8,2 V$. Eine Z-Diode stabilisiert also nur in einem bestimmten Bereich und verheizt ständig Energie. Für größere Ströme nimmt man einen **Spannungsregler** wie den 7805.',
        'Then the current is no longer enough for the load, the Zener diode blocks and $U_{out}$ falls along. With R1 = 470 Ω that happens below about $5.6 V + 5.6 mA · 470 Ω ≈ 8.2 V$. So a Zener diode only stabilises within a certain range and constantly wastes energy. For larger currents you use a **voltage regulator** such as the 7805.',
      ),
    },
  ],
  solve: (doc) => change(doc, { R1: { value: '470' }, V1: { value: '9V', props: { dcVoltage: '9' } } }),
};

// ---- 9. the transistor as a switch -------------------------------------------------------------------

/** gap for the base resistor between S1 and the base of Q1 */
const BASE_GAP = { x: 256, y: 448 };

const transistorTitle = t('Der Transistor als Schalter', 'The transistor as a switch');

export const transistorSwitch: LessonDef = {
  id: 'transistor-switch',
  topic: 'semiconductors',
  level: 2,
  minutes: 12,
  title: transistorTitle,
  summary: t(
    'Ein kleiner Basisstrom schaltet einen großen Kollektorstrom: Ein NPN-Transistor schaltet eine LED.',
    'A small base current switches a large collector current: an NPN transistor switches an LED.',
  ),
  start: (library, lang) => {
    const b = new CircuitBuilder(library);
    heading(b, lang, transistorTitle, t('Setze den Basiswiderstand R2 in die Lücke und schalte die LED mit S1.', 'Put the base resistor R2 into the gap and switch the LED with S1.'));
    const top = 128;
    const bottom = 528;
    const v1 = battery(b, 'V1', { x: 96, y: 288 }, 9);
    const s1 = b.add('elektor-EIN-Schalter-klein', 'S1', { x: 224, y: 192 }, { pin: 1, props: { closed: 'false' } });
    const r1 = resistorV(b, 'R1', { x: 448, y: 160 }, '470');
    const d1 = ledV(b, 'D1', { x: 448, y: 288 });
    const q1 = b.add('elektor-npn', 'Q1', { x: 448, y: 400 }, { pin: 1, value: 'BC548' });
    b.wire(b.pin(v1, '+'), { x: 96, y: top }, { x: 448, y: top }, b.pin(r1, 1));
    b.wire({ x: 224, y: top }, b.pin(s1, 1));
    b.wire(b.pin(r1, 2), b.pin(d1, 'A'));
    b.wire(b.pin(d1, 'K'), b.pin(q1, 'C'));
    b.wire(b.pin(q1, 'E'), { x: 448, y: bottom }, { x: 96, y: bottom }, b.pin(v1, '-'));
    b.ground({ x: 96, y: bottom });
    // loose ends left and right of the gap for the base resistor
    b.wire(b.pin(s1, 2), { x: 224, y: BASE_GAP.y }, BASE_GAP);
    b.wire(b.pin(q1, 'B'), { x: BASE_GAP.x + 96, y: BASE_GAP.y });
    b.text(280, 488, 'R2 = ?', 12, true);
    return b.doc();
  },
  steps: [
    {
      text: t(
        '**Setze den Basiswiderstand ein.**\n\nZwischen S1 und der Basis (B) von Q1 fehlt ein Widerstand. Hol dir einen Widerstand „R#“ aus der Bibliothek, setz ihn in die Lücke und gib ihm einen Wert zwischen 4,7 kΩ und 22 kΩ, z. B. 10 kΩ.',
        '**Insert the base resistor.**\n\nA resistor is missing between S1 and the base (B) of Q1. Take a resistor “R#” from the library, put it into the gap and give it a value between 4.7 kΩ and 22 kΩ, e.g. 10 kΩ.',
      ),
      check: all(between('R2', ['S1', 2], ['Q1', 'B']), notConnected('S1', 2, 'Q1', 'B'), value('R2', 4700, 22000)),
      hint: t(
        'Bibliothek → Kategorie *Passive* → „R#“. Die Anschlüsse des Widerstands müssen genau auf den beiden Leitungsenden landen. Er sollte automatisch **R2** heißen – sonst benennst du ihn im Eigenschaften-Panel um.',
        'Library → category *Passive* → “R#”. The resistor\'s pins have to land exactly on the two wire ends. It should be named **R2** automatically – otherwise rename it in the properties panel.',
      ),
      explain: t(
        'Die Basis-Emitter-Strecke eines Transistors verhält sich wie eine Diode: Ab etwa 0,7 V leitet sie. Ohne Widerstand würde ein riesiger Basisstrom fließen und den Transistor zerstören. R2 begrenzt ihn: $I_B = (9 V − 0,7 V) / 10 kΩ ≈ 0,8 mA$.',
        'The base-emitter junction of a transistor behaves like a diode: it conducts from about 0.7 V. Without a resistor a huge base current would flow and destroy the transistor. R2 limits it: $I_B = (9 V − 0.7 V) / 10 kΩ ≈ 0.8 mA$.',
      ),
    },
    {
      live: true,
      text: t('**Schalte S1 ein.**\n\nKlicke im Live-Modus auf den Schalter S1.', '**Turn on S1.**\n\nClick the switch S1 in live mode.'),
      check: property('S1', 'closed', 'true'),
      explain: t(
        'Jetzt fließt ein kleiner Strom über R2 in die Basis und über den Emitter nach Masse. Dieser **Basisstrom** steuert den Transistor auf.',
        'Now a small current flows through R2 into the base and out of the emitter to ground. This **base current** turns the transistor on.',
      ),
    },
    {
      live: true,
      text: t(
        '**Die LED leuchtet.**\n\nPrüfe in den Live-Werten den Strom durch die LED D1. Er sollte über 10 mA liegen.',
        '**The LED lights up.**\n\nCheck the live current through the LED D1. It should be above 10 mA.',
      ),
      check: current('D1', 0.01, 0.03),
      hint: t('Bleibt die LED dunkel, ist R2 nicht richtig angeschlossen oder S1 noch offen.', 'If the LED stays dark, R2 is not connected properly or S1 is still open.'),
      explain: t(
        'Durch die LED fließen etwa 15 mA – rund zwanzigmal so viel wie in die Basis. Ein Transistor **verstärkt** Strom: Der Kollektorstrom kann bis zu $I_C = B · I_B$ betragen (B ist die Stromverstärkung, beim BC548 einige Hundert). Hier begrenzt R1 den Strom, nicht der Transistor.',
        'About 15 mA flow through the LED – roughly twenty times as much as into the base. A transistor **amplifies** current: the collector current can be up to $I_C = B · I_B$ (B is the current gain, a few hundred for the BC548). Here R1 limits the current, not the transistor.',
      ),
    },
    {
      live: true,
      text: t(
        '**Ist der Transistor ganz durchgeschaltet?**\n\nVergleiche die Spannung am Kollektor (C) mit der am Emitter (E). Ein guter Schalter „verbraucht“ fast keine Spannung: $U_{CE}$ sollte unter 0,4 V liegen.',
        '**Is the transistor fully on?**\n\nCompare the voltage at the collector (C) with the one at the emitter (E). A good switch “uses up” hardly any voltage: $U_{CE}$ should be below 0.4 V.',
      ),
      check: voltage(['Q1', 'C'], -0.2, 0.4, ['Q1', 'E']),
      hint: t('Ist $U_{CE}$ größer, ist der Basisstrom zu klein: Verkleinere R2, aber nicht unter 4,7 kΩ.', 'If $U_{CE}$ is larger, the base current is too small: reduce R2, but not below 4.7 kΩ.'),
      explain: t(
        'Mit genügend Basisstrom ist der Transistor **gesättigt**: $U_{CE}$ sinkt fast auf null, er wirkt wie ein geschlossener Schalter und wird kaum warm. Echte Transistoren erreichen dabei etwa 0,05 V bis 0,2 V; dass die Simulation sogar ein paar Millivolt unter null zeigt, ist eine Eigenheit des Modells. Faustregel für Schalter: Basisstrom etwa ein Zehntel bis ein Zwanzigstel des Kollektorstroms.',
        'With enough base current the transistor is **saturated**: $U_{CE}$ drops almost to zero, it acts like a closed switch and hardly warms up. Real transistors get down to about 0.05 V to 0.2 V; that the simulation even shows a few millivolts below zero is a quirk of the model. Rule of thumb for switches: base current about a tenth to a twentieth of the collector current.',
      ),
    },
    {
      text: t('**Wozu der Umweg?**', '**Why the detour?**'),
      check: quiz(
        t('Warum schaltet man die LED über einen Transistor, statt sie direkt mit S1 zu schalten?', 'Why switch the LED through a transistor instead of directly with S1?'),
        [
          t('Weil die LED sonst falsch herum gepolt wäre.', 'Because otherwise the LED would have the wrong polarity.'),
          t('Weil ein Transistor die Batteriespannung erhöht.', 'Because a transistor raises the battery voltage.'),
          t('Weil Schalter keinen Gleichstrom schalten können.', 'Because switches cannot switch direct current.'),
          t('Weil die Steuerung (S1, ein Sensor oder ein Mikrocontroller-Pin) dann nur einen kleinen Strom liefern muss.', 'Because the control (S1, a sensor or a microcontroller pin) then only has to supply a small current.'),
        ],
        3,
      ),
      explain: t(
        'Genau dafür sind Transistorschalter da: Ein Mikrocontroller-Pin liefert vielleicht 10 mA, ein Relais, ein Motor oder ein LED-Streifen braucht viel mehr. Der Transistor schaltet den großen **Laststrom** mit einem kleinen **Steuerstrom**.',
        'That is exactly what transistor switches are for: a microcontroller pin supplies maybe 10 mA, a relay, a motor or an LED strip needs much more. The transistor switches the large **load current** with a small **control current**.',
      ),
    },
  ],
  solve: (doc, library) =>
    change(
      extend(doc, library, (b) => resistorH(b, 'R2', BASE_GAP, '10k')),
      { S1: { props: { closed: 'true' } } },
    ),
};

export const SEMICONDUCTORS: LessonDef[] = [diode, ledResistor, zener, transistorSwitch];
