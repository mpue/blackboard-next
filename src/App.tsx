import { lazy, Suspense, useEffect } from 'react';
import { openDoc, setLibrary, toast, updateSettings, useStore } from './store/store.ts';
import { handleShortcut } from './editor/commands.ts';
import { openBytes } from './editor/fileActions.ts';
import { Canvas } from './editor/Canvas.tsx';
import { TopBar } from './ui/TopBar.tsx';
import { StatusBar, TabBar, Toasts, ToolRail } from './ui/Chrome.tsx';
import { LibraryPanel } from './ui/LibraryPanel.tsx';
import { RightPanel } from './ui/RightPanel.tsx';
import { Dialogs, Welcome } from './ui/Dialogs.tsx';
import { SimulationPanel } from './ui/SimulationPanel.tsx';
import { DrcPanel } from './ui/DrcPanel.tsx';
import { useDrc } from './ui/drcState.ts';
import { installCrossProbing } from './editor/crossProbe.ts';
import { installLiveUpdates } from './store/live.ts';
import { Board3DHost } from './ui/Board3DHost.tsx';
import { useLearn } from './learn/state.ts';
import { useApplyTheme } from './ui/theme.ts';
import { loadSession, loadUserSymbols, saveSession } from './platform/persist.ts';
import type { PartDef, SpiceModel, SymbolDef } from './model/types.ts';
import { isDirty } from './store/store.ts';

// lessons and the component guide are loaded when the learning panel opens
const LearnPanel = lazy(() => import('./learn/LearnPanel.tsx').then((m) => ({ default: m.LearnPanel })));

async function loadLibrary() {
  try {
    const [parts, symbols, models, userSymbols] = await Promise.all([
      fetch('library/parts.json').then((r) => r.json() as Promise<PartDef[]>),
      fetch('library/symbols.json').then((r) => r.json() as Promise<SymbolDef[]>),
      fetch('library/models.json').then((r) => r.json() as Promise<SpiceModel[]>),
      loadUserSymbols(),
    ]);
    setLibrary({ loaded: true, parts, symbols, models, userSymbols });
  } catch (e) {
    setLibrary({ loaded: false, error: `Bibliothek konnte nicht geladen werden: ${(e as Error).message}` });
  }
}

/**
 * Direct links: ?lesson=<id> starts a lesson, ?demo=pcb|bench opens a demo,
 * ?sample=schematics/<file>.bb opens a sample, ?view=3d|realistic|live|slowmo
 * adds a view (e.g. ?demo=pcb&view=3d).
 */
let deepLinkOpened = false;

async function openDeepLink() {
  // effects run twice in development (StrictMode): open the link once
  if (deepLinkOpened) return;
  deepLinkOpened = true;
  const q = new URLSearchParams(location.search);
  const lesson = q.get('lesson');
  const demo = q.get('demo');
  const view = q.get('view');
  const sample = q.get('sample');
  if (lesson) {
    const [{ LESSONS }, { startLesson }] = await Promise.all([import('./learn/lessons/index.ts'), import('./learn/state.ts')]);
    const l = LESSONS.find((x) => x.id === lesson);
    if (l) startLesson(l);
  } else if (demo === 'pcb') {
    const { openPcbDemo } = await import('./editor/pcbActions.ts');
    await openPcbDemo();
  } else if (demo === 'bench') {
    const { openBenchDemo } = await import('./ui/Dialogs.tsx');
    openBenchDemo();
  } else if (sample && /^(boards|schematics)\/[\w.-]+\.bb$/.test(sample)) {
    const { openSample } = await import('./editor/fileActions.ts');
    const [group, file] = sample.split('/');
    await openSample(group, file);
  }
  if (view === 'realistic') updateSettings({ pcbRealistic: true });
  if (view === '3d') (await import('./ui/Board3DHost.tsx')).setView3d(true);
  if (view === 'live' || view === 'slowmo') {
    const live = await import('./store/live.ts');
    if (view === 'slowmo') live.setLiveMode('tran');
    live.setLiveValues(true);
  }
}

async function restoreSession() {
  const s = await loadSession();
  if (!s?.docs.length || useStore.getState().docs.length) return;
  for (const d of s.docs) openDoc(d.doc, d.fileName, undefined, !d.dirty);
  const docs = useStore.getState().docs;
  const active = docs[Math.min(s.active, docs.length - 1)];
  if (active) useStore.setState({ active: active.id });
}

function useSessionPersistence() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useStore.subscribe((s, prev) => {
      if (s.docs === prev.docs && s.active === prev.active) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const st = useStore.getState();
        void saveSession({
          docs: st.docs.map((d) => ({ fileName: d.fileName, doc: d.doc, dirty: isDirty(d) })),
          active: Math.max(0, st.docs.findIndex((d) => d.id === st.active)),
        });
      }, 800);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);
}

type LaunchParams = { files: { getFile(): Promise<File> }[] };

function useFileEntryPoints() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handleShortcut(e);
    window.addEventListener('keydown', onKey);
    // dropping .bb files anywhere opens them
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const onDrop = async (e: DragEvent) => {
      const files = [...(e.dataTransfer?.files ?? [])].filter((f) => /\.bbs?$/i.test(f.name));
      if (!files.length) return;
      e.preventDefault();
      for (const f of files) openBytes(f.name, new Uint8Array(await f.arrayBuffer()));
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    // installed PWA: "open with BlackBoard"
    const lq = (window as unknown as { launchQueue?: { setConsumer(cb: (p: LaunchParams) => void): void } }).launchQueue;
    lq?.setConsumer(async (p) => {
      for (const h of p.files) {
        const f = await h.getFile();
        openBytes(f.name, new Uint8Array(await f.arrayBuffer()), h);
      }
    });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);
}

export function App() {
  useApplyTheme();
  useSessionPersistence();
  useFileEntryPoints();
  const hasDocs = useStore((s) => s.docs.length > 0);
  const active = useStore((s) => s.active);
  const left = useStore((s) => s.settings.leftPanel);
  const right = useStore((s) => s.settings.rightPanel);
  const simOpen = useStore((s) => s.simulationOpen);
  const drcOpen = useDrc((s) => s.open);
  const learnOpen = useLearn((s) => s.open);
  const isPcb = useStore((s) => s.docs.find((d) => d.id === s.active)?.doc.type === 'PCB');

  useEffect(installCrossProbing, []);
  useEffect(installLiveUpdates, []);

  useEffect(() => {
    if (window.innerWidth < 900) updateSettings({ leftPanel: false, rightPanel: false });
    void loadLibrary().then(restoreSession).then(openDeepLink);
    const off = () => toast('Offline', 'info');
    window.addEventListener('offline', off);
    return () => window.removeEventListener('offline', off);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        {hasDocs && <ToolRail />}
        {left && <LibraryPanel />}
        <main className="flex min-w-0 flex-1 flex-col">
          {hasDocs ? (
            <>
              <TabBar />
              <div className="relative min-h-0 flex-1">
                <Canvas />
                <Board3DHost />
              </div>
              {drcOpen && <DrcPanel />}
              {simOpen && !isPcb && <SimulationPanel key={active} />}
            </>
          ) : (
            <Welcome />
          )}
        </main>
        {learnOpen && (
          <Suspense fallback={<aside className="w-80 shrink-0 border-l border-line bg-panel" />}>
            <LearnPanel />
          </Suspense>
        )}
        {hasDocs && right && <RightPanel />}
      </div>
      <StatusBar />
      <Dialogs />
      <Toasts />
    </div>
  );
}
