# BlackBoard Next (3.0)

A complete rewrite of the BlackBoard Circuit Designer on web technology. A single
code base runs on every platform:

| Target | How |
| --- | --- |
| **Browser** (Windows, macOS, Linux, ChromeOS, Android, iPadOS) | static files from `dist/`, any web server or file share with HTTP |
| **Installable app (PWA)**, works offline | "Install" in Chrome/Edge/Safari; `.bb` files can be opened with the app |
| **Native desktop app** (`.exe`/`.msi`, `.dmg`/`.app`, `.deb`/`.rpm`/AppImage) | [Tauri 2](https://tauri.app) shell in `src-tauri/` |

Nothing has to be installed on the target machine. No Java, no ngspice.exe and no
admin rights are needed: the simulation runs **NGSpice compiled to WebAssembly**.

![Perfboard editing](docs/board.webp)

![Instrument bench](docs/bench.webp)

![Schematic with NGSpice simulation](docs/simulation.webp)

## What it can do

- Perfboards (holes), stripboards (copper stripes), blank boards and schematics
- Solder side view (mirrored, copper pads, solder joints, ghosted parts)
- Part library: 383 parts with images; symbol library: 477 symbols; 177 SPICE models.
  These are converted at build time from `../parts`, `../symbols` and `../models`
- Wires/jumpers, resistors with colour bands, diodes, rectangles, ellipses/arcs, text
- Layers (visibility, lock, opacity, colour, order), multiple documents in tabs
- Select (box selection; drag right to left to select everything it crosses), move,
  rotate, flip, z-order, copy/paste, duplicate, unlimited undo/redo, snap to grid
  (1/1, 1/2, 1/4), magnetic pins, arrow keys to nudge
- Magnetic mode (Shift+M): wire ends attached to pins, wire junctions and T junctions
  follow when parts or wires are moved, rotated, flipped or nudged
- Connection check: highlights the net of a wire or pin, including the copper
  stripes of stripboards and stripe breaks
- Measure tool (mm and grid units)
- Symbol editor: combine shapes into a symbol (wire ends marked with a dot become
  pins), edit pins, break symbols apart, keep your own symbol library
- Part editor (*Tools → New part*): own parts from a picture (photo, drawing, SVG) with
  the pins set by clicking on the leads and the size on the hole raster; library parts can
  be copied and changed; *Edit → Create part from selection* turns a drawing into a part
  (wire ends with a dot become pins). Own parts are kept in the browser and travel inside
  `.bb` files
- Scale designer (*Tools → Scale designer*): round scales for knobs, potentiometers and
  meters with major and minor ticks, numbers, an arc and a centre hole
- Instrument bench (Simulation → Bench): oscilloscope, multimeter and function
  generator are symbols (library category *Instruments*) that are wired like real
  instruments. Generator COM and scope GND are earthed, the multimeter floats; in the
  ammeter modes it is inserted in series. Front panels with knobs (drag, wheel, arrow
  keys), seven segment displays and a phosphor screen; live mode re-simulates after every
  edit, the transient window follows the scope time base. A ready-made demo is on the
  welcome screen and in *File → Samples*
- SPICE netlist generation (resistors, capacitors, inductors, diodes, BJTs, MOSFETs,
  DC/sine/pulse sources, subcircuits); simulation with plots (one chart per unit,
  values under the cursor, zoom by dragging, CSV export)
- File formats: **reads and writes the original `.bb` format** (zip with BoardBean XML
  and embedded parts), so files can be exchanged with BlackBoard 1.x/2.x. Export to
  PNG, SVG, SPICE (`.cir`), bill of materials (CSV), printing
- Session autosave (IndexedDB), German/English, light/dark/system theme,
  touch (pinch to zoom) and phone-size layouts

### Printed circuit boards

- **Schematic → PCB** (*PCB → Create PCB from schematic*): footprints are chosen from
  the symbols (or set per symbol in the properties panel), pins are mapped to pads
  (by name for transistors, diodes and LEDs), nets are named after GND/supply symbols,
  connected parts are placed next to each other. *Update PCB from schematic* carries
  later schematic changes over (forward annotation)
- Footprint library: 138 parametric THT and SMD footprints (KiCad-like dimensions:
  resistors, capacitors, diodes, LEDs, TO-92/TO-220/SOT, DIP/SOIC/TSSOP/QFP, headers,
  terminal blocks, crystals, switches, mounting holes …) plus every part of the classic
  part library as a through-hole footprint
- Footprint editor: pads of all shapes, pad arrays (row, DIP, zig-zag, QFP, BGA),
  silkscreen, auto courtyard, validation; own footprints are kept in the browser and
  can replace the footprint of placed parts
- Two copper layers (or single sided for home etching), silkscreen top/bottom, board
  outline with rounded corners or drawn freely (Shift+O), fit to parts, corner
  mounting holes
- Interactive routing (W): 45°/90° postures (`/` flips the bend), `V` switches the layer
  and sets a via, tracks snap to pads and never end on copper of another net; tracks
  stay attached when footprints are moved, rotated or flipped to the other side
- Copper zones (Z) with clearance, thermal reliefs, priorities and dead copper removal
- Autorouter (Shift+A): two layer maze router with rip-up & reroute, runs in the
  background; unroute all or single nets, select connected tracks (U)
- Ratsnest, net highlighting (K), cross probing between schematic and PCB
- Design rule check (Shift+D): clearance, shorts, unrouted nets, track width, drill,
  annular ring, board edge, overlapping parts — with markers on the board
- Design rules with presets for PCB manufacturers and for home etching
- Fabrication output: Gerber X2 (copper, mask, paste, silkscreen, edge cuts), Excellon
  drill files, pick & place (part centres), BOM — one zip ready for upload; 1:1
  artwork for toner transfer / UV exposure
- Layer colour view, realistic view (solder mask, HASL pads, silkscreen) and a 3D view
  (key 3) with component bodies
- **KiCad**: import `.kicad_mod` footprints (KiCad 5–8, several files at once, e.g. a
  whole `.pretty` folder) into the user library; export the user footprints as a
  `.pretty` library; export a schematic as KiCad netlist (*File → Export KiCad
  netlist*) for KiCad's PCB editor — built-in footprints are mapped to the KiCad
  standard libraries, others are written into an accompanying `BlackBoard.pretty`
- PCB data is stored inside the `.bb` archive (`bbnext/document.json`); BlackBoard
  1.x/2.x still open such files (as blank boards)

### Interactive simulation

- **Live values** (Shift+L): after every edit the DC operating point is simulated;
  wires are coloured by voltage, moving dots show the current flow, voltages and
  currents are labelled, LEDs glow. Switches are operated by clicking, push buttons
  while held, potentiometer wipers can be dragged
- **Slow motion** (Shift+T): a transient analysis is played back over a few seconds —
  blinking LEDs, charging capacitors, oscillators
- Measuring by hovering: voltage of a wire; voltage, current and power of a part; in
  slow motion with a small oscilloscope trace
- Incandescent lamps glow with their power; switches, buttons and potentiometers are
  operated directly in the schematic
- LEDs, Zener diodes and generic transistors without a SPICE model get built-in
  textbook models (LEDs by colour)
- **Simulation check**: missing ground or source, unusable values, symbols without
  SPICE type, open pins and missing models in plain words, each with a one-click fix;
  the analysis is picked in words (time response, frequency response, operating
  point) and ngspice errors are explained

### Microcontrollers

- **ATmega328P** (Arduino Uno / Nano) in the library, running real firmware in the
  live values: the [avr8js](https://github.com/wokwi/avr8js) emulator (MIT) runs in a
  web worker in real time, with ports, timers/PWM, ADC, USART, SPI, TWI and EEPROM
- Firmware is an Intel HEX file (Arduino IDE: *Sketch → Export compiled binary*) or one
  of the examples (blink, push button, running light, PWM dimmer, serial echo); it is
  stored in the schematic
- **Code editor** (*Write code (C/C++)* on an ATmega): Arduino sketches or plain C/C++
  with `main()`, several files as tabs, templates, completion while typing (Arduino
  functions, `Serial.`/`lcd.`/`servo.` members by the variable's type, registers, the
  program's own functions, variables and structs), parameter help, explanations on
  hover. *Upload* (Ctrl+Enter) compiles on the server, puts the HEX onto the chip and
  starts the live simulation; *Verify* (Ctrl+B) only compiles. Errors are marked in the
  text, memory use is shown, and the HEX and the source can be saved. The source is
  stored in the chip next to its HEX. The online compiler needs a free account (see *Free and
  open source*); the panel says so before the first compile and shows today's compiles
- Coupled to ngspice through the operating point: outputs drive the circuit through
  their 25 Ω drivers, pull-ups are 35 kΩ, inputs read the node voltages (Schmitt
  trigger levels), A0–A5 feed the ADC, the chip resets below 2.7 V. PWM pins are
  averaged over their high and low state, so a LED dims correctly
- **ESP32** (ESP32-DevKitC V4 board, 38 pins as on the real board): the
  [esp32sim](https://github.com/mikroverk/esp32sim) emulator (MIT, Rust → WebAssembly)
  boots Espressif's mask ROM into real firmware: an Arduino sketch (Arduino IDE:
  *Export compiled binary* → `*.merged.bin`) or MicroPython with code edited in the
  app (examples: blink, push button, running light, PWM dimmer, serial echo). The
  board is powered over USB by default (GND is the reference, 5V and 3V3 are outputs)
  or through its 3.3 V regulator from the 5V pin; 40 Ω pin drivers, 45 kΩ pulls,
  ADC on the ADC1/ADC2 pins, LEDC PWM, UART0 console at 115200 baud
- **Character LCDs** (HD44780 compatible, 16x2 green and 20x4 blue): the controller
  is emulated next to the chip, at every edge of E (8 and 4 bit mode, instruction set,
  DDRAM/CGRAM with user characters, display shift, cursor and blink, A00 character
  ROM); the circuit decides the rest: no supply, no display; contrast from VDD − V0;
  the backlight is a LED behind the module's 100 Ω. Examples for both chips
  (Arduino `LiquidCrystal` sketch / MicroPython driver) and ready-made demos. The bus
  lines have to be wired straight to chip pins; reading the controller (RW high) and
  busy times are not modelled
- Pin levels and PWM duty cycles are shown on the chip; serial monitor with input
- Limits: the coupling runs at the rate of the operating point (tens of times per
  second), so analog interplay faster than that (PWM through an RC filter back into
  the ADC) is only averaged; in the analyses of the simulation panel the pins are
  open inputs. The ESP32 runs code that keeps its CPU busy at about half real time
  (MicroPython busy-waits the last 10 ms of every `sleep_ms`, so loops should pause
  50 ms or more); Wi-Fi and Bluetooth are not part of the circuit simulation

### Schematics

- Net labels and supply symbols (VCC, +5V …) connect by name; junction dots
- Orthogonal wires (`/` flips the bend), annotate (renumber designators)
- Electrical rule check (Shift+D): open pins, duplicate designators, unreadable values,
  missing ground, parts without footprint
- Designators and values always readable, whatever the rotation

### Claude as design assistant

- **Claude** (F2, the button in the top bar): describe a circuit or ask about the open
  one, and Claude designs, builds and checks it right in the schematic. It searches the
  part library, places parts, wires them (routes that would touch another net are
  refused, so it never shorts anything), sets GND/supply/net labels, changes values,
  deletes, and runs the DC operating point or a transient analysis in ngspice to check
  currents and voltages before it answers. Its progress notes and every step show in the
  panel; all changes of one answer undo with one click (one undo step)
- Needs a (free) account and the user's own
  Anthropic API key (entered in the panel or the account dialog). Claude Opus 5.5 by
  default, Claude Sonnet 5.5 as the faster choice per conversation

### Learning

- **Learn electronics** (F1): 16 interactive lessons from the first circuit, Ohm's law
  and voltage dividers via diodes, LEDs, Zener diodes, rectifiers and transistor
  switches to RC circuits, a 555 blinker, logic gates and your first PCB. Every task
  is checked automatically against your circuit (structure, values, simulated
  voltages and currents, routing, DRC)
- Component guide: selecting a symbol explains the component (how it works, formulas,
  typical values, common mistakes) and links to the lessons that practise it

## Development

Requirements: Node.js ≥ 24 (the library converter and the server are plain
TypeScript, run natively by Node).

```bash
npm install
npm run dev        # converts the library, starts Vite on http://localhost:5173
npm test           # import/export of all sample boards, netlists, ngspice runs
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/ on http://localhost:4173
```

`npm run dev -- --host` makes the dev server reachable from other devices in the
network. Over plain http on a LAN address the browser does not allow installing the
app for offline use, and "save" falls back to downloading the file.

### ESP32 emulator

`public/esp32/` is committed, so the app builds without Rust. `scripts/build-esp32.sh`
rebuilds it: it checks out esp32sim at a pinned commit, applies `scripts/esp32sim.patch`
(WebAssembly exports for the circuit coupling and GPIO edges, pulls of the ESP32's RTC
pads), builds
the module (needs rustup) and fetches the mask ROM and MicroPython image by SHA-256.
Licences: `public/esp32/NOTICE.txt`.

### Direct links

`?lesson=<id>` starts a lesson, `?demo=pcb|bench|mcu|esp32|lcd|lcd-esp32` opens a demo,
`?sample=schematics/<file>.bb` a sample, `?view=3d|realistic|live|slowmo` adds a view —
e.g. `…/?lesson=led-resistor` or `…/?demo=pcb&view=3d`.

### Accounts and cloud (server/)

Accounts are only needed for the cloud: the editor works without one. `server/` is a
small Node server (Hono, [Better Auth](https://better-auth.com), SQLite via `node:sqlite`)
under `<PUBLIC_PATH>/api`: sign-up with e-mail confirmation, password reset, optional
"Sign in with Google", cloud projects with version check and sharing with other users
(view or edit). Without the server (desktop app, static hosting) the app shows no cloud
functions.

```bash
npm --prefix server install
npm run server     # API on http://localhost:8787, Vite passes /api through
```

Settings come from the environment, see `server/.env.example`. Without `SMTP_HOST` the
mails (confirmation, password reset, shares) are written to the log.

The landing page and the editor share one `index.html`: `./` shows the landing page,
`./?app` (and every direct link below) the editor; the desktop app always opens the
editor.

### Claude (server/assistant.ts)

The key is checked at Anthropic when it is stored, kept encrypted (AES-256-GCM, key
derived from the session secret; a new `AUTH_SECRET` means re-entering it) and never
returned, only its last four characters. `POST /api/assistant/messages` takes the
conversation the editor keeps, adds key, model, system prompt and tool definitions
(`server/assistantTools.ts`) and streams the answer back as JSON lines; the editor runs
the tools on the open schematic (`src/assistant/`) and sends their results back. The
server stores no conversation, only allows plans with the compiler, and at most
`MAX_ASSISTANT_REQUESTS` requests per account in ten minutes. Adaptive thinking with
progress notes, effort `medium`, prompt caching and Anthropic's server-side fallback on
policy declines (`fallbacks: "default"`).

### Compiler (compiler/)

The code editor compiles on the server: `compiler/` is a small Node service around
arduino-cli 1.5.1 with the Arduino AVR core 1.8.6 (avr-gcc 7.3, as in the Arduino IDE)
and the libraries LiquidCrystal, Servo and Stepper (EEPROM, Wire, SPI and SoftwareSerial
come with the core). `POST /compile` takes `{ files: [{ name, content }], clock }` and
answers with the HEX, the memory use and gcc's messages. A program without a `.ino` file
is plain C/C++ with its own `main()`. The API passes `/api/compile` on to signed-in
accounts that are not blocked from it, counts the compiles per day (`server/plans.ts`) and
allows at most `MAX_COMPILES` per account in ten minutes. The desktop app compiles on the
public server with the account's key (`Authorization: Bearer bbk_…`, made in the account
on the web, stored only as a hash).

It compiles code from the web, so it runs in a container of its own: nothing secret in it,
no network (an internal Docker network, only the API reaches it), read-only file system,
`/tmp` as a small tmpfs, no capabilities, memory, CPU and process limits, at most two
compiles at once and 45 s each. For development:

```bash
docker build --target compiler -t blackboard-compiler .
docker run -d --name bb-compiler -p 127.0.0.1:8789:8789 --read-only \
  --tmpfs /tmp:size=512m,mode=1777,noexec,nosuid --cap-drop ALL blackboard-compiler
npm run server     # passes /api/compile on to http://localhost:8789 (COMPILER_URL)
```

### Docker

The Dockerfile builds three images: `web` (the app, nginx unprivileged on port 8080, which
passes `/api/` on to the API), `api` (the server, data in `/data`) and `compiler` (see
above).

```bash
docker compose up -d --build     # all three, the app on 127.0.0.1:8080
```

The app only uses relative URLs, so it also runs below a path prefix. Example for
Caddy serving it at `https://example.org/blackboard/`:

```caddy
example.org {
	redir /blackboard /blackboard/ 308
	handle_path /blackboard/* {
		encode zstd gzip
		reverse_proxy 127.0.0.1:8080
	}
	# … the rest of the site
}
```

`handle_path` strips the prefix before proxying; the API then runs with
`PUBLIC_PATH=/blackboard` and the web container gets `API_URL=http://api:8787/blackboard`.
Hashed assets are cached for a year, `index.html` and the service worker are always
revalidated, so a new image reaches users on their next visit.

`scripts/deploy.sh` builds the three images, copies them to a server over SSH and restarts
the containers there (`DEPLOY_HOST`, default `root@pueski.de`; `DEPLOY_PORT`, default
`8210`; `DEPLOY_DIR`, default `/opt/blackboard`; `DEPLOY_ORIGIN` and `DEPLOY_PATH`,
default `https://pueski.de` and `/blackboard`). The secrets of the API live in
`$DEPLOY_DIR/server.env` (created from `server/.env.example` on the first deploy), the
database in `$DEPLOY_DIR/data`. `scripts/set-smtp.sh` writes the mail settings into it, asks
only for the password and restarts the API. The live instance runs at https://pueski.de/blackboard/.

### Free and open source

Everything is free for everyone. The editor works without an account; the online compiler
and Claude need a free one. Every account compiles up to a number of times per day (60, a
setting of the admin page, served with `/api/config`); admins can give an account unlimited
access or block it from compiler and Claude.

### Admin page and newsletter

`./?admin` is the admin page, for accounts in `ADMIN_EMAILS` (server.env, once the address
is confirmed) or with the role `admin`: an overview, the accounts (access to compiler and Claude, note,
admin rights, blocking, sign-out everywhere, password and confirmation mails, deleting with
all projects), the newsletter and the daily compiles. Blocking uses Better Auth's admin
plugin: a blocked account cannot sign in and its desktop key stops working.

The newsletter has double opt-in: the landing page sends a mail with a confirmation link
(unconfirmed sign-ups are deleted after seven days); signed-in users subscribe from their
account in one step. Issues are written in a little Markdown with an optional English
version, previewed exactly as the mail looks, sent to yourself as a test and then to every
confirmed subscriber in the background (`NEWSLETTER_PER_MINUTE`, it goes on after a
restart). Every mail has an unsubscribe link and a one-click `List-Unsubscribe` header
(RFC 8058); unsubscribing deletes the address. No tracking pixels, no tracked links.

### Search engines

`index.html` has the description, Open Graph and Twitter tags, a preview image
(`public/og.jpg`, 1200×630), JSON-LD (`WebApplication`) and a plain-text version of the
landing page inside `#root` for crawlers without JavaScript (the editor and the admin page
hide it). The build fills in `SITE_URL` (default `https://pueski.de/blackboard/`) and writes
`sitemap.xml` and `robots.txt`; the editor's addresses are `noindex`. Crawlers only read
`robots.txt` at the root of a host, so on a sub path the sitemap goes into the root
`robots.txt` or Search Console.

### Desktop app (Tauri)

Additionally requires Rust (`rustup`) and the
[platform prerequisites](https://tauri.app/start/prerequisites/)
(WebView2 on Windows, Xcode tools on macOS, `webkit2gtk-4.1` on Linux).

```bash
npm run tauri dev     # native window with hot reload
npm run tauri build   # installers in src-tauri/target/release/bundle/
```

Ready-made installers for Windows (`.exe`, `.msi`), macOS (universal `.dmg`) and Linux
(`.AppImage`, `.deb`, `.rpm`) come from GitHub Actions (`.github/workflows/desktop.yml`):
raise the version in `src-tauri/tauri.conf.json`, then push a tag such as `v3.0.1`. The
workflow drafts a release, builds the three systems and publishes the release once all
of them succeeded. The landing page offers the newest release for download; the API asks
GitHub for it (`/api/downloads`, cached, `DOWNLOADS_REPO`), so visitors' browsers do not.
The installers are not code-signed yet (macOS gets an ad-hoc signature).

## Architecture

```
library/                   the classic BlackBoard library: parts, symbols, models (XML), samples
scripts/build-library.ts   library/ -> public/library/*.json, public/samples/
server/                    accounts, plans, cloud projects, newsletter, admin API (Node, Better
                           Auth, SQLite), /api/compile, /api/assistant (Claude)
compiler/                  C/C++ -> Intel HEX for the ATmega328P (arduino-cli, own container)
src/landing/               landing page, sign-in dialogs, plans, newsletter, legal pages
src/admin/                 admin page (?admin): accounts, newsletter, daily compiles
src/account/               auth client, plans, cloud projects in the editor
src/io/                    XML reader/writer, legacy BoardBean format, .bb archives, KiCad
src/model/                 document model, item operations, engineering values
src/geometry/              transforms, bounds, hit testing, pin positions
src/render/                SVG rendering of boards, parts, symbols, resistors, diodes
src/editor/                canvas interaction, commands & shortcuts, file actions
src/spice/                 connectivity (union-find), netlist, ngspice web worker, live values
src/mcu/                   ATmega328P on avr8js, ESP32 on esp32sim (web workers), firmware
                           formats, examples, code editor sketches and compiling,
                           coupling to the operating point
public/esp32/              esp32sim.wasm, ESP32 mask ROM, MicroPython (scripts/build-esp32.sh)
src/pcb/                   PCB: footprints, copper geometry, connectivity, ratsnest, DRC,
                           zones, schematic -> PCB, autorouter, fabrication outputs (fab/)
src/pcb3d/                 3D board viewer (three.js, loaded on demand)
src/learn/                 lessons, checks, component guide
src/assistant/             Claude: panel, conversation loop, tools on the schematic (place,
                           wire, label, simulate)
src/store/                 zustand store with immer-based undo history
src/ui/                    panels, menus, dialogs, simulation panel (uPlot)
src/platform/              file access (Tauri / File System Access API / download), IndexedDB
src-tauri/                 native shell (dialogs + file system plugins)
```

Coordinates are the original board units: 16 units = 0.1" = 2.54 mm, so all
existing boards, parts and symbols fit without conversion. Net numbering follows
BlackBoard 1.x so `plot v(5)` in existing schematics still shows the same signal.

## Notes

- Newer ngspice versions sometimes settle oscillators into a static operating point.
  Transient analyses therefore start from 0 V (`uic`) by default; if that does not
  converge the simulation is repeated automatically from the DC operating point.
- `library/samples/schematics/phasenschieber.bbs` is a damaged archive and is not shipped.
- The NGSpice engine (~20 MB) is loaded on the first simulation and cached for
  offline use.

## Licence

BlackBoard Next is free software: © 2026 Matthias Püski and contributors, licensed under the
GNU Affero General Public License, version 3 ([LICENSE](LICENSE)). Run a changed version as a
web service and its users may ask for its source, as for the original at
https://github.com/mpue/blackboard-next (linked in the app).

Third-party components keep their own licences: the part library is partly
CC BY 3.0 (Gerd Bartelt, Andreas Kraemer); simulation: ngspice (BSD-3) via eecircuit-engine (MIT);
microcontrollers: avr8js, esp32sim and MicroPython (MIT), see
`public/esp32/NOTICE.txt`; code editor: CodeMirror (MIT); the compiler container runs
arduino-cli, avr-gcc, avr-libc, the Arduino AVR core and its libraries unchanged, under
their own licences (GPL, LGPL, BSD).
