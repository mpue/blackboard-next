// Board body for the 3D viewer: a rounded FR4 slab (mounting holes cut out)
// whose top and bottom faces are separate meshes for the rendered board sides,
// plus camera poses fitted to the board. Board y points down, 3D y up: the
// board occupies 0..width × -height..0 mm, its centre plane is z = 0.

import * as THREE from 'three';
import type { Doc } from '../model/types.ts';
import { footprintToWorld } from '../pcb/geometry.ts';
import { toMm } from '../pcb/units.ts';
import { BOARD_THICKNESS } from './models.ts';

export const SOLDER_MASK = '#145c34';
const FR4_EDGE = '#b5a46a';

export interface Hole {
  x: number;
  y: number;
  r: number;
}

/** Non plated holes (mounting holes) that lie fully inside the board outline, in 3D mm. */
export function boardHoles(doc: Doc): Hole[] {
  const W = toMm(doc.width);
  const H = toMm(doc.height);
  const rc = cornerRadius(doc);
  const out: Hole[] = [];
  const inside = (x: number, y: number, r: number) => {
    const m = r + 0.2;
    if (x < m || x > W - m || -y < m || -y > H - m) return false;
    // within a rounded corner the hole must clear the arc
    const inCorner = (x < rc || x > W - rc) && (-y < rc || -y > H - rc);
    if (!inCorner) return true;
    const cx = x < rc ? rc : W - rc;
    const cy = -y < rc ? rc : H - rc;
    return Math.hypot(x - cx, -y - cy) <= rc - m;
  };
  for (const it of doc.items) {
    if (it.kind !== 'footprint') continue;
    for (const pad of it.footprint.pads) {
      if (!pad.npth || !pad.drill) continue;
      const w = footprintToWorld(it, pad);
      const h = { x: toMm(w.x), y: -toMm(w.y), r: toMm(pad.drill) / 2 };
      if (!inside(h.x, h.y, h.r)) continue;
      if (out.some((o) => Math.hypot(o.x - h.x, o.y - h.y) < o.r + h.r + 0.1)) continue;
      out.push(h);
    }
  }
  return out;
}

function cornerRadius(doc: Doc): number {
  const W = toMm(doc.width);
  const H = toMm(doc.height);
  return Math.max(0, Math.min(toMm(doc.pcb?.cornerRadius ?? 0), W / 2, H / 2));
}

/** Rounded board outline with the mounting holes. */
export function boardShape(doc: Doc): THREE.Shape {
  const W = toMm(doc.width);
  const H = toMm(doc.height);
  const r = cornerRadius(doc);
  const s = new THREE.Shape();
  if (r < 1e-3) {
    s.moveTo(0, -H);
    s.lineTo(W, -H);
    s.lineTo(W, 0);
    s.lineTo(0, 0);
  } else {
    s.moveTo(r, -H);
    s.lineTo(W - r, -H);
    s.absarc(W - r, -H + r, r, -Math.PI / 2, 0, false);
    s.lineTo(W, -r);
    s.absarc(W - r, -r, r, 0, Math.PI / 2, false);
    s.lineTo(r, 0);
    s.absarc(r, -r, r, Math.PI / 2, Math.PI, false);
    s.lineTo(0, -H + r);
    s.absarc(r, -H + r, r, Math.PI, Math.PI * 1.5, false);
  }
  s.closePath();
  for (const h of boardHoles(doc)) {
    const p = new THREE.Path();
    p.absarc(h.x, h.y, h.r, 0, Math.PI * 2, true);
    s.holes.push(p);
  }
  return s;
}

/** Face geometry with UVs spanning the board rectangle (u = x / W, v = 1 at the top edge). */
export function faceGeometry(shape: THREE.Shape, W: number, H: number, bottom: boolean): THREE.ShapeGeometry {
  const g = new THREE.ShapeGeometry(shape, 24);
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / W, (pos.getY(i) + H) / H);
  uv.needsUpdate = true;
  if (bottom) {
    // facing down: reversed winding, normals -z
    const idx = g.getIndex();
    if (idx) {
      const a = idx.array;
      for (let i = 0; i + 2 < a.length; i += 3) {
        const t = a[i + 1];
        a[i + 1] = a[i + 2];
        a[i + 2] = t;
      }
      idx.needsUpdate = true;
    }
    const n = g.getAttribute('normal');
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 0, -1);
    n.needsUpdate = true;
  }
  return g;
}

export interface BoardMeshes {
  group: THREE.Group;
  top: THREE.MeshStandardMaterial;
  bottom: THREE.MeshStandardMaterial;
  width: number;
  height: number;
}

/** Board slab: FR4 edges and holes, top and bottom faces with their own (texturable) materials. */
export function buildBoard(doc: Doc, thickness = BOARD_THICKNESS): BoardMeshes {
  const W = Math.max(1, toMm(doc.width));
  const H = Math.max(1, toMm(doc.height));
  const shape = boardShape(doc);
  const group = new THREE.Group();
  group.name = 'board';
  // the slab only shows its sides: the caps are covered by the face meshes
  const caps = new THREE.MeshStandardMaterial({ visible: false });
  const edge = new THREE.MeshStandardMaterial({ color: FR4_EDGE, roughness: 0.75, metalness: 0 });
  const slabGeo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 24 }).translate(0, 0, -thickness / 2);
  const slab = new THREE.Mesh(slabGeo, [caps, edge]);
  slab.receiveShadow = true;
  group.add(slab);
  const face = (bottom: boolean) => {
    const m = new THREE.MeshStandardMaterial({ color: SOLDER_MASK, roughness: 0.45, metalness: 0 });
    const mesh = new THREE.Mesh(faceGeometry(shape, W, H, bottom).translate(0, 0, bottom ? -thickness / 2 : thickness / 2), m);
    mesh.name = bottom ? 'board-bottom' : 'board-top';
    mesh.receiveShadow = true;
    // the bottom face keeps the light of the top side away from bottom side parts
    mesh.castShadow = bottom;
    group.add(mesh);
    return m;
  };
  return { group, top: face(false), bottom: face(true), width: W, height: H };
}

// ---- camera ----------------------------------------------------------------------------------

export type ViewName = 'top' | 'bottom' | 'iso';

export interface Pose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

/** tilt off the poles so that the screen up direction stays defined (+y on top, also seen from below) */
const POLE = 1e-3;

/**
 * Camera pose for a z-up camera: top and bottom views fit the board rectangle
 * (the bottom view mirrored left/right like the editor's bottom view), the iso
 * view fits the bounds of board and parts.
 */
export function viewPose(view: ViewName, bounds: THREE.Box3, board: { width: number; height: number }, fovDeg: number, aspect: number): Pose {
  const target = new THREE.Vector3(board.width / 2, -board.height / 2, 0);
  const t = Math.tan((fovDeg * Math.PI) / 360);
  const a = Math.max(0.1, aspect);
  if (view === 'iso') {
    let radius = Math.hypot(board.width, board.height) / 2;
    if (!bounds.isEmpty()) {
      const corner = new THREE.Vector3();
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z);
        radius = Math.max(radius, corner.distanceTo(target));
      }
    }
    const half = Math.atan(Math.min(t, t * a));
    const dist = (radius / Math.sin(half)) * 0.92;
    const dir = new THREE.Vector3(0.42, -1, 0.95).normalize();
    return { position: target.clone().addScaledVector(dir, dist), target };
  }
  const fit = Math.max(board.height / 2 / t, board.width / 2 / (t * a)) * 1.08;
  if (view === 'top') {
    const d = fit + Math.max(0, bounds.isEmpty() ? 0 : bounds.max.z);
    return { position: target.clone().add(new THREE.Vector3(0, -Math.sin(POLE) * d, Math.cos(POLE) * d)), target };
  }
  const d = fit + Math.max(0, bounds.isEmpty() ? 0 : -bounds.min.z);
  return { position: target.clone().add(new THREE.Vector3(0, Math.sin(POLE) * d, -Math.cos(POLE) * d)), target };
}
