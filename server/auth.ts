// Accounts with Better Auth: e-mail and password with confirmation mail and
// password reset, Google sign-in when configured, sessions in the SQLite file.
// The admin plugin adds the role and blocking (a blocked account cannot sign
// in); the admin page itself is admin.ts.

import type { DatabaseSync } from 'node:sqlite';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { admin } from 'better-auth/plugins';
import type { Config } from './config.ts';
import { buttonMail, type Mailer } from './mail.ts';

/** The accounts, with their tables created or updated first. */
export async function createAuth(config: Config, db: DatabaseSync, mail: Mailer, beforeDeleteUser: (user: { id: string; email: string }) => void) {
  const options = {
    database: db,
    baseURL: config.origin,
    basePath: `${config.publicPath}/api/auth`,
    secret: config.secret,
    trustedOrigins: [config.origin],
    telemetry: { enabled: false },
    advanced: { cookiePrefix: 'blackboard' },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await mail(
          buttonMail(
            user.email,
            'BlackBoard: Passwort zurücksetzen / reset your password',
            [`Hallo ${user.name}, für dein BlackBoard-Konto wurde ein neues Passwort angefordert. Der Link gilt eine Stunde.`, 'Someone asked for a new password for your BlackBoard account. The link is valid for one hour.', 'Wenn du das nicht warst, ignoriere diese Mail. / If that was not you, ignore this mail.'],
            'Neues Passwort setzen / Set a new password',
            url,
          ),
        );
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await mail(
          buttonMail(
            user.email,
            'BlackBoard: E-Mail-Adresse bestätigen / confirm your e-mail address',
            [`Hallo ${user.name}, willkommen bei BlackBoard! Bitte bestätige deine E-Mail-Adresse, dann ist dein Konto bereit.`, 'Welcome to BlackBoard! Please confirm your e-mail address to finish your account.'],
            'E-Mail bestätigen / Confirm e-mail',
            url,
          ),
        );
      },
    },
    socialProviders: config.google ? { google: { clientId: config.google.clientId, clientSecret: config.google.clientSecret } } : {},
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => beforeDeleteUser(user),
      },
    },
    plugins: [admin()],
  } satisfies BetterAuthOptions;
  await (await getMigrations(options)).runMigrations();
  return betterAuth(options);
}

export type Auth = Awaited<ReturnType<typeof createAuth>>;

/** an admin: by role, or by an address in ADMIN_EMAILS once it is confirmed */
export const isAdmin = (config: Config, u: { email: string; emailVerified: boolean | number; role?: string | null }) =>
  u.role === 'admin' || (!!u.emailVerified && config.adminEmails.includes(u.email.toLowerCase()));
