// Firmware of the ESP32: a flash image from the Arduino IDE, or MicroPython
// with a script. Images are stored in the schematic compressed and base64
// encoded (trailing erased flash removed), so a saved schematic carries them.

import { deflateSync, inflateSync } from 'fflate';

/** MicroPython's image starts with the bootloader, which the classic ESP32 has at 0x1000. */
export const MICROPYTHON_OFFSET = 0x1000;

/**
 * Flash offset of an image: a merged image (Arduino IDE "Export compiled
 * binary" -> *.merged.bin) starts at 0 with the bootloader at 0x1000 and the
 * partition table at 0x8000; a combined image without the leading padding
 * (MicroPython, esptool merge-bin from 0x1000) starts with the bootloader.
 * Undefined for an app image alone (*.ino.bin), which cannot boot by itself.
 */
export function flashOffset(data: Uint8Array): number | undefined {
  const ptable = (at: number) => data.length > at + 1 && data[at] === 0xaa && data[at + 1] === 0x50;
  if (ptable(0x8000) && data[0x1000] === 0xe9) return 0;
  if (ptable(0x7000) && data[0] === 0xe9) return 0x1000;
  return undefined;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Image -> text for the schematic (erased flash at the end dropped, deflated, base64). */
export function packImage(data: Uint8Array): string {
  let end = data.length;
  while (end > 0 && data[end - 1] === 0xff) end--;
  return toBase64(deflateSync(data.subarray(0, end), { level: 9 }));
}

export const unpackImage = (text: string): Uint8Array => inflateSync(fromBase64(text));
