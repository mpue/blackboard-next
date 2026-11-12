import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { serverConfig } from '../account/auth.ts';
import { commands, runCommand } from '../editor/commands.ts';
import { useT } from '../i18n/i18n.ts';
import { Button, cx } from '../ui/primitives.tsx';
import { useAssistant } from './state.ts';

/** Claude in the top bar of the web version (hidden without a BlackBoard server, e.g. in the desktop app). */
export function AssistantButton() {
  const t = useT();
  const [available, setAvailable] = useState(false);
  const open = useAssistant((s) => s.open);
  const running = useAssistant((s) => s.running);
  useEffect(() => {
    void serverConfig().then((c) => setAvailable(!!c));
  }, []);
  if (!available) return null;
  return (
    <Button
      variant="ghost"
      icon={Sparkles}
      title={`${t('ai.open').replace(/\s*…$/, '')} (F2)`}
      aria-pressed={open}
      className={cx('px-2', open && 'bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent', running && '[&_svg]:animate-pulse')}
      onClick={() => runCommand(commands.assistant)}
    >
      {/* the top bar is full on most screens: the word only where there is room */}
      <span className="hidden 2xl:inline">{t('ai.title')}</span>
    </Button>
  );
}
