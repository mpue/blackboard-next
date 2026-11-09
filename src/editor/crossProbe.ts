// Cross probing: selecting components in a schematic selects the footprints
// with the same designators on its PCB (and the other way round).

import { useStore, type DocState } from '../store/store.ts';
import { isSchematicDoc } from '../model/types.ts';

const named = (ds: DocState, ids: string[]) => {
  const sel = new Set(ids);
  return new Set(ds.doc.items.flatMap((i) => (sel.has(i.id) && (i.kind === 'symbol' || i.kind === 'footprint') ? [i.name] : [])));
};

function linked(a: DocState, b: DocState): boolean {
  if (a.doc.type === 'PCB' && isSchematicDoc(b.doc)) return a.doc.pcb?.schematic === b.fileName;
  if (isSchematicDoc(a.doc) && b.doc.type === 'PCB') return b.doc.pcb?.schematic === a.fileName;
  return false;
}

export function installCrossProbing(): () => void {
  return useStore.subscribe((s, prev) => {
    const cur = s.docs.find((d) => d.id === s.active);
    const before = prev.docs.find((d) => d.id === s.active);
    if (!cur || !before || cur.selection === before.selection) return;
    const names = named(cur, cur.selection);
    const others = s.docs.filter((d) => d.id !== cur.id && linked(cur, d));
    if (!others.length) return;
    useStore.setState({
      docs: s.docs.map((d) => {
        if (!others.includes(d)) return d;
        const kind = d.doc.type === 'PCB' ? 'footprint' : 'symbol';
        const selection = d.doc.items.filter((i) => i.kind === kind && names.has(i.name)).map((i) => i.id);
        return selection.join() === d.selection.join() ? d : { ...d, selection };
      }),
    });
  });
}
