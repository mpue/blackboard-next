// E-mails of the accounts (confirmation, password reset, shared projects) and
// the newsletter, over SMTP; without SMTP settings they are written to the log
// instead, so a development setup works without a mail server.

import nodemailer from 'nodemailer';
import type { Config } from './config.ts';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** e.g. List-Unsubscribe of the newsletter */
  headers?: Record<string, string>;
}

export type Mailer = (mail: Mail) => Promise<void>;

export function createMailer(config: Config, log: (line: string) => void = console.log): Mailer {
  if (!config.smtp) {
    return async (m) => log(`[mail] to ${m.to}: ${m.subject}\n${m.text}`);
  }
  const { host, port, secure, user, pass, from } = config.smtp;
  const transport = nodemailer.createTransport({ host, port, secure, auth: user ? { user, pass } : undefined });
  return async (m) => {
    await transport.sendMail({ from, to: m.to, subject: m.subject, text: m.text, html: m.html, headers: m.headers });
  };
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** A short mail with one button, in German and English. */
export function buttonMail(to: string, subject: string, lines: string[], button: string, url: string): Mail {
  const text = `${lines.join('\n\n')}\n\n${button}: ${url}\n\n– BlackBoard Next`;
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#111827;max-width:520px;margin:24px auto;padding:0 16px">
<h2 style="margin:0 0 16px">BlackBoard Next</h2>
${lines.map((l) => `<p style="line-height:1.5">${esc(l)}</p>`).join('\n')}
<p style="margin:24px 0"><a href="${esc(url)}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${esc(button)}</a></p>
<p style="font-size:12px;color:#6b7280;word-break:break-all">${esc(url)}</p>
</body></html>`;
  return { to, subject, text, html };
}
