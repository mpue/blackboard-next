// crypto.randomUUID is unavailable outside secure contexts (e.g. plain http on
// a LAN address), so ids are generated locally.
let counter = 0;
const session = Math.random().toString(36).slice(2, 8);

export function uid(prefix = 'i'): string {
  counter = (counter + 1) % 0x7fffffff;
  return `${prefix}${session}${counter.toString(36)}`;
}
