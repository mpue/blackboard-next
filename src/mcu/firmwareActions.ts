// Putting firmware on a microcontroller symbol: an Intel HEX file (Arduino IDE
// "Export compiled binary", avr-gcc) or one of the examples. The HEX text is
// stored in the symbol, so a saved schematic carries its firmware.

import type { Draft } from 'immer';
import type { Item } from '../model/types.ts';
import { toast, updateItems } from '../store/store.ts';
import { openFile, type FileType } from '../platform/files.ts';
import { t } from '../i18n/i18n.ts';
import { HexError, parseHex } from './hex.ts';
import { exampleHex, type ExampleId } from './examples.ts';

const HEX_TYPE: FileType = { description: 'Intel HEX', extensions: ['.hex', '.ihx'], mime: 'text/plain' };

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

export const clearFirmware = (id: string) => setFirmware(id, undefined, undefined);

export function setClock(id: string, hz: number) {
  updateItems([id], (it: Draft<Item>) => {
    if (it.kind === 'symbol') it.properties = { ...(it.properties ?? {}), clock: String(hz) };
  });
}
