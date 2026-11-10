// Board side textures for the 3D viewer: the realistic SVG rendering of one
// side (PcbView) rasterised to a canvas, plus a roughness/metalness map derived
// from its colours so that tinned pads shine while the solder mask stays satin.

import { createElement } from 'react';
import * as THREE from 'three';
import type { CopperSide, Doc } from '../model/types.ts';
import { PcbView, type PcbRenderOptions } from '../render/PcbView.tsx';
import { toMm } from '../pcb/units.ts';

export const TEXTURE_PX_PER_MM = 12;
export const TEXTURE_MAX_PX = 4096;

export interface BoardTextures {
  /** colour (sRGB) */
  map: THREE.CanvasTexture;
  /** roughness in green, metalness in blue (three.js convention) */
  orm: THREE.CanvasTexture;
}

/** Canvas size for a board of w × h mm: px/mm resolution, the longer side capped. */
export function textureSize(wMm: number, hMm: number, pxPerMm = TEXTURE_PX_PER_MM, maxPx = TEXTURE_MAX_PX): { width: number; height: number } {
  const s = Math.min(pxPerMm, maxPx / Math.max(wMm, hMm, 1e-6));
  return { width: Math.max(1, Math.min(maxPx, Math.round(wMm * s))), height: Math.max(1, Math.min(maxPx, Math.round(hMm * s))) };
}

/** SVG markup of one board side in board coordinates (the bottom side seen through the board). */
export async function boardSideSvg(doc: Doc, side: CopperSide, width: number, height: number, zoneFills?: Map<string, string>): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  // the manufactured board has every physical layer, whatever is hidden in the editor
  const shown: Doc = { ...doc, layers: doc.layers.map((l) => (l.role ? { ...l, visible: true, opacity: 1 } : l)) };
  const opts: PcbRenderOptions = { realistic: true, showNames: true, showValues: false, showPins: false, mirror: false, zoom: 1, zoneFills };
  return renderToStaticMarkup(
    createElement(
      'svg',
      { xmlns: 'http://www.w3.org/2000/svg', width, height, viewBox: `0 0 ${doc.width} ${doc.height}`, preserveAspectRatio: 'none' },
      createElement(PcbView, { doc: shown, idPrefix: `b3d${side}`, opts, mirror: side === 'bottom' }),
    ),
  );
}

async function rasterise(svg: string, width: number, height: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('board texture: SVG could not be rasterised'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Surface of a texel of the realistic palette (PcbView): returns
 * roughness | metalness << 8, both 0..255. Tin pads are metallic, silkscreen
 * matte, holes black and rough, everything else solder mask.
 */
export function surfaceOf(r: number, g: number, b: number): number {
  if (Math.abs(r - 215) + Math.abs(g - 217) + Math.abs(b - 219) < 36) return 80 | (255 << 8);
  if (r > 232 && g > 232 && b > 225) return 215;
  if (r + g + b < 60) return 255;
  return 105;
}

/** roughness/metalness canvas, at half resolution for large boards */
function surfaceMap(src: HTMLCanvasElement): HTMLCanvasElement {
  const k = Math.max(src.width, src.height) > 2048 ? 0.5 : 1;
  const w = Math.max(1, Math.round(src.width * k));
  const h = Math.max(1, Math.round(src.height * k));
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const s = surfaceOf(d[i], d[i + 1], d[i + 2]);
    d[i] = 255;
    d[i + 1] = s & 255;
    d[i + 2] = s >> 8;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/** Textures of one board side, ~12 px/mm (longest side at most 4096 px). */
export async function boardTextures(doc: Doc, side: CopperSide, zoneFills?: Map<string, string>): Promise<BoardTextures> {
  const { width, height } = textureSize(toMm(doc.width), toMm(doc.height));
  const canvas = await rasterise(await boardSideSvg(doc, side, width, height, zoneFills), width, height);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const orm = new THREE.CanvasTexture(surfaceMap(canvas));
  return { map, orm };
}
