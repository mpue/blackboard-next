// Lesson on printed circuit boards: from the finished LED schematic to a
// routed, DRC clean board and its fabrication files.

import { CircuitBuilder } from '../build.ts';
import { heading, ledLoop, quiz, t, type LessonDef } from './kit.ts';

const pcbTitle = t('Vom Schaltplan zur Platine', 'From schematic to PCB');

export const schematicToPcb: LessonDef = {
  id: 'schematic-to-pcb',
  topic: 'pcb',
  level: 2,
  minutes: 15,
  title: pcbTitle,
  summary: t(
    'Mach aus der LED-Schaltung eine echte Leiterplatte: Footprints anordnen, Leiterbahnen verlegen, Design-Regeln prüfen.',
    'Turn the LED circuit into a real circuit board: arrange footprints, route tracks, check the design rules.',
  ),
  start: (library, lang) => {
    const b = new CircuitBuilder(library);
    heading(
      b,
      lang,
      pcbTitle,
      t('Menü Leiterplatte → Leiterplatte aus Schaltplan erstellen macht daraus eine Platine.', 'Menu PCB → Create PCB from schematic turns it into a board.'),
    );
    ledLoop(b, { volts: 9, r: '470', closed: true });
    return b.doc();
  },
  steps: [
    {
      text: t(
        '**Erstelle die Leiterplatte.**\n\nDer Schaltplan ist fertig. Wähle im Menü **Leiterplatte → Leiterplatte aus Schaltplan erstellen**. Die Platine öffnet sich in einem neuen Tab, dort geht die Lektion weiter.',
        '**Create the PCB.**\n\nThe schematic is finished. Choose **PCB → Create PCB from schematic** in the menu. The board opens in a new tab, where the lesson continues.',
      ),
      check: { kind: 'isPcb' },
      hint: t(
        'Der Schaltplan der Lektion muss dabei der aktive Tab sein. Danach ist die neue Platine das aktive Dokument.',
        'The lesson schematic has to be the active tab. Afterwards the new board is the active document.',
      ),
      explain: t(
        'Jedes Bauteil ist jetzt ein **Footprint**: das Kupfermuster, auf das das echte Bauteil gelötet wird – Lötaugen (Pads) mit Bohrungen für bedrahtete Bauteile und der Bestückungsdruck mit dem Umriss. Der Widerstand bekommt zwei Pads im Rastermaß, die LED einen 5-mm-Footprint, der Schalter einen Taster-Footprint und die Batterie eine Schraubklemme zum Anschließen.',
        'Every component is now a **footprint**: the copper pattern the real part is soldered to – pads with drill holes for through-hole parts, plus the silkscreen outline. The resistor gets two pads on the grid, the LED a 5 mm footprint, the switch a push button footprint and the battery a screw terminal to connect it.',
      ),
    },
    {
      text: t(
        '**Luftlinien.**\n\nZwischen den Pads siehst du dünne, gerade Linien – die **Luftlinien** (englisch *ratsnest*).',
        '**The ratsnest.**\n\nBetween the pads you see thin straight lines – the **ratsnest** (airwires).',
      ),
      check: quiz(
        t('Was zeigen die Luftlinien?', 'What does the ratsnest show?'),
        [
          t('fertig verlegte Leiterbahnen', 'tracks that are already routed'),
          t('Verbindungen aus dem Schaltplan, die noch als Leiterbahn verlegt werden müssen', 'connections from the schematic that still have to be routed as tracks'),
          t('den Umriss der Platine', 'the outline of the board'),
          t('wo gebohrt wird', 'where holes are drilled'),
        ],
        1,
      ),
      explain: t(
        'Die Luftlinien kommen aus den **Netzen** des Schaltplans: Alle Pins, die im Schaltplan miteinander verbunden sind, bilden ein Netz, und alle Pads eines Netzes müssen auf der Platine verbunden werden. Die Luftlinien zeigen jeweils den kürzesten Weg.',
        'The ratsnest comes from the **nets** of the schematic: all pins that are connected in the schematic form a net, and all pads of a net have to be connected on the board. The airwires always show the shortest path.',
      ),
    },
    {
      text: t(
        '**Ordne die Bauteile an.**\n\nZieh die Footprints innerhalb der Platine so zurecht, dass die Luftlinien kurz sind und sich möglichst nicht kreuzen. Mit R drehst du ein ausgewähltes Bauteil. Klicke auf *Weiter*, wenn du zufrieden bist.',
        '**Arrange the parts.**\n\nDrag the footprints around on the board so that the airwires are short and cross as little as possible. R rotates the selected part. Click *Next* when you are happy with it.',
      ),
      hint: t(
        'Lege die Bauteile in der Reihenfolge des Stromkreises nebeneinander: Klemme, Widerstand, LED, Schalter.',
        'Line the parts up in the order of the circuit: terminal, resistor, LED, switch.',
      ),
      explain: t(
        'Eine gute Platzierung ist die halbe Arbeit: Kurze, kreuzungsfreie Verbindungen lassen sich oft auf einer einzigen Kupferlage verlegen. Das macht die Platine einfacher, billiger und störsicherer.',
        'Good placement is half the job: short connections without crossings can often be routed on a single copper layer. That makes the board simpler, cheaper and less prone to interference.',
      ),
    },
    {
      text: t(
        '**Verlege die Leiterbahnen.**\n\nVerbinde alle Pads, zwischen denen Luftlinien liegen, mit Leiterbahnen: Werkzeug **Leiterbahn verlegen** (Taste W), am Pad beginnen und auf dem Ziel-Pad beenden. Der Schritt ist erledigt, wenn keine Verbindung mehr offen ist.',
        '**Route the tracks.**\n\nConnect all pads joined by airwires with tracks: tool **Route track** (key W), start on a pad and finish on the target pad. The step is done when no connection is left open.',
      ),
      check: { kind: 'pcbRouted' },
      hint: t(
        'Klick auf ein Pad, setz mit weiteren Klicks Knicke und beende die Bahn auf dem Ziel-Pad (Doppelklick oder Esc). Alternativ verlegt **Leiterplatte → Autorouter …** die Bahnen automatisch. Die Statusleiste zeigt, wie viele Verbindungen noch offen sind.',
        'Click a pad, add bends with further clicks and finish the track on the target pad (double click or Esc). Alternatively **PCB → Autorouter …** routes the tracks automatically. The status bar shows how many connections are still open.',
      ),
      explain: t(
        '**Leiterbahnen** sind Kupferstreifen auf der Ober- (Top) oder Unterseite (Bottom) der Platine. Ihre Breite richtet sich nach dem Strom: Für einige 10 mA reichen 0,25 mm locker, für 1 A nimmt man etwa 0,5 mm bis 1 mm. Muss eine Bahn die Seite wechseln, setzt man eine **Durchkontaktierung** (Via).',
        '**Tracks** are copper strips on the top or bottom side of the board. Their width depends on the current: a few 10 mA are easily handled by 0.25 mm, for 1 A you use about 0.5 mm to 1 mm. When a track has to change sides you place a **via**.',
      ),
    },
    {
      text: t(
        '**Prüfe die Design-Regeln.**\n\nWähle **Leiterplatte → Design-Rule-Check (DRC)** und behebe alle Fehler, bis keine Verstöße mehr gemeldet werden.',
        '**Check the design rules.**\n\nChoose **PCB → Design rule check (DRC)** and fix all errors until no violations are reported.',
      ),
      check: { kind: 'drcClean' },
      hint: t(
        'Typische Fehler: Leiterbahnen zu nah an fremden Pads oder Bahnen, überlappende Bauteile, Kupfer zu nah am Platinenrand. Mit *Anzeigen* im DRC-Fenster springst du zur Fehlerstelle.',
        'Typical errors: tracks too close to other pads or tracks, overlapping parts, copper too close to the board edge. *Show* in the DRC panel takes you to the spot.',
      ),
      explain: t(
        'Der DRC prüft, ob ein Hersteller die Platine fertigen kann: **Mindestabstand** (Clearance) zwischen verschiedenen Netzen, Mindestbreite der Bahnen, Bohrdurchmesser, Restring um die Bohrungen und Abstand zum Rand. Eine Platine ohne DRC-Fehler kann bestellt werden.',
        'The DRC checks whether a manufacturer can make the board: **minimum clearance** between different nets, minimum track width, drill sizes, annular rings around the holes and the distance to the edge. A board without DRC errors is ready to order.',
      ),
    },
    {
      text: t(
        '**Fertigungsdaten exportieren.**\n\nÜber **Leiterplatte → Fertigungsdaten exportieren (Gerber, Bohrdaten, BOM) …** erzeugst du die Dateien für den Platinenhersteller. Damit hast du es geschafft!',
        '**Export the fabrication files.**\n\n**PCB → Export fabrication files (Gerber, drill, BOM) …** creates the files for the board manufacturer. That is it – you made it!',
      ),
      explain: t(
        '**Gerber-Dateien** beschreiben jede Lage der Platine einzeln: Kupfer oben und unten, Lötstopplack, Bestückungsdruck und Umriss. Dazu kommen die **Bohrdaten** (Excellon) und die Stückliste (**BOM**). Diese Dateien lädst du beim Hersteller hoch – ein paar Tage später liegt deine Platine im Briefkasten.',
        '**Gerber files** describe every layer of the board on its own: top and bottom copper, solder mask, silkscreen and outline. They come with the **drill files** (Excellon) and the bill of materials (**BOM**). You upload them to the manufacturer – a few days later your board arrives in the mail.',
      ),
    },
  ],
};

export const PCB: LessonDef[] = [schematicToPcb];
