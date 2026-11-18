// The design assistant's side of the BlackBoard server (server/assistant.ts):
// may the account use Claude, its API key, and the conversation as a stream
// of JSON lines. Also used by the account dialog of the landing page.

import { apiUrl } from '../account/api.ts';
import { serverConfig } from '../account/auth.ts';

export type ModelChoice = 'opus' | 'sonnet';

export interface KeyInfo {
  /** "sk-ant-…a1B2" */
  hint: string;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface AssistantInfo {
  access: { ok: true } | { ok: false; reason: 'blocked' };
  key: KeyInfo | null;
  models: ModelChoice[];
}

/** What went wrong, as a word the panel translates (server/assistant.ts). */
export class AssistantError extends Error {
  readonly kind: string;
  constructor(kind: string, message?: string) {
    super(message ?? kind);
    this.kind = kind;
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(apiUrl(path), { credentials: 'same-origin', ...init });
  const body = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new AssistantError(body.error ?? (r.status === 401 ? 'login' : 'server'));
  return body;
}

/** The account's access and key; 'login' without a session, 'none' without a server (desktop, static hosting). */
export async function fetchAssistant(): Promise<AssistantInfo | 'login' | 'none'> {
  if (!(await serverConfig())) return 'none';
  try {
    return await call<AssistantInfo>('assistant');
  } catch (e) {
    return (e as AssistantError).kind === 'login' ? 'login' : 'none';
  }
}

/** Stores a key after the server tried it at Anthropic ('format', 'invalid', 'unreachable' otherwise). */
export const saveAssistantKey = (key: string) =>
  call<{ key: KeyInfo }>('assistant/key', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }) }).then((r) => r.key);

export const removeAssistantKey = () => call<{ ok: boolean }>('assistant/key', { method: 'DELETE' });

/** One line of the server's answer stream. */
export type StreamEvent =
  | { t: 'text' | 'note'; i: number; d: string }
  | { t: 'tool'; name: string }
  | { t: 'ping' }
  | { t: 'done'; message: { role: 'assistant'; content: { type: string; [k: string]: unknown }[] }; stop: string | null; model: string; usage: { input: number; output: number } }
  | { t: 'error'; error: string; message?: string };

/** Sends the conversation; yields Claude's answer as it arrives. */
export async function* streamAnswer(model: ModelChoice, messages: unknown[], signal: AbortSignal): AsyncGenerator<StreamEvent> {
  const r = await fetch(apiUrl('assistant/messages'), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages }),
    signal,
  }).catch((e: Error) => {
    throw signal.aborted ? e : new AssistantError('network');
  });
  if (!r.ok || !r.body) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    throw new AssistantError(body.error ?? (r.status === 401 ? 'login' : 'server'));
  }
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let rest = '';
  for (;;) {
    const { value, done } = await reader.read().catch((e: Error) => {
      throw signal.aborted ? e : new AssistantError('network');
    });
    if (done) break;
    rest += value;
    const lines = rest.split('\n');
    rest = lines.pop() ?? '';
    for (const line of lines) if (line.trim()) yield JSON.parse(line) as StreamEvent;
  }
  if (rest.trim()) yield JSON.parse(rest) as StreamEvent;
}
