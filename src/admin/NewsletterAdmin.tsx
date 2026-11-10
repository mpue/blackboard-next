// The newsletter on the admin page: issues (write, preview as the mail looks,
// test to yourself, send to everyone with progress) and the subscribers.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, FlaskConical, Plus, Save, Search, Send, Square, Trash2 } from 'lucide-react';
import { api, when, type Issue, type IssueFields, type Subscriber } from './api.ts';
import { Badge, Button, Card, Field, input, Pager, problem, textarea } from './ui.tsx';

const EMPTY: IssueFields = { subject: '', body: '', subjectEn: '', bodyEn: '' };
const HELP = '# Überschrift · ## kleinere · leere Zeile = neuer Absatz · - Liste · 1. Liste · **fett** · *kursiv* · [Text](https://…) · ![Bild](https://…) · --- Linie';

function status(i: Issue) {
  if (i.status === 'draft') return <Badge>Entwurf</Badge>;
  if (i.status === 'sending') return <Badge tone="amber">wird verschickt</Badge>;
  return <Badge tone="emerald">verschickt</Badge>;
}

function Editor({ id, subscribers, onBack, say }: { id: string | null; subscribers: number; onBack: () => void; say: (s: string) => void }) {
  const [issue, setIssue] = useState<Issue | null>(null);
  const [f, setF] = useState<IssueFields>(EMPTY);
  const [lang, setLang] = useState<'de' | 'en'>('de');
  const [html, setHtml] = useState('');
  const [busy, setBusy] = useState('');
  const saved = useRef<IssueFields>(EMPTY);
  const draft = !issue || issue.status === 'draft';
  const dirty = JSON.stringify(f) !== JSON.stringify(saved.current);

  const take = useCallback((i: Issue) => {
    setIssue(i);
    const fields = { subject: i.subject, body: i.body, subjectEn: i.subjectEn, bodyEn: i.bodyEn };
    saved.current = fields;
    setF(fields);
  }, []);
  useEffect(() => {
    if (id) api.issue(id).then(take, (e) => say(problem(e)));
  }, [id, take, say]);
  // while it is being sent: the progress
  useEffect(() => {
    if (issue?.status !== 'sending') return;
    const t = setInterval(() => void api.issue(issue.id).then(setIssue), 2000);
    return () => clearInterval(t);
  }, [issue?.status, issue?.id]);
  // the preview as the mail looks, a moment after typing
  useEffect(() => {
    const t = setTimeout(() => void api.preview(f, lang).then((r) => setHtml(r.html), () => undefined), 350);
    return () => clearTimeout(t);
  }, [f, lang]);

  const set = (k: keyof IssueFields) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async (): Promise<Issue> => {
    const i = issue ? await api.saveIssue(issue.id, f) : await api.createIssue(f);
    take(i);
    return i;
  };
  const act = async (what: string, run: () => Promise<void>) => {
    setBusy(what);
    try {
      await run();
    } catch (e) {
      say(problem(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <button type="button" className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white" onClick={onBack} aria-label="Zurück zur Liste">
            <ArrowLeft size={17} />
          </button>
          {issue ? issue.subject || 'Ohne Betreff' : 'Neue Ausgabe'} {issue && status(issue)}
        </span>
      }
      actions={
        draft ? (
          <>
            <Button icon={Save} disabled={!dirty && !!issue} busy={busy === 'save'} onClick={() => void act('save', async () => void (await save(), say('Gespeichert.')))}>
              Speichern
            </Button>
            <Button
              icon={FlaskConical}
              busy={busy === 'test'}
              onClick={() =>
                void act('test', async () => {
                  const i = await save();
                  const r = await api.testIssue(i.id);
                  say(`Test an ${r.to} geschickt.`);
                })
              }
            >
              Test an mich
            </Button>
            <Button
              variant="primary"
              icon={Send}
              busy={busy === 'send'}
              disabled={!subscribers}
              onClick={() =>
                confirm(`„${f.subject}“ jetzt an ${subscribers} Abonnent(en) schicken? Das lässt sich nicht zurückholen.`) &&
                void act('send', async () => {
                  const i = await save();
                  setIssue(await api.sendIssue(i.id));
                  say('Wird verschickt.');
                })
              }
            >
              An {subscribers} senden
            </Button>
          </>
        ) : issue?.status === 'sending' ? (
          <Button variant="danger" icon={Square} busy={busy === 'cancel'} onClick={() => void act('cancel', async () => setIssue(await api.cancelIssue(issue.id)))}>
            Abbrechen
          </Button>
        ) : null
      }
    >
      {issue && issue.status !== 'draft' && (
        <div className="mb-5 grid gap-2">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13.5px]">
            <span>
              Verschickt: <b className="text-white">{issue.sent}</b> von {issue.total}
            </span>
            {issue.failed > 0 && <span className="text-red-300">Fehlgeschlagen: {issue.failed}</span>}
            {issue.sentAt && <span className="text-slate-400">fertig am {when(issue.sentAt, true)}</span>}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${issue.total ? ((issue.sent + issue.failed) / issue.total) * 100 : 100}%` }} />
          </div>
          {!!issue.failures?.length && (
            <details className="text-[12.5px] text-slate-400">
              <summary className="cursor-pointer">Fehler ansehen</summary>
              <ul className="mt-2 grid gap-1">
                {issue.failures.map((x) => (
                  <li key={x.email}>
                    {x.email}: {x.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="grid content-start gap-4">
          <Field label="Betreff">
            <input className={input} value={f.subject} onChange={set('subject')} disabled={!draft} maxLength={200} placeholder="z. B. Neu in BlackBoard: der Code-Editor" />
          </Field>
          <Field label="Text" hint={HELP}>
            <textarea className={`${textarea} font-mono`} rows={16} value={f.body} onChange={set('body')} disabled={!draft} />
          </Field>
          <details className="rounded-xl border border-white/10 p-3" open={!!f.subjectEn || !!f.bodyEn}>
            <summary className="cursor-pointer text-[13px] font-medium text-slate-300">Englische Fassung (optional)</summary>
            <p className="mt-2 text-[12px] text-slate-500">Wer sich auf Englisch angemeldet hat, bekommt diese Fassung; ohne sie bekommen alle die deutsche.</p>
            <div className="mt-3 grid gap-3">
              <Field label="Subject">
                <input className={input} value={f.subjectEn} onChange={set('subjectEn')} disabled={!draft} maxLength={200} />
              </Field>
              <Field label="Text">
                <textarea className={`${textarea} font-mono`} rows={10} value={f.bodyEn} onChange={set('bodyEn')} disabled={!draft} />
              </Field>
            </div>
          </details>
          {draft && issue && (
            <Button
              variant="danger"
              icon={Trash2}
              className="justify-self-start"
              busy={busy === 'delete'}
              onClick={() =>
                confirm('Diesen Entwurf löschen?') &&
                void act('delete', async () => {
                  await api.deleteIssue(issue.id);
                  onBack();
                })
              }
            >
              Entwurf löschen
            </Button>
          )}
        </div>
        <div className="grid content-start gap-2">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="font-medium text-slate-300">Vorschau</span>
            <div className="ml-auto flex rounded-lg border border-white/10 p-0.5">
              {(['de', 'en'] as const).map((l) => (
                <button key={l} type="button" className={`rounded-md px-2.5 py-1 text-[12px] ${lang === l ? 'bg-white/10 text-white' : 'text-slate-400'}`} onClick={() => setLang(l)}>
                  {l === 'de' ? 'Deutsch' : 'Englisch'}
                </button>
              ))}
            </div>
          </div>
          <iframe title="Vorschau der Mail" sandbox="" srcDoc={html} className="h-[620px] w-full rounded-xl border border-white/10 bg-[#f1f5f9]" />
        </div>
      </div>
    </Card>
  );
}

function Subscribers({ say, onCount }: { say: (s: string) => void; onCount: () => void }) {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [state, setState] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ total: number; subscribers: Subscriber[] } | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(q);
      setOffset(0);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);
  const load = useCallback(() => {
    api.subscribers({ q: query, status: state, offset }).then(setData, (e) => say(problem(e)));
  }, [query, state, offset, say]);
  useEffect(load, [load]);

  return (
    <Card
      title={`Abonnenten${data ? ` (${data.total})` : ''}`}
      actions={
        <>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className={`${input} w-[200px] pl-8`} placeholder="E-Mail" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Abonnenten suchen" />
          </div>
          <select
            className={input}
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setOffset(0);
            }}
            aria-label="Nach Status filtern"
          >
            <option value="">Alle</option>
            <option value="active">bestätigt</option>
            <option value="pending">nicht bestätigt</option>
          </select>
          <a href={api.subscribersCsv()} className="flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-[13.5px] font-medium text-slate-200 hover:bg-white/5">
            <Download size={15} /> CSV
          </a>
        </>
      }
    >
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[640px] text-left text-[13.5px]">
          <thead className="text-[12px] uppercase tracking-wide text-slate-500">
            <tr className="border-b border-white/10">
              <th className="py-2 pr-3 font-medium">E-Mail</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Sprache</th>
              <th className="py-2 pr-3 font-medium">Über</th>
              <th className="py-2 pr-3 font-medium">Angemeldet</th>
              <th className="py-2 pr-3 font-medium">Bestätigt</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {data?.subscribers.map((s) => (
              <tr key={s.id} className="border-b border-white/5">
                <td className="py-2 pr-3 text-white">{s.email}</td>
                <td className="py-2 pr-3">{s.status === 'active' ? <Badge tone="emerald">bestätigt</Badge> : <Badge>offen</Badge>}</td>
                <td className="py-2 pr-3 uppercase text-slate-400">{s.lang}</td>
                <td className="py-2 pr-3 text-slate-400">{s.source === 'account' ? 'Konto' : 'Startseite'}</td>
                <td className="py-2 pr-3 text-slate-400">{when(s.createdAt)}</td>
                <td className="py-2 pr-3 text-slate-400">{when(s.confirmedAt)}</td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-300"
                    aria-label={`${s.email} entfernen`}
                    onClick={() =>
                      confirm(`${s.email} aus dem Newsletter entfernen?`) &&
                      void api.removeSubscriber(s.id).then(() => {
                        load();
                        onCount();
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {data && !data.subscribers.length && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  Noch keine Abonnenten.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data && <Pager offset={offset} total={data.total} size={50} onChange={setOffset} />}
    </Card>
  );
}

export function NewsletterAdmin({ say, subscribers, onCount }: { say: (s: string) => void; subscribers: number; onCount: () => void }) {
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [editing, setEditing] = useState<string | null | undefined>(undefined);
  const load = useCallback(() => void api.issues().then(setIssues, (e) => say(problem(e))), [say]);
  useEffect(load, [load]);

  if (editing !== undefined)
    return (
      <Editor
        id={editing}
        subscribers={subscribers}
        say={say}
        onBack={() => {
          setEditing(undefined);
          load();
        }}
      />
    );
  return (
    <div className="grid gap-5">
      <Card
        title="Ausgaben"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing(null)}>
            Neue Ausgabe
          </Button>
        }
      >
        {issues && !issues.length && <p className="py-6 text-center text-[14px] text-slate-500">Noch keine Ausgabe. Die erste schreibst du mit „Neue Ausgabe“.</p>}
        <ul className="grid gap-1">
          {issues?.map((i) => (
            <li key={i.id}>
              <button type="button" className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2.5 text-left hover:bg-white/[0.05]" onClick={() => setEditing(i.id)}>
                <span className="min-w-0 flex-1 truncate font-medium text-white">{i.subject || 'Ohne Betreff'}</span>
                {status(i)}
                <span className="text-[12.5px] text-slate-400">
                  {i.status === 'draft' ? `bearbeitet ${when(i.updatedAt, true)}` : `${i.sent} von ${i.total} · ${when(i.sentAt ?? i.updatedAt, true)}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Subscribers say={say} onCount={onCount} />
    </div>
  );
}
