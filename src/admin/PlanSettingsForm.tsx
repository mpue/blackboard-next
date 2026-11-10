// The plan settings: when Professional starts to cost money, the prices, the
// daily compiles and the Stripe payment links.

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

  const num = (k: keyof PlanSettings) => (e: { target: { value: string } }) => setS({ ...s, [k]: e.target.value === '' ? 0 : Number(e.target.value.replace(',', '.')) });
  const str = (k: keyof PlanSettings) => (e: { target: { value: string } }) => setS({ ...s, [k]: e.target.value.trim() });
  const save = async () => {
    setBusy(true);
    try {
      setS(await api.saveSettings(s));
      say('Tarife gespeichert. Die Preisseite zeigt sie sofort.');
    } catch (e) {
      say(problem(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Professional">
        <div className="grid gap-4">
          <Field label="Kostenpflichtig ab" hint="Bis zum Tag davor ist Professional kostenlos; ab diesem Tag braucht der Online-Compiler ein bezahltes Abo („Bezahlt bis“ im Konto).">
            <input type="date" className={input} value={s.proFreeUntil} onChange={str('proFreeUntil')} />
          </Field>
          <Field label="Preis pro Monat (€)">
            <input type="number" min={0} step="0.01" className={input} value={s.proPrice} onChange={num('proPrice')} />
          </Field>
          <Field label="Übersetzungen pro Tag" hint="Der Tag beginnt um Mitternacht deutscher Zeit.">
            <input type="number" min={0} step={1} className={input} value={s.proDailyCompiles} onChange={num('proDailyCompiles')} />
          </Field>
          <Field label="Stripe-Zahlungslink" hint="Leer lassen, solange es noch keinen gibt: die Preisseite zeigt dann „Abo kommt bald“.">
            <input type="url" className={input} placeholder="https://buy.stripe.com/…" value={s.proCheckoutUrl} onChange={str('proCheckoutUrl')} />
          </Field>
        </div>
      </Card>
      <Card title="Individual Commercial">
        <div className="grid gap-4">
          <Field label="Preis pro Monat (€)">
            <input type="number" min={0} step="0.01" className={input} value={s.commercialPrice} onChange={num('commercialPrice')} />
          </Field>
          <Field label="Stripe-Zahlungslink">
            <input type="url" className={input} placeholder="https://buy.stripe.com/…" value={s.commercialCheckoutUrl} onChange={str('commercialCheckoutUrl')} />
          </Field>
          <p className="text-[12.5px] leading-relaxed text-slate-400">
            Beide Links bekommen beim Klick die Konto-ID als <code className="text-slate-300">client_reference_id</code> und die E-Mail-Adresse mit. In Stripe siehst du so, welches Konto
            bezahlt hat; trage danach im Konto den Tarif und „Bezahlt bis“ ein.
          </p>
          <p className="text-[12.5px] leading-relaxed text-amber-200/80">
            Preise und Datum stehen auch in den Nutzungsbedingungen und AGB. Ändern sie sich für bestehende Abos, gelten die Ankündigungsfristen dort.
          </p>
        </div>
      </Card>
      <div className="lg:col-span-2">
        <Button variant="primary" icon={Save} busy={busy} onClick={() => void save()}>
          Speichern
        </Button>
      </div>
    </div>
  );
}
