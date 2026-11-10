// Legal notice (Impressum, § 5 DDG) and privacy policy of the web version.
// German law asks for them in German; the English version only points there.
// The texts describe what the BlackBoard server actually stores (server/).

import type { ReactNode } from 'react';
import type { Lang } from './strings.ts';

/** Operator of the site: fill in before going live. */
export const OPERATOR = {
  name: 'Matthias Püski',
  /** postal address, required in the Impressum */
  address: ['[Straße und Hausnummer]', '[PLZ Ort]'],
  email: 'matthias@pueski.de',
};

const H = ({ children }: { children: ReactNode }) => <h2 className="mt-8 text-[18px] font-semibold text-white">{children}</h2>;
const P = ({ children }: { children: ReactNode }) => <p className="mt-3 leading-relaxed text-slate-300">{children}</p>;

function Imprint() {
  return (
    <>
      <h1 className="text-[28px] font-bold text-white">Impressum</h1>
      <H>Angaben gemäß § 5 DDG</H>
      <P>
        {OPERATOR.name}
        <br />
        {OPERATOR.address.map((l) => (
          <span key={l}>
            {l}
            <br />
          </span>
        ))}
      </P>
      <H>Kontakt</H>
      <P>
        E-Mail: <a className="text-indigo-300" href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
      </P>
      <H>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</H>
      <P>{OPERATOR.name}, Anschrift wie oben.</P>
      <H>Haftung für Inhalte und Links</H>
      <P>
        Die Inhalte dieser Seiten wurden mit Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität der Inhalte sowie für Inhalte externer Links, auf deren Inhalte wir keinen
        Einfluss haben, übernehmen wir keine Gewähr. Für die Inhalte der verlinkten Seiten sind ausschließlich deren Betreiber verantwortlich.
      </P>
      <H>Inhalte der Nutzer</H>
      <P>Für Projekte, die Nutzer in der Cloud speichern oder teilen, sind die jeweiligen Nutzer verantwortlich.</P>
    </>
  );
}

function Privacy() {
  return (
    <>
      <h1 className="text-[28px] font-bold text-white">Datenschutzerklärung</h1>
      <H>Verantwortlicher</H>
      <P>
        {OPERATOR.name}, {OPERATOR.address.join(', ')}, E-Mail: {OPERATOR.email}
      </P>
      <H>Nutzung ohne Konto</H>
      <P>
        Der Editor läuft vollständig in deinem Browser. Schaltungen, Einstellungen und Bibliotheken speichert er nur lokal in deinem Browser (Local Storage, IndexedDB); sie werden nicht an uns
        übertragen. Beim Aufruf der Seite verarbeitet unser Webserver technisch notwendige Verbindungsdaten (IP-Adresse, Zeitpunkt, abgerufene Adresse, Browserkennung), um die Seite
        auszuliefern und vor Missbrauch zu schützen (Art. 6 Abs. 1 lit. f DSGVO). Es gibt keine Werbung, keine Analyse- oder Tracking-Dienste und keine Einbindung fremder Server beim Aufruf.
      </P>
      <H>Nutzerkonto</H>
      <P>
        Für ein Konto speichern wir Name, E-Mail-Adresse, das Passwort (nur als sicherer Hash, nie im Klartext) und den Zeitpunkt der Registrierung. Für angemeldete Sitzungen speichern wir
        zusätzlich IP-Adresse und Browserkennung der Sitzung, um Missbrauch zu erkennen. Die Verarbeitung dient der Bereitstellung des Kontos (Art. 6 Abs. 1 lit. b DSGVO). Zur Bestätigung
        der E-Mail-Adresse, zum Zurücksetzen des Passworts und um dich über geteilte Projekte zu informieren, senden wir E-Mails an deine Adresse.
      </P>
      <H>Anmeldung mit Google</H>
      <P>
        Wenn du dich mit Google anmeldest, wirst du zu Google (Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland) weitergeleitet. Google teilt uns danach deinen Namen,
        deine E-Mail-Adresse und dein Profilbild mit; wir speichern sie wie bei einem Konto mit Passwort. Für die Verarbeitung bei Google gilt dessen Datenschutzerklärung
        (policies.google.com/privacy). Die Anmeldung mit Google ist freiwillig; ein Konto mit E-Mail und Passwort ist jederzeit möglich.
      </P>
      <H>Projekte in der Cloud und Freigaben</H>
      <P>
        Projekte, die du in der Cloud speicherst, liegen auf unserem Server, bis du sie oder dein Konto löschst. Teilst du ein Projekt, sehen die Personen, mit denen du es teilst, das Projekt
        sowie deinen Namen und deine E-Mail-Adresse; du siehst umgekehrt Name und E-Mail-Adresse der Personen, mit denen du teilst. Freigaben kannst du jederzeit zurücknehmen.
      </P>
      <H>Abonnement und Zahlung</H>
      <P>
        Für das Abo Individual Commercial wirst du zu unserem Zahlungsdienstleister Stripe (Stripe Payments Europe, Limited, 1 Grand Canal Street Lower, Grand Canal Dock, Dublin, D02 H210,
        Irland) weitergeleitet. Stripe verarbeitet deine Zahlungsdaten selbst; wir erhalten Name, E-Mail-Adresse, Rechnungsadresse und den Status der Zahlung, aber keine vollständigen
        Kartendaten. Bist du angemeldet, geben wir Stripe die interne Kennung deines Kontos mit, damit das Abo deinem Konto zugeordnet werden kann. Die Verarbeitung dient der Durchführung
        des Vertrags (Art. 6 Abs. 1 lit. b DSGVO); Rechnungsdaten bewahren wir so lange auf, wie es das Steuerrecht vorschreibt. Für die Verarbeitung bei Stripe gilt dessen
        Datenschutzerklärung (stripe.com/de/privacy).
      </P>
      <H>Cookies</H>
      <P>
        Wir setzen nur technisch notwendige Cookies: ein Sitzungs-Cookie, solange du angemeldet bist, und kurzlebige Cookies während einer Anmeldung mit Google. Dafür ist keine Einwilligung
        nötig (§ 25 Abs. 2 TDDDG).
      </P>
      <H>Speicherdauer</H>
      <P>
        Kontodaten und Projekte speichern wir, bis du dein Konto löschst. Sitzungen laufen nach spätestens sieben Tagen ohne Nutzung ab. Links in Bestätigungs- und Passwort-Mails gelten eine
        Stunde.
      </P>
      <H>Deine Rechte</H>
      <P>
        Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO). Dein Konto samt aller Projekte und
        Freigaben kannst du selbst löschen (Startseite → Konto → Konto löschen). Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren.
      </P>
    </>
  );
}

export function LegalPage({ page, lang }: { page: 'impressum' | 'datenschutz'; lang: Lang }) {
  return (
    <article className="mx-auto max-w-[760px] px-5 py-14 text-[15px]">
      {lang === 'en' && <p className="mb-6 rounded-lg bg-white/5 p-3 text-[13px] text-slate-400">German law asks for the legal notice and the privacy policy in German; here is the binding German text.</p>}
      {page === 'impressum' ? <Imprint /> : <Privacy />}
    </article>
  );
}
