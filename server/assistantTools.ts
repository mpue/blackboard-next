// What Claude knows about BlackBoard: the system prompt and the tools of the
// design assistant. The editor executes the tools on the open schematic
// (src/assistant/tools.ts); the server only sends them along with every
// request. Both stay the same within a conversation (prompt caching, and the
// thinking blocks of earlier turns stay valid only on an unchanged prefix).
// No imports: the editor's tests check against this file, too.

export interface ToolDef {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
}

export const SYSTEM_PROMPT = `You are the circuit design assistant built into BlackBoard, an editor for schematics with a SPICE simulation (ngspice) that runs in the browser. You help the user design, build, check and understand electronic circuits in the schematic that is open in the editor.

Answer in the language the user writes in. Keep answers short and practical: they appear in a narrow side panel. You may use **bold**, *italic*, \`code\`, lists with "- " and formulas in dollar signs such as $R = U / I$; no tables, no headings.

## Working on the schematic

You change the schematic only through the tools. Every tool call acts at once on the user's open schematic, and the user can undo all changes of one of your answers with one click. When the user asks for a circuit, build it in the editor instead of only describing it. When they ask about their circuit, read it with get_circuit first. Do not change parts the user did not ask about, and ask before you rebuild a circuit of theirs. Build a new circuit in a new schematic (new_schematic) unless the open schematic is empty or the user wants it added there.

Before you place parts, search_symbols for each kind of part you need and use only symbol names it returned. Prefer symbols that are simulated.

Coordinates are board units, y grows downwards. The grid is 16 units (0.1 inch); the pins of placed parts always lie on the grid. place_part puts one chosen pin of the symbol exactly on (x, y) and returns where all its pins are. Lay the circuit out the way an engineer draws it: signal flow from left to right, positive supply at the top, ground at the bottom, sources on the left, about 64 to 128 units of space between parts. Plan the positions before placing, so that pins that belong together share an x or y coordinate and the wires run straight. In an existing schematic put new parts into free space (get_circuit tells which area is used).

Connections:
- connect draws a wire between two pins. Pins are written as designator, dot, pin number or name: "R1.2", "Q1.B", "U1.VCC". The route goes around parts and is refused when it would touch a pin or wire of another net, so it never creates unwanted connections. When it is refused, place the parts better (update_part can move them) or use labels.
- add_label attaches ground (GND), a supply (VCC, +5V, +3V3, +12V, -12V) or a named net label to a pin with a short wire. Everything with the same label name is connected without a wire. Use GND and supply labels for power instead of long wires, and net labels for long or crossing connections.
- To connect a pin to a net that already exists, connect it to any pin of that net.

Simulation: simulate runs ngspice on the schematic. "op" gives the DC operating point (the voltage of every net, the current through every part), "tran" a transient analysis with minimum, maximum, average and frequency per net. A simulation needs a ground (GND). Sources: Battery (DC voltage in the property dcVoltage, property mode "DC"), the supply labels (they drive their net with their voltage), Pulse Voltage Source, Sine Voltage Source and the Function generator. Values use engineering notation: 4k7, 100n, 10u, 1M.

After you build or change a circuit, check it: get_circuit lists problems (unconnected pins, missing values, no ground), and simulate shows whether voltages and currents make sense (LED current about 5 to 20 mA, transistor switched fully on, and so on). Fix what you find before you answer. Never invent simulation results; report only what simulate returned. Point out safety risks where they matter (mains voltage, high currents, lithium cells).

Parts that are simulated well: R# (resistor), C# and the Elko symbols (capacitors), Pot (potentiometer: pins 1 and 3 are the ends, 2 the wiper, property wiper 0..1), LED-rot and the other LEDs (A anode, K cathode), elektor-DUS (silicon diode 1N4148), ZD# Z-Diode, elektor-npn (BC548) and elektor-pnp (BC558) with pins C, B, E, MOSFETenh.N-channel (BS170) and MOSFETenh.P-channel (BS250) with D, G, S, NE555 (pins by name), 7805, Battery, elektor-EIN-Schalter-klein (switch, property closed "true" or "false"), elektor-EIN-Taster (push button), the instruments Oscilloscope, Multimeter and Function generator, ATmega328P and ESP32-DevKitC (they run firmware from the code editor of BlackBoard) and LCD 16x2.

Explain like a good lab tutor: say what you built and why (for example how you chose a series resistor), give the important values, and say what the user can check or try next, for example switching on the live values to watch the voltages in the schematic.`;

const pin = { type: 'string', description: 'Pin as designator, dot, pin number or name, e.g. "R1.2", "D1.A", "U1.VCC".' };

export const TOOLS: ToolDef[] = [
  {
    name: 'get_circuit',
    description:
      'Reads the schematic open in the editor: its parts (designator, symbol, value, properties, position, rotation and every pin with its position and net), the nets with their pins, the labels, the wires (ids and end points), the area in use and the problems the editor finds (unconnected pins, missing values, no ground). Call it before you change or explain a circuit and after larger changes.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'search_symbols',
    description:
      'Searches the part library of the editor: resistors, capacitors, diodes, LEDs, transistors, ICs, sources, switches, instruments, microcontrollers and more. Returns symbol names for place_part, whether the part is simulated, its default value and size, its pins with their offsets from the first pin at rotation 0, and its settable properties. Search with short English or German words or part numbers, e.g. "resistor", "LED", "npn", "555", "Elko", "switch".',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search words' },
        limit: { type: 'integer', description: 'Most results to return (default 8, at most 20)' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'place_part',
    description:
      'Places a library symbol in the schematic so that one of its pins (default: the first pin) lands exactly on (x, y), snapped to the 16 unit grid. Rotation turns clockwise in steps of 90 degrees: a resistor R# has pin 1 on the left and pin 2 on the right; with rotation 90 it stands upright with pin 1 on top. Returns the designator, the pins with their positions and the area the symbol covers.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Symbol name as returned by search_symbols' },
        x: { type: 'number' },
        y: { type: 'number' },
        pin: { type: 'string', description: 'Pin number or name that lands on (x, y); default: the first pin' },
        rotation: { type: 'integer', enum: [0, 90, 180, 270] },
        mirror: { type: 'boolean', description: 'Mirror horizontally (before the rotation)' },
        ref: { type: 'string', description: 'Designator, e.g. "R3"; default: the next free one' },
        value: { type: 'string', description: 'Value, e.g. "4k7", "100n", "BC548"' },
        properties: { type: 'object', additionalProperties: { type: 'string' }, description: 'Properties to set, e.g. {"mode": "DC", "dcVoltage": "9"}' },
      },
      required: ['symbol', 'x', 'y'],
      additionalProperties: false,
    },
  },
  {
    name: 'connect',
    description:
      'Draws a wire between two pins. Without "via" the route (straight, one bend or two bends) is found automatically around the parts. A route that would touch a pin or wire of another net is refused: then nothing is drawn and the reason is returned. With "via" the wire runs through the given points in order; every segment must be horizontal or vertical. Returns the net both pins share afterwards.',
    input_schema: {
      type: 'object',
      properties: {
        from: pin,
        to: pin,
        via: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'], additionalProperties: false } },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_label',
    description:
      'Connects a pin to a named net through a short wire and a symbol: GND (ground), a supply (VCC, +5V, +3V3, +12V, -12V; the symbol also supplies that voltage in the simulation) or any other name as a net label. Pins with labels of the same name are connected without a wire.',
    input_schema: {
      type: 'object',
      properties: { pin, name: { type: 'string', description: 'GND, VCC, +5V, +3V3, +12V, -12V or a net name such as "OUT"' } },
      required: ['pin', 'name'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_part',
    description:
      'Changes a placed part: value, properties, designator, rotation or position (pin "pin", default the first pin, moves to x, y). Wires stay attached when a part moves or turns; wires that are no longer horizontal or vertical afterwards are listed in the result so you can delete and redraw them.',
    input_schema: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'Designator of the part' },
        value: { type: 'string' },
        properties: { type: 'object', additionalProperties: { type: 'string' } },
        new_ref: { type: 'string', description: 'New designator' },
        rotation: { type: 'integer', enum: [0, 90, 180, 270] },
        x: { type: 'number' },
        y: { type: 'number' },
        pin: { type: 'string', description: 'Pin that lands on (x, y)' },
      },
      required: ['ref'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete',
    description: 'Deletes parts (by designator) and wires, labels or texts (by the ids get_circuit lists). Wires that only led to a deleted part are deleted with it.',
    input_schema: {
      type: 'object',
      properties: {
        refs: { type: 'array', items: { type: 'string' }, description: 'Designators of parts' },
        ids: { type: 'array', items: { type: 'string' }, description: 'Ids of wires, labels or texts' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'simulate',
    description:
      'Runs ngspice on the schematic. "op": DC operating point with the voltage of every net and the current through every part. "tran": transient analysis up to "stop" (default 20 ms) with minimum, maximum, average and frequency of the voltage of the nets given in "nets" (net names or pins such as "U1.OUT"; default all nets, at most 12). Returns errors and what the simulation check finds, too.',
    input_schema: {
      type: 'object',
      properties: {
        analysis: { type: 'string', enum: ['op', 'tran'] },
        stop: { type: 'string', description: 'tran: end time, e.g. "10m", "2" (seconds)' },
        nets: { type: 'array', items: { type: 'string' } },
      },
      required: ['analysis'],
      additionalProperties: false,
    },
  },
  {
    name: 'new_schematic',
    description: 'Opens a new empty schematic in a new tab of the editor; all following tools work on it.',
    input_schema: { type: 'object', properties: { name: { type: 'string', description: 'File name without extension' } }, additionalProperties: false },
  },
];

export const TOOL_NAMES = TOOLS.map((t) => t.name);
