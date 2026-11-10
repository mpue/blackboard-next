import { activeDoc, select, setView } from '../store/store.ts';
import { itemBounds } from '../geometry/geom.ts';
import { partLookup } from '../model/ops.ts';

/** Centres an item in the canvas, zooms in if needed and selects it. */
export function showItem(id: string) {
  const ds = activeDoc();
  const el = document.querySelector('.bb-canvas');
  const it = ds?.doc.items.find((i) => i.id === id);
  if (!ds || !el || !it) return;
  const r = itemBounds(it, partLookup(ds.doc));
  const box = el.getBoundingClientRect();
  const zoom = Math.min(4, Math.max(ds.view.zoom, Math.min((box.width * 0.3) / Math.max(r.w, 16), (box.height * 0.3) / Math.max(r.h, 16))));
  const cx = r.x + r.w / 2;
  const x = ds.mirror ? ds.doc.width - cx : cx;
  setView({ zoom, panX: box.width / 2 - x * zoom, panY: box.height / 2 - (r.y + r.h / 2) * zoom });
  select([id]);
}
