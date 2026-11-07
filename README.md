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
- Connection check: highlights the net of a wire or pin, including the copper
  stripes of stripboards and stripe breaks
- Measure tool (mm and grid units)
- Symbol editor: combine shapes into a symbol (wire ends marked with a dot become
  pins), edit pins, break symbols apart, keep your own symbol library
- SPICE netlist generation (resistors, capacitors, inductors, diodes, BJTs, MOSFETs,
  DC/sine/pulse sources, subcircuits); simulation with plots (one chart per unit,
  values under the cursor, zoom by dragging, CSV export)
- File formats: **reads and writes the original `.bb` format** (zip with BoardBean XML
  and embedded parts), so files can be exchanged with BlackBoard 1.x/2.x. Export to
  PNG, SVG, SPICE (`.cir`), bill of materials (CSV), printing
- Session autosave (IndexedDB), German/English, light/dark/system theme,
  touch (pinch to zoom) and phone-size layouts

## Development

Requirements: Node.js ≥ 23.6 (the library converter is plain TypeScript, run
natively by Node).

```bash
npm install
npm run dev        # converts the library, starts Vite on http://localhost:5173
npm test           # import/export of all sample boards, netlists, ngspice runs
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/ on http://localhost:4173
```

### Desktop app (Tauri)

Additionally requires Rust (`rustup`) and the
[platform prerequisites](https://tauri.app/start/prerequisites/)
(WebView2 on Windows, Xcode tools on macOS, `webkit2gtk-4.1` on Linux).

```bash
npm run tauri dev     # native window with hot reload
npm run tauri build   # installers in src-tauri/target/release/bundle/
```

## Architecture

```
scripts/build-library.ts   parts/symbols/models/samples (XML) -> public/library/*.json
src/io/                    XML reader/writer, legacy BoardBean format, .bb archives
src/model/                 document model, item operations, engineering values
src/geometry/              transforms, bounds, hit testing, pin positions
src/render/                SVG rendering of boards, parts, symbols, resistors, diodes
src/editor/                canvas interaction, commands & shortcuts, file actions
src/spice/                 connectivity (union-find), netlist, ngspice web worker
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
- `samples/schematics/phasenschieber.bbs` is a damaged archive and is not shipped.
- The NGSpice engine (~20 MB) is loaded on the first simulation and cached for
  offline use.

Licence: GPL-2.0 (like BlackBoard). The part library is partly CC BY 3.0
(Gerd Bartelt). Simulation: ngspice (BSD-3) via eecircuit-engine (MIT).
