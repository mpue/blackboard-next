// Legal notice (Impressum, § 5 DDG), privacy policy and terms of use of the
// web version. German law asks for them in German; the English version only
// points there. The texts describe what the BlackBoard server actually stores
// (server/). The program itself is open source: its licence is the AGPL, the
// terms only cover the service run at pueski.de.

import type { ReactNode } from 'react';
import { SOURCE_URL } from '../source.ts';
import type { Lang } from './strings.ts';

/** Operator of the site */
export const OPERATOR = {
  name: 'Matthias Püski, M.Sc.',
  /** postal address, required in the Impressum */
  address: ['Im Jägeracker 42', '79312 Emmendingen'],
  email: 'blackboard@pueski.de',
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
      <H>Desktop-App und Downloads</H>
      <P>
        Die Desktop-App für Windows, macOS und Linux liegt auf GitHub (GitHub B.V., Prins Bernhardplein 200, 1097 JB Amsterdam, Niederlande; ein Unternehmen von GitHub, Inc., USA). Unser
        Server fragt GitHub gelegentlich nach der neuesten Version; dabei werden keine Daten von dir übertragen. Erst wenn du auf einen Download klickst, lädst du die Datei direkt von
        GitHub. Dabei verarbeitet GitHub deine IP-Adresse und Angaben deines Browsers nach seiner Datenschutzerklärung (docs.github.com/site-policy/privacy-policies), auch in den USA. Die
        Desktop-App selbst arbeitet auf deinem Rechner; mit unserem Server verbindet sie sich nur, wenn du den Online-Compiler mit dem Schlüssel deines Kontos nutzt.
      </P>
      <H>Nutzerkonto</H>
      <P>
        Für ein Konto speichern wir Name, E-Mail-Adresse, das Passwort (nur als sicherer Hash, nie im Klartext) und den Zeitpunkt der Registrierung. Für angemeldete Sitzungen speichern wir
        zusätzlich IP-Adresse und Browserkennung der Sitzung, um Missbrauch zu erkennen. Die Verarbeitung dient der Bereitstellung des Kontos (Art. 6 Abs. 1 lit. b DSGVO). Zur Bestätigung
        der E-Mail-Adresse, zum Zurücksetzen des Passworts und um dich über geteilte Projekte zu informieren, senden wir E-Mails an deine Adresse. Zum Konto gehört außerdem sein Zugang
        zum Online-Compiler und zu Claude (Standard, unbegrenzt oder gesperrt) mit einer Notiz des Administrators.
      </P>
      <H>Online-Compiler</H>
      <P>
        Wenn du im Code-Editor „Prüfen“ oder „Hochladen“ wählst, schickt der Editor deinen Quelltext an unseren Server. Er wird dort in einem abgeschotteten Container ohne
        Internetzugang übersetzt; Quelltext und Ergebnis werden danach sofort gelöscht und nicht gespeichert. Wir speichern nur, wie oft dein Konto an einem Tag übersetzt hat, um das
        Tageslimit einzuhalten. Für die Desktop-App kannst du einen Schlüssel erzeugen; wir speichern ihn nur als Hash, zusammen mit dem Zeitpunkt der Erzeugung und der
        letzten Nutzung. Die Verarbeitung dient der Bereitstellung des Online-Compilers (Art. 6 Abs. 1 lit. b DSGVO).
      </P>
      <H>Claude als Entwurfsassistent</H>
      <P>
        Mit einem Konto kannst du im Editor Claude als Entwurfsassistenten nutzen. Dafür hinterlegst du deinen eigenen API-Schlüssel von Anthropic. Wir
        speichern ihn verschlüsselt, zeigen ihn nie wieder an (nur seine letzten vier Zeichen) und speichern dazu den Zeitpunkt der Hinterlegung und der letzten Nutzung. Stellst du Claude
        eine Frage, schickt der Editor deine Nachricht, eine Beschreibung des Schaltplans, an dem Claude arbeitet, und die Ergebnisse von Claudes Arbeitsschritten (etwa Simulationswerte)
        über unseren Server mit deinem Schlüssel an Anthropic, den Anbieter von Claude. Unser Server speichert diese Inhalte nicht; er leitet sie nur weiter und zählt die Anfragen, um
        Missbrauch zu begrenzen. Mit Anthropic schließt du über deinen Schlüssel einen eigenen Vertrag; für die Verarbeitung dort gelten die Bedingungen und die Datenschutzerklärung von
        Anthropic (anthropic.com/legal/privacy), und Anthropic kann die Daten auch in den USA verarbeiten. Die Nutzung ist freiwillig. Die Verarbeitung bei uns dient der Bereitstellung
        dieser Funktion (Art. 6 Abs. 1 lit. b DSGVO); deinen Schlüssel kannst du jederzeit löschen, mit dem Konto wird er ebenfalls gelöscht.
      </P>
      <H>Newsletter</H>
      <P>
        Den Newsletter schicken wir nur mit deiner Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Meldest du dich auf der Startseite an, bekommst du zuerst eine E-Mail mit einem
        Bestätigungslink (Double-Opt-in); erst nach dem Klick bist du angemeldet. Mit einem Konto meldest du dich in deinem Konto an; deine Adresse ist dort schon bestätigt. Wir speichern
        deine E-Mail-Adresse, die Sprache und die Zeitpunkte von Anmeldung und Bestätigung, um die Einwilligung nachweisen zu können. Der Newsletter enthält keine Zählpixel und keine
        verfolgten Links. Du kannst die Einwilligung jederzeit widerrufen: mit dem Abmeldelink in jeder Ausgabe, in deinem Konto oder per E-Mail an uns. Beim Abmelden löschen wir deine
        Adresse aus der Liste; nicht bestätigte Anmeldungen löschen wir nach sieben Tagen.
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
      <H>Cookies</H>
      <P>
        Wir setzen nur technisch notwendige Cookies: ein Sitzungs-Cookie, solange du angemeldet bist, und kurzlebige Cookies während einer Anmeldung mit Google. Dafür ist keine Einwilligung
        nötig (§ 25 Abs. 2 TDDDG).
      </P>
      <H>Speicherdauer</H>
      <P>
        Kontodaten, Zugang, die Zahl der Übersetzungen und Projekte speichern wir, bis du dein Konto löschst. Sitzungen laufen nach spätestens sieben Tagen ohne Nutzung ab. Links in
        Bestätigungs- und Passwort-Mails gelten eine Stunde. Newsletter-Adressen speichern wir, bis du dich abmeldest.
      </P>
      <H>Deine Rechte</H>
      <P>
        Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO) sowie das Recht, eine
        Einwilligung jederzeit für die Zukunft zu widerrufen (Art. 7 Abs. 3 DSGVO). Dein Konto samt aller Projekte, Freigaben und deinem Newsletter-Abo kannst du selbst löschen
        (Startseite → Konto → Konto löschen). Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren.
      </P>
    </>
  );
}

const address = () => `${OPERATOR.name}, ${OPERATOR.address.join(', ')}`;
const Stand = () => <p className="mt-2 text-[13px] text-slate-500">Stand: November 2026</p>;

/** Terms of use of the service: everyone, with or without account */
function Terms({ dailyCompiles }: { dailyCompiles: number }) {
  const source = SOURCE_URL.replace(/^https:\/\//, '');
  return (
    <>
      <h1 className="text-[28px] font-bold text-white">Nutzungsbedingungen</h1>
      <Stand />
      <H>§ 1 Geltungsbereich</H>
      <P>
        Diese Nutzungsbedingungen gelten für die Nutzung von BlackBoard – der Web-App, der installierbaren App und der Desktop-Anwendung – und des BlackBoard-Kontos. Anbieter ist {address()}{' '}
        (siehe Impressum).
      </P>
      <H>§ 1a Online-Compiler und Claude</H>
      <P>
        (1) Alle Funktionen von BlackBoard stehen ohne Konto zur Verfügung – mit Ausnahme des Online-Compilers, der im Code-Editor C- und C++-Quelltext auf dem Server des Anbieters
        übersetzt, und von Claude als Entwurfsassistent (Absatz 4). Beide brauchen ein kostenloses Konto. HEX-Dateien aus anderen Werkzeugen lassen sich immer laden.
      </P>
      <P>
        (2) Jedes Konto kann den Online-Compiler nutzen, derzeit mit bis zu {dailyCompiles} Übersetzungen pro Tag. Der Anbieter kann diese Zahl ändern, einzelnen Konten mehr erlauben oder
        ein Konto bei Missbrauch vom Online-Compiler und von Claude ausschließen.
      </P>
      <P>
        (3) Zum Schutz des Dienstes darf der Anbieter technische Grenzen setzen, etwa für die Zahl der Übersetzungen in kurzer Zeit, die Größe des Quelltexts und die Dauer einer
        Übersetzung. Der Schlüssel für die Desktop-App ist wie ein Passwort geheim zu halten.
      </P>
      <P>
        (4) Claude als Entwurfsassistent: Mit einem Konto kannst du einen eigenen API-Schlüssel von Anthropic hinterlegen und Claude im Editor Schaltungen entwerfen, ändern und prüfen
        lassen. Die Nutzung von Claude rechnet Anthropic direkt mit dir ab; dafür gelten die Bedingungen von Anthropic. Der Anbieter leitet die Anfragen nur weiter und darf ihre Zahl zum
        Schutz des Dienstes begrenzen. Claudes Antworten und Änderungen am Schaltplan entstehen automatisch und können Fehler enthalten: Prüfe sie, bevor du eine Schaltung aufbaust,
        besonders bei Netzspannung, hohen Strömen und Akkus.
      </P>
      <H>§ 2 Kostenlose Nutzung und Open Source</H>
      <P>(1) Die Nutzung von BlackBoard und des Kontos ist kostenlos – privat, in Schule, Ausbildung und Studium und auch gewerblich.</P>
      <P>
        (2) BlackBoard ist Open Source. Der Quellcode steht unter der GNU Affero General Public License, Version 3 (AGPL-3.0), unter{' '}
        <a className="text-indigo-300" href={SOURCE_URL} target="_blank" rel="noreferrer">
          {source}
        </a>
        . Für das Kopieren, Verändern und Weitergeben des Programms gilt allein diese Lizenz; diese Nutzungsbedingungen regeln nur den Dienst, den der Anbieter betreibt (Web-App, Konto,
        Cloud-Projekte, Online-Compiler und die Weiterleitung an Claude).
      </P>
      <P>
        (3) Bestandteile Dritter (Bauteilbibliothek, Simulator, Emulatoren) stehen unter ihren eigenen Lizenzen; sie sind in der App unter „Über BlackBoard“ genannt.
      </P>
      <P>(4) Nicht erlaubt ist, Grenzen oder Schutzmaßnahmen des Dienstes zu umgehen.</P>
      <H>§ 3 Konto</H>
      <P>(1) Für den Editor brauchst du kein Konto. Das Konto ist kostenlos; du brauchst es für Projekte in der Cloud, zum Teilen, für den Online-Compiler und für Claude.</P>
      <P>(2) Deine Angaben müssen zutreffen. Halte dein Passwort geheim. Jedes Konto gehört einer Person.</P>
      <P>(3) Minderjährige brauchen die Zustimmung ihrer Erziehungsberechtigten.</P>
      <H>§ 4 Cloud-Projekte und Teilen</H>
      <P>
        (1) Deine Projekte bleiben deine. Du räumst dem Anbieter nur die Rechte ein, die er braucht, um sie zu speichern, dir anzuzeigen und den Personen zugänglich zu machen, mit denen du
        sie teilst.
      </P>
      <P>
        (2) Du bist für die Inhalte deiner Projekte verantwortlich und stellst sicher, dass du sie speichern und teilen darfst. Rechtswidrige Inhalte sind nicht erlaubt. Projekte sollen
        keine personenbezogenen Daten Dritter enthalten.
      </P>
      <P>(3) Für Größe und Anzahl der Cloud-Projekte gelten angemessene Grenzen, derzeit 8 MB je Projekt und 200 Projekte je Konto.</P>
      <P>(4) Bewahre von wichtigen Projekten eigene Kopien auf (als Datei speichern). Der Anbieter sichert die Daten, kann einen Verlust aber nicht ausschließen.</P>
      <H>§ 5 Simulation und Ergebnisse</H>
      <P>
        BlackBoard berechnet Schaltungen mit Modellen. Ergebnisse von Simulation, Emulation, Design-Regel-Prüfung und Autorouter können von realen Schaltungen abweichen. Sie ersetzen keine
        eigene Prüfung, keine Messung und keine nach Normen vorgeschriebene Prüfung oder Abnahme. Arbeiten an Netzspannung und anderen gefährlichen Spannungen erfordern Fachkenntnis.
      </P>
      <H>§ 6 Verfügbarkeit und Änderungen</H>
      <P>
        Der kostenlose Dienst wird ohne Zusage einer bestimmten Verfügbarkeit angeboten. Der Anbieter darf Funktionen weiterentwickeln, ändern oder einstellen. Stellt er die
        Cloud-Funktionen ein, kündigt er das mindestens vier Wochen vorher an, damit du deine Projekte sichern kannst.
      </P>
      <H>§ 7 Haftung</H>
      <P>
        (1) Der Anbieter haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit, für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit sowie nach dem
        Produkthaftungsgesetz.
      </P>
      <P>
        (2) Bei leichter Fahrlässigkeit haftet der Anbieter nur für die Verletzung wesentlicher Pflichten, deren Erfüllung die Nutzung erst ermöglicht und auf deren Einhaltung du
        regelmäßig vertrauen darfst, und dann begrenzt auf den vorhersehbaren, typischen Schaden.
      </P>
      <P>(3) Das gilt auch für gesetzliche Vertreter und Erfüllungsgehilfen des Anbieters.</P>
      <H>§ 8 Ende der Nutzung</H>
      <P>(1) Du kannst dein Konto jederzeit löschen (Startseite → Konto → Konto löschen). Dabei werden deine Cloud-Projekte und Freigaben gelöscht.</P>
      <P>(2) Der Anbieter kann ein kostenloses Konto mit einer Frist von vier Wochen kündigen und bei schweren oder wiederholten Verstößen gegen diese Bedingungen sofort sperren.</P>
      <H>§ 9 Änderungen dieser Bedingungen</H>
      <P>
        Änderungen teilt der Anbieter Kontoinhabern mindestens vier Wochen vor ihrem Inkrafttreten per E-Mail mit und bittet um Zustimmung. Stimmst du nicht zu, gelten die bisherigen
        Bedingungen weiter; der Anbieter kann das kostenlose Konto dann nach § 8 kündigen.
      </P>
      <H>§ 10 Schlussbestimmungen</H>
      <P>
        Es gilt deutsches Recht. Bist du Verbraucher mit gewöhnlichem Aufenthalt in einem anderen Staat, bleiben die zwingenden Verbraucherschutzvorschriften dieses Staates unberührt. Der
        Anbieter ist nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.
      </P>
    </>
  );
}

export const LEGAL_PAGES = ['impressum', 'datenschutz', 'nutzungsbedingungen'] as const;
export type LegalPageId = (typeof LEGAL_PAGES)[number];

export function LegalPage({ page, lang, dailyCompiles }: { page: LegalPageId; lang: Lang; dailyCompiles: number }) {
  return (
    <article className="mx-auto max-w-[760px] px-5 py-14 text-[15px]">
      {lang === 'en' && <p className="mb-6 rounded-lg bg-white/5 p-3 text-[13px] text-slate-400">The legal texts are binding in German; here is the German text.</p>}
      {page === 'impressum' ? <Imprint /> : page === 'datenschutz' ? <Privacy /> : <Terms dailyCompiles={dailyCompiles} />}
    </article>
  );
}
