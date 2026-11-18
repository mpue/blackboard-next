// The daily compiles of the online compiler: how often an account with the
// standard access may compile per day (server/plans.ts).

import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import type { PlanSettings } from '../account/plans.ts';
import { api } from './api.ts';
import { Button, Card, Field, input, problem } from './ui.tsx';

export function PlanSettingsForm({ say }: { say: (s: string) => void }) {
  const [s, setS] = useState<PlanSettings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => void api.settings().then(setS, (e) => say(problem(e))), [say]);
  if (!s) return null;

  const save = async () => {
    setBusy(true);
    try {
      setS(await api.saveSettings(s));
      say('Gespeichert. Die Startseite und die Nutzungsbedingungen zeigen die Zahl sofort.');
    } catch (e) {
      say(problem(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid max-w-[560px] gap-5">
      <Card title="Online-Compiler">
        <div className="grid gap-4">
          <Field label="Übersetzungen pro Tag" hint="Für jedes Konto mit Zugang „Standard“. Der Tag beginnt um Mitternacht deutscher Zeit. Konten mit „Unbegrenzt“ und Admins haben kein Tageslimit.">
            <input
              type="number"
              min={0}
              step={1}
              className={input}
              value={s.dailyCompiles}
              onChange={(e) => setS({ dailyCompiles: e.target.value === '' ? 0 : Math.round(Number(e.target.value)) })}
            />
          </Field>
        </div>
      </Card>
      <div>
        <Button variant="primary" icon={Save} busy={busy} onClick={() => void save()}>
          Speichern
        </Button>
      </div>
    </div>
  );
}
