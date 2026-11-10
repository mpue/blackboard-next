import { useEffect, useRef, useState } from 'react';
import { Check, Monitor, Moon, Sun, Languages, Activity } from 'lucide-react';
import { commands, runCommand, type Command } from '../editor/commands.ts';
import { useStore, updateSettings, activeDoc } from '../store/store.ts';
import { useT, type I18nKey } from '../i18n/i18n.ts';
import { Button, IconButton, cx } from './primitives.tsx';
import { Logo } from './Logo.tsx';
import { useLive } from '../store/live.ts';
import { useLearn } from '../learn/state.ts';
import { useView3d } from './Board3DHost.tsx';
import { isSchematicDoc } from '../model/types.ts';

type MenuEntry = Command | 'sep' | { radio: string; checked: boolean; run: () => void };

function useMenus(): { title: I18nKey; items: MenuEntry[] }[] {
  const settings = useStore((s) => s.settings);
  const t = useT();
  const c = commands;
  return [
    { title: 'menu.file', items: [c.new, c.open, c.samples, 'sep', c.save, c.saveAs, 'sep', c.exportPng, c.exportSvg, c.exportNetlist, c.exportKicadNetlist, c.exportBom, 'sep', c.print] },
    {
      title: 'menu.edit',
      items: [c.undo, c.redo, 'sep', c.cut, c.copy, c.paste, c.duplicate, c.delete, 'sep', c.selectAll, c.selectLines, 'sep', c.rotateCW, c.rotateCCW, c.flipH, c.flipV, 'sep', c.front, c.forward, c.backward, c.back, 'sep', c.makeSymbol, c.breakSymbol],
    },
    {
      title: 'menu.view',
      items: [
        c.zoomIn,
        c.zoomOut,
        c.fit,
        c.actual,
        'sep',
        c.grid,
        c.snap,
        c.magnet,
        c.mirror,
        'sep',
        c.names,
        c.values,
        c.pins,
        c.layerColor,
        'sep',
        c.leftPanel,
        c.rightPanel,
        'sep',
        ...(['system', 'light', 'dark'] as const).map((th) => ({ radio: `${t('view.theme')}: ${t(`view.theme.${th}`)}`, checked: settings.theme === th, run: () => updateSettings({ theme: th }) })),
        'sep',
        { radio: 'Deutsch', checked: settings.lang === 'de', run: () => updateSettings({ lang: 'de' }) },
        { radio: 'English', checked: settings.lang === 'en', run: () => updateSettings({ lang: 'en' }) },
      ],
    },
    { title: 'menu.board', items: [c.boardProps, 'sep', c.simulate, c.live, c.liveTran, c.check, c.erc, c.exportNetlist] },
    {
      title: 'menu.pcb',
      items: [c.annotate, c.createPcb, c.updatePcb, 'sep', c.track, c.via, c.zone, c.outline, c.resetOutline, c.fitBoard, c.mountingHoles, c.autoroute, c.selectConnected, c.unrouteNet, c.unrouteAll, 'sep', c.newFootprint, c.editFootprint, c.importKicadFootprints, c.exportKicadFootprints, 'sep', c.drc, c.pcbRules, 'sep', c.realistic, c.view3d, c.ratsnest, 'sep', c.exportGerber, c.exportEtching],
    },
    { title: 'menu.tools', items: [c.select, c.pan, c.wire, c.resistor, c.diode, c.box, c.ellipse, c.text, c.measure, c.check, 'sep', c.track, c.via, c.zone] },
    { title: 'menu.help', items: [c.learn, 'sep', c.shortcuts, c.about] },
  ];
}

function MenuDropdown({ items, onClose }: { items: MenuEntry[]; onClose: () => void }) {
  const t = useT();
  // re-render when the document changes so enabled/checked states are current
  useStore((s) => activeDoc(s));
  useStore((s) => s.tool);
  useStore((s) => s.clipboard);
  return (
    <div
      className="bb-pop bb-scroll absolute left-0 top-full z-50 mt-1 max-h-[calc(100vh-64px)] w-max min-w-[260px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-lg border border-line bg-panel p-1 shadow-xl"
      role="menu"
    >
      {items.map((it, i) => {
        if (it === 'sep') return <div key={i} className="my-1 h-px bg-line" />;
        if ('radio' in it) {
          return (
            <button
              key={i}
              role="menuitemradio"
              aria-checked={it.checked}
              className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12.5px] hover:bg-hover"
              onClick={() => {
                it.run();
                onClose();
              }}
            >
              <span className="flex w-4 justify-center">{it.checked && <Check size={14} />}</span>
              <span className="whitespace-nowrap">{it.radio}</span>
            </button>
          );
        }
        const enabled = !it.enabled || it.enabled();
        const checked = it.checked?.();
        const Icon = it.icon;
        return (
          <button
            key={i}
            role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={checked}
            disabled={!enabled}
            className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12.5px] hover:bg-hover disabled:opacity-35 disabled:hover:bg-transparent"
            onClick={() => {
              onClose();
              runCommand(it);
            }}
          >
            <span className="flex w-4 justify-center text-muted">{checked ? <Check size={14} className="text-accent" /> : Icon ? <Icon size={14} /> : null}</span>
            <span className="flex-1 whitespace-nowrap">{t(it.label)}</span>
            {it.shortcut && <span className="ml-6 whitespace-nowrap text-[11px] text-muted">{it.shortcut}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function TopBar() {
  const t = useT();
  const menus = useMenus();
  const [open, setOpen] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const theme = useStore((s) => s.settings.theme);
  const lang = useStore((s) => s.settings.lang);
  const hasDoc = useStore((s) => !!s.active);
  const docType = useStore((s) => activeDoc(s)?.doc.type);
  const schematic = useStore((s) => {
    const d = activeDoc(s)?.doc;
    return !!d && isSchematicDoc(d);
  });
  const liveOn = useLive((s) => s.on);
  const learnOpen = useLearn((s) => s.open);
  const view3d = useView3d((s) => s.open);
  const liveStatus = useLive((s) => s.status);
  const liveMode = useLive((s) => s.mode);
  useStore((s) => activeDoc(s));
  useStore((s) => s.settings);

  useEffect(() => {
    if (open === null) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const quick = (c: Command) => (
    <IconButton key={c.id} icon={c.icon!} label={t(c.label)} shortcut={c.shortcut} disabled={c.enabled ? !c.enabled() : false} active={c.checked?.()} onClick={() => runCommand(c)} />
  );
  const nextTheme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  const ThemeIcon = theme === 'system' ? Monitor : theme === 'light' ? Sun : Moon;

  return (
    <header className="flex h-11 shrink-0 items-center gap-1 border-b border-line bg-panel px-1.5 sm:gap-2 sm:px-2">
      <div className="flex shrink-0 items-center gap-2 pl-1 pr-1 sm:pr-2">
        <Logo size={22} />
        <span className="hidden text-[13.5px] font-semibold tracking-tight sm:inline">
          BlackBoard<span className="ml-1 font-normal text-muted">Next</span>
        </span>
      </div>
      <nav ref={ref} className="flex items-center" aria-label="Menu">
        {menus.map((m, i) => (
          <div key={m.title} className="relative">
            <button
              className={cx('h-7 rounded-md px-1.5 text-[12.5px] hover:bg-hover sm:px-2.5', open === i && 'bg-hover')}
              onClick={() => setOpen(open === i ? null : i)}
              onPointerEnter={() => open !== null && setOpen(i)}
              aria-haspopup="menu"
              aria-expanded={open === i}
            >
              {t(m.title)}
            </button>
            {open === i && <MenuDropdown items={m.items} onClose={() => setOpen(null)} />}
          </div>
        ))}
      </nav>
      <div className="mx-1 hidden h-5 w-px bg-line lg:block" />
      <div className="hidden items-center gap-0.5 lg:flex">
        {[commands.undo, commands.redo].map(quick)}
        <div className="mx-1 h-5 w-px bg-line" />
        {[commands.rotateCCW, commands.rotateCW, commands.flipH].map(quick)}
        <div className="mx-1 h-5 w-px bg-line" />
        {[commands.zoomOut, commands.zoomIn, commands.fit].map(quick)}
        <div className="mx-1 h-5 w-px bg-line" />
        {[commands.grid, commands.snap, commands.magnet, commands.mirror].map(quick)}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <IconButton icon={commands.learn.icon!} label={`${t('learn.title')} (F1)`} active={learnOpen} onClick={() => runCommand(commands.learn)} />
        <IconButton icon={Languages} className="max-sm:hidden" label={t('view.language')} onClick={() => updateSettings({ lang: lang === 'de' ? 'en' : 'de' })} />
        <IconButton icon={ThemeIcon} className="max-sm:hidden" label={`${t('view.theme')}: ${t(`view.theme.${theme}`)}`} onClick={() => updateSettings({ theme: nextTheme })} />
        {schematic && (
          <Button
            variant={liveOn ? 'primary' : 'ghost'}
            icon={commands.live.icon}
            onClick={() => runCommand(commands.live)}
            title={`${t('live.toggle')} (Shift+L)${liveOn ? ` · ${t('hint.live')}` : ''}`}
            className={cx(liveStatus === 'running' && '[&_svg]:animate-pulse')}
          >
            <span className="hidden md:inline">{t('live.short')}</span>
          </Button>
        )}
        {schematic && liveOn && (
          <IconButton icon={commands.liveTran.icon!} label={`${t('live.tran')} (Shift+T)`} active={liveMode === 'tran'} onClick={() => runCommand(commands.liveTran)} />
        )}
        {docType === 'PCB' && <IconButton icon={commands.view3d.icon!} label={`${t('view3d.toggle')} (3)`} active={view3d} onClick={() => runCommand(commands.view3d)} />}
        {docType === 'PCB' ? (
          <Button variant="primary" icon={commands.drc.icon} onClick={() => runCommand(commands.drc)} title={`${t('pcb.drc')} (Shift+D)`}>
            <span className="hidden md:inline">DRC</span>
          </Button>
        ) : (
          <Button variant="primary" icon={Activity} disabled={!hasDoc} onClick={() => runCommand(commands.simulate)} title={`${t('board.simulate')} (F5)`}>
            <span className="hidden md:inline">{t('sim.run')}</span>
          </Button>
        )}
      </div>
    </header>
  );
}
