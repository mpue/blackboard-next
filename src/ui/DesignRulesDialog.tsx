import { useState } from 'react';
import type { DesignRules } from '../model/types.ts';
import { activeDoc, updatePcbSettings, useStore } from '../store/store.ts';
import { useT, type I18nKey } from '../i18n/i18n.ts';
import { defaultRules } from '../pcb/defaults.ts';
import { mm, toMm } from '../pcb/units.ts';
import { Button, Dialog, Field, NumberInput, Select } from './primitives.tsx';

type LengthRule = Exclude<keyof DesignRules, 'copperLayers'>;

const FIELDS: { key: LengthRule; label: I18nKey; min: number }[] = [
  { key: 'clearance', label: 'rules.clearance', min: 0.05 },
  { key: 'trackWidth', label: 'rules.trackWidth', min: 0.05 },
  { key: 'powerTrackWidth', label: 'rules.powerTrackWidth', min: 0.05 },
  { key: 'viaDiameter', label: 'rules.viaDiameter', min: 0.2 },
  { key: 'viaDrill', label: 'rules.viaDrill', min: 0.1 },
  { key: 'minTrackWidth', label: 'rules.minTrackWidth', min: 0.05 },
  { key: 'minDrill', label: 'rules.minDrill', min: 0.1 },
  { key: 'minAnnularRing', label: 'rules.minAnnularRing', min: 0.05 },
  { key: 'edgeClearance', label: 'rules.edgeClearance', min: 0 },
];

/** Home etching needs wide tracks and gaps (toner transfer, hand drilling). */
export function homeEtchingRules(): DesignRules {
  return {
    clearance: mm(0.5),
    trackWidth: mm(0.8),
    powerTrackWidth: mm(1.2),
    viaDiameter: mm(1.8),
    viaDrill: mm(0.8),
    minTrackWidth: mm(0.5),
    minDrill: mm(0.6),
    minAnnularRing: mm(0.4),
    edgeClearance: mm(1),
    copperLayers: 1,
  };
}

export function DesignRulesDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const ds = useStore((s) => activeDoc(s));
  const [rules, setRules] = useState<DesignRules>(ds?.doc.pcb?.rules ?? defaultRules());
  if (!ds?.doc.pcb) return null;
  const set = (patch: Partial<DesignRules>) => setRules((r) => ({ ...r, ...patch }));
  return (
    <Dialog
      title={t('rules.title')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            onClick={() => {
              updatePcbSettings({ rules });
              onClose();
            }}
          >
            {t('common.apply')}
          </Button>
        </>
      }
    >
      <div className="grid gap-2">
        <Field label={t('rules.preset')}>
          <div className="flex gap-2">
            <Button onClick={() => setRules(defaultRules())}>{t('rules.presetFab')}</Button>
            <Button onClick={() => setRules(homeEtchingRules())}>{t('rules.presetHome')}</Button>
          </div>
        </Field>
        <Field label={t('rules.copperLayers')}>
          <Select
            value={rules.copperLayers}
            options={[
              { value: 2, label: t('rules.doubleSided') },
              { value: 1, label: t('rules.singleSided') },
            ]}
            onChange={(v) => set({ copperLayers: Number(v) === 1 ? 1 : 2 })}
          />
        </Field>
        {FIELDS.map((f) => (
          <Field key={f.key} label={t(f.label)} wide>
            <NumberInput value={parseFloat(toMm(rules[f.key]).toFixed(3))} min={f.min} step={0.05} onCommit={(v) => set({ [f.key]: mm(v) })} suffix="mm" />
          </Field>
        ))}
      </div>
    </Dialog>
  );
}
