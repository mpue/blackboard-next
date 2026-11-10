// Component guide ("Bauteil-Lexikon"): explains the kind of component behind a
// selected schematic symbol, in German and English. `componentFor` takes the
// first entry whose match fits, so specific entries (matched by library name)
// come before the general ones (matched by SPICE type).

import type { SymbolItem } from '../model/types.ts';
import { matches } from './checks.ts';
import type { ComponentInfo, L10n } from './types.ts';

const l = (de: string, en: string): L10n => ({ de, en });
/** joins paragraphs (a blank line starts a new paragraph in RichText) */
const p = (...blocks: string[]) => blocks.join('\n\n');

export const COMPONENTS: ComponentInfo[] = [
  // ---- reference & supply ---------------------------------------------------------------
  {
    id: 'ground',
    title: l('Masse & Versorgung (GND, VCC)', 'Ground & supply (GND, VCC)'),
    match: { name: '\\bgnd\\b|masse|\\bvcc\\b|\\bvdd\\b|^plus\\b' },
    summary: l(
      'Das Masse-Symbol markiert den Bezugspunkt der Schaltung: Alle Spannungen werden gegen ihn gemessen, er hat 0 V. Versorgungssymbole wie VCC kennzeichnen die Betriebsspannung.',
      'The ground symbol marks the reference point of the circuit: all voltages are measured against it, and it sits at 0 V. Supply symbols such as VCC mark the supply voltage.',
    ),
    body: {
      de: p(
        'Spannung ist immer eine Differenz zwischen zwei Punkten. Damit man trotzdem kurz „die Spannung an Punkt X“ sagen kann, legt man einen gemeinsamen Bezugspunkt fest: die **Masse** (GND, *ground*). Sie hat per Definition 0 V, meist liegt dort der Minuspol der Versorgung.',
        'Alle Masse-Symbole im Schaltplan gelten als miteinander verbunden, auch ohne gezeichnete Leitung – so musst du nicht jede Rückleitung quer über den Plan ziehen. Für die Simulation ist Masse Pflicht: SPICE rechnet alle Spannungen gegen den Knoten 0, und den bildet das Masse-Symbol.',
        'Versorgungssymbole wie `VCC`, `VDD` oder `+5V` zeigen, wo die Betriebsspannung anliegt. Sie sind nur Markierungen und liefern selbst keine Spannung – irgendwo muss eine Quelle (Batterie, Netzteil) angeschlossen sein. Bei CMOS-ICs heißt der Minuspol oft `VSS`.',
      ),
      en: p(
        'Voltage is always a difference between two points. To be able to say “the voltage at point X” anyway, you pick a common reference point: **ground** (GND). By definition it is at 0 V, and usually the negative terminal of the supply is connected to it.',
        'All ground symbols in a schematic count as connected, even without a drawn wire, so you do not have to route every return path across the sheet. For simulation, ground is mandatory: SPICE computes all voltages against node 0, and the ground symbol is that node.',
        'Supply symbols such as `VCC`, `VDD` or `+5V` show where the supply voltage is applied. They are only markers and do not deliver any voltage themselves – a source (battery, power supply) has to be connected somewhere. On CMOS chips the negative rail is often called `VSS`.',
      ),
    },
    facts: [
      { label: l('Bezeichnungen', 'Names'), value: l('Masse: GND, 0V, VSS · Versorgung: VCC, VDD, +5V, +12V', 'Ground: GND, 0V, VSS · supply: VCC, VDD, +5V, +12V') },
      { label: l('Simulation', 'Simulation'), value: l('Masse = SPICE-Knoten 0; mindestens ein Masse-Symbol ist nötig', 'ground = SPICE node 0; at least one ground symbol is required') },
      { label: l('Andere Symbole', 'Related symbols'), value: l('Schutzerde (PE) und Gehäusemasse haben eigene Symbole', 'protective earth (PE) and chassis ground have their own symbols') },
    ],
    pitfalls: [
      l('Kein Masse-Symbol im Schaltplan: Der Simulator kann keine Spannungen berechnen.', 'No ground symbol in the schematic: the simulator cannot compute any voltages.'),
      l('Mehrere Netzteile ohne gemeinsame Masse: Signale zwischen den Schaltungsteilen haben keinen gemeinsamen Bezug (außer die Trennung ist gewollt, z. B. mit Optokoppler).', 'Several power supplies without a common ground: signals between the circuit parts have no common reference (unless the isolation is intended, e.g. with an optocoupler).'),
      l('Ein VCC-Symbol liefert keine Spannung – es muss mit einer Quelle verbunden sein.', 'A VCC symbol does not supply any voltage – it has to be connected to a source.'),
      l('Beim Messen gehört die COM-Buchse des Multimeters an Masse, wenn du „die Spannung an einem Punkt“ wissen willst.', 'When measuring “the voltage at a point”, the multimeter’s COM lead belongs on ground.'),
    ],
    lessons: ['first-circuit'],
  },

  // ---- integrated circuits --------------------------------------------------------------
  {
    id: 'optocoupler',
    title: l('Optokoppler', 'Optocoupler'),
    match: { name: 'opto.?koppler|optocoupler|reflexkoppler|\\bcny\\d|\\b4n\\d\\d|pc817|\\bmoc\\d' },
    summary: l(
      'Ein Optokoppler überträgt ein Signal per Licht: Eine LED leuchtet auf einen Fototransistor im selben Gehäuse. So sind Ein- und Ausgang elektrisch vollständig getrennt.',
      'An optocoupler transfers a signal by light: an LED shines on a phototransistor inside the same package. Input and output are therefore completely isolated electrically.',
    ),
    body: {
      de: p(
        'Auf der Eingangsseite sitzt eine Infrarot-LED, auf der Ausgangsseite – durch eine durchsichtige Isolierschicht getrennt – ein Fototransistor (je nach Typ auch ein Fototriac oder ein Logikausgang). Leuchtet die LED, wird der Transistor leitend. Zwischen Ein- und Ausgang halten Optokoppler mehrere tausend Volt aus.',
        'Damit trennst du einen Mikrocontroller von Netzspannung, Motoren oder langen, störbehafteten Leitungen, überträgst Signale zwischen Schaltungen mit unterschiedlicher Masse und steuerst Triacs an (z. B. MOC3041 mit Nulldurchgangserkennung).',
        'Die Eingangs-LED braucht wie jede LED einen **Vorwiderstand**, der Ausgangstransistor arbeitet meist mit einem Pull-up-Widerstand. Wie viel Ausgangsstrom pro Eingangsstrom herauskommt, sagt das **CTR** (*Current Transfer Ratio*). Reflexkoppler wie der CNY70 funktionieren ähnlich, nur fällt das Licht über ein reflektierendes Objekt auf den Empfänger.',
      ),
      en: p(
        'The input side holds an infrared LED, the output side – separated by a transparent insulating layer – a phototransistor (depending on the type also a phototriac or a logic output). When the LED lights up, the transistor conducts. Optocouplers withstand several thousand volts between input and output.',
        'Use them to isolate a microcontroller from mains voltage, motors or long, noisy cables, to pass signals between circuits with different grounds, and to drive triacs (e.g. the MOC3041 with zero-cross detection).',
        'Like any LED, the input LED needs a **series resistor**; the output transistor usually works with a pull-up resistor. How much output current you get per input current is the **CTR** (*current transfer ratio*). Reflective sensors such as the CNY70 work the same way, except that the light reaches the receiver via a reflecting object.',
      ),
    },
    formulas: [
      { label: l('Vorwiderstand der LED', 'LED series resistor'), formula: 'R_V = (U_B - U_F) / I_F' },
      { label: l('Übertragungsverhältnis', 'Current transfer ratio'), formula: 'CTR = I_C / I_F' },
    ],
    facts: [
      { label: l('PC817 (DIP-4)', 'PC817 (DIP-4)'), value: l('1 Anode, 2 Kathode, 3 Emitter, 4 Kollektor; CTR 50–600 %, 5000 V Isolation', '1 anode, 2 cathode, 3 emitter, 4 collector; CTR 50–600 %, 5000 V isolation') },
      { label: l('4N25 / 4N28 (DIP-6)', '4N25 / 4N28 (DIP-6)'), value: l('1 Anode, 2 Kathode, 4 Emitter, 5 Kollektor, 6 Basis', '1 anode, 2 cathode, 4 emitter, 5 collector, 6 base') },
      { label: l('LED-Seite', 'LED side'), value: l('typ. 5–20 mA, $U_F$ ≈ 1,2 V', 'typically 5–20 mA, $U_F$ ≈ 1.2 V') },
    ],
    pitfalls: [
      l('Vorwiderstand vergessen: Die IR-LED brennt durch wie jede andere LED.', 'Forgotten series resistor: the IR LED burns out like any other LED.'),
      l('Beide Seiten an dieselbe Masse gelegt: Damit ist die galvanische Trennung aufgehoben.', 'Both sides tied to the same ground: that removes the galvanic isolation.'),
      l('Optokoppler mit Fototransistor sind langsam (einige µs) – für schnelle Datenleitungen gibt es spezielle Typen wie den 6N137.', 'Optocouplers with a phototransistor are slow (a few µs) – for fast data lines there are dedicated types such as the 6N137.'),
      l('Das CTR streut stark und sinkt mit dem Alter – mit Reserve dimensionieren.', 'The CTR varies a lot and drops with age – design with margin.'),
    ],
  },
  {
    id: 'timer-555',
    title: l('Timer 555', '555 timer'),
    match: { name: '555|556|timer' },
    summary: l(
      'Der 555 ist ein Timer-IC, mit dem du Blinker, Taktgeber und Verzögerungen baust. Zwei Widerstände und ein Kondensator legen Frequenz bzw. Zeit fest.',
      'The 555 is a timer chip for blinkers, clock generators and delays. Two resistors and a capacitor set the frequency or the time.',
    ),
    body: {
      de: p(
        'Im 555 stecken zwei Komparatoren, ein Flipflop und ein Entladetransistor. Die Komparatoren vergleichen die Kondensatorspannung mit ⅓ und ⅔ der Versorgung: Erreicht sie ⅔ $U_B$ (Pin 6, THR), geht der Ausgang auf Low und Pin 7 (DIS) entlädt den Kondensator. Fällt sie unter ⅓ $U_B$ (Pin 2, TRIG), geht der Ausgang wieder auf High.',
        '**Astabil** – Pin 2 und 6 verbunden, $R_1$ von Plus nach Pin 7, $R_2$ von Pin 7 zum Kondensator – schwingt er dauerhaft und liefert ein Rechtecksignal, z. B. für Blinklichter oder Töne. **Monostabil** erzeugt er nach einem Triggerimpuls genau einen Puls der Länge $t = 1,1 \\cdot R \\cdot C$.',
        'Der Ausgang (Pin 3) liefert beim klassischen NE555 bis zu 200 mA – genug für LEDs, Summer oder kleine Relais. Die CMOS-Varianten **TLC555** und **ICM7555** brauchen viel weniger Strom und laufen schon ab 2 V. Der **NE556** enthält zwei 555 in einem Gehäuse.',
      ),
      en: p(
        'Inside the 555 are two comparators, a flip-flop and a discharge transistor. The comparators compare the capacitor voltage with ⅓ and ⅔ of the supply: when it reaches ⅔ $U_B$ (pin 6, THR), the output goes low and pin 7 (DIS) discharges the capacitor. When it falls below ⅓ $U_B$ (pin 2, TRIG), the output goes high again.',
        'In **astable** mode – pins 2 and 6 tied together, $R_1$ from the supply to pin 7, $R_2$ from pin 7 to the capacitor – it oscillates continuously and produces a square wave, e.g. for blinkers or tones. In **monostable** mode a trigger pulse produces exactly one output pulse of length $t = 1.1 \\cdot R \\cdot C$.',
        'The output (pin 3) of the classic NE555 delivers up to 200 mA – enough for LEDs, buzzers or small relays. The CMOS versions **TLC555** and **ICM7555** draw far less current and run from 2 V. The **NE556** contains two 555s in one package.',
      ),
    },
    formulas: [
      { label: l('Astabil: Frequenz', 'Astable: frequency'), formula: 'f = 1.44 / ((R_1 + 2 R_2) \\cdot C)' },
      { label: l('Astabil: High-Zeit', 'Astable: high time'), formula: 't_H = 0.693 \\cdot (R_1 + R_2) \\cdot C' },
      { label: l('Astabil: Low-Zeit', 'Astable: low time'), formula: 't_L = 0.693 \\cdot R_2 \\cdot C' },
      { label: l('Monostabil: Pulsdauer', 'Monostable: pulse width'), formula: 't = 1.1 \\cdot R \\cdot C' },
    ],
    facts: [
      { label: l('Pinbelegung (DIP-8)', 'Pinout (DIP-8)'), value: l('1 GND, 2 TRIG, 3 OUT, 4 RESET, 5 CV, 6 THR, 7 DIS, 8 VCC', '1 GND, 2 TRIG, 3 OUT, 4 RESET, 5 CV, 6 THR, 7 DIS, 8 VCC') },
      { label: l('Versorgung', 'Supply'), value: l('NE555: 4,5–16 V; TLC555 / ICM7555 (CMOS): ab 2 V', 'NE555: 4.5–16 V; TLC555 / ICM7555 (CMOS): from 2 V') },
      { label: l('Ausgangsstrom', 'Output current'), value: l('NE555 bis 200 mA; CMOS-Typen deutlich weniger', 'NE555 up to 200 mA; CMOS types much less') },
      { label: l('Tastverhältnis', 'Duty cycle'), value: l('astabil immer über 50 % High, weil über $R_1 + R_2$ geladen, aber nur über $R_2$ entladen wird', 'astable always above 50 % high, because the capacitor charges through $R_1 + R_2$ but discharges through $R_2$ only') },
      { label: l('Beispiel', 'Example'), value: l('$R_1$ = 1 kΩ, $R_2$ = 10 kΩ, C = 10 µF → f ≈ 6,9 Hz (ein Blinker)', '$R_1$ = 1 kΩ, $R_2$ = 10 kΩ, C = 10 µF → f ≈ 6.9 Hz (a blinker)') },
    ],
    pitfalls: [
      l('RESET (Pin 4) offen gelassen: Der Timer arbeitet unzuverlässig. Wenn du ihn nicht brauchst, Pin 4 an VCC.', 'RESET (pin 4) left open: the timer behaves erratically. If you do not need it, tie pin 4 to VCC.'),
      l('CV (Pin 5) unbeschaltet: Ein 10-nF-Kondensator nach Masse macht die Schaltschwellen störfest.', 'CV (pin 5) left open: a 10 nF capacitor to ground makes the thresholds immune to noise.'),
      l('Der bipolare NE555 zieht beim Umschalten kurze Stromspitzen – 100 nF (und ggf. einen Elko) direkt an die Versorgungspins.', 'The bipolar NE555 draws short current spikes when switching – put 100 nF (and maybe an electrolytic) right at the supply pins.'),
      l('$R_1$ kleiner als ca. 1 kΩ: Der Entladetransistor an Pin 7 wird überlastet.', '$R_1$ below about 1 kΩ: the discharge transistor at pin 7 gets overloaded.'),
      l('Elkos als Zeitkondensator haben große Toleranzen – die echte Frequenz kann 20 % und mehr vom berechneten Wert abweichen.', 'Electrolytic timing capacitors have wide tolerances – the real frequency can be 20 % or more off the calculated value.'),
    ],
    lessons: ['rc-time-constant'],
  },
  {
    id: 'regulator',
    title: l('Spannungsregler (78xx, LM317)', 'Voltage regulator (78xx, LM317)'),
    match: { name: '\\b78\\d\\d\\b|\\b79\\d\\d\\b|78l\\d\\d|lm3[13]7|lm350|\\bstabi|regel-ic|regler|regulator|\\bl200' },
    summary: l(
      'Ein linearer Spannungsregler macht aus einer höheren, schwankenden Gleichspannung eine stabile Ausgangsspannung, z. B. 5 V. Die überschüssige Spannung verheizt er.',
      'A linear voltage regulator turns a higher, fluctuating DC voltage into a stable output voltage, e.g. 5 V. It burns off the excess voltage as heat.',
    ),
    body: {
      de: p(
        'Ein Festspannungsregler wie der **7805** hat drei Anschlüsse: Eingang (IN), Masse (GND) und Ausgang (OUT). Liegt am Eingang mindestens etwa 2 V mehr an als am Ausgang (**Dropout**), hält er den Ausgang stabil auf 5 V – egal wie Last und Eingangsspannung schwanken. Die Zahl hinter „78“ ist die Spannung: 7805 = +5 V, 7812 = +12 V. Die **79xx** sind die Gegenstücke für negative Spannungen.',
        'Der **LM317** ist einstellbar: Er hält zwischen OUT und ADJ immer 1,25 V. Mit zwei Widerständen stellst du damit jede Spannung zwischen 1,25 V und etwa 37 V ein.',
        'Linearregler sind einfach und rauscharm, aber die Differenz zwischen Ein- und Ausgang wird komplett zu Wärme. Bei großen Spannungsunterschieden oder Strömen ist ein **Schaltregler** (z. B. LT1074, LM2596) effizienter: Er arbeitet mit Spule, Diode und schnellem Ein- und Ausschalten statt mit Verheizen.',
      ),
      en: p(
        'A fixed regulator such as the **7805** has three pins: input (IN), ground (GND) and output (OUT). As long as the input is at least about 2 V above the output (**dropout**), it holds the output steady at 5 V – no matter how load and input voltage vary. The number after “78” is the voltage: 7805 = +5 V, 7812 = +12 V. The **79xx** series are the counterparts for negative voltages.',
        'The **LM317** is adjustable: it always keeps 1.25 V between OUT and ADJ. With two resistors you can set any voltage between 1.25 V and about 37 V.',
        'Linear regulators are simple and quiet, but the whole difference between input and output turns into heat. For large voltage differences or currents a **switching regulator** (e.g. LT1074, LM2596) is more efficient: it uses an inductor, a diode and fast switching instead of burning off power.',
      ),
    },
    formulas: [
      { label: l('Verlustleistung', 'Power dissipation'), formula: 'P = (U_{in} - U_{out}) \\cdot I' },
      { label: l('LM317 Ausgangsspannung', 'LM317 output voltage'), formula: 'U_{out} = 1.25 V \\cdot (1 + R_2 / R_1)' },
      { label: l('Wirkungsgrad (linear)', 'Efficiency (linear)'), formula: 'η \\approx U_{out} / U_{in}' },
    ],
    facts: [
      { label: l('78xx (TO-220)', '78xx (TO-220)'), value: l('Schrift zu dir, Beine unten: **IN – GND – OUT**; Kühlfahne = GND; bis ca. 1 A', 'text facing you, legs down: **IN – GND – OUT**; tab = GND; up to about 1 A') },
      { label: l('79xx (TO-220)', '79xx (TO-220)'), value: l('andere Belegung: **GND – IN – OUT**; Kühlfahne = IN', 'different pinout: **GND – IN – OUT**; tab = IN') },
      { label: l('LM317 (TO-220)', 'LM317 (TO-220)'), value: l('**ADJ – OUT – IN**; Kühlfahne = OUT; $R_1$ = 240 Ω zwischen OUT und ADJ', '**ADJ – OUT – IN**; tab = OUT; $R_1$ = 240 Ω between OUT and ADJ') },
      { label: l('Dropout', 'Dropout'), value: l('78xx ca. 2 V; Low-Drop-Typen (LM1117, LP2950) ca. 0,1–1,2 V', '78xx about 2 V; low-dropout types (LM1117, LP2950) about 0.1–1.2 V') },
      { label: l('Kondensatoren', 'Capacitors'), value: l('laut Datenblatt 330 nF am Eingang, 100 nF am Ausgang, direkt an den Pins', 'per datasheet 330 nF at the input, 100 nF at the output, right at the pins') },
    ],
    pitfalls: [
      l('Kühlung vergessen: 12 V auf 5 V bei 0,5 A sind $P = 7 V \\cdot 0,5 A = 3,5 W$ – ohne Kühlkörper schaltet der Regler wegen Übertemperatur ab.', 'Forgotten heat sink: 12 V down to 5 V at 0.5 A means $P = 7 V \\cdot 0.5 A = 3.5 W$ – without a heat sink the regulator shuts down from overheating.'),
      l('Eingangsspannung zu knapp: Unter ca. 7 V am Eingang regelt ein 7805 nicht mehr sauber.', 'Input voltage too low: below about 7 V at the input a 7805 no longer regulates properly.'),
      l('Kondensatoren fehlen: Ohne sie direkt an den Pins kann der Regler schwingen.', 'Missing capacitors: without them right at the pins the regulator may oscillate.'),
      l('78xx, 79xx und LM317 haben verschiedene Pinbelegungen und die Kühlfahne liegt auf verschiedenem Potenzial – auf einem gemeinsamen Kühlkörper isoliert montieren.', '78xx, 79xx and LM317 have different pinouts, and their tabs sit at different potentials – mount them insulated on a shared heat sink.'),
    ],
  },
  {
    id: 'zener',
    title: l('Z-Diode & Spannungsreferenz', 'Zener diode & voltage reference'),
    match: { name: 'z-diode|zener|\\bzd|bzx|bzy|referenz|rferenz|reference|tl431|lm385' },
    summary: l(
      'Eine Z-Diode wird in Sperrrichtung betrieben und hält dort eine fast konstante Spannung, die Z-Spannung. Mit einem Vorwiderstand ergibt sie eine einfache Spannungsstabilisierung.',
      'A Zener diode is operated in reverse and holds an almost constant voltage there, the Zener voltage. Together with a series resistor it forms a simple voltage stabiliser.',
    ),
    body: {
      de: p(
        'In Durchlassrichtung verhält sich die Z-Diode wie eine normale Diode. Spannend wird sie in **Sperrrichtung**: Ab der **Z-Spannung** $U_Z$ (z. B. 5,6 V beim BZX85C5V6) bricht sie gezielt durch und leitet, ohne Schaden zu nehmen – solange jemand den Strom begrenzt. Die Spannung an ihr bleibt dabei nahezu konstant.',
        'Die Grundschaltung: ein **Vorwiderstand** in Reihe, die Z-Diode mit der **Kathode zur Plus-Seite**. Der Widerstand nimmt die Differenzspannung auf, die Z-Diode „schluckt“ den überschüssigen Strom. So entstehen Referenzspannungen, Überspannungsschutz und Stabilisierungen für kleine Lasten.',
        'Im Symbol hat der Kathodenstrich kleine Haken (wie ein „Z“). Für genauere Referenzen gibt es **Referenz-ICs** wie den TL431 (einstellbar von 2,5 V bis 36 V) oder den LM385 – sie verhalten sich wie eine sehr präzise Z-Diode.',
      ),
      en: p(
        'In the forward direction a Zener diode behaves like an ordinary diode. It gets interesting in **reverse**: from the **Zener voltage** $U_Z$ on (e.g. 5.6 V for the BZX85C5V6) it breaks down on purpose and conducts without damage – as long as something limits the current. The voltage across it stays almost constant.',
        'The basic circuit: a **series resistor**, and the Zener diode with its **cathode towards the positive side**. The resistor takes up the voltage difference, the Zener “swallows” the excess current. This gives you reference voltages, overvoltage protection and regulation for small loads.',
        'In the symbol the cathode bar has small hooks (like a “Z”). For more accurate references there are **reference ICs** such as the TL431 (adjustable from 2.5 V to 36 V) or the LM385 – they act like a very precise Zener diode.',
      ),
    },
    formulas: [
      { label: l('Vorwiderstand', 'Series resistor'), formula: 'R_V = (U_B - U_Z) / (I_Z + I_L)' },
      { label: l('Verlustleistung', 'Power dissipation'), formula: 'P_Z = U_Z \\cdot I_Z' },
    ],
    facts: [
      { label: l('Typenschlüssel', 'Part code'), value: l('`BZX85C5V6`: C = ±5 % Toleranz, 5V6 = 5,6 V', '`BZX85C5V6`: C = ±5 % tolerance, 5V6 = 5.6 V') },
      { label: l('Leistung', 'Power rating'), value: l('BZX55 / BZX79: 0,5 W · BZX85: 1,3 W · 1N53xx: 5 W', 'BZX55 / BZX79: 0.5 W · BZX85: 1.3 W · 1N53xx: 5 W') },
      { label: l('Häufige Werte', 'Common values'), value: l('3V3, 4V7, 5V1, 5V6, 6V8, 9V1, 12 V, 15 V', '3V3, 4V7, 5V1, 5V6, 6V8, 9V1, 12 V, 15 V') },
      { label: l('Temperatur', 'Temperature'), value: l('um 5–6 V am stabilsten; darüber und darunter driftet die Z-Spannung', 'most stable around 5–6 V; above and below that the Zener voltage drifts') },
      { label: l('Polung', 'Polarity'), value: l('Kathode (Ring) zum Pluspol – „falsch herum“ im Vergleich zur Gleichrichterdiode', 'cathode (ring) to the positive side – “backwards” compared to a rectifier diode') },
    ],
    pitfalls: [
      l('Ohne Vorwiderstand: Die Z-Diode zieht so viel Strom, wie die Quelle liefern kann, und brennt durch.', 'No series resistor: the Zener draws as much current as the source can deliver and burns out.'),
      l('Falsch gepolt: In Durchlassrichtung liegen nur ca. 0,7 V an statt der Z-Spannung.', 'Reversed: in the forward direction you only get about 0.7 V instead of the Zener voltage.'),
      l('Zu wenig Querstrom: Bei sehr kleinem $I_Z$ wird die Z-Spannung weich und ungenau – plane einige mA ein, auch bei voller Last.', 'Too little Zener current: at very small $I_Z$ the voltage gets soft and inaccurate – allow a few mA even at full load.'),
      l('Für größere Lasten ist eine Z-Diode allein ineffizient – dann lieber einen Spannungsregler wie den 7805.', 'For larger loads a Zener on its own is inefficient – use a voltage regulator such as the 7805 instead.'),
    ],
    lessons: ['zener'],
  },
  {
    id: 'microcontroller',
    title: l('Mikrocontroller', 'Microcontroller'),
    match: { name: 'atmega|attiny|\\bpic\\d|stm32|arduino|esp32|esp8266|mikrocontroller|microcontroller' },
    summary: l(
      'Ein Mikrocontroller ist ein kleiner Computer auf einem Chip – mit Prozessor, Speicher und Ein-/Ausgängen. Du programmierst ihn, damit er Sensoren liest und LEDs, Motoren oder Displays steuert.',
      'A microcontroller is a small computer on one chip – with processor, memory and inputs/outputs. You program it to read sensors and control LEDs, motors or displays.',
    ),
    body: {
      de: p(
        'In einem Mikrocontroller wie dem **ATmega328** (Arduino Uno), **ATmega32** oder einem **ATtiny** stecken CPU, Flash-Speicher für das Programm, RAM, Taktgeber und viele Peripheriemodule: digitale Ein-/Ausgänge (GPIO), Analog-Digital-Wandler (ADC), Timer mit PWM und Schnittstellen wie UART, SPI und I²C.',
        'Die meisten Pins sind mehrfach belegt: Derselbe Pin kann digitaler Eingang, Ausgang, ADC-Kanal oder Teil einer Schnittstelle sein – das legt dein Programm fest. Programmiert wird der Chip über eine Schnittstelle wie ISP oder per Bootloader über USB/seriell.',
        'Zum Betrieb braucht er wenig: eine Versorgung (z. B. 5 V oder 3,3 V) mit **100-nF-Abblockkondensator** an jedem VCC-Pin, einen Pull-up-Widerstand am **RESET**-Pin und – wenn der interne Takt nicht genau genug ist – einen Quarz mit zwei Lastkondensatoren.',
      ),
      en: p(
        'A microcontroller such as the **ATmega328** (Arduino Uno), **ATmega32** or an **ATtiny** contains a CPU, flash memory for the program, RAM, a clock and many peripherals: digital inputs/outputs (GPIO), analog-to-digital converters (ADC), timers with PWM and interfaces such as UART, SPI and I²C.',
        'Most pins have several functions: the same pin can be a digital input, an output, an ADC channel or part of an interface – your program decides. The chip is programmed via an interface such as ISP or through a bootloader over USB/serial.',
        'It needs very little to run: a supply (e.g. 5 V or 3.3 V) with a **100 nF decoupling capacitor** at every VCC pin, a pull-up resistor on the **RESET** pin and – if the internal clock is not accurate enough – a crystal with two load capacitors.',
      ),
    },
    facts: [
      { label: l('Versorgung', 'Supply'), value: l('AVR (ATmega/ATtiny): je nach Typ 1,8–5,5 V; ESP32, STM32: 3,3 V', 'AVR (ATmega/ATtiny): 1.8–5.5 V depending on type; ESP32, STM32: 3.3 V') },
      { label: l('Pin-Strom', 'Pin current'), value: l('AVR: max. 40 mA pro Pin (besser ≤ 20 mA), Gesamtstrom pro Chip begrenzt', 'AVR: 40 mA per pin max. (better ≤ 20 mA), total current per chip is limited') },
      { label: l('Reset', 'Reset'), value: l('Low-aktiv; 10 kΩ nach VCC', 'active low; 10 kΩ to VCC') },
      { label: l('Pegel', 'Levels'), value: l('High ≈ VCC, Low ≈ 0 V; 5-V-Signale an einem 3,3-V-Controller brauchen einen Pegelwandler', 'high ≈ VCC, low ≈ 0 V; 5 V signals into a 3.3 V controller need a level shifter') },
    ],
    pitfalls: [
      l('Lasten direkt am Pin: Motoren, Relais oder viele LEDs überfordern den Ausgang – einen Transistor, MOSFET oder Treiber-IC dazwischen.', 'Loads driven straight from a pin: motors, relays or many LEDs overload the output – put a transistor, MOSFET or driver chip in between.'),
      l('Abblockkondensatoren fehlen: Abstürze und Resets ohne erkennbaren Grund.', 'Missing decoupling capacitors: crashes and resets for no obvious reason.'),
      l('Offene Eingänge lesen zufällige Werte – Pull-up (intern oder extern) verwenden.', 'Floating inputs read random values – use a pull-up (internal or external).'),
      l('Alle VCC- und GND-Pins anschließen, auch AVCC (Versorgung des ADC) – nicht nur einen davon.', 'Connect all VCC and GND pins, including AVCC (the ADC supply) – not just one of them.'),
    ],
  },
  {
    id: 'opamp',
    title: l('Operationsverstärker (OPV)', 'Operational amplifier (op-amp)'),
    match: { name: 'lm324|lm358|lm741|ua741|lf444|lf35\\d|tl0[78]\\d|ne5532|op.?amp|operational|operationsverst' },
    summary: l(
      'Ein Operationsverstärker verstärkt die Differenz zwischen seinen beiden Eingängen extrem stark. Mit wenigen Widerständen in der Rückkopplung wird daraus ein Verstärker, Filter oder Komparator.',
      'An op-amp amplifies the difference between its two inputs enormously. With a few resistors in the feedback path it becomes an amplifier, a filter or a comparator.',
    ),
    body: {
      de: p(
        'Ein OPV hat einen **nichtinvertierenden** (+) und einen **invertierenden** Eingang (–), einen Ausgang und zwei Versorgungsanschlüsse. Ohne Beschaltung ist seine Verstärkung riesig (100 000-fach und mehr) – schon wenige Mikrovolt Unterschied treiben den Ausgang an den Anschlag. So arbeitet er als **Komparator**.',
        'Mit **Gegenkopplung** – einem Widerstand vom Ausgang zum –Eingang – wird er berechenbar: Der OPV stellt seinen Ausgang so ein, dass beide Eingänge auf derselben Spannung liegen. Daraus folgen einfache Formeln für den invertierenden und den nichtinvertierenden Verstärker; die Verstärkung legen allein die Widerstände fest. Impedanzwandler, Addierer, Integrierer und aktive Filter funktionieren nach demselben Prinzip.',
        'Das Symbol ist ein Dreieck mit den Eingängen links und dem Ausgang an der Spitze; die Versorgungspins werden oft weggelassen, müssen aber angeschlossen werden. Klassiker: **LM741** (einfach, alt), **LM358/LM324** (2- bzw. 4-fach, für einfache Versorgung), **TL072** (JFET-Eingang, Audio).',
      ),
      en: p(
        'An op-amp has a **non-inverting** (+) and an **inverting** input (–), an output and two supply pins. Without feedback its gain is huge (100,000 and more) – a difference of a few microvolts drives the output into its limit. That is how it works as a **comparator**.',
        'With **negative feedback** – a resistor from the output to the – input – it becomes predictable: the op-amp sets its output so that both inputs sit at the same voltage. That leads to simple formulas for the inverting and non-inverting amplifier; the gain is set by the resistors alone. Buffers, summing amplifiers, integrators and active filters all work on the same principle.',
        'The symbol is a triangle with the inputs on the left and the output at the tip; the supply pins are often omitted but must be connected. Classics: **LM741** (simple, old), **LM358/LM324** (dual/quad, single-supply), **TL072** (JFET input, audio).',
      ),
    },
    formulas: [
      { label: l('Regel bei Gegenkopplung', 'Rule with negative feedback'), formula: 'U_{+} = U_{-}' },
      { label: l('Nichtinvertierend (R₂ Ausgang→–, R₁ –→Masse)', 'Non-inverting (R₂ output→–, R₁ –→ground)'), formula: 'V = 1 + R_2 / R_1' },
      { label: l('Invertierend (R₁ Eingang→–, R₂ Ausgang→–)', 'Inverting (R₁ input→–, R₂ output→–)'), formula: 'V = -R_2 / R_1' },
    ],
    facts: [
      { label: l('LM741 (DIP-8)', 'LM741 (DIP-8)'), value: l('2 = –In, 3 = +In, 6 = Out, 7 = V+, 4 = V–; 1 und 5 Offsetabgleich', '2 = –In, 3 = +In, 6 = Out, 7 = V+, 4 = V–; 1 and 5 offset null') },
      { label: l('LM358 (DIP-8)', 'LM358 (DIP-8)'), value: l('1 Out A, 2 –In A, 3 +In A, 4 GND/V–, 5 +In B, 6 –In B, 7 Out B, 8 V+', '1 Out A, 2 –In A, 3 +In A, 4 GND/V–, 5 +In B, 6 –In B, 7 Out B, 8 V+') },
      { label: l('Versorgung', 'Supply'), value: l('symmetrisch (z. B. ±12 V) oder einfach (z. B. 0/5 V bei Single-Supply-Typen wie LM358)', 'split (e.g. ±12 V) or single (e.g. 0/5 V with single-supply types such as the LM358)') },
      { label: l('Aussteuerung', 'Output swing'), value: l('ältere OPVs (741, LM358) erreichen die Versorgungsgrenzen nicht; „Rail-to-Rail“-Typen schon', 'older op-amps (741, LM358) do not reach the supply rails; “rail-to-rail” types do') },
    ],
    pitfalls: [
      l('Versorgung vergessen: Im Symbol oft unsichtbar, in Wirklichkeit Pflicht – plus 100 nF Abblockkondensator direkt an den Pins.', 'Forgotten supply: often invisible in the symbol, mandatory in reality – plus a 100 nF decoupling capacitor right at the pins.'),
      l('Eingänge außerhalb des erlaubten Gleichtaktbereichs: Der Ausgang macht Unsinn oder kippt sogar um.', 'Inputs outside the allowed common-mode range: the output misbehaves or even flips.'),
      l('Rückkopplung an + statt an –: Aus der Mitkopplung wird ein Schmitt-Trigger statt eines Verstärkers.', 'Feedback to + instead of –: positive feedback turns the amplifier into a Schmitt trigger.'),
      l('Für saubere Schaltflanken ist ein echter Komparator (z. B. LM393) besser als ein OPV.', 'For clean switching edges a real comparator (e.g. LM393) works better than an op-amp.'),
      l('Unbenutzte OPVs in Mehrfachgehäusen (LM324) als Spannungsfolger beschalten, nicht offen lassen.', 'Wire unused op-amps in multi-packs (LM324) as voltage followers instead of leaving them open.'),
    ],
  },
  {
    id: 'flipflop',
    title: l('Flipflop', 'Flip-flop'),
    match: { name: 'flip.?flop' },
    summary: l(
      'Ein Flipflop speichert ein einzelnes Bit: Es merkt sich seinen Zustand (0 oder 1), bis ein Eingang ihn ändert. Flipflops sind die Grundlage von Zählern, Registern und Speichern.',
      'A flip-flop stores a single bit: it remembers its state (0 or 1) until an input changes it. Flip-flops are the basis of counters, registers and memories.',
    ),
    body: {
      de: p(
        'Das einfachste ist das **RS-Flipflop** aus zwei rückgekoppelten NAND- oder NOR-Gattern: **S** (Set) setzt den Ausgang Q auf 1, **R** (Reset) setzt ihn auf 0. Ohne Signal behält es den letzten Zustand. Der zweite Ausgang Q̅ („Q quer“) ist immer das Gegenteil von Q.',
        '**Taktflankengesteuerte** Flipflops übernehmen ihren Eingang nur im Moment einer Taktflanke. Das **D-Flipflop** (z. B. 74HC74, CD4013) speichert bei der Flanke den Wert am D-Eingang. Das **JK-Flipflop** (z. B. CD4027) kann zusätzlich umschalten: Mit J = K = 1 wechselt es bei jedem Takt seinen Zustand. So entsteht ein **T-Flipflop**, das die Frequenz halbiert – mehrere hintereinander ergeben einen Binärzähler.',
        'Im Symbol markiert ein kleines Dreieck („>“) am Takteingang die Flankensteuerung, ein Kreis davor die fallende Flanke. Setz- und Rücksetzeingänge (S/R bzw. PRE/CLR) wirken meist sofort, unabhängig vom Takt.',
      ),
      en: p(
        'The simplest one is the **SR flip-flop** made of two cross-coupled NAND or NOR gates: **S** (set) drives output Q to 1, **R** (reset) drives it to 0. Without a signal it keeps its last state. The second output Q̅ (“Q bar”) is always the opposite of Q.',
        '**Edge-triggered** flip-flops take their input only at the moment of a clock edge. The **D flip-flop** (e.g. 74HC74, CD4013) stores the value at its D input on the edge. The **JK flip-flop** (e.g. CD4027) can also toggle: with J = K = 1 it changes state on every clock. That makes a **T flip-flop**, which halves the frequency – several in a row form a binary counter.',
        'In the symbol a small triangle (“>”) at the clock input marks edge triggering, a bubble in front of it the falling edge. Set and reset inputs (S/R or PRE/CLR) usually act immediately, regardless of the clock.',
      ),
    },
    facts: [
      { label: l('D-Flipflop', 'D flip-flop'), value: l('bei der aktiven Taktflanke: Q = D; sonst bleibt Q', 'on the active clock edge: Q = D; otherwise Q holds') },
      { label: l('JK-Flipflop', 'JK flip-flop'), value: l('J = K = 0 halten · J = 1, K = 0 setzen · J = 0, K = 1 rücksetzen · J = K = 1 umschalten', 'J = K = 0 hold · J = 1, K = 0 set · J = 0, K = 1 reset · J = K = 1 toggle') },
      { label: l('Typen', 'Parts'), value: l('74HC74, CD4013 (2 × D) · CD4027, 74HC73 (2 × JK)', '74HC74, CD4013 (2 × D) · CD4027, 74HC73 (2 × JK)') },
    ],
    pitfalls: [
      l('Prellender Taster als Takt: Jeder Preller ist eine Flanke – Takteingänge nur entprellt ansteuern.', 'Bouncing push button as clock: every bounce is an edge – only feed debounced signals into clock inputs.'),
      l('Unbenutzte Set-/Reset-Eingänge offen gelassen: Auf ihren inaktiven Pegel legen (CD4013: an GND; 74HC74: PRE/CLR an VCC, weil Low-aktiv).', 'Unused set/reset inputs left open: tie them to their inactive level (CD4013: to GND; 74HC74: PRE/CLR to VCC, as they are active low).'),
      l('Beim RS-Flipflop S und R gleichzeitig aktiv: verbotener Zustand – danach ist der Ausgang unbestimmt.', 'SR flip-flop with S and R active at the same time: forbidden state – afterwards the output is undefined.'),
    ],
  },
  {
    id: 'logic-gate',
    title: l('Logikgatter & Logik-ICs', 'Logic gates & logic ICs'),
    match: {
      name:
        'gate|gatter|\\b(n?and|x?n?or|xor|not|nicht|n?und|n?oder|notand|notor)\\b|excl\\.|inverter|schmitt|zähler|counter|schieberegister|multivibrator|\\b(sn)?74(hc|hct|ls|als|ac|act|f)\\d{2,4}|\\bcd40\\d\\d|\\bhef40',
    },
    summary: l(
      'Logikgatter verknüpfen digitale Signale (0 und 1) nach festen Regeln wie UND, ODER und NICHT. Sie sind die Grundbausteine jeder Digitalschaltung.',
      'Logic gates combine digital signals (0 and 1) according to fixed rules such as AND, OR and NOT. They are the building blocks of every digital circuit.',
    ),
    body: {
      de: p(
        'Ein Gatter kennt nur zwei Zustände: **Low** (0, nahe 0 V) und **High** (1, nahe der Versorgung). Die Grundfunktionen:',
        [
          '- **UND (AND)**: Ausgang 1, wenn alle Eingänge 1 sind',
          '- **ODER (OR)**: Ausgang 1, wenn mindestens ein Eingang 1 ist',
          '- **NICHT (NOT, Inverter)**: kehrt das Signal um',
          '- **NAND / NOR**: UND bzw. ODER mit invertiertem Ausgang – aus NANDs allein lässt sich jede Logik bauen',
          '- **XOR**: Ausgang 1, wenn die Eingänge verschieden sind',
        ].join('\n'),
        'Das IEC-Symbol ist ein Rechteck mit „&“, „≥1“, „1“ oder „=1“; ein kleiner Kreis am Ausgang bedeutet Invertierung. Ein **Schmitt-Trigger**-Eingang (Hysterese-Zeichen im Symbol) macht aus langsamen oder verrauschten Signalen saubere Flanken.',
        'Gatter stecken zu viert oder zu sechst in einem IC, z. B. 7400/4011 (4 × NAND) oder 7404/40106 (6 × Inverter). Die wichtigsten Familien sind **74HC** (CMOS, 2–6 V), **74LS** (TTL, 5 V) und die **CD4000**-Reihe (CMOS, 3–15 V, langsamer). Auch Zähler (CD4017, 74HC193), Puffer und Analogschalter (CD4066) gehören dazu. Die Versorgungspins sind im Gattersymbol meist nicht gezeichnet – anschließen musst du sie trotzdem.',
      ),
      en: p(
        'A gate knows only two states: **low** (0, near 0 V) and **high** (1, near the supply). The basic functions:',
        [
          '- **AND**: output 1 when all inputs are 1',
          '- **OR**: output 1 when at least one input is 1',
          '- **NOT (inverter)**: inverts the signal',
          '- **NAND / NOR**: AND or OR with an inverted output – any logic can be built from NANDs alone',
          '- **XOR**: output 1 when the inputs differ',
        ].join('\n'),
        'The IEC symbol is a rectangle with “&”, “≥1”, “1” or “=1”; a small bubble at the output means inversion. A **Schmitt trigger** input (hysteresis sign in the symbol) turns slow or noisy signals into clean edges.',
        'Gates come four or six to a chip, e.g. 7400/4011 (4 × NAND) or 7404/40106 (6 × inverter). The main families are **74HC** (CMOS, 2–6 V), **74LS** (TTL, 5 V) and the **CD4000** series (CMOS, 3–15 V, slower). Counters (CD4017, 74HC193), buffers and analog switches (CD4066) belong to the same families. The supply pins are usually not drawn on gate symbols – but you still have to connect them.',
      ),
    },
    formulas: [
      { label: l('De Morgan (NAND)', 'De Morgan (NAND)'), formula: '¬(A ∧ B) = ¬A ∨ ¬B' },
      { label: l('De Morgan (NOR)', 'De Morgan (NOR)'), formula: '¬(A ∨ B) = ¬A ∧ ¬B' },
    ],
    facts: [
      { label: l('7400 / 4011 (DIP-14)', '7400 / 4011 (DIP-14)'), value: l('4 × NAND; Pin 7 = GND, Pin 14 = VCC (wie bei fast allen 14-poligen Logik-ICs)', '4 × NAND; pin 7 = GND, pin 14 = VCC (as on almost all 14-pin logic chips)') },
      { label: l('Pegel (CMOS an 5 V)', 'Levels (CMOS at 5 V)'), value: l('Low unter ca. 1,5 V, High über ca. 3,5 V (30 % / 70 % der Versorgung)', 'low below about 1.5 V, high above about 3.5 V (30 % / 70 % of the supply)') },
      { label: l('Ausgangsstrom 74HC', '74HC output current'), value: l('spezifiziert für ±4 mA, absolutes Maximum ±25 mA', 'specified for ±4 mA, absolute maximum ±25 mA') },
    ],
    pitfalls: [
      l('Offene CMOS-Eingänge: Unbenutzte Eingänge nie offen lassen, sondern an GND oder VCC legen – sonst schwingen sie, ziehen Strom und liefern Zufallswerte.', 'Floating CMOS inputs: never leave unused inputs open, tie them to GND or VCC – otherwise they oscillate, draw current and give random results.'),
      l('Abblockkondensator vergessen: 100 nF direkt zwischen VCC und GND jedes ICs.', 'Forgotten decoupling capacitor: 100 nF right between VCC and GND of every chip.'),
      l('Familien gemischt: TTL-Ausgänge (74LS) erreichen den High-Pegel von 5-V-CMOS (74HC) nicht sicher – dafür gibt es 74HCT.', 'Mixed families: TTL outputs (74LS) do not reliably reach the high level of 5 V CMOS (74HC) – that is what 74HCT is for.'),
      l('Langsame Flanken (z. B. von RC-Gliedern) an normalen Eingängen schalten mehrfach – dafür Schmitt-Trigger wie 74HC14 oder 40106 verwenden.', 'Slow edges (e.g. from RC networks) at normal inputs cause multiple switching – use Schmitt triggers such as the 74HC14 or 40106.'),
    ],
  },

  // ---- optoelectronics & diodes ---------------------------------------------------------
  {
    id: 'ldr',
    title: l('Fotowiderstand (LDR)', 'Light-dependent resistor (LDR)'),
    match: { name: 'ldr|fotowiderstand|photoresistor' },
    summary: l(
      'Ein LDR ändert seinen Widerstand mit der Helligkeit: Im Dunkeln ist er hochohmig, im Licht niederohmig. Damit baust du einfache Licht- und Dämmerungsschalter.',
      'An LDR changes its resistance with brightness: high in the dark, low in the light. It is the basis of simple light and twilight switches.',
    ),
    body: {
      de: p(
        'LDR steht für *Light Dependent Resistor*. Seine lichtempfindliche Schicht (meist Cadmiumsulfid) setzt bei Lichteinfall Ladungsträger frei, dadurch sinkt der Widerstand – von einigen Megaohm im Dunkeln bis auf wenige hundert Ohm bei hellem Licht.',
        'Ein LDR hat keine Polarität. Meist schaltest du ihn mit einem festen Widerstand zu einem **Spannungsteiler**: Die Spannung in der Mitte hängt dann von der Helligkeit ab und kann einen Transistor, einen Komparator oder den ADC eines Mikrocontrollers ansteuern.',
        'Im Symbol siehst du ein Widerstandsrechteck mit zwei Pfeilen, die von außen *auf* das Bauteil zeigen – das einfallende Licht.',
      ),
      en: p(
        'LDR stands for *light dependent resistor*. Its light-sensitive layer (usually cadmium sulphide) releases charge carriers when light falls on it, so the resistance drops – from several megohms in the dark down to a few hundred ohms in bright light.',
        'An LDR has no polarity. Usually you combine it with a fixed resistor into a **voltage divider**: the voltage in the middle then depends on the brightness and can drive a transistor, a comparator or a microcontroller’s ADC.',
        'The symbol is a resistor rectangle with two arrows pointing *at* the part from outside – the incoming light.',
      ),
    },
    formulas: [{ label: l('Spannungsteiler (LDR oben)', 'Voltage divider (LDR on top)'), formula: 'U_{out} = U_B \\cdot R_2 / (R_{LDR} + R_2)' }],
    facts: [
      { label: l('Dunkelwiderstand', 'Dark resistance'), value: l('ca. 0,5–10 MΩ', 'about 0.5–10 MΩ') },
      { label: l('Hellwiderstand', 'Light resistance'), value: l('bei 10 lx (Dämmerung) ca. 10–20 kΩ, bei hellem Licht unter 1 kΩ', 'at 10 lx (dusk) about 10–20 kΩ, in bright light below 1 kΩ') },
      { label: l('Reaktionszeit', 'Response time'), value: l('träge: einige 10 ms, beim Abdunkeln oft deutlich länger', 'slow: tens of milliseconds, often much longer when it gets dark') },
    ],
    pitfalls: [
      l('LDRs sind langsam: Für Lichtschranken mit schnellen Impulsen oder für Datenübertragung eine Fotodiode oder einen Fototransistor nehmen.', 'LDRs are slow: for light barriers with fast pulses or for data transmission use a photodiode or phototransistor.'),
      l('Die Exemplarstreuung ist groß – stelle die Schaltschwelle mit einem Poti statt mit einem festen Widerstand ein.', 'Part-to-part variation is large – set the switching threshold with a potentiometer instead of a fixed resistor.'),
      l('Viele LDRs enthalten Cadmium und sind in neuen Geräten (RoHS) kaum noch erlaubt; Alternative: Fototransistor.', 'Many LDRs contain cadmium and are hardly allowed in new products (RoHS); alternative: a phototransistor.'),
    ],
    lessons: ['voltage-divider'],
  },
  {
    id: 'photo',
    title: l('Fotodiode & Fototransistor', 'Photodiode & phototransistor'),
    match: { name: 'foto|photo|\\bbpw\\d|\\bsfh\\d|tsop|ir-empf|infrarot-empf' },
    summary: l(
      'Diese Bauteile wandeln Licht in Strom: Je heller es ist, desto mehr Strom lassen sie fließen. Sie sind schnell und eignen sich für Lichtschranken, Fernbedienungen und Lichtmessung.',
      'These parts turn light into current: the brighter it is, the more current flows. They are fast and suit light barriers, remote controls and light measurement.',
    ),
    body: {
      de: p(
        'Eine **Fotodiode** wird in Sperrrichtung betrieben. Einfallendes Licht erzeugt Ladungsträger in der Sperrschicht, dadurch fließt ein kleiner Fotostrom (µA-Bereich), der nahezu proportional zur Beleuchtungsstärke ist. Fotodioden sind sehr schnell.',
        'Ein **Fototransistor** ist ein Transistor, dessen Basisstrom vom Licht erzeugt wird – oft fehlt der Basisanschluss ganz. Er verstärkt den Fotostrom um ein Vielfaches, ist dafür langsamer. Typisch schaltest du ihn mit einem Widerstand vom Emitter nach Masse (oder vom Kollektor nach Plus) und greifst dort die Spannung ab.',
        'Im Symbol zeigen zwei Pfeile *auf* das Bauteil (Licht kommt hinein). **IR-Empfänger** wie der TSOP1136 enthalten Fotodiode, Verstärker und Demodulator in einem Gehäuse und liefern direkt das digitale Signal einer Fernbedienung.',
      ),
      en: p(
        'A **photodiode** is operated in reverse. Incoming light creates charge carriers in the depletion layer, so a small photocurrent flows (microamps) that is almost proportional to the illuminance. Photodiodes are very fast.',
        'A **phototransistor** is a transistor whose base current is generated by light – often there is no base pin at all. It amplifies the photocurrent many times but is slower. Typically you add a resistor from the emitter to ground (or from the collector to the supply) and take the voltage there.',
        'In the symbol two arrows point *at* the part (light comes in). **IR receivers** such as the TSOP1136 contain photodiode, amplifier and demodulator in one package and output the digital signal of a remote control directly.',
      ),
    },
    formulas: [{ label: l('Ausgangsspannung am Arbeitswiderstand', 'Output voltage across the load resistor'), formula: 'U_{out} = I_{ph} \\cdot R' }],
    facts: [
      { label: l('Fotostrom', 'Photocurrent'), value: l('Fotodiode BPW34: ca. 50 µA bei 1000 lx; Fototransistoren: bis einige mA', 'photodiode BPW34: about 50 µA at 1000 lx; phototransistors: up to a few mA') },
      { label: l('Polung', 'Polarity'), value: l('Fotodiode: Kathode an Plus (Sperrrichtung) · Fototransistor: Kollektor an Plus', 'photodiode: cathode to positive (reverse) · phototransistor: collector to positive') },
      { label: l('Spektrum', 'Spectrum'), value: l('viele Typen sind auf Infrarot (850–950 nm) optimiert, oft mit Tageslichtfilter (schwarzes Gehäuse)', 'many types are optimised for infrared (850–950 nm), often with a daylight filter (black package)') },
    ],
    pitfalls: [
      l('Fototransistor mit LED verwechselt: Das Gehäuse sieht gleich aus – Beschriftung und Pinbelegung im Datenblatt prüfen.', 'Phototransistor mistaken for an LED: the package looks the same – check the marking and the datasheet pinout.'),
      l('Umgebungslicht (Sonne, Lampen mit 100 Hz Flimmern) stört Lichtschranken – mit moduliertem Licht arbeiten oder abschirmen.', 'Ambient light (sun, lamps flickering at 100 Hz) disturbs light barriers – use modulated light or shielding.'),
      l('Fotodiode in Durchlassrichtung vorgespannt: Dann wirkt sie wie eine normale Diode und misst kein Licht.', 'Photodiode biased in the forward direction: then it acts like an ordinary diode and does not measure light.'),
    ],
  },
  {
    id: 'led',
    title: l('Leuchtdiode (LED)', 'Light-emitting diode (LED)'),
    match: { name: '^(?!.*(treiber|driver)).*(\\bled|leuchtdiode|ir-sende|tsal\\d)' },
    summary: l(
      'Eine LED ist eine Diode, die leuchtet, wenn Strom in Durchlassrichtung fließt. Sie braucht immer eine Strombegrenzung – meist einen Vorwiderstand.',
      'An LED is a diode that lights up when current flows in the forward direction. It always needs current limiting – usually a series resistor.',
    ),
    body: {
      de: p(
        'Wie jede Diode hat die LED eine **Anode** (+, langes Bein) und eine **Kathode** (–, kurzes Bein, abgeflachte Gehäuseseite). Fließt Strom von der Anode zur Kathode, wandelt der Halbleiterkristall einen Teil der Energie direkt in Licht um. Die Farbe hängt vom Material ab – und damit auch die **Durchlassspannung** $U_F$.',
        'Die Spannung an der LED bleibt fast konstant, der Strom steigt oberhalb von $U_F$ aber steil an. Darum kommt immer ein **Vorwiderstand** in Reihe, der die überschüssige Spannung aufnimmt und den Strom festlegt. Standard-LEDs vertragen etwa 20 mA, moderne helle LEDs leuchten schon mit 2–5 mA gut.',
        'Im Symbol ist die LED eine Diode mit zwei Pfeilen, die vom Bauteil *weg* zeigen (Licht geht hinaus). Mit eingeschalteten Live-Werten leuchtet die LED im Schaltplan, sobald genug Strom fließt.',
      ),
      en: p(
        'Like every diode, the LED has an **anode** (+, long leg) and a **cathode** (–, short leg, flat side of the package). When current flows from anode to cathode, the semiconductor crystal turns part of the energy directly into light. The colour depends on the material – and so does the **forward voltage** $U_F$.',
        'The voltage across the LED stays almost constant, but above $U_F$ the current rises steeply. That is why a **series resistor** always goes in line: it takes up the excess voltage and sets the current. Standard LEDs handle about 20 mA; modern bright LEDs already glow nicely at 2–5 mA.',
        'The symbol is a diode with two arrows pointing *away* from it (light goes out). With live values switched on, the LED lights up in the schematic as soon as enough current flows.',
      ),
    },
    formulas: [
      { label: l('Vorwiderstand', 'Series resistor'), formula: 'R_V = (U_B - U_F) / I_F' },
      { label: l('Leistung im Vorwiderstand', 'Power in the series resistor'), formula: 'P_R = (U_B - U_F) \\cdot I_F' },
    ],
    facts: [
      { label: l('Durchlassspannung', 'Forward voltage'), value: l('rot ≈ 1,8–2,0 V · gelb/orange ≈ 2,0 V · grün ≈ 2,1 V (reingrün bis 3 V) · blau/weiß ≈ 3,0–3,4 V · infrarot ≈ 1,2–1,5 V', 'red ≈ 1.8–2.0 V · yellow/orange ≈ 2.0 V · green ≈ 2.1 V (true green up to 3 V) · blue/white ≈ 3.0–3.4 V · infrared ≈ 1.2–1.5 V') },
      { label: l('Strom', 'Current'), value: l('Standard-LED max. 20 mA, Low-Current-LED 2 mA', 'standard LED 20 mA max., low-current LED 2 mA') },
      { label: l('Polarität', 'Polarity'), value: l('Anode = langes Bein · Kathode = kurzes Bein und abgeflachte Seite', 'anode = long leg · cathode = short leg and flat side') },
      { label: l('Beispiel', 'Example'), value: l('9 V, rote LED, 15 mA: $R_V = (9 V - 1,9 V) / 15 mA \\approx 470 \\Omega$', '9 V, red LED, 15 mA: $R_V = (9 V - 1.9 V) / 15 mA \\approx 470 \\Omega$') },
      { label: l('Sperrspannung', 'Reverse voltage'), value: l('nur ca. 5 V', 'only about 5 V') },
    ],
    pitfalls: [
      l('Vorwiderstand vergessen: Die LED wird kurz sehr hell, dann heiß – und ist kaputt.', 'Forgotten series resistor: the LED flashes very brightly, gets hot – and is dead.'),
      l('LEDs nie direkt parallel schalten: Wegen der Exemplarstreuung nimmt eine LED den meisten Strom. Jede LED bekommt ihren eigenen Widerstand.', 'Never put LEDs directly in parallel: due to part variation one LED takes most of the current. Give every LED its own resistor.'),
      l('Falsch herum: Die LED bleibt einfach dunkel. Langes Bein = Anode = Plus.', 'Reversed: the LED simply stays dark. Long leg = anode = positive.'),
      l('In Sperrrichtung vertragen LEDs nur etwa 5 V – an Wechselspannung eine Diode antiparallel schalten.', 'LEDs only withstand about 5 V in reverse – on AC put a diode in antiparallel.'),
    ],
    lessons: ['led-resistor', 'first-circuit'],
  },
  {
    id: 'thyristor',
    title: l('Thyristor, Triac & Diac', 'Thyristor, triac & diac'),
    match: { name: 'thyristor|triac|diac|^th#|^tri#' },
    summary: l(
      'Thyristoren sind elektronische Schalter, die nach einem kurzen Zündimpuls am Gate leitend bleiben, bis der Strom fast null wird. Triacs schalten so Wechselstrom, z. B. in Dimmern.',
      'Thyristors are electronic switches that stay on after a short trigger pulse at the gate until the current drops to almost zero. Triacs switch AC this way, e.g. in dimmers.',
    ),
    body: {
      de: p(
        'Ein **Thyristor** (SCR) hat Anode, Kathode und Gate. Ein kurzer Strompuls ins Gate „zündet“ ihn; danach leitet er weiter, auch wenn das Gate-Signal weg ist. Er sperrt erst wieder, wenn der Strom unter den Haltestrom fällt – bei Wechselstrom also im nächsten Nulldurchgang.',
        'Ein **Triac** wirkt wie zwei gegenparallele Thyristoren mit gemeinsamem Gate und leitet in beide Richtungen. Seine Anschlüsse heißen A1, A2 und G. Triacs schalten Lampen, Heizungen und Motoren direkt am Netz – im Dimmer per **Phasenanschnitt**: Je später in der Halbwelle gezündet wird, desto weniger Leistung kommt an.',
        'Ein **Diac** hat kein Gate. Er sperrt in beide Richtungen bis etwa 30 V und schaltet dann schlagartig durch – damit erzeugt er in Dimmern die Zündimpulse für den Triac.',
      ),
      en: p(
        'A **thyristor** (SCR) has anode, cathode and gate. A short current pulse into the gate “fires” it; afterwards it keeps conducting even when the gate signal is gone. It only turns off when the current falls below the holding current – on AC, at the next zero crossing.',
        'A **triac** acts like two antiparallel thyristors with a common gate and conducts in both directions. Its pins are called MT1, MT2 and G. Triacs switch lamps, heaters and motors directly on the mains – in a dimmer by **phase-angle control**: the later in the half-wave it fires, the less power arrives.',
        'A **diac** has no gate. It blocks in both directions up to about 30 V and then switches through abruptly – in dimmers it generates the trigger pulses for the triac.',
      ),
    },
    facts: [
      { label: l('TIC106D', 'TIC106D'), value: l('Thyristor 400 V, 5 A, sehr empfindliches Gate (max. 0,2 mA)', 'thyristor 400 V, 5 A, very sensitive gate (0.2 mA max.)') },
      { label: l('TIC206D', 'TIC206D'), value: l('Triac 400 V, 4 A', 'triac 400 V, 4 A') },
      { label: l('DB3', 'DB3'), value: l('Diac, Durchbruch ca. 32 V', 'diac, breakover about 32 V') },
    ],
    pitfalls: [
      l('Netzspannung ist lebensgefährlich! Triac-Schaltungen am 230-V-Netz nur mit Erfahrung, Gehäuse und Sicherung – zur Ansteuerung vom Mikrocontroller einen Opto-Triac (z. B. MOC3041) zur Trennung verwenden.', 'Mains voltage can kill! Build 230 V triac circuits only with experience, an enclosure and a fuse – drive them from a microcontroller through an opto-triac (e.g. MOC3041) for isolation.'),
      l('Ein Thyristor an Gleichspannung bleibt nach dem Zünden an – zum Ausschalten muss der Strom unterbrochen werden.', 'A thyristor on DC stays on after firing – to turn it off the current has to be interrupted.'),
      l('Induktive Lasten (Motoren) brauchen meist ein RC-Snubber-Glied, sonst zündet der Triac unkontrolliert.', 'Inductive loads (motors) usually need an RC snubber, otherwise the triac fires uncontrollably.'),
    ],
  },
  {
    id: 'transformer',
    title: l('Transformator (Trafo)', 'Transformer'),
    match: { name: 'trafo|transformer|übertrager' },
    summary: l(
      'Ein Trafo überträgt Wechselspannung über ein gemeinsames Magnetfeld von einer Wicklung auf eine andere und ändert dabei ihre Höhe. Gleichzeitig trennt er die Stromkreise galvanisch.',
      'A transformer transfers AC voltage from one winding to another through a shared magnetic field and changes its level on the way. At the same time it isolates the circuits galvanically.',
    ),
    body: {
      de: p(
        'Zwei (oder mehr) Spulen sitzen auf einem gemeinsamen Eisen- oder Ferritkern. Die Wechselspannung an der **Primärwicklung** erzeugt ein wechselndes Magnetfeld, das in der **Sekundärwicklung** eine Spannung induziert. Das Verhältnis der Windungszahlen bestimmt das Spannungsverhältnis.',
        'Klassisch macht ein Netztrafo aus 230 V~ eine ungefährliche Kleinspannung, z. B. 12 V~. Danach folgen Gleichrichter, Siebelko und Spannungsregler – fertig ist das Netzteil. Weil zwischen den Wicklungen keine leitende Verbindung besteht, trennt der Trafo die Schaltung vom Netz.',
        'Ein Trafo funktioniert nur mit **Wechselspannung**; Gleichspannung erzeugt kein wechselndes Feld und damit keine Spannung auf der anderen Seite. Im Symbol siehst du zwei Wicklungen mit Strichen dazwischen für den Kern. Punkte an den Wicklungen markieren die Wicklungsanfänge (gleiche Phase).',
      ),
      en: p(
        'Two (or more) coils sit on a shared iron or ferrite core. The AC voltage on the **primary winding** creates an alternating magnetic field that induces a voltage in the **secondary winding**. The turns ratio sets the voltage ratio.',
        'Classically a mains transformer turns 230 V AC into a safe low voltage, e.g. 12 V AC. Then come a rectifier, a smoothing capacitor and a voltage regulator – and the power supply is done. Since there is no conductive connection between the windings, the transformer isolates the circuit from the mains.',
        'A transformer only works with **AC**; DC creates no changing field and therefore no voltage on the other side. The symbol shows two windings with lines between them for the core. Dots on the windings mark the winding starts (same phase).',
      ),
    },
    formulas: [
      { label: l('Spannungen', 'Voltages'), formula: 'U_1 / U_2 = N_1 / N_2' },
      { label: l('Ströme', 'Currents'), formula: 'I_1 / I_2 = N_2 / N_1' },
      { label: l('Scheitelwert', 'Peak value'), formula: 'U_{peak} = \\sqrt{2} \\cdot U_{rms}' },
    ],
    facts: [
      { label: l('Angaben', 'Ratings'), value: l('Primär-/Sekundärspannung (Effektivwert) und Leistung in VA, z. B. 230 V / 2 × 12 V, 7 VA', 'primary/secondary voltage (RMS) and power in VA, e.g. 230 V / 2 × 12 V, 7 VA') },
      { label: l('Max. Strom', 'Max. current'), value: l('Leistung / Spannung, z. B. 7 VA / 12 V ≈ 0,58 A', 'power / voltage, e.g. 7 VA / 12 V ≈ 0.58 A') },
      { label: l('Leerlauf', 'No load'), value: l('kleine Trafos liefern ohne Last deutlich mehr als die Nennspannung (oft 10–30 %)', 'small transformers deliver noticeably more than their rated voltage without load (often 10–30 %)') },
    ],
    pitfalls: [
      l('Netzspannung ist lebensgefährlich! Die Primärseite gehört isoliert, abgesichert und berührsicher aufgebaut – im Zweifel ein fertiges Steckernetzteil verwenden.', 'Mains voltage can kill! The primary side must be insulated, fused and touch-proof – when in doubt use a ready-made plug-in power supply.'),
      l('Nach dem Gleichrichten liegt am Siebelko etwa die $\\sqrt{2}$-fache Spannung: Aus 12 V~ werden rund 15–17 V Gleichspannung.', 'After rectification the smoothing capacitor sees about $\\sqrt{2}$ times the voltage: 12 V AC becomes roughly 15–17 V DC.'),
      l('Ein Trafo an Gleichspannung ist nur ein kleiner Drahtwiderstand – er wird heiß und kann durchbrennen.', 'A transformer on DC is just a small wire resistance – it gets hot and can burn out.'),
    ],
  },
  {
    id: 'rectifier',
    title: l('Brückengleichrichter', 'Bridge rectifier'),
    match: { name: 'gleichrichter|rectifier|\\bb#|\\bb\\d\\dc\\d|villard' },
    summary: l(
      'Vier Dioden in Brückenschaltung machen aus Wechselspannung eine pulsierende Gleichspannung und nutzen dabei beide Halbwellen. Ein Siebelko dahinter glättet sie.',
      'Four diodes in a bridge turn AC into a pulsating DC voltage, using both half-waves. A smoothing capacitor behind it flattens it out.',
    ),
    body: {
      de: p(
        'Der Brückengleichrichter (Graetz-Schaltung) hat zwei Wechselspannungsanschlüsse (**~**) und zwei Gleichspannungsanschlüsse (**+** und **–**). In jeder Halbwelle leiten zwei der vier Dioden und schicken den Strom immer in derselben Richtung durch die Last.',
        'Weil immer zwei Dioden in Reihe liegen, gehen etwa 2 × 0,7 V verloren. Hinter dem Gleichrichter pulsiert die Spannung mit der doppelten Netzfrequenz (100 Hz bei 50 Hz Netz). Ein großer **Siebelko** glättet sie, ein Spannungsregler macht daraus eine saubere Gleichspannung.',
        'Fertige Brücken gibt es als ein Bauteil (z. B. B40C1000: max. 40 V~ Eingang, 1000 mA), oder du baust sie aus vier Einzeldioden wie der 1N4004. Spannungsvervielfacher wie die Villard-Kaskade arbeiten ebenfalls mit Dioden und Kondensatoren, liefern aber ein Vielfaches der Scheitelspannung.',
      ),
      en: p(
        'The bridge rectifier (Graetz circuit) has two AC terminals (**~**) and two DC terminals (**+** and **–**). In each half-wave two of the four diodes conduct and always send the current through the load in the same direction.',
        'Because two diodes are always in series, about 2 × 0.7 V are lost. After the rectifier the voltage pulses at twice the mains frequency (100 Hz on a 50 Hz grid). A large **smoothing capacitor** flattens it, and a voltage regulator turns it into clean DC.',
        'Bridges come as a single part (e.g. B40C1000: 40 V AC input max., 1000 mA), or you build one from four single diodes such as the 1N4004. Voltage multipliers like the Villard cascade also use diodes and capacitors but deliver a multiple of the peak voltage.',
      ),
    },
    formulas: [
      { label: l('Gleichspannung am Siebelko (unbelastet)', 'DC voltage at the smoothing capacitor (no load)'), formula: 'U_{DC} \\approx \\sqrt{2} \\cdot U_{rms} - 2 U_F' },
      { label: l('Brummspannung', 'Ripple voltage'), formula: '\\Delta U \\approx I_L / (2 f \\cdot C)' },
    ],
    facts: [
      { label: l('Bezeichnung', 'Part code'), value: l('`B40C1000`: Brücke, max. 40 V~ Eingang, für kapazitive Last, 1000 mA', '`B40C1000`: bridge, 40 V AC input max., for capacitive load, 1000 mA') },
      { label: l('Anschlüsse', 'Terminals'), value: l('~ ~ = Wechselspannung, + und – = Gleichspannung (auf dem Gehäuse markiert)', '~ ~ = AC, + and – = DC (marked on the package)') },
      { label: l('Spannungsverlust', 'Voltage drop'), value: l('ca. 1,4–2 V (zwei Dioden in Reihe)', 'about 1.4–2 V (two diodes in series)') },
    ],
    pitfalls: [
      l('+ und – vertauscht: Der Siebelko bekommt verpolte Spannung und kann platzen.', '+ and – swapped: the smoothing capacitor is reverse-biased and may burst.'),
      l('Einschaltstrom unterschätzt: Der leere Siebelko zieht beim Einschalten sehr hohe Spitzenströme – der Gleichrichter braucht Reserve.', 'Inrush current underestimated: the empty smoothing capacitor draws very high peak currents at power-on – the rectifier needs margin.'),
      l('Den Siebelko nach der Scheitelspannung (≈ 1,41 × Effektivwert) auswählen, nicht nach dem Effektivwert.', 'Choose the smoothing capacitor’s voltage rating by the peak voltage (≈ 1.41 × RMS), not by the RMS value.'),
    ],
    lessons: ['diode'],
  },
  {
    id: 'schottky',
    title: l('Schottky-Diode', 'Schottky diode'),
    match: { name: 'schottky|\\bbat\\d|1n58\\d\\d' },
    summary: l(
      'Eine Schottky-Diode hat eine besonders kleine Durchlassspannung (ca. 0,2–0,45 V) und schaltet sehr schnell. Ideal für Verpolschutz, Schaltregler und Logik.',
      'A Schottky diode has a particularly low forward voltage (about 0.2–0.45 V) and switches very fast. Ideal for reverse-polarity protection, switching regulators and logic.',
    ),
    body: {
      de: p(
        'Statt eines pn-Übergangs nutzt die Schottky-Diode einen Metall-Halbleiter-Übergang. Dadurch ist ihre Durchlassspannung kleiner als bei Silizium-Dioden, und es gibt praktisch keine Sperrverzögerung – sie schaltet extrem schnell.',
        'Das macht sie zur ersten Wahl als Freilaufdiode in **Schaltreglern**, als **Verpolschutz** mit wenig Spannungsverlust und in Solar- und Batterieschaltungen, in denen jedes Zehntel Volt zählt.',
        'Im Symbol hat der Kathodenstrich kleine S-förmige Haken an beiden Enden. Polung und Markierung sind wie bei jeder Diode: Ring = Kathode.',
      ),
      en: p(
        'Instead of a p-n junction the Schottky diode uses a metal-semiconductor junction. Its forward voltage is therefore lower than that of silicon diodes, and there is practically no reverse recovery – it switches extremely fast.',
        'That makes it the first choice as the freewheeling diode in **switching regulators**, for **reverse-polarity protection** with little voltage loss and in solar and battery circuits where every tenth of a volt counts.',
        'In the symbol the cathode bar has small S-shaped hooks at both ends. Polarity and marking are the same as for any diode: ring = cathode.',
      ),
    },
    formulas: [{ label: l('Verlustleistung', 'Power dissipation'), formula: 'P = U_F \\cdot I_F' }],
    facts: [
      { label: l('Durchlassspannung', 'Forward voltage'), value: l('ca. 0,2–0,45 V (steigt mit dem Strom)', 'about 0.2–0.45 V (rises with current)') },
      { label: l('Typen', 'Parts'), value: l('BAT43 / BAT85 (30 V, 200 mA) · 1N5817–1N5819 (1 A, 20–40 V) · 1N5822 (3 A, 40 V)', 'BAT43 / BAT85 (30 V, 200 mA) · 1N5817–1N5819 (1 A, 20–40 V) · 1N5822 (3 A, 40 V)') },
      { label: l('Nachteile', 'Drawbacks'), value: l('größerer Sperrstrom (steigt stark mit der Temperatur), meist niedrigere Sperrspannung', 'higher leakage current (rises strongly with temperature), usually lower reverse voltage') },
    ],
    pitfalls: [
      l('Die Sperrspannung ist oft nur 20–100 V – für Netzgleichrichter ungeeignet.', 'The reverse voltage is often only 20–100 V – unsuitable for mains rectifiers.'),
      l('Der Leckstrom kann bei Wärme mehrere mA erreichen – für hochohmige Mess- und Halteschaltungen ungeeignet.', 'Leakage can reach several mA when hot – unsuitable for high-impedance measurement and hold circuits.'),
    ],
    lessons: ['diode'],
  },
  {
    id: 'diode',
    title: l('Diode', 'Diode'),
    match: { spiceType: 'DIODE' },
    summary: l(
      'Eine Diode lässt Strom nur in eine Richtung durch – wie ein Ventil. In Durchlassrichtung fallen an einer Siliziumdiode etwa 0,7 V ab.',
      'A diode lets current pass in one direction only – like a valve. A silicon diode drops about 0.7 V in the forward direction.',
    ),
    body: {
      de: p(
        'Die Diode hat zwei Anschlüsse: **Anode** (A) und **Kathode** (K). Ist die Anode um mehr als die Schwellspannung positiver als die Kathode, leitet sie; andersherum sperrt sie. Im Symbol zeigt das Dreieck in Stromrichtung (von + nach –), der Querstrich ist die Kathode. Auf dem Bauteil ist die Kathode mit einem **Ring** markiert.',
        'Typische Aufgaben: **Gleichrichten** von Wechselspannung, **Verpolschutz**, **Freilaufdiode** an Relais und Motoren und das Begrenzen von Spannungen. Siliziumdioden haben eine Durchlassspannung von etwa 0,6–0,7 V, Germanium- und Schottky-Dioden weniger.',
        'Die Kennlinie ist stark nichtlinear: Unterhalb der Schwelle fließt kaum Strom, darüber steigt er steil an. Eine Diode in Durchlassrichtung braucht deshalb fast immer etwas, das den Strom begrenzt.',
      ),
      en: p(
        'The diode has two terminals: **anode** (A) and **cathode** (K). When the anode is more positive than the cathode by more than the threshold voltage, it conducts; the other way round it blocks. In the symbol the triangle points in the direction of current (from + to –), the bar is the cathode. On the part the cathode is marked with a **ring**.',
        'Typical jobs: **rectifying** AC, **reverse-polarity protection**, **freewheeling diode** across relays and motors, and clamping voltages. Silicon diodes have a forward voltage of about 0.6–0.7 V; germanium and Schottky diodes less.',
        'The characteristic is strongly non-linear: below the threshold hardly any current flows, above it the current rises steeply. A forward-biased diode therefore almost always needs something that limits the current.',
      ),
    },
    formulas: [
      { label: l('Shockley-Gleichung', 'Shockley equation'), formula: 'I = I_S \\cdot (exp(U / (n \\cdot U_T)) - 1)' },
      { label: l('Temperaturspannung (Raumtemperatur)', 'Thermal voltage (room temperature)'), formula: 'U_T \\approx 26 mV' },
      { label: l('Verlustleistung', 'Power dissipation'), formula: 'P = U_F \\cdot I_F' },
    ],
    facts: [
      { label: l('Durchlassspannung', 'Forward voltage'), value: l('Si ≈ 0,6–0,7 V (bei hohem Strom bis ~1 V) · Ge ≈ 0,2–0,3 V · Schottky ≈ 0,2–0,45 V', 'Si ≈ 0.6–0.7 V (up to ~1 V at high current) · Ge ≈ 0.2–0.3 V · Schottky ≈ 0.2–0.45 V') },
      { label: l('1N4148', '1N4148'), value: l('schnelle Signaldiode: 100 V, ca. 200 mA', 'fast signal diode: 100 V, about 200 mA') },
      { label: l('1N4001 … 1N4007', '1N4001 … 1N4007'), value: l('Gleichrichterdioden 1 A; Sperrspannung 50 V (4001) bis 1000 V (4007)', 'rectifier diodes 1 A; reverse voltage 50 V (4001) to 1000 V (4007)') },
      { label: l('Markierung', 'Marking'), value: l('Ring = Kathode', 'ring = cathode') },
      { label: l('Sonderformen', 'Special types'), value: l('Kapazitätsdioden (Varicap) nutzen ihre Sperrschichtkapazität zum Abstimmen; Tunneldioden haben einen Bereich mit negativem Widerstand', 'varicap diodes use their junction capacitance for tuning; tunnel diodes have a region of negative resistance') },
    ],
    pitfalls: [
      l('Falsch herum eingebaut: Die Schaltung bleibt stumm. Kathodenring und Symbolstrich müssen zur gleichen Seite zeigen.', 'Mounted backwards: the circuit stays silent. Cathode ring and symbol bar must point the same way.'),
      l('Ohne Strombegrenzung direkt an einer Spannungsquelle: Der Strom steigt extrem an und die Diode brennt durch.', 'Connected straight to a voltage source without current limiting: the current shoots up and the diode burns out.'),
      l('Freilaufdiode vergessen: Relais- und Motorspulen erzeugen beim Abschalten Spannungsspitzen, die Transistoren zerstören.', 'Forgotten freewheeling diode: relay and motor coils produce voltage spikes at turn-off that destroy transistors.'),
      l('Sperrspannung zu knapp: Für Netzgleichrichter mit deutlicher Reserve über der Scheitelspannung auswählen.', 'Reverse voltage too tight: for mains rectifiers choose a rating well above the peak voltage.'),
    ],
    lessons: ['diode'],
  },

  // ---- transistors ----------------------------------------------------------------------
  {
    id: 'mosfet',
    title: l('MOSFET', 'MOSFET'),
    match: { name: 'mosfet|\\bbs1[78]0\\b|\\bbs250\\b|\\birf|\\birl|\\bbf98\\d|2n7000' },
    summary: l(
      'Ein MOSFET ist ein spannungsgesteuerter Transistor: Die Spannung zwischen Gate und Source schaltet ihn ein, fast ohne Steuerstrom. Er ist der Standard zum Schalten großer Ströme.',
      'A MOSFET is a voltage-controlled transistor: the voltage between gate and source turns it on, with almost no control current. It is the standard for switching large currents.',
    ),
    body: {
      de: p(
        'Ein MOSFET hat **Gate** (G), **Drain** (D) und **Source** (S). Das Gate ist durch eine hauchdünne Oxidschicht isoliert – im Ruhezustand fließt kein Strom hinein. Erst wenn die Spannung $U_{GS}$ die **Schwellspannung** $U_{GS(th)}$ überschreitet, bildet sich ein leitender Kanal zwischen Drain und Source.',
        'Beim **N-Kanal**-Typ (z. B. BS170, IRLZ44N) liegt Source an Masse und die Last zwischen Plus und Drain; eine positive Gate-Spannung schaltet ein (Low-Side-Schalter). Der **P-Kanal**-Typ (z. B. BS250) ist das Gegenstück für die Plus-Seite: Source an Plus, zum Einschalten wird das Gate unter die Source-Spannung gezogen.',
        'Voll eingeschaltet wirkt der MOSFET wie ein kleiner Widerstand $R_{DS(on)}$ (Milliohm bis wenige Ohm). Im Symbol zeigt der Pfeil beim N-Kanal zum Kanal hin, beim P-Kanal von ihm weg. Die üblichen *Anreicherungstypen* (enh.) sperren ohne Gate-Spannung; *Verarmungstypen* (dep.) leiten schon bei 0 V. Leistungs-MOSFETs enthalten eine **Body-Diode** zwischen Source und Drain.',
      ),
      en: p(
        'A MOSFET has **gate** (G), **drain** (D) and **source** (S). The gate is insulated by a very thin oxide layer – at rest no current flows into it. Only when the voltage $U_{GS}$ exceeds the **threshold voltage** $U_{GS(th)}$ does a conducting channel form between drain and source.',
        'With an **N-channel** type (e.g. BS170, IRLZ44N) the source goes to ground and the load sits between the supply and the drain; a positive gate voltage turns it on (low-side switch). The **P-channel** type (e.g. BS250) is the counterpart for the positive side: source to the supply, and to turn it on the gate is pulled below the source voltage.',
        'Fully on, the MOSFET acts like a small resistance $R_{DS(on)}$ (milliohms to a few ohms). In the symbol the arrow points towards the channel for N-channel and away from it for P-channel. The usual *enhancement* types (enh.) are off without gate voltage; *depletion* types (dep.) already conduct at 0 V. Power MOSFETs contain a **body diode** between source and drain.',
      ),
    },
    formulas: [
      { label: l('Verlustleistung (eingeschaltet)', 'Power dissipation (on)'), formula: 'P = I_D² \\cdot R_{DS(on)}' },
      { label: l('Einschaltbedingung (N-Kanal)', 'Turn-on condition (N-channel)'), formula: 'U_{GS} > U_{GS(th)}' },
    ],
    facts: [
      { label: l('BS170 (TO-92)', 'BS170 (TO-92)'), value: l('N-Kanal, 60 V, 0,5 A, $U_{GS(th)}$ 0,8–3 V; Pins **D – G – S**', 'N-channel, 60 V, 0.5 A, $U_{GS(th)}$ 0.8–3 V; pins **D – G – S**') },
      { label: l('BS250 (TO-92)', 'BS250 (TO-92)'), value: l('P-Kanal, –45 V, ca. –0,25 A', 'P-channel, –45 V, about –0.25 A') },
      { label: l('Logic-Level', 'Logic level'), value: l('IRLZ44N oder IRLML2502 schalten mit 3,3–5 V am Gate voll durch; ein IRF540 braucht ca. 10 V', 'IRLZ44N or IRLML2502 turn fully on with 3.3–5 V at the gate; an IRF540 needs about 10 V') },
      { label: l('Gate-Spannung', 'Gate voltage'), value: l('meist max. ±20 V zwischen Gate und Source', 'usually ±20 V max. between gate and source') },
    ],
    pitfalls: [
      l('Gate offen gelassen: Das isolierte Gate hält Ladung und schaltet zufällig. Immer einen Pull-down (10–100 kΩ) von Gate nach Source.', 'Gate left floating: the insulated gate holds charge and switches at random. Always add a pull-down (10–100 kΩ) from gate to source.'),
      l('Kein Logic-Level-Typ: Mit nur 3,3 V am Gate schaltet ein normaler MOSFET nur halb durch und wird heiß.', 'Not a logic-level type: with only 3.3 V at the gate a standard MOSFET turns only half on and gets hot.'),
      l('Statische Aufladung kann das dünne Gate-Oxid zerstören – vor dem Anfassen erden.', 'Static discharge can destroy the thin gate oxide – ground yourself before handling.'),
      l('Ein Gate-Widerstand (z. B. 100 Ω) dämpft Schwingungen und schont den ansteuernden Pin beim Umladen der Gate-Kapazität.', 'A gate resistor (e.g. 100 Ω) damps ringing and protects the driving pin while the gate capacitance is charged.'),
      l('Freilaufdiode bei Spulenlasten (Relais, Motor) nicht vergessen.', 'Do not forget the freewheeling diode with inductive loads (relay, motor).'),
    ],
    lessons: ['transistor-switch'],
  },
  {
    id: 'jfet',
    title: l('Sperrschicht-FET (JFET)', 'Junction FET (JFET)'),
    match: { name: 'jfet|\\bfet\\b' },
    summary: l(
      'Ein JFET ist ein Feldeffekttransistor, der ohne Gate-Spannung leitet und durch eine Gate-Spannung in Sperrrichtung zugeschnürt wird. Er ist rauscharm und am Eingang sehr hochohmig.',
      'A JFET is a field-effect transistor that conducts without gate voltage and is pinched off by a reverse gate voltage. It is low-noise and has a very high input resistance.',
    ),
    body: {
      de: p(
        'Der JFET hat **Gate**, **Drain** und **Source**. Beim N-Kanal-JFET (z. B. BF245) fließt bei $U_{GS}$ = 0 V der größte Strom $I_{DSS}$. Je negativer das Gate gegenüber der Source wird, desto enger wird der Kanal, bis er bei der Abschnürspannung $U_P$ ganz sperrt. Gate und Kanal bilden eine Diode, die in Sperrrichtung betrieben wird – daher der winzige Gate-Strom.',
        'JFETs findest du in rauscharmen Vorverstärkern (Mikrofon, Gitarre), in HF-Stufen, als einfache Konstantstromquelle (Gate mit Source verbunden) und als Eingangsstufe in Operationsverstärkern wie TL072 oder LF444.',
        'Im Symbol berührt die Gate-Linie den Kanal direkt (beim MOSFET ist sie davon getrennt). Der Pfeil am Gate zeigt beim N-Kanal zum Kanal hin, beim P-Kanal von ihm weg.',
      ),
      en: p(
        'The JFET has **gate**, **drain** and **source**. In an N-channel JFET (e.g. BF245) the largest current $I_{DSS}$ flows at $U_{GS}$ = 0 V. The more negative the gate gets relative to the source, the narrower the channel becomes, until it blocks completely at the pinch-off voltage $U_P$. Gate and channel form a diode operated in reverse – hence the tiny gate current.',
        'You find JFETs in low-noise preamplifiers (microphone, guitar), RF stages, as a simple constant current source (gate tied to source) and as the input stage of op-amps such as the TL072 or LF444.',
        'In the symbol the gate line touches the channel directly (in a MOSFET it is separated from it). The gate arrow points towards the channel for N-channel and away from it for P-channel.',
      ),
    },
    formulas: [{ label: l('Kennlinie (Sättigungsbereich)', 'Characteristic (saturation region)'), formula: 'I_D = I_{DSS} \\cdot (1 - U_{GS} / U_P)²' }],
    facts: [
      { label: l('BF245 (N-Kanal)', 'BF245 (N-channel)'), value: l('$I_{DSS}$ je nach Gruppe: A ≈ 2–6,5 mA, B ≈ 6–15 mA, C ≈ 12–25 mA', '$I_{DSS}$ by group: A ≈ 2–6.5 mA, B ≈ 6–15 mA, C ≈ 12–25 mA') },
      { label: l('Gate-Spannung (N-Kanal)', 'Gate voltage (N-channel)'), value: l('zwischen 0 V und $U_P$ (typ. –0,5 … –8 V)', 'between 0 V and $U_P$ (typically –0.5 … –8 V)') },
      { label: l('Pinbelegung', 'Pinout'), value: l('stark typabhängig – unbedingt im Datenblatt nachsehen', 'varies a lot between types – always check the datasheet') },
    ],
    pitfalls: [
      l('Gate in Durchlassrichtung (beim N-Kanal positiv gegen Source): Dann fließt Gate-Strom und der hohe Eingangswiderstand ist weg.', 'Gate forward-biased (positive against source for N-channel): gate current flows and the high input resistance is gone.'),
      l('$I_{DSS}$ und $U_P$ streuen stark – den Arbeitspunkt einstellbar machen oder ausmessen.', '$I_{DSS}$ and $U_P$ vary a lot – make the operating point adjustable or measure it.'),
      l('Nicht mit dem MOSFET verwechseln: Ein JFET sperrt nicht von selbst, sondern leitet ohne Gate-Spannung.', 'Do not confuse it with a MOSFET: a JFET is not off by itself, it conducts without gate voltage.'),
    ],
  },
  {
    id: 'npn',
    title: l('NPN-Transistor', 'NPN transistor'),
    // unijunction transistors are typed NPN in the library but work differently
    match: { spiceType: 'NPN', name: '^(?!.*\\bujt\\b)' },
    summary: l(
      'Ein bipolarer Transistor verstärkt: Ein kleiner Basisstrom steuert einen bis zu einige hundert Mal größeren Kollektorstrom. Damit schaltest du Lasten oder verstärkst Signale.',
      'A bipolar transistor amplifies: a small base current controls a collector current up to several hundred times larger. Use it to switch loads or amplify signals.',
    ),
    body: {
      de: p(
        'Der NPN-Transistor hat drei Anschlüsse: **Basis** (B), **Kollektor** (C) und **Emitter** (E). Fließt ein kleiner Strom von der Basis zum Emitter – dafür braucht es etwa 0,7 V zwischen B und E –, kann ein viel größerer Strom vom Kollektor zum Emitter fließen. Das Verhältnis heißt **Stromverstärkung** B (im Datenblatt $h_{FE}$), typisch 100–800.',
        'Als **Schalter** – der häufigste Einsatz für Einsteiger – liegt der Emitter an Masse, die Last zwischen Plus und Kollektor, und die Basis wird über einen **Basiswiderstand** angesteuert, z. B. von einem Mikrocontroller-Pin. Als **Verstärker** arbeitet er im Bereich zwischen „aus“ und „voll an“, etwa in der Emitterschaltung.',
        'Im Symbol zeigt der Pfeil am Emitter *nach außen* – er zeigt die Stromrichtung. Beim PNP zeigt er nach innen.',
      ),
      en: p(
        'The NPN transistor has three terminals: **base** (B), **collector** (C) and **emitter** (E). When a small current flows from base to emitter – which takes about 0.7 V between B and E – a much larger current can flow from collector to emitter. The ratio is the **current gain** B (in datasheets $h_{FE}$), typically 100–800.',
        'As a **switch** – the most common use for beginners – the emitter goes to ground, the load sits between the supply and the collector, and the base is driven through a **base resistor**, e.g. from a microcontroller pin. As an **amplifier** it works in the region between “off” and “fully on”, for example in the common-emitter circuit.',
        'In the symbol the arrow on the emitter points *outwards* – it shows the direction of current. On a PNP it points inwards.',
      ),
    },
    formulas: [
      { label: l('Stromverstärkung', 'Current gain'), formula: 'I_C = B \\cdot I_B' },
      { label: l('Emitterstrom', 'Emitter current'), formula: 'I_E = I_C + I_B' },
      { label: l('Basiswiderstand', 'Base resistor'), formula: 'R_B = (U_{in} - U_{BE}) / I_B' },
      { label: l('Verlustleistung', 'Power dissipation'), formula: 'P = U_{CE} \\cdot I_C' },
    ],
    facts: [
      { label: l('BC547 (TO-92)', 'BC547 (TO-92)'), value: l('flache Seite zu dir, Beine unten: **C – B – E**; 45 V, 100 mA, 500 mW', 'flat side facing you, legs down: **C – B – E**; 45 V, 100 mA, 500 mW') },
      { label: l('Verstärkungsgruppen', 'Gain groups'), value: l('BC547A / B / C: B ≈ 110–220 / 200–450 / 420–800', 'BC547A / B / C: B ≈ 110–220 / 200–450 / 420–800') },
      { label: l('2N2222A / 2N3904', '2N2222A / 2N3904'), value: l('**E – B – C** (andersherum als BC547!); 2N2222A: 40 V, 600 mA', '**E – B – C** (reversed compared to the BC547!); 2N2222A: 40 V, 600 mA') },
      { label: l('Spannungen', 'Voltages'), value: l('$U_{BE}$ ≈ 0,6–0,7 V im leitenden Zustand; $U_{CE(sat)}$ ≈ 0,1–0,3 V voll durchgeschaltet', '$U_{BE}$ ≈ 0.6–0.7 V when conducting; $U_{CE(sat)}$ ≈ 0.1–0.3 V when fully on') },
    ],
    pitfalls: [
      l('Basiswiderstand vergessen: Die Basis-Emitter-Strecke ist eine Diode – direkt an 5 V fließt ein riesiger Strom und Transistor oder Ausgang sterben.', 'Forgotten base resistor: the base-emitter junction is a diode – connected straight to 5 V a huge current flows and the transistor or the driving output dies.'),
      l('Als Schalter zu knapp gerechnet: Plane 3- bis 10-mal mehr Basisstrom ein als $I_C / B$, damit der Transistor sicher sättigt und kalt bleibt.', 'Too tight as a switch: plan 3 to 10 times more base current than $I_C / B$ so the transistor saturates reliably and stays cool.'),
      l('Pinbelegung geraten: BC547 ist C-B-E, 2N2222 und 2N3904 sind E-B-C – immer im Datenblatt nachsehen.', 'Guessed pinout: BC547 is C-B-E, 2N2222 and 2N3904 are E-B-C – always check the datasheet.'),
      l('Spule ohne Freilaufdiode am Kollektor (Relais, Motor): Die Abschaltspitze zerstört den Transistor.', 'Coil at the collector without a freewheeling diode (relay, motor): the turn-off spike destroys the transistor.'),
      l('Basis offen gelassen: Ein Pull-down (z. B. 10 kΩ) von der Basis nach Masse hält den Transistor sicher aus, solange der Eingang undefiniert ist.', 'Base left open: a pull-down (e.g. 10 kΩ) from base to ground keeps the transistor reliably off while the input is undefined.'),
    ],
    lessons: ['transistor-switch'],
  },
  {
    id: 'pnp',
    title: l('PNP-Transistor', 'PNP transistor'),
    match: { spiceType: 'PNP' },
    summary: l(
      'Der PNP-Transistor ist das Spiegelbild des NPN: Er leitet, wenn die Basis etwa 0,7 V *unter* dem Emitter liegt. Man setzt ihn gern als Schalter auf der Plus-Seite ein.',
      'The PNP transistor is the mirror image of the NPN: it conducts when the base is about 0.7 V *below* the emitter. It is a popular switch on the positive side.',
    ),
    body: {
      de: p(
        'Auch der PNP hat **Basis**, **Kollektor** und **Emitter**, aber alle Spannungen und Ströme sind umgekehrt: Der Emitter liegt an Plus, der Strom fließt vom Emitter zum Kollektor, und die Basis muss zum Einschalten *negativer* als der Emitter sein. Im Symbol zeigt der Pfeil *nach innen* zur Basis – Merkhilfe: „Tut der Pfeil der Basis weh, ist es ein PNP.“',
        'Typischer Einsatz ist der **High-Side-Schalter**: Emitter an Plus, Last zwischen Kollektor und Masse. Wird die Basis über einen Widerstand nach Masse gezogen (z. B. von einem NPN oder einem Low-Pegel am Mikrocontroller), schaltet er ein; liegt sie auf Emitterpotenzial, ist er aus.',
        'PNP- und NPN-Typen gibt es als **Komplementärpaare** mit gleichen Daten, z. B. BC557 und BC547. Zusammen bilden sie Gegentakt-Endstufen und H-Brücken.',
      ),
      en: p(
        'A PNP also has **base**, **collector** and **emitter**, but all voltages and currents are reversed: the emitter sits at the supply, current flows from emitter to collector, and to turn it on the base must be *more negative* than the emitter. In the symbol the arrow points *inwards* to the base.',
        'The typical use is the **high-side switch**: emitter to the supply, load between collector and ground. Pulling the base to ground through a resistor (e.g. from an NPN or a low level on a microcontroller pin) turns it on; with the base at emitter potential it is off.',
        'PNP and NPN types come as **complementary pairs** with matching ratings, e.g. BC557 and BC547. Together they form push-pull output stages and H-bridges.',
      ),
    },
    formulas: [
      { label: l('Stromverstärkung', 'Current gain'), formula: 'I_C = B \\cdot I_B' },
      { label: l('Basiswiderstand', 'Base resistor'), formula: 'R_B = (U_E - U_{EB} - U_{in}) / I_B' },
    ],
    facts: [
      { label: l('BC557 (TO-92)', 'BC557 (TO-92)'), value: l('Belegung wie BC547: **C – B – E**; –45 V, –100 mA, 500 mW', 'same pinout as BC547: **C – B – E**; –45 V, –100 mA, 500 mW') },
      { label: l('Komplementärpaare', 'Complementary pairs'), value: l('BC557 ↔ BC547 · BC327 ↔ BC337 · 2N3906 ↔ 2N3904', 'BC557 ↔ BC547 · BC327 ↔ BC337 · 2N3906 ↔ 2N3904') },
      { label: l('Basis-Emitter', 'Base-emitter'), value: l('$U_{EB}$ ≈ 0,6–0,7 V (Basis unter dem Emitter)', '$U_{EB}$ ≈ 0.6–0.7 V (base below the emitter)') },
    ],
    pitfalls: [
      l('PNP an höherer Spannung (z. B. 12 V) direkt von 3,3-V- oder 5-V-Logik: Der Pin kann die Basis nicht bis auf Emitterpotenzial ziehen, der Transistor geht nie aus. Einen NPN als Treiber dazwischen.', 'PNP on a higher voltage (e.g. 12 V) driven directly from 3.3 V or 5 V logic: the pin cannot pull the base up to emitter potential, so the transistor never turns off. Add an NPN as a driver.'),
      l('NPN und PNP verwechselt: Ein PNP mit dem Emitter an Masse funktioniert nicht. Pfeilrichtung im Symbol beachten.', 'NPN and PNP mixed up: a PNP with its emitter at ground does not work. Watch the arrow direction in the symbol.'),
      l('Basiswiderstand und Freilaufdiode gelten genauso wie beim NPN.', 'Base resistor and freewheeling diode apply just as for the NPN.'),
    ],
    lessons: ['transistor-switch'],
  },

  // ---- electromechanical & misc ---------------------------------------------------------
  {
    id: 'connector',
    title: l('Steckverbinder & Klemmen', 'Connectors & terminals'),
    match: { name: 'connector|steck|buchse|stiftleiste|klemme|jumper|lötstift|\\busb|klinke|cinch|sub-d|scart|\\bxlr|faston|\\bidc' },
    summary: l(
      'Steckverbinder, Stiftleisten und Klemmen verbinden die Schaltung mit der Außenwelt: Versorgung, Sensoren, Lautsprecher oder andere Platinen.',
      'Connectors, pin headers and terminals link the circuit to the outside world: power, sensors, speakers or other boards.',
    ),
    body: {
      de: p(
        'Elektrisch tun Steckverbinder wenig – sie sollen nur zuverlässig verbinden. Im Schaltplan sind sie trotzdem wichtig: Jeder Pin hat eine Nummer, die beim Übergang zur **Leiterplatte** exakt zum Footprint passen muss.',
        'Gängige Typen: **Stiftleisten** im 2,54-mm-Raster (für Jumper, Flachbandkabel mit IDC-Steckern und Steckbretter), **Schraubklemmen** (5 mm oder 7,5 mm Raster) für Versorgung und dickere Leitungen, **Hohlstecker** für Steckernetzteile, **Klinke** und **Cinch** für Audio, **USB** und **SUB-D** für Daten.',
        'Achte auf die Belastbarkeit (Strom pro Kontakt), auf Verpolsicherheit und auf eine eindeutige Beschriftung der Pins im Bestückungsdruck.',
      ),
      en: p(
        'Electrically, connectors do little – they just have to connect reliably. They still matter in the schematic: every pin has a number that must match the footprint exactly when you move on to the **PCB**.',
        'Common types: **pin headers** on a 2.54 mm pitch (for jumpers, ribbon cables with IDC connectors and breadboards), **screw terminals** (5 mm or 7.5 mm pitch) for power and thicker wires, **barrel jacks** for plug-in power supplies, **phone jacks** and **RCA** for audio, **USB** and **D-sub** for data.',
        'Pay attention to the current rating per contact, to polarisation (can it be plugged in the wrong way?) and to clear pin labels on the silkscreen.',
      ),
    },
    facts: [
      { label: l('Raster', 'Pitch'), value: l('2,54 mm (0,1 Zoll) Standard; 2,0 mm und 1,27 mm für kompakte Leisten', '2.54 mm (0.1 inch) standard; 2.0 mm and 1.27 mm for compact headers') },
      { label: l('Hohlstecker', 'Barrel jack'), value: l('5,5/2,1 mm und 5,5/2,5 mm am häufigsten; meist Plus innen – am Netzteil prüfen', '5.5/2.1 mm and 5.5/2.5 mm most common; usually centre positive – check the power supply') },
      { label: l('Belastbarkeit', 'Current rating'), value: l('Stiftleisten ca. 1–3 A pro Kontakt, Schraubklemmen 10 A und mehr', 'pin headers about 1–3 A per contact, screw terminals 10 A and more') },
      { label: l('Stereo-Klinke', 'Stereo jack'), value: l('Spitze = links, Ring = rechts, Schaft = Masse', 'tip = left, ring = right, sleeve = ground') },
    ],
    pitfalls: [
      l('Pinbelegung gespiegelt: Stecker von der Steckseite und von der Lötseite gesehen sind spiegelverkehrt – vor dem Layout im Datenblatt prüfen.', 'Mirrored pinout: a connector seen from the mating side and from the solder side is mirrored – check the datasheet before layout.'),
      l('Nicht verpolsichere Versorgungsstecker: Einmal falsch herum gesteckt, ist die Schaltung tot. Codierte Stecker oder eine Verpolschutzdiode verwenden.', 'Non-polarised power connectors: plugged in the wrong way once, the circuit is dead. Use keyed connectors or a reverse-polarity diode.'),
      l('Pin 1 nicht gekennzeichnet: Auf der Platine wird es dann zum Ratespiel.', 'Pin 1 not marked: on the board it turns into guesswork.'),
    ],
    lessons: ['schematic-to-pcb'],
  },
  {
    id: 'relay',
    title: l('Relais', 'Relay'),
    match: { name: 'relais|relay' },
    summary: l(
      'Ein Relais ist ein elektrisch betätigter Schalter: Ein kleiner Strom durch die Spule zieht einen Anker an, der Kontakte für große Ströme schaltet – galvanisch getrennt vom Steuerkreis.',
      'A relay is an electrically operated switch: a small current through the coil pulls in an armature that switches contacts for large currents – galvanically isolated from the control circuit.',
    ),
    body: {
      de: p(
        'Ein Relais besteht aus einer **Spule** mit Eisenkern und einem oder mehreren **Kontaktsätzen**. Fließt Strom durch die Spule, zieht das Magnetfeld den Anker an und die Kontakte schalten um; ohne Strom zieht eine Feder sie zurück. Steuerkreis und Lastkreis sind dabei vollständig voneinander getrennt.',
        'Die Kontakte heißen **COM** (gemeinsamer Kontakt), **NO** (Schließer, *normally open*) und **NC** (Öffner, *normally closed*). So schaltet ein Mikrocontroller über einen Transistor z. B. eine 230-V-Lampe oder einen 12-V-Motor.',
        'Im Schaltplan ist die Spule ein Rechteck; die Kontakte werden in Ruhestellung (Spule stromlos) gezeichnet. Eine gestrichelte Linie verbindet oft Spule und Kontakte.',
      ),
      en: p(
        'A relay consists of a **coil** with an iron core and one or more **contact sets**. When current flows through the coil, the magnetic field pulls in the armature and the contacts change over; without current a spring pulls them back. Control circuit and load circuit are completely isolated from each other.',
        'The contacts are called **COM** (common), **NO** (normally open) and **NC** (normally closed). That way a microcontroller can switch a 230 V lamp or a 12 V motor via a transistor.',
        'In the schematic the coil is a rectangle; the contacts are drawn in their rest position (coil de-energised). A dashed line often links coil and contacts.',
      ),
    },
    formulas: [{ label: l('Spulenstrom (Nennspannung / Spulenwiderstand)', 'Coil current (rated voltage / coil resistance)'), formula: 'I = U / R' }],
    facts: [
      { label: l('Spulenspannung', 'Coil voltage'), value: l('5 V, 12 V, 24 V üblich; kleine 5-V-Relais ziehen ca. 70–90 mA', '5 V, 12 V, 24 V common; small 5 V relays draw about 70–90 mA') },
      { label: l('Kontakte', 'Contacts'), value: l('z. B. 10 A / 250 V~; bei Gleichspannung oft nur bis 30 V', 'e.g. 10 A / 250 V AC; on DC often only up to 30 V') },
      { label: l('Bezeichnungen', 'Designations'), value: l('COM, NO (Schließer), NC (Öffner); „2xUM“ = zwei Umschaltkontakte', 'COM, NO, NC; “2 × changeover” = DPDT') },
      { label: l('Schaltzeit', 'Switching time'), value: l('einige Millisekunden', 'a few milliseconds') },
    ],
    pitfalls: [
      l('Freilaufdiode vergessen: Beim Abschalten erzeugt die Spule eine Spannungsspitze von oft über 100 V, die den Treibertransistor zerstört. Eine Diode (z. B. 1N4148) antiparallel zur Spule, Kathode an Plus.', 'Forgotten freewheeling diode: at turn-off the coil produces a spike often above 100 V that kills the driver transistor. Put a diode (e.g. 1N4148) across the coil, cathode to positive.'),
      l('Spule direkt am Mikrocontroller-Pin: 70 mA und mehr überfordern den Pin – immer über einen Transistor oder ein Treiber-IC (ULN2803) schalten.', 'Coil straight on a microcontroller pin: 70 mA and more overload the pin – always switch it through a transistor or a driver chip (ULN2803).'),
      l('Netzspannung auf der Kontaktseite braucht ausreichende Abstände auf der Platine und Berührschutz.', 'Mains voltage on the contact side needs sufficient clearances on the PCB and protection against touch.'),
    ],
    lessons: ['transistor-switch'],
  },
  {
    id: 'push-button',
    title: l('Taster', 'Push button'),
    match: { name: 'tast|button' },
    summary: l(
      'Ein Taster schließt (oder öffnet) einen Kontakt nur, solange du ihn drückst. Lässt du los, springt er von selbst zurück.',
      'A push button closes (or opens) a contact only while you press it. When you let go, it springs back by itself.',
    ),
    body: {
      de: p(
        'Im Gegensatz zum Schalter rastet ein Taster nicht ein. Es gibt zwei Grundformen: den **Schließer** (NO, *normally open*), der gedrückt leitet, und den **Öffner** (NC, *normally closed*), der gedrückt unterbricht. Taster nutzt man für Eingaben: Reset, Start, Menütasten, Tastenfelder.',
        'An einem Logik- oder Mikrocontroller-Eingang schaltest du den Taster meist zwischen Pin und Masse und setzt einen **Pull-up-Widerstand** (z. B. 10 kΩ) vom Pin nach Plus. Nicht gedrückt liest der Pin dann High, gedrückt Low. Viele Mikrocontroller haben interne Pull-ups, die du einschalten kannst.',
        'Die verbreiteten 6 × 6 mm-Printtaster haben vier Beinchen, von denen je zwei intern verbunden sind. Im Simulator hältst du einen Taster bei eingeschalteten Live-Werten mit der Maus gedrückt.',
      ),
      en: p(
        'Unlike a switch, a push button does not latch. There are two basic forms: the **normally open** (NO) button conducts while pressed, the **normally closed** (NC) button interrupts while pressed. Push buttons are used for input: reset, start, menu keys, keypads.',
        'On a logic or microcontroller input you usually connect the button between the pin and ground and add a **pull-up resistor** (e.g. 10 kΩ) from the pin to the supply. Not pressed, the pin reads high; pressed, it reads low. Many microcontrollers have internal pull-ups you can enable.',
        'The popular 6 × 6 mm tactile buttons have four legs, two of which are connected internally in pairs. In the simulator, with live values on, you hold a push button down with the mouse.',
      ),
    },
    facts: [
      { label: l('Arten', 'Types'), value: l('Schließer (NO, „EIN-Taster“) und Öffner (NC, „AUS-Taster“)', 'normally open (NO, “make”) and normally closed (NC, “break”)') },
      { label: l('Pull-up', 'Pull-up'), value: l('typ. 4,7–10 kΩ; interne Pull-ups von Mikrocontrollern ca. 20–50 kΩ', 'typically 4.7–10 kΩ; internal microcontroller pull-ups about 20–50 kΩ') },
      { label: l('Prellen', 'Bounce'), value: l('meist unter 5–10 ms', 'usually below 5–10 ms') },
    ],
    pitfalls: [
      l('Ohne Pull-up oder Pull-down schwebt der offene Eingang und liest Zufallswerte – manchmal reicht schon die Hand in der Nähe.', 'Without a pull-up or pull-down the open input floats and reads random values – sometimes a hand nearby is enough.'),
      l('Prellen: Ein Tastendruck wird mehrfach gezählt. Entprellen per Software (10–20 ms warten) oder mit RC-Glied und Schmitt-Trigger.', 'Bounce: one press is counted several times. Debounce in software (wait 10–20 ms) or with an RC network and a Schmitt trigger.'),
      l('Printtaster um 90° verdreht eingelötet: Dann liegen die intern verbundenen Pins quer und der Taster ist dauerhaft „gedrückt“.', 'Tactile button soldered rotated by 90°: the internally connected pins end up across the circuit and the button is permanently “pressed”.'),
    ],
  },
  {
    id: 'switch',
    title: l('Schalter', 'Switch'),
    match: { name: 'schalter|scjalter|switch|reed' },
    summary: l(
      'Ein Schalter öffnet oder schließt einen Stromkreis mechanisch und bleibt in seiner Stellung. Ein Umschalter verbindet einen gemeinsamen Kontakt wahlweise mit einem von zwei Anschlüssen.',
      'A switch opens or closes a circuit mechanically and stays in its position. A changeover switch connects a common contact to one of two terminals.',
    ),
    body: {
      de: p(
        'Der einfachste Schalter ist der **Ein/Aus-Schalter**: offen fließt kein Strom, geschlossen ist er fast ein Kurzschluss. Ein **Umschalter** hat drei Anschlüsse – den gemeinsamen Kontakt (meist 1) und zwei Ausgänge – und verbindet immer einen davon. Bauformen gibt es viele: Kipp-, Schiebe-, Dreh-, DIP- und Reedschalter (der schließt, wenn ein Magnet in der Nähe ist).',
        'Im Englischen beschreibt man Schalter mit Polen und Stellungen: SPST = einpolig Ein/Aus, SPDT = einpoliger Umschalter, DPDT = zweipoliger Umschalter. Wichtig ist außerdem die Belastbarkeit: Schaltstrom und -spannung stehen im Datenblatt.',
        'Im Schaltplan wird ein Schalter in Ruhestellung gezeichnet. Mit eingeschalteten Live-Werten kannst du ihn anklicken und siehst sofort, wie sich die Schaltung verhält.',
      ),
      en: p(
        'The simplest switch is the **on/off switch**: open, no current flows; closed, it is almost a short circuit. A **changeover switch** has three terminals – the common contact (usually 1) and two outputs – and always connects one of them. There are many styles: toggle, slide, rotary, DIP and reed switches (which close when a magnet comes near).',
        'Switches are described by poles and throws: SPST = single-pole on/off, SPDT = single-pole changeover, DPDT = double-pole changeover. The rating matters too: switching current and voltage are in the datasheet.',
        'In the schematic a switch is drawn in its rest position. With live values switched on you can click it and immediately see how the circuit reacts.',
      ),
    },
    facts: [
      { label: l('Bezeichnungen', 'Designations'), value: l('SPST, SPDT, DPDT; „1xUM“ = einpoliger Umschalter, „2xUM“ = zweipolig', 'SPST, SPDT, DPDT; German “1xUM” = SPDT, “2xUM” = DPDT') },
      { label: l('Belastbarkeit', 'Rating'), value: l('Kleinschalter typ. 0,5–3 A, Netzschalter 10 A und mehr', 'small switches typically 0.5–3 A, mains switches 10 A and more') },
      { label: l('Kontaktprellen', 'Contact bounce'), value: l('mechanische Kontakte federn beim Schalten einige Millisekunden nach', 'mechanical contacts bounce for a few milliseconds when switching') },
    ],
    pitfalls: [
      l('Prellen an Digitaleingängen: Ein Zähler zählt einen Schaltvorgang mehrfach. Entprellen mit RC-Glied und Schmitt-Trigger oder in Software.', 'Bounce on digital inputs: a counter counts one switching action several times. Debounce with an RC network and Schmitt trigger, or in software.'),
      l('Offener Eingang: Ein Schalter allein an einem Logikeingang lässt ihn in offener Stellung schweben – immer einen Pull-up- oder Pull-down-Widerstand vorsehen.', 'Floating input: a switch alone on a logic input leaves it floating when open – always add a pull-up or pull-down resistor.'),
      l('Schaltstrom zu groß: Kleine Schiebeschalter vertragen oft nur einige hundert mA – Motoren und Lampen über ein Relais oder einen Transistor schalten.', 'Too much current: small slide switches often handle only a few hundred mA – switch motors and lamps through a relay or a transistor.'),
      l('Bei Gleichstrom steht beim Öffnen ein Lichtbogen länger als bei Wechselstrom – Schalter sind für DC oft deutlich geringer belastbar.', 'With DC an arc lasts longer at opening than with AC – switches are often rated much lower for DC.'),
    ],
    lessons: ['first-circuit'],
  },
  {
    id: 'fuse',
    title: l('Sicherung', 'Fuse'),
    match: { name: 'sicherung|fuse' },
    summary: l(
      'Eine Sicherung unterbricht den Stromkreis, wenn zu viel Strom fließt, und schützt so Leitungen und Geräte vor Überhitzung und Brand.',
      'A fuse interrupts the circuit when too much current flows, protecting wires and devices from overheating and fire.',
    ),
    body: {
      de: p(
        'Eine Schmelzsicherung enthält einen dünnen Draht, der bei Überstrom durchschmilzt. Danach muss sie ersetzt werden – nachdem die Ursache behoben ist. Selbstrückstellende Sicherungen (**PTC**, „Polyfuse“) werden bei Überstrom hochohmig und erholen sich nach dem Abkühlen.',
        'Entscheidend sind **Nennstrom** und **Auslösecharakteristik**: *flink* (F) löst schnell aus und schützt empfindliche Elektronik, *träge* (T) toleriert kurze Einschaltstromspitzen, z. B. von Trafos, Motoren oder großen Elkos. Die Sicherung sitzt möglichst nah an der Quelle in der Zuleitung – am Netz im Außenleiter (L).',
        'Im Symbol ist die Sicherung ein schmales Rechteck mit einer durchgehenden Linie in Längsrichtung.',
      ),
      en: p(
        'A fuse contains a thin wire that melts on overcurrent. Afterwards it has to be replaced – once the cause is fixed. Resettable fuses (**PTC**, “polyfuse”) become high-resistance on overcurrent and recover after cooling down.',
        'What matters is the **rated current** and the **time characteristic**: *fast-acting* (F) blows quickly and protects sensitive electronics, *time-lag* (T) tolerates short inrush peaks, e.g. from transformers, motors or large capacitors. The fuse goes into the supply line as close to the source as possible – on the mains in the live conductor (L).',
        'The symbol is a narrow rectangle with a continuous line running lengthwise through it.',
      ),
    },
    facts: [
      { label: l('Feinsicherungen', 'Glass fuses'), value: l('5 × 20 mm, z. B. 100 mA, 500 mA, 1 A, 2 A; Aufdruck „T1A“ = träge, 1 A', '5 × 20 mm, e.g. 100 mA, 500 mA, 1 A, 2 A; marking “T1A” = time-lag, 1 A') },
      { label: l('Kennbuchstaben', 'Speed codes'), value: l('FF superflink · F flink · M mittelträge · T träge · TT superträge', 'FF very fast · F fast · M medium · T time-lag · TT long time-lag') },
      { label: l('Auswahl', 'Choosing'), value: l('etwas über dem normalen Betriebsstrom, aber unter dem, was Leitungen und Bauteile vertragen', 'a bit above the normal operating current but below what wires and parts can handle') },
    ],
    pitfalls: [
      l('Sicherung durch Draht oder einen höheren Wert ersetzt: Damit ist der Schutz weg – Brandgefahr!', 'Fuse replaced by a wire or a higher value: the protection is gone – fire hazard!'),
      l('Flinke Sicherung vor einem Trafo: Der Einschaltstrom lässt sie sofort durchbrennen; dort gehört eine träge hin.', 'Fast fuse in front of a transformer: the inrush current blows it immediately; use a time-lag fuse there.'),
      l('Sicherung an der falschen Stelle: Sie muss vor dem zu schützenden Teil in der Zuleitung sitzen, sonst überbrückt ein Kurzschluss sie.', 'Fuse in the wrong place: it must sit in the supply line ahead of the protected part, otherwise a short circuit bypasses it.'),
    ],
  },
  {
    id: 'crystal',
    title: l('Quarz', 'Crystal'),
    match: { name: 'quarz|crystal|xtal|resonator' },
    summary: l(
      'Ein Quarz ist ein winziges, präzise geschliffenes Kristallplättchen, das mechanisch auf einer festen Frequenz schwingt. Er gibt Mikrocontrollern, Uhren und Funkgeräten einen genauen Takt.',
      'A crystal is a tiny, precisely cut quartz plate that vibrates mechanically at a fixed frequency. It gives microcontrollers, clocks and radios an accurate clock.',
    ),
    body: {
      de: p(
        'Quarz ist **piezoelektrisch**: Eine Spannung verformt den Kristall, und eine Verformung erzeugt eine Spannung. Angeregt von einer Verstärkerschaltung (Oszillator) schwingt das Plättchen deshalb auf seiner Resonanzfrequenz – sehr genau und stabil, typisch auf ±20 ppm (0,002 %).',
        'Allein schwingt ein Quarz nicht, er braucht einen Oszillator. Beim Mikrocontroller ist der schon eingebaut: Du schließt den Quarz an XTAL1/XTAL2 an und setzt von jedem Pin einen kleinen **Lastkondensator** (z. B. 22 pF) nach Masse. Uhrenquarze schwingen auf 32,768 kHz – das sind 2¹⁵ Hz, durch 15-maliges Halbieren entsteht genau eine Sekunde.',
        'Im Symbol liegt ein Rechteck (der Kristall) zwischen zwei Platten. Quarze haben keine Polarität. Eine günstigere, ungenauere Alternative ist der **Keramikresonator**.',
      ),
      en: p(
        'Quartz is **piezoelectric**: a voltage deforms the crystal, and a deformation produces a voltage. Driven by an amplifier circuit (oscillator), the plate therefore vibrates at its resonant frequency – very accurately and stably, typically within ±20 ppm (0.002 %).',
        'A crystal does not oscillate on its own; it needs an oscillator. Microcontrollers have one built in: you connect the crystal to XTAL1/XTAL2 and add a small **load capacitor** (e.g. 22 pF) from each pin to ground. Watch crystals run at 32.768 kHz – that is 2¹⁵ Hz, and halving it 15 times gives exactly one second.',
        'The symbol shows a rectangle (the crystal) between two plates. Crystals have no polarity. A cheaper, less accurate alternative is the **ceramic resonator**.',
      ),
    },
    formulas: [{ label: l('Lastkapazität', 'Load capacitance'), formula: 'C_L = C_1 \\cdot C_2 / (C_1 + C_2) + C_{stray}' }],
    facts: [
      { label: l('Typische Frequenzen', 'Typical frequencies'), value: l('32,768 kHz (Uhren) · 4, 8, 12, 16 MHz (Mikrocontroller) · 10 MHz', '32.768 kHz (clocks) · 4, 8, 12, 16 MHz (microcontrollers) · 10 MHz') },
      { label: l('Genauigkeit', 'Accuracy'), value: l('±10 … 50 ppm; 20 ppm ≈ 1,7 s Abweichung pro Tag', '±10 … 50 ppm; 20 ppm ≈ 1.7 s error per day') },
      { label: l('Lastkondensatoren', 'Load capacitors'), value: l('meist 12–22 pF je Pin, passend zur Lastkapazität im Datenblatt', 'usually 12–22 pF per pin, matched to the load capacitance in the datasheet') },
    ],
    pitfalls: [
      l('Lastkondensatoren vergessen oder falsch gewählt: Der Oszillator schwingt nicht an oder auf einer falschen Frequenz.', 'Load capacitors missing or wrong: the oscillator does not start or runs at the wrong frequency.'),
      l('Lange Leitungen: Quarz und Kondensatoren gehören ganz dicht an die IC-Pins, mit kurzer Masseverbindung.', 'Long traces: crystal and capacitors belong right at the chip pins, with a short ground connection.'),
      l('Beim Mikrocontroller muss die Taktquelle per Konfiguration (bei AVR: Fuses) auf „externer Quarz“ stehen, sonst wird er ignoriert.', 'On a microcontroller the clock source must be configured (on AVR: fuses) to “external crystal”, otherwise it is ignored.'),
    ],
  },
  {
    id: 'speaker',
    title: l('Lautsprecher & Summer', 'Speaker & buzzer'),
    match: { name: 'lautsprecher|speaker|buzzer|summer|piezo|kopfhörer|headphone|horn' },
    summary: l(
      'Lautsprecher und Summer wandeln elektrische Signale in Schall. Lautsprecher brauchen ein Wechselsignal; aktive Summer piepen schon an Gleichspannung.',
      'Speakers and buzzers turn electrical signals into sound. Speakers need an alternating signal; active buzzers beep on plain DC.',
    ),
    body: {
      de: p(
        'Ein dynamischer **Lautsprecher** hat eine Schwingspule im Feld eines Dauermagneten. Wechselstrom durch die Spule bewegt sie samt Membran hin und her – so entsteht Schall. Wichtigste Kenngrößen sind die **Impedanz** (meist 4 Ω oder 8 Ω) und die Belastbarkeit in Watt. Kopfhörer funktionieren genauso, sind aber hochohmiger (16–300 Ω).',
        '**Piezo-Summer** nutzen ein piezoelektrisches Plättchen. Ein *passiver* Piezo braucht ein Wechselsignal (z. B. ein Rechteck aus einem 555 oder einem Mikrocontroller) und gibt dessen Frequenz wieder. Ein *aktiver* Summer hat einen Oszillator eingebaut: Gleichspannung anlegen, und er piept – dafür ist er gepolt.',
        'Ein Lautsprecher gehört nie direkt an einen Logikausgang: Wegen der kleinen Impedanz flösse viel zu viel Strom. Dazwischen kommt ein Verstärker oder Transistor und meist ein Koppelkondensator, der den Gleichanteil abblockt.',
      ),
      en: p(
        'A dynamic **speaker** has a voice coil in the field of a permanent magnet. AC through the coil moves it and the cone back and forth – that makes sound. The key figures are the **impedance** (usually 4 Ω or 8 Ω) and the power rating in watts. Headphones work the same way but have a higher impedance (16–300 Ω).',
        '**Piezo buzzers** use a piezoelectric disc. A *passive* piezo needs an alternating signal (e.g. a square wave from a 555 or a microcontroller) and reproduces its frequency. An *active* buzzer has a built-in oscillator: apply DC and it beeps – which is why it is polarised.',
        'Never connect a speaker directly to a logic output: its low impedance would draw far too much current. Put an amplifier or transistor in between, and usually a coupling capacitor that blocks the DC component.',
      ),
    },
    formulas: [{ label: l('Leistung', 'Power'), formula: 'P = U_{rms}² / Z' }],
    facts: [
      { label: l('Impedanz', 'Impedance'), value: l('Lautsprecher 4 Ω / 8 Ω, Kopfhörer 16–300 Ω', 'speakers 4 Ω / 8 Ω, headphones 16–300 Ω') },
      { label: l('Piezo', 'Piezo'), value: l('hochohmig; Resonanz meist bei 2–4 kHz, dort am lautesten', 'high impedance; resonance usually at 2–4 kHz, loudest there') },
      { label: l('Aktiver Summer', 'Active buzzer'), value: l('Gleichspannung (z. B. 5 V oder 12 V); langes Bein bzw. „+“ = Plus', 'DC (e.g. 5 V or 12 V); long leg or “+” = positive') },
    ],
    pitfalls: [
      l('8-Ω-Lautsprecher direkt an 5 V: über 600 mA Gleichstrom – das überlastet Ausgang und Schwingspule.', '8 Ω speaker straight on 5 V: over 600 mA of DC – that overloads the output and the voice coil.'),
      l('Gleichstrom durch den Lautsprecher macht keinen Ton, nur Wärme – das Signal muss sich ändern.', 'DC through the speaker makes no sound, only heat – the signal has to change.'),
      l('Aktiven und passiven Summer verwechselt: Der passive bleibt an Gleichspannung stumm (nur ein Knacken).', 'Active and passive buzzer mixed up: the passive one stays silent on DC (just a click).'),
    ],
  },
  {
    id: 'lamp',
    title: l('Glühlampe & Glimmlampe', 'Light bulb & neon lamp'),
    match: { name: 'lampe|lämpchen|\\blamp|bulb' },
    summary: l(
      'In einer Glühlampe bringt der Strom einen dünnen Wolframdraht zum Glühen. Sie ist das klassische Anzeigebauteil im ersten Stromkreis.',
      'In a light bulb the current makes a thin tungsten filament glow. It is the classic indicator in a first circuit.',
    ),
    body: {
      de: p(
        'Die Glühlampe ist im Prinzip ein Widerstand, der so heiß wird, dass er leuchtet (über 2000 °C). Sie hat keine Polarität und funktioniert mit Gleich- und Wechselspannung. Angegeben werden Nennspannung und Strom oder Leistung, z. B. 6 V / 50 mA.',
        'Wichtig: Der kalte Glühfaden hat nur etwa ein Zehntel seines Betriebswiderstands. Beim Einschalten fließt deshalb kurz ein hoher **Einschaltstrom** – den muss ein Transistor oder Schalter aushalten.',
        'Eine **Glimmlampe** funktioniert ganz anders: Ein Gas (Neon) zündet erst ab etwa 70–90 V und leuchtet orange. Sie braucht immer einen Vorwiderstand (am Netz einige 100 kΩ) und dient als Netzspannungsanzeige.',
      ),
      en: p(
        'A light bulb is basically a resistor that gets so hot that it glows (above 2000 °C). It has no polarity and works on DC and AC. It is rated by voltage and current or power, e.g. 6 V / 50 mA.',
        'Important: the cold filament has only about a tenth of its operating resistance. At switch-on a high **inrush current** flows briefly – the transistor or switch has to cope with it.',
        'A **neon lamp** works quite differently: a gas (neon) only ignites from about 70–90 V and glows orange. It always needs a series resistor (a few hundred kΩ on the mains) and serves as a mains indicator.',
      ),
    },
    formulas: [
      { label: l('Leistung', 'Power'), formula: 'P = U \\cdot I' },
      { label: l('Widerstand im Betrieb', 'Operating resistance'), formula: 'R = U / I' },
    ],
    facts: [
      { label: l('Beispiel 6 V / 50 mA', 'Example 6 V / 50 mA'), value: l('P = 0,3 W; warm 120 Ω, kalt nur ca. 10–15 Ω', 'P = 0.3 W; hot 120 Ω, cold only about 10–15 Ω') },
      { label: l('Fassungen', 'Bases'), value: l('E10 (Taschenlampe), E14, E27 (Haushalt)', 'E10 (flashlight), E14, E27 (household)') },
    ],
    pitfalls: [
      l('Einschaltstrom unterschätzt: Der kalte Glühfaden zieht ein Vielfaches des Nennstroms – Transistor und Sicherung danach auswählen.', 'Inrush current underestimated: the cold filament draws several times the rated current – choose transistor and fuse accordingly.'),
      l('Überspannung: Schon 5 % zu viel Spannung halbiert ungefähr die Lebensdauer.', 'Overvoltage: just 5 % too much voltage roughly halves the lifetime.'),
      l('Glimmlampe ohne Vorwiderstand: Nach dem Zünden ist der Strom unbegrenzt und sie zerstört sich sofort.', 'Neon lamp without a series resistor: after ignition the current is unlimited and it destroys itself at once.'),
    ],
  },
  {
    id: 'motor',
    title: l('Elektromotor', 'Electric motor'),
    match: { name: 'motor' },
    summary: l(
      'Ein Elektromotor wandelt elektrische Energie in Drehbewegung. Gleichstrommotoren drehen schneller, je höher die Spannung ist; Schrittmotoren bewegen sich in exakten Schritten.',
      'An electric motor turns electrical energy into rotation. DC motors spin faster the higher the voltage; stepper motors move in exact steps.',
    ),
    body: {
      de: p(
        'Ein **Gleichstrommotor** hat zwei Anschlüsse. Die Drehzahl steigt mit der Spannung, die Drehrichtung kehrt sich um, wenn du die Polung tauschst. Unter Last steigt der Strom; beim Anlaufen oder Blockieren fließt der **Anlaufstrom** – oft das 5- bis 10-Fache des Leerlaufstroms.',
        'Elektrisch ist ein Motor vor allem eine **Spule**: Beim Abschalten entsteht eine Spannungsspitze, außerdem erzeugen die Bürsten Störungen. Darum gehört an jeden Transistor, der einen Motor schaltet, eine **Freilaufdiode**, und an den Motor selbst oft ein 100-nF-Entstörkondensator. Die Drehzahl stellst du elegant per **PWM** ein, die Richtung mit einer H-Brücke (z. B. L293D).',
        '**Schrittmotoren** haben zwei Wicklungen (bipolar, 4 Drähte) oder Wicklungen mit Mittelanzapfung (unipolar, 5 oder 6 Drähte). Ein Treiber bestromt sie nacheinander, und der Motor dreht pro Impuls um einen festen Winkel, oft 1,8° (200 Schritte pro Umdrehung).',
      ),
      en: p(
        'A **DC motor** has two terminals. The speed rises with the voltage, and the direction reverses when you swap the polarity. Under load the current increases; at start-up or when stalled the **stall current** flows – often 5 to 10 times the no-load current.',
        'Electrically a motor is mostly a **coil**: turning it off produces a voltage spike, and the brushes generate noise. So every transistor that switches a motor needs a **freewheeling diode**, and the motor itself often gets a 100 nF suppression capacitor. Set the speed elegantly with **PWM** and the direction with an H-bridge (e.g. L293D).',
        '**Stepper motors** have two windings (bipolar, 4 wires) or centre-tapped windings (unipolar, 5 or 6 wires). A driver energises them in sequence, and the motor turns by a fixed angle per pulse, often 1.8° (200 steps per revolution).',
      ),
    },
    formulas: [
      { label: l('Leistungsaufnahme', 'Input power'), formula: 'P = U \\cdot I' },
      { label: l('Mittlere Spannung bei PWM (Tastgrad D)', 'Average voltage with PWM (duty cycle D)'), formula: 'U_{avg} = D \\cdot U_B' },
    ],
    facts: [
      { label: l('Anlaufstrom', 'Stall current'), value: l('ca. 5–10 × Leerlaufstrom', 'about 5–10 × no-load current') },
      { label: l('Schrittwinkel', 'Step angle'), value: l('meist 1,8° (200 Schritte/Umdrehung) oder 0,9°', 'usually 1.8° (200 steps/rev) or 0.9°') },
      { label: l('Treiber', 'Drivers'), value: l('DC: L293D, L298N oder MOSFET + Diode · Schritt: A4988, DRV8825, ULN2003 (unipolar)', 'DC: L293D, L298N or MOSFET + diode · stepper: A4988, DRV8825, ULN2003 (unipolar)') },
    ],
    pitfalls: [
      l('Motor direkt am Mikrocontroller-Pin: viel zu viel Strom, und die Rückspannung zerstört den Pin.', 'Motor straight on a microcontroller pin: far too much current, and the back EMF kills the pin.'),
      l('Freilaufdiode vergessen: Die Abschaltspitze zerstört den Schalttransistor.', 'Forgotten freewheeling diode: the turn-off spike destroys the switching transistor.'),
      l('Gemeinsame Versorgung mit der Logik: Anlaufströme lassen die Spannung einbrechen und den Controller neu starten – mit Elko puffern oder getrennt versorgen.', 'Shared supply with the logic: start-up currents make the voltage dip and reset the controller – buffer with an electrolytic or use separate supplies.'),
    ],
    lessons: ['transistor-switch'],
  },

  // ---- resistors ------------------------------------------------------------------------
  {
    id: 'potentiometer',
    title: l('Potentiometer & Trimmer', 'Potentiometer & trimmer'),
    match: { spiceType: 'RESISTOR', name: 'pot|trimm' },
    summary: l(
      'Ein Potentiometer (Poti) ist ein Widerstand mit verstellbarem Abgriff, dem Schleifer. Damit stellst du Spannungen oder Widerstände stufenlos ein, z. B. Lautstärke oder Helligkeit.',
      'A potentiometer (pot) is a resistor with an adjustable tap, the wiper. It lets you set voltages or resistances continuously, e.g. volume or brightness.',
    ),
    body: {
      de: p(
        'Ein Poti hat drei Anschlüsse: die beiden Enden der Widerstandsbahn (meist 1 und 3) und den **Schleifer** (meist 2), der auf der Bahn gleitet. Zwischen den Enden liegt immer der volle Nennwert, z. B. 10 kΩ; der Schleifer teilt ihn in zwei Teile.',
        'Als **Spannungsteiler** geschaltet – die Enden an Plus und Masse – liefert der Schleifer jede Spannung zwischen 0 V und der Versorgung. Nutzt du nur ein Ende und den Schleifer, hast du einen **einstellbaren Widerstand**.',
        '**Trimmer** sind kleine Potis, die man einmal mit dem Schraubendreher abgleicht und dann in Ruhe lässt. Im Symbol erkennst du das Poti am Pfeil auf das Widerstandsrechteck. Mit eingeschalteten Live-Werten kannst du den Schleifer im Schaltplan ziehen und siehst sofort, wie sich Spannungen und Ströme ändern.',
      ),
      en: p(
        'A pot has three terminals: the two ends of the resistive track (usually 1 and 3) and the **wiper** (usually 2), which slides along the track. The full rated value, e.g. 10 kΩ, is always between the ends; the wiper splits it into two parts.',
        'Wired as a **voltage divider** – ends to the supply and ground – the wiper delivers any voltage between 0 V and the supply. If you use just one end and the wiper, you get an **adjustable resistor**.',
        '**Trimmers** are small pots that you adjust once with a screwdriver and then leave alone. In the symbol the pot is recognised by the arrow on the resistor rectangle. With live values switched on you can drag the wiper in the schematic and immediately see how voltages and currents change.',
      ),
    },
    formulas: [
      { label: l('Schleiferspannung (unbelastet, Stellung α von 0 bis 1)', 'Wiper voltage (unloaded, position α from 0 to 1)'), formula: 'U_S = α \\cdot U_B' },
      { label: l('Spannungsteiler', 'Voltage divider'), formula: 'U_{out} = U_{in} \\cdot R_2 / (R_1 + R_2)' },
    ],
    facts: [
      { label: l('Typische Werte', 'Typical values'), value: l('1 kΩ, 10 kΩ, 47 kΩ, 100 kΩ – 10 kΩ ist der Klassiker', '1 kΩ, 10 kΩ, 47 kΩ, 100 kΩ – 10 kΩ is the classic') },
      { label: l('Kennlinie', 'Taper'), value: l('**lin** für Einstellspannungen, **log** für Lautstärke (das Ohr hört logarithmisch)', '**lin** for setting voltages, **log** for volume (hearing is logarithmic)') },
      { label: l('Belastbarkeit', 'Power rating'), value: l('kleine Potis ca. 0,1–0,5 W, Trimmer oft nur 0,1 W', 'small pots about 0.1–0.5 W, trimmers often only 0.1 W') },
    ],
    pitfalls: [
      l('Schleifer am Anschlag: Als Vorwiderstand geschaltet wird der Widerstand am Ende 0 Ω – setze einen festen Widerstand in Reihe, sonst fließt zu viel Strom (z. B. durch eine LED).', 'Wiper at the end stop: used as a series resistor it reaches 0 Ω – add a fixed resistor in series, otherwise too much current flows (e.g. through an LED).'),
      l('Belasteter Spannungsteiler: Hängt am Schleifer ein niederohmiger Verbraucher, bricht die Spannung ein. Faustregel: Last mindestens zehnmal hochohmiger als das Poti.', 'Loaded divider: a low-resistance load on the wiper pulls the voltage down. Rule of thumb: the load should be at least ten times the pot value.'),
      l('Über den Schleifer darf nur wenig Strom fließen – ein Poti ist kein Leistungsbauteil.', 'Only a small current may flow through the wiper – a pot is not a power component.'),
    ],
    lessons: ['potentiometer', 'voltage-divider'],
  },
  {
    id: 'thermistor',
    title: l('NTC & PTC (Thermistor)', 'NTC & PTC (thermistor)'),
    match: { name: '\\bntc|\\bptc|heißleiter|kaltleiter|thermistor|\\bpt100' },
    summary: l(
      'Thermistoren ändern ihren Widerstand mit der Temperatur: Ein NTC (Heißleiter) wird warm niederohmiger, ein PTC (Kaltleiter) hochohmiger.',
      'Thermistors change their resistance with temperature: an NTC gets lower when warm, a PTC gets higher.',
    ),
    body: {
      de: p(
        '**NTC** steht für *Negative Temperature Coefficient*: Steigt die Temperatur, sinkt der Widerstand. NTCs sind die Standard-Temperaturfühler in Bastelprojekten, Ladegeräten und Thermostaten. Ihr Nennwert gilt bei 25 °C, z. B. „NTC 10k“.',
        '**PTC** (*Positive Temperature Coefficient*) wird bei Erwärmung hochohmiger, viele Typen sogar sprunghaft ab einer bestimmten Temperatur. Deshalb dienen PTCs als selbstrückstellende Sicherungen und als Überlastschutz. Auch Platin-Messwiderstände wie der **PT100** (100 Ω bei 0 °C) steigen mit der Temperatur – allerdings fast linear und sehr genau.',
        'Im Symbol ist ein schräger Strich mit Knick durch das Rechteck gezogen, oft mit „ϑ“ daneben. Zum Messen schaltest du den Thermistor wie einen LDR mit einem festen Widerstand zu einem Spannungsteiler.',
      ),
      en: p(
        '**NTC** stands for *negative temperature coefficient*: when the temperature rises, the resistance falls. NTCs are the standard temperature sensors in hobby projects, chargers and thermostats. Their rated value applies at 25 °C, e.g. “NTC 10k”.',
        'A **PTC** (*positive temperature coefficient*) gets higher in resistance when heated, many types even abruptly above a certain temperature. That is why PTCs serve as resettable fuses and overload protection. Platinum sensors such as the **PT100** (100 Ω at 0 °C) also rise with temperature – but almost linearly and very accurately.',
        'In the symbol a slanted line with a kink runs through the rectangle, often with “ϑ” next to it. To measure, combine the thermistor with a fixed resistor into a voltage divider, just like an LDR.',
      ),
    },
    formulas: [
      { label: l('NTC (B-Modell, T in Kelvin)', 'NTC (beta model, T in kelvin)'), formula: 'R(T) = R_{25} \\cdot exp(B \\cdot (1/T - 1/T_{25}))' },
      { label: l('PT100 (ϑ in °C)', 'PT100 (ϑ in °C)'), formula: 'R(ϑ) \\approx R_0 \\cdot (1 + α \\cdot ϑ)' },
    ],
    facts: [
      { label: l('Typische NTCs', 'Typical NTCs'), value: l('10 kΩ bei 25 °C (am häufigsten), auch 4,7 kΩ und 100 kΩ', '10 kΩ at 25 °C (most common), also 4.7 kΩ and 100 kΩ') },
      { label: l('B-Wert', 'Beta value'), value: l('ca. 3000–4500 K, oft 3435 K oder 3950 K', 'about 3000–4500 K, often 3435 K or 3950 K') },
      { label: l('Faustregel NTC', 'NTC rule of thumb'), value: l('um Raumtemperatur ca. 4 % weniger Widerstand pro Grad', 'around room temperature about 4 % less resistance per degree') },
      { label: l('PT100', 'PT100'), value: l('100 Ω bei 0 °C, α = 0,00385 /K (ca. +0,385 Ω pro Grad)', '100 Ω at 0 °C, α = 0.00385 /K (about +0.385 Ω per degree)') },
    ],
    pitfalls: [
      l('Eigenerwärmung: Ein zu großer Messstrom heizt den Fühler selbst auf und verfälscht die Messung – Leistung im Thermistor klein halten.', 'Self-heating: too much measuring current heats the sensor itself and falsifies the reading – keep the power in the thermistor small.'),
      l('NTC-Kennlinien sind stark nichtlinear – mit der B-Formel oder einer Tabelle rechnen, nicht mit einer Geraden.', 'NTC curves are strongly non-linear – use the beta formula or a table, not a straight line.'),
      l('NTC und PTC verwechselt: gleiches Aussehen, entgegengesetztes Verhalten.', 'NTC and PTC mixed up: same looks, opposite behaviour.'),
    ],
    lessons: ['voltage-divider'],
  },
  {
    id: 'inductor',
    title: l('Spule (Induktivität)', 'Inductor (coil)'),
    match: { name: 'spule|induct|drossel|\\bcoil|drahtwendel' },
    summary: l(
      'Eine Spule speichert Energie im Magnetfeld. Sie lässt Gleichstrom fast ungehindert durch, wehrt sich aber gegen schnelle Stromänderungen.',
      'An inductor stores energy in its magnetic field. It passes DC almost freely but resists fast changes in current.',
    ),
    body: {
      de: p(
        'Eine Spule ist ein aufgewickelter Draht, oft um einen Kern aus Ferrit oder Eisen. Fließt Strom, baut sich ein Magnetfeld auf. Ändert sich der Strom, induziert dieses Feld eine Gegenspannung, die die Änderung bremst – die Spule ist „träge“ für Strom, so wie ein Kondensator für Spannung.',
        'Ihre Kenngröße ist die **Induktivität** in Henry (H), praktisch µH und mH. Für Gleichstrom zählt nur der Drahtwiderstand; für Wechselstrom steigt ihr Blindwiderstand mit der Frequenz. Deshalb filtern Spulen hohe Frequenzen heraus (Drosseln), speichern Energie in Schaltreglern und bilden mit Kondensatoren Schwingkreise.',
        'Im Symbol ist die Spule ein ausgefülltes Rechteck (DIN) oder eine Reihe von Bögen; Striche daneben zeigen einen Kern an. Spulen haben normalerweise keine Polarität.',
      ),
      en: p(
        'An inductor is a wound-up wire, often around a ferrite or iron core. When current flows, a magnetic field builds up. When the current changes, this field induces a counter-voltage that opposes the change – the inductor is “sluggish” for current, just as a capacitor is for voltage.',
        'Its key figure is the **inductance** in henry (H), in practice µH and mH. For DC only the wire resistance counts; for AC its reactance rises with frequency. That is why inductors filter out high frequencies (chokes), store energy in switching regulators and form resonant circuits with capacitors.',
        'In the symbol an inductor is a filled rectangle (DIN) or a row of loops; lines next to it indicate a core. Inductors normally have no polarity.',
      ),
    },
    formulas: [
      { label: l('Blindwiderstand', 'Reactance'), formula: 'X_L = 2\\pi f L' },
      { label: l('Induzierte Spannung', 'Induced voltage'), formula: 'U = L \\cdot \\Delta I / \\Delta t' },
      { label: l('Zeitkonstante (RL)', 'Time constant (RL)'), formula: '\\tau = L / R' },
      { label: l('Resonanzfrequenz (LC)', 'Resonant frequency (LC)'), formula: 'f_0 = 1 / (2\\pi \\sqrt{LC})' },
      { label: l('Gespeicherte Energie', 'Stored energy'), formula: 'W = ½ \\cdot L \\cdot I²' },
    ],
    facts: [
      { label: l('Typische Werte', 'Typical values'), value: l('Entstördrossel 10–100 µH, Schaltregler 10–220 µH, Netzfilter im mH-Bereich', 'suppression choke 10–100 µH, switching regulator 10–220 µH, mains filters in the mH range') },
      { label: l('Wichtige Angaben', 'Key ratings'), value: l('Induktivität, Sättigungsstrom, Drahtwiderstand', 'inductance, saturation current, DC resistance') },
    ],
    pitfalls: [
      l('Abschaltspannung: Wird der Strom durch eine Spule (auch Relais oder Motor) plötzlich unterbrochen, entsteht eine hohe Spannungsspitze – Transistoren mit einer Freilaufdiode schützen.', 'Turn-off voltage: when the current through a coil (relay or motor too) is suddenly interrupted, a high voltage spike appears – protect transistors with a freewheeling diode.'),
      l('Sättigung: Über dem Nennstrom verliert der Kern seine Wirkung, die Induktivität bricht ein und der Strom steigt sehr schnell.', 'Saturation: above the rated current the core stops working, the inductance collapses and the current rises very fast.'),
      l('Spulen koppeln magnetisch mit ihrer Umgebung – auf der Platine nicht dicht an empfindliche Signalleitungen setzen.', 'Inductors couple magnetically with their surroundings – do not place them close to sensitive signal traces on the PCB.'),
    ],
  },
  {
    id: 'resistor',
    title: l('Widerstand', 'Resistor'),
    match: { spiceType: 'RESISTOR' },
    summary: l(
      'Ein Widerstand begrenzt den Strom und setzt dabei elektrische Energie in Wärme um. Er ist das häufigste Bauteil überhaupt.',
      'A resistor limits current and turns electrical energy into heat in the process. It is the most common component of all.',
    ),
    body: {
      de: p(
        'Ein Widerstand „bremst“ den Stromfluss: Je größer sein Wert in Ohm (Ω), desto weniger Strom fließt bei gleicher Spannung. Den Zusammenhang beschreibt das **ohmsche Gesetz** $U = R \\cdot I$.',
        'Typische Aufgaben: Strom begrenzen (z. B. als Vorwiderstand einer LED), Spannungen teilen (**Spannungsteiler**), Eingänge auf einen festen Pegel ziehen (Pull-up/Pull-down) und zusammen mit Kondensatoren Zeiten und Filter festlegen. Sonderformen wie Shunts (Strommessung), Varistoren (VDR) oder Dehnungsmessstreifen nutzen dasselbe Prinzip.',
        'Im Schaltplan ist der Widerstand ein Rechteck (DIN/IEC) oder eine Zickzacklinie (US-Norm). Er hat keine Polarität – du kannst ihn beliebig herum einbauen. Wichtig sind zwei Angaben: der **Widerstandswert** und die **Belastbarkeit** in Watt.',
      ),
      en: p(
        'A resistor “slows down” the current: the higher its value in ohms (Ω), the less current flows at the same voltage. The relationship is **Ohm’s law** $U = R \\cdot I$.',
        'Typical jobs: limiting current (e.g. as an LED series resistor), dividing voltages (**voltage divider**), pulling inputs to a defined level (pull-up/pull-down) and, together with capacitors, setting times and filters. Special types such as shunts (current sensing), varistors (VDR) or strain gauges use the same principle.',
        'In the schematic a resistor is a rectangle (DIN/IEC) or a zigzag line (US style). It has no polarity – you can fit it either way round. Two figures matter: the **resistance** and the **power rating** in watts.',
      ),
    },
    formulas: [
      { label: l('Ohmsches Gesetz', 'Ohm’s law'), formula: 'U = R \\cdot I' },
      { label: l('Leistung', 'Power'), formula: 'P = U \\cdot I = I² \\cdot R = U² / R' },
      { label: l('Reihenschaltung', 'Series'), formula: 'R = R_1 + R_2' },
      { label: l('Parallelschaltung', 'Parallel'), formula: 'R = R_1 \\cdot R_2 / (R_1 + R_2)' },
      { label: l('Spannungsteiler', 'Voltage divider'), formula: 'U_{out} = U_{in} \\cdot R_2 / (R_1 + R_2)' },
    ],
    facts: [
      { label: l('E12-Reihe', 'E12 series'), value: l('1,0 1,2 1,5 1,8 2,2 2,7 3,3 3,9 4,7 5,6 6,8 8,2 (× 10ⁿ); E24 und E96 sind feiner gestuft', '1.0 1.2 1.5 1.8 2.2 2.7 3.3 3.9 4.7 5.6 6.8 8.2 (× 10ⁿ); E24 and E96 are finer') },
      { label: l('Schreibweise', 'Notation'), value: l('`4k7` = 4,7 kΩ · `1M` = 1 MΩ · `R47` = 0,47 Ω', '`4k7` = 4.7 kΩ · `1M` = 1 MΩ · `R47` = 0.47 Ω') },
      { label: l('Farbcode', 'Colour code'), value: l('schwarz 0, braun 1, rot 2, orange 3, gelb 4, grün 5, blau 6, violett 7, grau 8, weiß 9; gelb-violett-rot = 47 × 100 Ω = 4,7 kΩ', 'black 0, brown 1, red 2, orange 3, yellow 4, green 5, blue 6, violet 7, grey 8, white 9; yellow-violet-red = 47 × 100 Ω = 4.7 kΩ') },
      { label: l('Toleranz', 'Tolerance'), value: l('Metallfilm meist ±1 % (brauner Ring), Kohleschicht ±5 % (goldener Ring)', 'metal film usually ±1 % (brown band), carbon film ±5 % (gold band)') },
      { label: l('Belastbarkeit', 'Power rating'), value: l('bedrahtet meist 0,25 W oder 0,6 W; SMD 0603 ca. 0,1 W', 'through-hole usually 0.25 W or 0.6 W; SMD 0603 about 0.1 W') },
    ],
    pitfalls: [
      l('Belastbarkeit vergessen: 100 Ω an 12 V müssen $P = U² / R \\approx 1,4 W$ verheizen – ein 0,25-W-Widerstand brennt durch.', 'Forgotten power rating: 100 Ω on 12 V has to dissipate $P = U² / R \\approx 1.4 W$ – a 0.25 W resistor burns out.'),
      l('Einheiten verwechselt: `1M` ist hier bei Widerständen 1 MΩ, ein kleines `m` aber milli. In reinem SPICE bedeutet auch `M` milli – dort schreibt man `1Meg`.', 'Units mixed up: here `1M` on a resistor is 1 MΩ, but a lower-case `m` means milli. In plain SPICE `M` also means milli – write `1Meg` there.'),
      l('Pull-up oder Pull-down vergessen: Offene Eingänge von Logik-ICs und Transistoren schweben und reagieren auf jede Störung.', 'Forgotten pull-up or pull-down: open inputs of logic chips and transistors float and react to any interference.'),
    ],
    lessons: ['ohms-law', 'series-parallel', 'voltage-divider', 'first-circuit'],
  },

  // ---- capacitors -----------------------------------------------------------------------
  {
    id: 'electrolytic',
    title: l('Elektrolytkondensator (Elko)', 'Electrolytic capacitor'),
    match: { name: 'elko|elektrolyt|electrolytic|tantal' },
    summary: l(
      'Elkos bieten große Kapazitäten (µF bis mF) auf kleinem Raum, sind aber gepolt: Plus und Minus müssen richtig herum angeschlossen werden.',
      'Electrolytic capacitors offer large capacitance (µF to mF) in a small size, but they are polarised: plus and minus must be connected the right way round.',
    ),
    body: {
      de: p(
        'Beim Aluminium-Elko ist das Dielektrikum eine hauchdünne Oxidschicht auf einer aufgerauten Alufolie. Dadurch passt sehr viel Kapazität in ein kleines Gehäuse – ideal zum **Glätten** von Netzteilspannungen, als Pufferspeicher und zum Koppeln niedriger Frequenzen.',
        'Die Oxidschicht hält nur in einer Richtung: Elkos sind **gepolt**. Im Symbol ist eine Platte hohl und mit „+“ markiert, die andere ausgefüllt oder gebogen (Minus). Am Bauteil zeigt ein Streifen mit Minuszeichen den **Minuspol**; bei neuen Elkos ist das Minusbein außerdem kürzer.',
        '**Tantal-Elkos** sind kleiner und stabiler, aber empfindlich gegen Verpolung und Spannungsspitzen. Bei ihnen ist – anders als beim Alu-Elko – der **Pluspol** mit einem Strich markiert.',
      ),
      en: p(
        'In an aluminium electrolytic the dielectric is a very thin oxide layer on a roughened aluminium foil. That fits a lot of capacitance into a small can – ideal for **smoothing** power supply voltages, as an energy buffer and for coupling low frequencies.',
        'The oxide layer only works in one direction: electrolytics are **polarised**. In the symbol one plate is hollow and marked “+”, the other filled or curved (minus). On the part a stripe with minus signs marks the **negative terminal**; on new parts the negative leg is also shorter.',
        '**Tantalum capacitors** are smaller and more stable but sensitive to reverse voltage and voltage spikes. On them – unlike aluminium electrolytics – the stripe marks the **positive terminal**.',
      ),
    },
    formulas: [
      { label: l('Zeitkonstante', 'Time constant'), formula: '\\tau = R \\cdot C' },
      { label: l('Brummspannung am Siebelko (Brückengleichrichter)', 'Ripple at the smoothing capacitor (bridge rectifier)'), formula: '\\Delta U \\approx I_L / (2 f \\cdot C)' },
    ],
    facts: [
      { label: l('Typische Werte', 'Typical values'), value: l('1 µF … 10 000 µF; Netzteil-Siebung oft 470–4700 µF', '1 µF … 10,000 µF; power supply smoothing often 470–4700 µF') },
      { label: l('Spannung', 'Voltage'), value: l('Nennspannung ist aufgedruckt (z. B. 16 V, 25 V, 35 V); mindestens 20–30 % Reserve einplanen', 'rated voltage is printed on it (e.g. 16 V, 25 V, 35 V); allow at least 20–30 % margin') },
      { label: l('Polarität', 'Polarity'), value: l('Streifen mit „–“ = Minus; kurzes Bein = Minus; im Symbol „+“ am Pluspol', 'stripe with “–” = negative; short leg = negative; “+” at the positive plate in the symbol') },
      { label: l('Toleranz', 'Tolerance'), value: l('groß, oft ±20 %', 'wide, often ±20 %') },
      { label: l('Lebensdauer', 'Lifetime'), value: l('begrenzt, z. B. 2000 h bei 105 °C; je 10 °C kühler verdoppelt sie sich etwa', 'limited, e.g. 2000 h at 105 °C; roughly doubles for every 10 °C cooler') },
    ],
    pitfalls: [
      l('Verpolt eingebaut: Der Elko wird warm, bläht sich auf und kann platzen. Immer auf den Minusstreifen achten!', 'Reversed: the capacitor heats up, bulges and may burst. Always watch the minus stripe!'),
      l('Spannung zu knapp gewählt: Ein 16-V-Elko an 15 V hat keine Reserve – nimm 25 V.', 'Voltage rating too tight: a 16 V capacitor on 15 V has no margin – use 25 V.'),
      l('Elkos haben einen merklichen Innenwiderstand (ESR) und wirken bei hohen Frequenzen schlecht – parallel einen 100-nF-Keramikkondensator setzen.', 'Electrolytics have a noticeable internal resistance (ESR) and work poorly at high frequencies – add a 100 nF ceramic in parallel.'),
      l('Für genaue Zeiten ungeeignet: Toleranz und Leckstrom sind groß.', 'Not suited for accurate timing: tolerance and leakage are large.'),
    ],
    lessons: ['rc-time-constant'],
  },
  {
    id: 'capacitor',
    title: l('Kondensator', 'Capacitor'),
    match: { spiceType: 'CAPACITOR' },
    summary: l(
      'Ein Kondensator speichert elektrische Ladung zwischen zwei isolierten Platten. Er sperrt Gleichstrom, lässt Wechselstrom aber umso besser durch, je höher die Frequenz ist.',
      'A capacitor stores electric charge between two insulated plates. It blocks DC but passes AC the better the higher the frequency.',
    ),
    body: {
      de: p(
        'Ein Kondensator besteht aus zwei leitenden Flächen, getrennt durch einen Isolator (Dielektrikum). Legst du eine Spannung an, sammelt sich Ladung auf den Platten. Wie viel, sagt die **Kapazität** in Farad (F); praktisch rechnest du mit pF, nF und µF.',
        'Über einen Widerstand geladen, steigt die Spannung nicht sofort, sondern entlang einer e-Funktion: Nach einer **Zeitkonstante** $\\tau = R \\cdot C$ sind es rund 63 %, nach 5 τ ist er praktisch voll. Darauf beruhen Verzögerungen, Timer und Filter wie der RC-Tiefpass.',
        'Einsatzgebiete: **Abblocken** der Versorgung direkt an ICs, **Koppeln** von Wechselsignalen (der Gleichanteil wird abgetrennt), Filter und Schwingkreise. Keramik- und Folienkondensatoren haben **keine Polarität**; das Symbol zeigt zwei gleiche parallele Platten.',
      ),
      en: p(
        'A capacitor consists of two conductive plates separated by an insulator (dielectric). When you apply a voltage, charge collects on the plates. How much is given by the **capacitance** in farads (F); in practice you work with pF, nF and µF.',
        'Charged through a resistor, the voltage does not jump but follows an exponential curve: after one **time constant** $\\tau = R \\cdot C$ it reaches about 63 %, after 5 τ it is practically full. Delays, timers and filters such as the RC low-pass are based on this.',
        'Uses: **decoupling** the supply right at the chips, **coupling** AC signals (the DC component is blocked), filters and resonant circuits. Ceramic and film capacitors have **no polarity**; the symbol shows two identical parallel plates.',
      ),
    },
    formulas: [
      { label: l('Ladung', 'Charge'), formula: 'Q = C \\cdot U' },
      { label: l('Zeitkonstante', 'Time constant'), formula: '\\tau = R \\cdot C' },
      { label: l('Laden über R', 'Charging through R'), formula: 'U_C(t) = U_0 \\cdot (1 - exp(-t / \\tau))' },
      { label: l('Blindwiderstand', 'Reactance'), formula: 'X_C = 1 / (2\\pi f C)' },
      { label: l('Grenzfrequenz RC-Tiefpass', 'RC low-pass cut-off frequency'), formula: 'f_g = 1 / (2\\pi R C)' },
    ],
    facts: [
      { label: l('Keramik (MLCC)', 'Ceramic (MLCC)'), value: l('1 pF … ca. 10 µF; Standard zum Abblocken: 100 nF', '1 pF … about 10 µF; standard for decoupling: 100 nF') },
      { label: l('Folie', 'Film'), value: l('ca. 1 nF … 10 µF; stabil und genau, für Filter und Audio', 'about 1 nF … 10 µF; stable and accurate, for filters and audio') },
      { label: l('Aufdruck', 'Marking'), value: l('`104` = 10 × 10⁴ pF = 100 nF · `223` = 22 nF · `471` = 470 pF', '`104` = 10 × 10⁴ pF = 100 nF · `223` = 22 nF · `471` = 470 pF') },
      { label: l('Parallel / Reihe', 'Parallel / series'), value: l('parallel addieren sich die Kapazitäten; in Reihe wird es weniger (wie Widerstände parallel)', 'in parallel capacitances add up; in series the total gets smaller (like resistors in parallel)') },
      { label: l('Spannungsfestigkeit', 'Voltage rating'), value: l('immer mit Reserve über der höchsten auftretenden Spannung wählen', 'always choose it with margin above the highest voltage that occurs') },
    ],
    pitfalls: [
      l('Abblockkondensator vergessen: Jedes IC braucht 100 nF direkt zwischen seinen Versorgungspins, sonst schwingt oder spinnt die Schaltung.', 'Forgotten decoupling capacitor: every chip needs 100 nF right between its supply pins, otherwise the circuit oscillates or misbehaves.'),
      l('Einheiten: `100n` sind 100 nF, `100` ohne Vorsatz aber 100 F – ein riesiger Wert. Für Mikrofarad schreibst du `u` (z. B. `10u`), denn `m` heißt milli.', 'Units: `100n` is 100 nF, but `100` without a prefix is 100 F – a huge value. For microfarads write `u` (e.g. `10u`), since `m` means milli.'),
      l('Keramikkondensatoren der Klassen X7R und besonders Y5V verlieren bei Gleichspannung und Temperatur deutlich Kapazität – für genaue Zeiten C0G/NP0 oder Folie nehmen.', 'Class X7R and especially Y5V ceramics lose a lot of capacitance with DC bias and temperature – use C0G/NP0 or film for accurate timing.'),
      l('Große Kondensatoren können auch ausgeschaltet noch geladen sein – vor Arbeiten an Netzteilen entladen.', 'Large capacitors can stay charged after power-off – discharge them before working on power supplies.'),
    ],
    lessons: ['rc-time-constant', 'rc-lowpass-bench'],
  },

  // ---- sources --------------------------------------------------------------------------
  {
    id: 'battery',
    title: l('Batterie & Spannungsquelle', 'Battery & voltage source'),
    match: { spiceType: 'VOLTAGE_SOURCE' },
    summary: l(
      'Eine Spannungsquelle liefert die Energie für die Schaltung. Sie hält zwischen Plus- und Minuspol eine möglichst feste Spannung; wie viel Strom fließt, bestimmt die Last.',
      'A voltage source supplies the energy for the circuit. It keeps a voltage as constant as possible between its positive and negative terminals; the load decides how much current flows.',
    ),
    body: {
      de: p(
        'Batterien und Akkus wandeln chemische Energie in elektrische. Im Symbol ist der **lange Strich der Pluspol**, der kurze (oft dickere) Strich der Minuspol. Mehrere Zellen in Reihe addieren ihre Spannungen: Sechs Zellen à 1,5 V ergeben eine 9-V-Batterie.',
        'Eine echte Batterie hat einen **Innenwiderstand**: Je mehr Strom du entnimmst, desto weiter sinkt die Klemmenspannung. Wie lange sie hält, sagt die **Kapazität** in mAh – eine 2000-mAh-Zelle liefert theoretisch 100 Stunden lang 20 mA.',
        'Im Simulator ist die Quelle ideal und einstellbar: **DC** für eine feste Gleichspannung oder **AC** mit Sinus- oder Pulsform für Wechselsignale, Filter und Zeitverläufe. Damit Spannungen definiert sind, gehört der Minuspol an **Masse**.',
      ),
      en: p(
        'Batteries and rechargeable cells turn chemical energy into electrical energy. In the symbol the **long line is the positive terminal**, the short (often thicker) line the negative one. Cells in series add up their voltages: six cells of 1.5 V make a 9 V battery.',
        'A real battery has an **internal resistance**: the more current you draw, the further the terminal voltage drops. How long it lasts is given by its **capacity** in mAh – a 2000 mAh cell theoretically delivers 20 mA for 100 hours.',
        'In the simulator the source is ideal and adjustable: **DC** for a fixed voltage, or **AC** with a sine or pulse shape for alternating signals, filters and waveforms. For voltages to be defined, the negative terminal belongs on **ground**.',
      ),
    },
    formulas: [
      { label: l('Klemmenspannung', 'Terminal voltage'), formula: 'U = U_0 - I \\cdot R_i' },
      { label: l('Laufzeit (grob)', 'Run time (rough)'), formula: 't \\approx Q / I' },
      { label: l('Reihenschaltung', 'Series connection'), formula: 'U = U_1 + U_2 + …' },
    ],
    facts: [
      { label: l('Zellspannungen', 'Cell voltages'), value: l('Alkali 1,5 V (leer ca. 0,9 V) · NiMH 1,2 V · Lithium-Knopfzelle CR2032 3 V · Li-Ion 3,6–3,7 V (voll 4,2 V)', 'alkaline 1.5 V (empty about 0.9 V) · NiMH 1.2 V · lithium coin cell CR2032 3 V · Li-ion 3.6–3.7 V (full 4.2 V)') },
      { label: l('Kapazität', 'Capacity'), value: l('AA (Mignon) Alkali ca. 2000–2800 mAh · 9-V-Block ca. 500 mAh', 'AA alkaline about 2000–2800 mAh · 9 V block about 500 mAh') },
      { label: l('Symbol', 'Symbol'), value: l('langer Strich = Plus, kurzer Strich = Minus', 'long line = positive, short line = negative') },
    ],
    pitfalls: [
      l('Kurzschluss: Eine direkt kurzgeschlossene Batterie liefert sehr hohe Ströme – Drähte und Zelle werden heiß, Li-Ion-Akkus können brennen.', 'Short circuit: a shorted battery delivers very high currents – wires and cell get hot, Li-ion cells can catch fire.'),
      l('Masse vergessen: Ohne Masse-Symbol kann der Simulator keine Spannungen berechnen.', 'Forgotten ground: without a ground symbol the simulator cannot compute any voltages.'),
      l('Verpolt angeschlossen: Elkos, LEDs, ICs und Transistoren nehmen das übel – eine Verpolschutzdiode hilft.', 'Reversed connection: electrolytics, LEDs, chips and transistors do not like it – a reverse-polarity diode helps.'),
      l('Unter Last ist die Spannung niedriger als im Leerlauf – besonders bei fast leeren Zellen und beim 9-V-Block.', 'Under load the voltage is lower than with no load – especially with nearly empty cells and 9 V blocks.'),
    ],
    lessons: ['first-circuit', 'ohms-law', 'rc-lowpass-bench'],
  },
];

/** The guide entry explaining a schematic symbol, if there is one. */
export function componentFor(symbol: SymbolItem): ComponentInfo | undefined {
  return COMPONENTS.find((c) => matches(symbol, c.match));
}
