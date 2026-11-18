// The accounts: search, filter by access, and per account the access to
// compiler and Claude, admin rights, blocking, mails and deleting.

import { useCallback, useEffect, useState } from 'react';
import { Ban, KeyRound, LogOut, Mail, Search, Shield, Trash2, UserCheck } from 'lucide-react';
import type { Plan } from '../account/plans.ts';
import { api, PLAN_NAMES, when, type AdminUser } from './api.ts';
import { Badge, Button, Card, Field, input, Modal, Pager, problem, textarea } from './ui.tsx';

const SIZE = 50;

function Avatar({ u }: { u: AdminUser }) {
  return u.image ? (
    <img src={u.image} alt="" className="h-8 w-8 shrink-0 rounded-full" referrerPolicy="no-referrer" />
  ) : (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/80 text-[13px] font-semibold text-white">{u.name.slice(0, 1).toUpperCase()}</span>
  );
}

function Badges({ u }: { u: AdminUser }) {
  return (
    <>
      {u.admin && <Badge tone="amber">Admin</Badge>}
      {u.banned && <Badge tone="red">gesperrt</Badge>}
      {!u.emailVerified && <Badge>unbestätigt</Badge>}
      {u.providers.includes('google') && <Badge>Google</Badge>}
    </>
  );
}

const planTone = (p: Plan) => (p === 'unlimited' ? 'emerald' : p === 'standard' ? 'indigo' : 'slate');

function UserPanel({ user: u, self, onClose, onChanged, say }: { user: AdminUser; self: string; onClose: () => void; onChanged: () => void; say: (s: string) => void }) {
  const [plan, setPlan] = useState<Plan>(u.plan);
  const [note, setNote] = useState(u.note);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState('');
  const isSelf = u.id === self;
  const dirty = plan !== u.plan || note !== u.note;

  const act = async (what: string, f: () => Promise<unknown>, done: string, close = false) => {
    setBusy(what);
    try {
      await f();
      say(done);
      onChanged();
      if (close) onClose();
    } catch (e) {
      say(problem(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <Modal
      wide
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <Avatar u={u} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-[17px] font-semibold text-white">{u.name}</span>
              <Badges u={u} />
            </div>
            <div className="truncate text-[13px] text-slate-400">{u.email}</div>
          </div>
        </div>
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div className="grid content-start gap-4">
          <Field label="Zugang zu Online-Compiler und Claude" hint="Standard: mit Tageslimit (Reiter „Compiler“). Unbegrenzt: ohne Tageslimit. Gesperrt: weder Compiler noch Claude; das Konto selbst bleibt nutzbar.">
            <select className={input} value={plan} onChange={(e) => setPlan(e.target.value as Plan)}>
              {(Object.keys(PLAN_NAMES) as Plan[]).map((p) => (
                <option key={p} value={p}>
                  {PLAN_NAMES[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notiz" hint="Nur für dich, z. B. warum das Konto unbegrenzt oder gesperrt ist.">
            <textarea className={textarea} rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </Field>
          <Button
            variant="primary"
            disabled={!dirty}
            busy={busy === 'plan'}
            onClick={() => void act('plan', () => api.updateUser(u.id, { plan, note }), 'Zugang gespeichert.')}
          >
            Speichern
          </Button>
        </div>

        <div className="grid content-start gap-4 text-[13.5px]">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-slate-500">Registriert</dt>
            <dd>{when(u.createdAt, true)}</dd>
            <dt className="text-slate-500">Letzte Sitzung</dt>
            <dd>{when(u.lastSeen, true)}</dd>
            <dt className="text-slate-500">Anmeldung</dt>
            <dd>{u.providers.map((p) => (p === 'credential' ? 'E-Mail und Passwort' : p === 'google' ? 'Google' : p)).join(', ') || '–'}</dd>
            <dt className="text-slate-500">Projekte</dt>
            <dd>{u.projects}</dd>
            <dt className="text-slate-500">Übersetzungen</dt>
            <dd>
              heute {u.compilesToday}, insgesamt {u.compilesTotal}
            </dd>
            <dt className="text-slate-500">Newsletter</dt>
            <dd>{u.newsletter === 'active' ? 'abonniert' : u.newsletter === 'pending' ? 'nicht bestätigt' : 'nein'}</dd>
            {u.banned && (
              <>
                <dt className="text-slate-500">Gesperrt</dt>
                <dd className="text-red-300">{u.banReason || 'ohne Grund'}</dd>
              </>
            )}
          </dl>

          <div className="flex flex-wrap gap-2">
            {u.role === 'admin' ? (
              <Button icon={Shield} disabled={isSelf} busy={busy === 'role'} onClick={() => void act('role', () => api.updateUser(u.id, { role: 'user' }), 'Admin-Rechte entzogen.')}>
                Admin-Rechte entziehen
              </Button>
            ) : (
              <Button
                icon={Shield}
                busy={busy === 'role'}
                onClick={() => confirm(`${u.name} Admin-Rechte geben? Admins sehen alle Konten und verschicken den Newsletter.`) && void act('role', () => api.updateUser(u.id, { role: 'admin' }), 'Admin-Rechte gegeben.')}
              >
                Zum Admin machen
              </Button>
            )}
            <Button icon={LogOut} busy={busy === 'out'} onClick={() => void act('out', () => api.signOutUser(u.id), 'Überall abgemeldet.')}>
              Abmelden
            </Button>
            {u.providers.includes('credential') && (
              <Button icon={KeyRound} busy={busy === 'reset'} onClick={() => void act('reset', () => api.resetPassword(u.id), `Passwort-Link an ${u.email} geschickt.`)}>
                Passwort-Link schicken
              </Button>
            )}
            {!u.emailVerified && (
              <Button icon={Mail} busy={busy === 'verify'} onClick={() => void act('verify', () => api.resendVerification(u.id), `Bestätigungsmail an ${u.email} geschickt.`)}>
                Bestätigungsmail
              </Button>
            )}
          </div>
          {u.role !== 'admin' && u.admin && <p className="text-[12px] text-slate-500">Admin über ADMIN_EMAILS in server.env.</p>}

          <div className="grid gap-2 rounded-xl border border-red-500/20 p-3">
            {u.banned ? (
              <Button icon={UserCheck} busy={busy === 'ban'} onClick={() => void act('ban', () => api.updateUser(u.id, { banned: false }), 'Konto entsperrt.')}>
                Entsperren
              </Button>
            ) : (
              <div className="flex gap-2">
                <input className={`${input} min-w-0 flex-1`} placeholder="Grund (optional)" value={reason} onChange={(e) => setReason(e.target.value)} disabled={isSelf} />
                <Button variant="danger" icon={Ban} disabled={isSelf} busy={busy === 'ban'} onClick={() => void act('ban', () => api.updateUser(u.id, { banned: true, banReason: reason }), 'Konto gesperrt und abgemeldet.')}>
                  Sperren
                </Button>
              </div>
            )}
            <Button
              variant="danger"
              icon={Trash2}
              disabled={isSelf}
              busy={busy === 'delete'}
              onClick={() =>
                confirm(`Das Konto ${u.email} endgültig löschen – mit allen Projekten, Freigaben und dem Newsletter-Abo? Das lässt sich nicht rückgängig machen.`) &&
                void act('delete', () => api.deleteUser(u.id), 'Konto gelöscht.', true)
              }
            >
              Konto löschen
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function Users({ self, say }: { self: string; say: (s: string) => void }) {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [plan, setPlan] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ total: number; users: AdminUser[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(q);
      setOffset(0);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);
  const load = useCallback(() => {
    api.users({ q: query, plan, offset }).then(setData, (e) => say(problem(e)));
  }, [query, plan, offset, say]);
  useEffect(load, [load]);

  const current = data?.users.find((u) => u.id === open);
  return (
    <Card
      title={`Konten${data ? ` (${data.total})` : ''}`}
      actions={
        <>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className={`${input} w-[220px] pl-8`} placeholder="Name oder E-Mail" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Konten suchen" />
          </div>
          <select
            className={input}
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value);
              setOffset(0);
            }}
            aria-label="Nach Zugang filtern"
          >
            <option value="">Jeder Zugang</option>
            {(Object.keys(PLAN_NAMES) as Plan[]).map((p) => (
              <option key={p} value={p}>
                {PLAN_NAMES[p]}
              </option>
            ))}
          </select>
        </>
      }
    >
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[760px] text-left text-[13.5px]">
          <thead className="text-[12px] uppercase tracking-wide text-slate-500">
            <tr className="border-b border-white/10">
              <th className="py-2 pr-3 font-medium">Konto</th>
              <th className="py-2 pr-3 font-medium">Zugang</th>
              <th className="py-2 pr-3 text-right font-medium">Übers. heute</th>
              <th className="py-2 pr-3 text-right font-medium">Projekte</th>
              <th className="py-2 pr-3 font-medium">Registriert</th>
              <th className="py-2 font-medium">Letzte Sitzung</th>
            </tr>
          </thead>
          <tbody>
            {data?.users.map((u) => (
              <tr key={u.id} className="cursor-pointer border-b border-white/5 hover:bg-white/[0.04]" onClick={() => setOpen(u.id)}>
                <td className="py-2.5 pr-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar u={u} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-white">{u.name}</span>
                        <Badges u={u} />
                      </div>
                      <div className="truncate text-[12.5px] text-slate-400">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="py-2.5 pr-3">
                  <Badge tone={planTone(u.plan)}>{PLAN_NAMES[u.plan]}</Badge>
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{u.compilesToday}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{u.projects}</td>
                <td className="py-2.5 pr-3 text-slate-400">{when(u.createdAt)}</td>
                <td className="py-2.5 text-slate-400">{when(u.lastSeen)}</td>
              </tr>
            ))}
            {data && !data.users.length && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  Keine Konten gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data && <Pager offset={offset} total={data.total} size={SIZE} onChange={setOffset} />}
      {current && <UserPanel key={current.id} user={current} self={self} onClose={() => setOpen(null)} onChanged={load} say={say} />}
    </Card>
  );
}
