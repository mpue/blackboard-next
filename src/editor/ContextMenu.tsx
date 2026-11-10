import { useEffect, useRef } from 'react';
import { commands, runCommand, type Command } from './commands.ts';
import { activeDoc, moveSelectionToLayer, useStore } from '../store/store.ts';
import { useT } from '../i18n/i18n.ts';
import { isBoardLayer, type Layer } from '../model/types.ts';

const NO_LAYERS: Layer[] = [];

export interface ContextMenuState {
  x: number;
  y: number;
  onItem: boolean;
}

export function ContextMenu({ state, onClose }: { state: ContextMenuState; onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const layers = useStore((s) => activeDoc(s)?.doc.layers ?? NO_LAYERS);
  useEffect(() => {
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener('pointerdown', down);
    return () => window.removeEventListener('pointerdown', down);
  }, [onClose]);
  const c = commands;
  const groups: Command[][] = state.onItem
    ? [
        [c.cut, c.copy, c.paste, c.duplicate, c.delete],
        [c.rotateCW, c.rotateCCW, c.flipH, c.flipV],
        [c.front, c.back],
        [c.makeSymbol, c.breakSymbol, c.makePart, c.editPart],
      ]
    : [[c.paste, c.selectAll], [c.wire, c.text], [c.fit, c.grid, c.snap, c.magnet, c.mirror]];
  const parent = ref.current?.parentElement;
  const maxX = (parent?.clientWidth ?? 9999) - 240;
  const maxY = (parent?.clientHeight ?? 9999) - 420;
  return (
    <div
      ref={ref}
      className="bb-pop absolute z-40 min-w-[220px] rounded-lg border border-line bg-panel p-1 text-[12.5px] shadow-xl"
      style={{ left: Math.max(4, Math.min(state.x, maxX)), top: Math.max(4, Math.min(state.y, maxY)) }}
      onContextMenu={(e) => e.preventDefault()}
      role="menu"
    >
      {groups.map((g, gi) => (
        <div key={gi}>
          {gi > 0 && <div className="my-1 h-px bg-line" />}
          {g
            .filter((cmd) => !cmd.enabled || cmd.enabled() || !state.onItem)
            .map((cmd) => {
              const Icon = cmd.icon;
              const enabled = !cmd.enabled || cmd.enabled();
              return (
                <button
                  key={cmd.id}
                  disabled={!enabled}
                  role="menuitem"
                  className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-hover disabled:opacity-35"
                  onClick={() => {
                    onClose();
                    runCommand(cmd);
                  }}
                >
                  <span className="flex w-4 justify-center text-muted">{Icon && <Icon size={14} />}</span>
                  <span className="flex-1">{t(cmd.label)}</span>
                  {cmd.shortcut && <span className="text-[11px] text-muted">{cmd.shortcut}</span>}
                </button>
              );
            })}
        </div>
      ))}
      {state.onItem && (
        <>
          <div className="my-1 h-px bg-line" />
          <div className="px-2 pb-1 pt-1 text-[11px] text-muted">{t('edit.toLayer')}</div>
          <div className="flex flex-wrap gap-1 px-1.5 pb-1">
            {layers
              .filter((l) => !isBoardLayer(l))
              .map((l) => (
                <button
                  key={l.id}
                  className="flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[11.5px] hover:bg-hover"
                  onClick={() => {
                    moveSelectionToLayer(l.id);
                    onClose();
                  }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
                  {l.name}
                </button>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
