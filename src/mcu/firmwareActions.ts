// Putting firmware on a microcontroller symbol: an Intel HEX file (Arduino IDE
// "Export compiled binary", avr-gcc) or one of the examples for the ATmega; a
// flash image (Arduino IDE *.merged.bin) or a MicroPython script for the
// ESP32. It is stored in the symbol, so a saved schematic carries its firmware.

import type { Draft } from 'immer';
import type { Item } from '../model/types.ts';
import { toast, updateItems } from '../store/store.ts';
import { openFile, type FileType } from '../platform/files.ts';
import { t } from '../i18n/i18n.ts';
import { HexError, parseHex } from './hex.ts';
import { exampleHex, type ExampleId } from './examples.ts';
import { esp32ExampleById, type Esp32ExampleId } from './esp32Examples.ts';
import { flashOffset, packImage } from './esp32Firmware.ts';

const HEX_TYPE: FileType = { description: 'Intel HEX', extensions: ['.hex', '.ihx'], mime: 'text/plain' };
const BIN_TYPE: FileType = { description: 'ESP32 firmware', extensions: ['.bin'], mime: 'application/octet-stream' };

/** Changes the program properties of a chip; undefined removes a property. */
function setProgram(id: string, patch: Record<string, string | undefined>) {
  updateItems([id], (it: Draft<Item>) => {
    if (it.kind !== 'symbol') return;
    const p = { ...(it.properties ?? {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete p[k];
      else p[k] = v;
    }
    it.properties = p;
  });
}

function setFirmware(id: string, hex: string | undefined, name: string | undefined) {
  updateItems([id], (it: Draft<Item>) => {
    if (it.kind !== 'symbol') return;
    const p = { ...(it.properties ?? {}) };
    if (hex) {
      p.firmware = hex;
      p.firmwareName = name ?? '';
    } else {
      delete p.firmware;
      delete p.firmwareName;
    }
    it.properties = p;
  });
}

export function hexProblemText(e: HexError): string {
  return t(`mcu.hex.${e.problem}`, { line: e.line });
}

export async function loadHexFile(id: string) {
  const f = await openFile(HEX_TYPE);
  if (!f) return;
  const text = new TextDecoder().decode(f.data);
  try {
    const { used } = parseHex(text);
    setFirmware(id, text, f.name);
    toast(t('mcu.loaded', { name: f.name, bytes: used }), 'success');
  } catch (e) {
    toast(e instanceof HexError ? hexProblemText(e) : String(e), 'error');
  }
}

export async function loadExample(id: string, example: ExampleId) {
  setFirmware(id, await exampleHex(example), `example:${example}`);
}

export const clearFirmware = (id: string) => setProgram(id, { firmware: undefined, firmwareName: undefined, firmwareOffset: undefined, script: undefined });

/** ESP32: a flash image; the merged image of the Arduino IDE boots by itself, the app image alone does not. */
export async function loadEsp32Image(id: string) {
  const f = await openFile(BIN_TYPE);
  if (!f) return;
  const offset = flashOffset(f.data);
  if (offset === undefined) {
    toast(t('mcu.bin.notMerged'), 'error');
    return;
  }
  setProgram(id, { firmware: packImage(f.data), firmwareOffset: String(offset), firmwareName: f.name });
  toast(t('mcu.loaded', { name: f.name, bytes: f.data.length }), 'success');
}

/** ESP32: MicroPython with one of the example scripts. */
export function loadEsp32Example(id: string, example: Esp32ExampleId) {
  setProgram(id, { script: esp32ExampleById(example)!.script, firmwareName: `example:${example}`, firmware: undefined, firmwareOffset: undefined });
}

/** ESP32: MicroPython with the user's own code. */
export const setScript = (id: string, script: string) => setProgram(id, { script, firmwareName: 'micropython', firmware: undefined, firmwareOffset: undefined });

export const setUsbPower = (id: string, on: boolean) => setProgram(id, { usb: on ? 'true' : 'false' });

export function setClock(id: string, hz: number) {
  updateItems([id], (it: Draft<Item>) => {
    if (it.kind === 'symbol') it.properties = { ...(it.properties ?? {}), clock: String(hz) };
  });
}
