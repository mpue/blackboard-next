// Settings of the BlackBoard server, from the environment (see .env.example).

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Config {
  port: number;
  /** origin the browser sees, e.g. https://pueski.de */
  origin: string;
  /** path the app is served under, e.g. /blackboard ('' at the root) */
  publicPath: string;
  dataDir: string;
  secret: string;
  google?: { clientId: string; clientSecret: string };
  smtp?: { host: string; port: number; secure: boolean; user?: string; pass?: string; from: string };
  /** largest project in bytes */
  maxProjectBytes: number;
  maxProjectsPerUser: number;
  /** the compile service (compiler/) */
  compilerUrl: string;
  /** compiles per account in ten minutes, against runaway scripts (the daily limit of a plan comes on top) */
  maxCompiles: number;
  /** requests to Claude per account in ten minutes, against runaway loops (the account's own API key pays) */
  maxAssistantRequests: number;
  /** addresses that are admins once confirmed (lower case) */
  adminEmails: string[];
  /** newsletter mails per minute */
  newsletterPerMinute: number;
  /** the GitHub repository whose newest release holds the desktop app (owner/name) */
  downloadsRepo: string;
}

/** The session secret: from AUTH_SECRET, else made once and kept in the data directory. */
function secret(dataDir: string, given?: string): string {
  if (given && given.length >= 32) return given;
  const file = join(dataDir, 'auth-secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const s = randomBytes(32).toString('base64url');
  writeFileSync(file, s, { mode: 0o600 });
  return s;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = env.DATA_DIR ?? join(import.meta.dirname, 'data');
  mkdirSync(dataDir, { recursive: true });
  const publicPath = (env.PUBLIC_PATH ?? '').replace(/\/+$/, '');
  return {
    port: Number(env.PORT ?? 8787),
    origin: (env.ORIGIN ?? 'http://localhost:5173').replace(/\/+$/, ''),
    publicPath,
    dataDir,
    secret: secret(dataDir, env.AUTH_SECRET),
    google: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } : undefined,
    smtp: env.SMTP_HOST
      ? {
          host: env.SMTP_HOST,
          port: Number(env.SMTP_PORT ?? 587),
          secure: env.SMTP_SECURE === 'true' || env.SMTP_PORT === '465',
          user: env.SMTP_USER || undefined,
          pass: env.SMTP_PASS || undefined,
          from: env.SMTP_FROM ?? `BlackBoard <${env.SMTP_USER ?? 'noreply@localhost'}>`,
        }
      : undefined,
    maxProjectBytes: Number(env.MAX_PROJECT_MB ?? 8) * 1024 * 1024,
    maxProjectsPerUser: Number(env.MAX_PROJECTS ?? 200),
    compilerUrl: (env.COMPILER_URL ?? 'http://localhost:8789').replace(/\/+$/, ''),
    maxCompiles: Number(env.MAX_COMPILES ?? 60),
    maxAssistantRequests: Number(env.MAX_ASSISTANT_REQUESTS ?? 300),
    adminEmails: (env.ADMIN_EMAILS ?? '')
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    newsletterPerMinute: Number(env.NEWSLETTER_PER_MINUTE ?? 20),
    downloadsRepo: env.DOWNLOADS_REPO ?? 'mpue/blackboard-next',
  };
}
