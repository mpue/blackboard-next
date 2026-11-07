const DIGIT_COLORS = ['#000000', '#8b4513', '#e02424', '#f97316', '#facc15', '#16a34a', '#2563eb', '#7c3aed', '#9ca3af', '#ffffff'];
const GOLD = '#c9a227';
const SILVER = '#c0c0c0';

const TOLERANCE_COLORS: [number, string][] = [
  [0.05, '#9ca3af'],
  [0.1, '#7c3aed'],
  [0.25, '#2563eb'],
  [0.5, '#16a34a'],
  [1, '#8b4513'],
  [2, '#e02424'],
  [5, GOLD],
  [10, SILVER],
];

/** Colour bands of a resistor: 4 bands (2 digits) for E24, 5 bands (3 digits) for precision values. */
export function resistorBands(ohms: number, tolerance: number): string[] {
  const precise = tolerance <= 1;
  const digits = precise ? 3 : 2;
  if (!(ohms > 0)) return [DIGIT_COLORS[0]];
  let exp = Math.floor(Math.log10(ohms)) - (digits - 1);
  let mant = Math.round(ohms / 10 ** exp);
  if (mant >= 10 ** digits) {
    mant = Math.round(mant / 10);
    exp += 1;
  }
  const ds = String(mant).padStart(digits, '0').split('').map(Number);
  const mult = exp === -1 ? GOLD : exp === -2 ? SILVER : DIGIT_COLORS[Math.max(0, Math.min(9, exp))];
  const tol = TOLERANCE_COLORS.find(([t]) => tolerance <= t)?.[1] ?? SILVER;
  return [...ds.map((d) => DIGIT_COLORS[d]), mult, tol];
}
