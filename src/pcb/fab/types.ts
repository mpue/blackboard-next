// Shared types of the fabrication outputs (Gerber, Excellon, assembly, etching).

export interface FabFile {
  name: string;
  content: string;
}

/** Closed implicitly, board units. */
export type Ring = { x: number; y: number }[];
/** [outer, ...holes] */
export type PolygonWithHoles = Ring[];
export type MultiPolygon = PolygonWithHoles[];

/** zone item id -> filled copper of the zone */
export type ZoneFills = Map<string, MultiPolygon>;

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const GENERATOR = 'BlackBoard,Next,3.0';

/** File names must survive every fab upload form. */
export function safeProjectName(project: string | undefined): string {
  const s = (project ?? '').trim().replace(/\.bb$/i, '').replace(/[^A-Za-z0-9_.-]+/g, '_');
  return s || 'board';
}
