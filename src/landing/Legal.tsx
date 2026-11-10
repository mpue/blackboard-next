// Legal notice (Impressum, § 5 DDG) and privacy policy of the web version.
// German law asks for them in German; the English version only points there.
// The texts describe what the BlackBoard server actually stores (server/).

import type { ReactNode } from 'react';
import { lastFreeDay, longDate, type PlanSettings } from '../account/plans.ts';
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
      <H>Nutzerkonto</H>
      <P>
        Für ein Konto speichern wir Name, E-Mail-Adresse, das Passwort (nur als sicherer Hash, nie im Klartext) und den Zeitpunkt der Registrierung. Für angemeldete Sitzungen speichern wir
        zusätzlich IP-Adresse und Browserkennung der Sitzung, um Missbrauch zu erkennen. Die Verarbeitung dient der Bereitstellung des Kontos (Art. 6 Abs. 1 lit. b DSGVO). Zur Bestätigung
        der E-Mail-Adresse, zum Zurücksetzen des Passworts und um dich über geteilte Projekte zu informieren, senden wir E-Mails an deine Adresse. Zum Konto gehört außerdem der Tarif
        (Free / Edu, Professional oder Individual Commercial) mit dem Zeitraum, für den er bezahlt ist.
      </P>
      <H>Online-Compiler</H>
      <P>
        Wenn du im Code-Editor „Prüfen“ oder „Hochladen“ wählst, schickt der Editor deinen Quelltext an unseren Server. Er wird dort in einem abgeschotteten Container ohne
        Internetzugang übersetzt; Quelltext und Ergebnis werden danach sofort gelöscht und nicht gespeichert. Wir speichern nur, wie oft dein Konto an einem Tag übersetzt hat, um das
        Tageslimit deines Tarifs einzuhalten. Für die Desktop-App kannst du einen Schlüssel erzeugen; wir speichern ihn nur als Hash, zusammen mit dem Zeitpunkt der Erzeugung und der
        letzten Nutzung. Die Verarbeitung dient der Bereitstellung des Online-Compilers (Art. 6 Abs. 1 lit. b DSGVO).
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
      <H>Abonnement und Zahlung</H>
      <P>
        Für ein kostenpflichtiges Abo (Professional nach der kostenlosen Startphase, Individual Commercial) wirst du zu unserem Zahlungsdienstleister Stripe (Stripe Payments Europe, Limited, 1 Grand Canal Street Lower, Grand Canal Dock, Dublin, D02 H210,
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
        Kontodaten, Tarif, die Zahl der Übersetzungen und Projekte speichern wir, bis du dein Konto löschst. Sitzungen laufen nach spätestens sieben Tagen ohne Nutzung ab. Links in
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

/** Terms of use: everyone, with or without account (the plans and the rules for commercial use) */
function Terms({ plans }: { plans: PlanSettings }) {
  return (
    <>
      <h1 className="text-[28px] font-bold text-white">Nutzungsbedingungen</h1>
      <Stand />
      <H>§ 1 Geltungsbereich</H>
      <P>
        Diese Nutzungsbedingungen gelten für die Nutzung von BlackBoard – der Web-App, der installierbaren App und der Desktop-Anwendung – und des BlackBoard-Kontos. Anbieter ist {address()}{' '}
        (siehe Impressum). Für das kostenpflichtige Abo Individual Commercial gelten zusätzlich die AGB.
      </P>
      <H>§ 1a Tarife und Online-Compiler</H>
      <P>
        (1) Alle Funktionen von BlackBoard stehen ohne Konto und in jedem Tarif zur Verfügung – mit Ausnahme des Online-Compilers, der im Code-Editor C- und C++-Quelltext auf dem Server des
        Anbieters übersetzt. HEX-Dateien aus anderen Werkzeugen lassen sich immer laden.
      </P>
      <P>
        (2) Professional: Mit einem Konto ist der Online-Compiler enthalten, derzeit mit bis zu {plans.proDailyCompiles} Übersetzungen pro Tag. Bis zum {longDate(lastFreeDay(plans), 'de')}{' '}
        ist Professional kostenlos. Ab dem {longDate(plans.proFreeUntil, 'de')} kostet Professional {plans.proPrice} € im Monat; der Online-Compiler steht dann nur mit einem bezahlten Abo
        zur Verfügung. Über die Bedingungen des Abos informiert der Anbieter die Kontoinhaber rechtzeitig vorher per E-Mail. Ohne Abo bleiben Konto, Cloud-Projekte und alle anderen
        Funktionen erhalten.
      </P>
      <P>(3) Individual Commercial enthält den Online-Compiler ohne Tageslimit (siehe AGB).</P>
      <P>
        (4) Zum Schutz des Dienstes darf der Anbieter technische Grenzen setzen, etwa für die Zahl der Übersetzungen in kurzer Zeit, die Größe des Quelltexts und die Dauer einer
        Übersetzung. Der Schlüssel für die Desktop-App ist wie ein Passwort geheim zu halten.
      </P>
      <H>§ 2 Nutzungsrecht</H>
      <P>(1) Der Anbieter räumt dir ein einfaches, nicht übertragbares Recht ein, BlackBoard nach diesen Bedingungen zu nutzen.</P>
      <P>
        (2) Free / Edu: Kostenlos ist die Nutzung für private Zwecke ohne Erwerbsabsicht sowie für Schule, Ausbildung, Studium, Lehre und nicht kommerzielle Forschung an
        Bildungseinrichtungen.
      </P>
      <P>
        (3) Gewerbliche Nutzung: Wer BlackBoard im Zusammenhang mit einer gewerblichen oder selbstständigen beruflichen Tätigkeit nutzt – etwa für Produktentwicklung, Auftragsarbeiten oder
        Beratung, auch als Beschäftigte eines Unternehmens für dessen Zwecke –, braucht für jede Person, die BlackBoard so nutzt, ein Abo Individual Commercial.
      </P>
      <P>
        (4) Nicht erlaubt ist, BlackBoard zu verändern, zu dekompilieren oder weiterzuverbreiten, soweit das Gesetz es nicht ausdrücklich erlaubt (§§ 69d, 69e UrhG), sowie Grenzen oder
        Schutzmaßnahmen des Dienstes zu umgehen. Bestandteile Dritter (Bauteilbibliothek, Simulator, Emulatoren) stehen unter ihren eigenen Lizenzen; sie sind in der App unter „Über
        BlackBoard“ genannt.
      </P>
      <H>§ 3 Konto</H>
      <P>(1) Für den Editor brauchst du kein Konto. Das Konto ist kostenlos; du brauchst es für Projekte in der Cloud, zum Teilen und für den Online-Compiler.</P>
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

/** Terms of sale of the subscription "Individual Commercial" (businesses only) */
function Agb() {
  return (
    <>
      <h1 className="text-[28px] font-bold text-white">Allgemeine Geschäftsbedingungen für das Abo „Individual Commercial“</h1>
      <Stand />
      <H>§ 1 Geltungsbereich und Kunden</H>
      <P>(1) Diese AGB gelten für Verträge über das Abo Individual Commercial zwischen {address()} („Anbieter“) und seinen Kunden.</P>
      <P>
        (2) Das Abo richtet sich ausschließlich an Unternehmer im Sinne von § 14 BGB, juristische Personen des öffentlichen Rechts und öffentlich-rechtliche Sondervermögen. Mit dem
        Abschluss bestätigt der Kunde, in Ausübung seiner gewerblichen oder selbstständigen beruflichen Tätigkeit zu handeln. Mit Verbrauchern schließt der Anbieter keine Verträge über das
        Abo.
      </P>
      <P>(3) Ergänzend gelten die Nutzungsbedingungen. Abweichende Bedingungen des Kunden gelten nur, wenn der Anbieter ihnen ausdrücklich in Textform zustimmt.</P>
      <H>§ 2 Vertragsschluss</H>
      <P>(1) Die Darstellung auf der Website ist kein bindendes Angebot. Der Kunde gibt sein Angebot auf der Bezahlseite des Zahlungsdienstleisters Stripe ab („Abonnieren“).</P>
      <P>(2) Der Vertrag kommt zustande, wenn die erste Zahlung erfolgreich ist. Der Kunde erhält dann eine Bestätigung per E-Mail.</P>
      <P>(3) Vertragssprache ist Deutsch.</P>
      <H>§ 3 Leistungen</H>
      <P>
        (1) Das Abo gibt einer natürlichen Person (Lizenznehmer) das Recht, BlackBoard für gewerbliche Zwecke zu nutzen – in der Web-App, als installierte App und als Desktop-Anwendung,
        mit dem jeweils aktuellen Funktionsumfang. Lizenznehmer ist die beim Abschluss angegebene Person. Ein Wechsel der Person ist zum nächsten Abrechnungsmonat möglich; der Kunde teilt
        ihn in Textform mit.
      </P>
      <P>(2) Die Lizenz ist an die Person gebunden. Nutzen mehrere Personen BlackBoard gewerblich, braucht jede ein eigenes Abo.</P>
      <P>
        (3) Die Cloud-Funktionen stehen nach den Nutzungsbedingungen zur Verfügung. Der Anbieter bemüht sich um eine hohe Verfügbarkeit, schuldet aber keine bestimmte; Wartungen kündigt er
        nach Möglichkeit vorher an. Der Editor selbst arbeitet auch ohne Verbindung zum Server.
      </P>
      <P>(4) Das Abo enthält den Online-Compiler des Code-Editors ohne Tageslimit; technische Grenzen zum Schutz des Dienstes nach den Nutzungsbedingungen bleiben unberührt.</P>
      <P>
        (5) Der Anbieter entwickelt BlackBoard weiter. Schränkt eine Änderung den Kern der Leistung – Entwurf, Simulation und Platinen – wesentlich ein, kann der Kunde mit sofortiger
        Wirkung kündigen.
      </P>
      <H>§ 4 Preise und Zahlung</H>
      <P>
        (1) Das Abo kostet 29 € pro Monat. Der Anbieter ist Kleinunternehmer im Sinne von § 19 UStG; Umsatzsteuer wird nicht berechnet. Entfällt diese Regelung, kommt die gesetzliche
        Umsatzsteuer hinzu; der Anbieter kündigt das mindestens vier Wochen vorher in Textform an.
      </P>
      <P>(2) Der Betrag ist monatlich im Voraus fällig und wird über Stripe mit der beim Abschluss gewählten Zahlungsart eingezogen. Rechnungen erhält der Kunde per E-Mail.</P>
      <P>(3) Schlägt eine Zahlung fehl, ruht das Recht zur gewerblichen Nutzung, bis der offene Betrag bezahlt ist.</P>
      <P>
        (4) Preisänderungen kündigt der Anbieter mindestens sechs Wochen vor ihrem Wirksamwerden in Textform an. Der Kunde kann bis dahin zum Zeitpunkt des Wirksamwerdens kündigen; darauf
        weist der Anbieter in der Ankündigung hin.
      </P>
      <H>§ 5 Laufzeit und Kündigung</H>
      <P>(1) Das Abo läuft jeweils einen Monat und verlängert sich automatisch um einen weiteren Monat.</P>
      <P>
        (2) Beide Seiten können jederzeit zum Ende des laufenden Abrechnungsmonats kündigen, der Kunde über das Kundenportal von Stripe oder in Textform per E-Mail an {OPERATOR.email}.
      </P>
      <P>(3) Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.</P>
      <P>
        (4) Mit dem Ende des Abos endet das Recht zur gewerblichen Nutzung; Konto und Cloud-Projekte bleiben nach den Nutzungsbedingungen erhalten. Kündigt der Kunde nach § 3 Abs. 5,
        erstattet der Anbieter den bereits bezahlten Betrag für die Zeit danach anteilig.
      </P>
      <H>§ 6 Mängel</H>
      <P>(1) Der Anbieter sorgt dafür, dass BlackBoard während der Laufzeit im Wesentlichen wie beschrieben funktioniert, und behebt gemeldete Mängel in angemessener Frist.</P>
      <P>(2) Der Kunde meldet Mängel unverzüglich in Textform mit einer nachvollziehbaren Beschreibung.</P>
      <P>
        (3) Ergebnisse von Simulation, Emulation, Design-Regel-Prüfung und Autorouter sind Modellrechnungen. Sie ersetzen keine eigene Prüfung, Messung, Normprüfung oder Abnahme; ob sie
        für einen bestimmten Zweck genügen, prüft der Kunde selbst. Abweichungen zwischen Modell und realer Schaltung sind kein Mangel.
      </P>
      <H>§ 7 Haftung</H>
      <P>
        (1) Der Anbieter haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung des Lebens, des Körpers oder der Gesundheit, nach dem Produkthaftungsgesetz und im Umfang
        einer übernommenen Garantie.
      </P>
      <P>
        (2) Bei leichter Fahrlässigkeit haftet der Anbieter nur für die Verletzung wesentlicher Vertragspflichten – solcher, deren Erfüllung die ordnungsgemäße Durchführung des Vertrags
        erst ermöglicht und auf deren Einhaltung der Kunde regelmäßig vertrauen darf –, und dann begrenzt auf den bei Vertragsschluss vorhersehbaren, vertragstypischen Schaden.
      </P>
      <P>
        (3) Für den Verlust von Daten haftet der Anbieter nur in Höhe des Aufwands, der bei regelmäßiger Datensicherung durch den Kunden für ihre Wiederherstellung nötig gewesen wäre.
      </P>
      <P>(4) Die verschuldensunabhängige Haftung für Mängel, die bei Vertragsschluss schon vorhanden waren (§ 536a Abs. 1 BGB), ist ausgeschlossen.</P>
      <P>(5) Diese Regeln gelten auch für gesetzliche Vertreter und Erfüllungsgehilfen des Anbieters.</P>
      <H>§ 8 Daten</H>
      <P>
        Der Anbieter verarbeitet personenbezogene Daten nach der Datenschutzerklärung. Cloud-Projekte sollen keine personenbezogenen Daten Dritter enthalten; eine Verarbeitung im Auftrag des
        Kunden (Art. 28 DSGVO) ist nicht Gegenstand des Vertrags.
      </P>
      <H>§ 9 Änderungen dieser AGB</H>
      <P>
        Der Anbieter kann diese AGB mit Wirkung für die Zukunft ändern, soweit das für den Kunden zumutbar ist, etwa bei geänderter Rechtslage oder neuen Funktionen. Er teilt Änderungen
        mindestens sechs Wochen vor ihrem Wirksamwerden in Textform mit. Widerspricht der Kunde bis dahin nicht, gelten sie als angenommen; auf diese Folge und auf sein Recht, bis dahin zu
        kündigen, weist der Anbieter in der Mitteilung hin.
      </P>
      <H>§ 10 Schlussbestimmungen</H>
      <P>(1) Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts.</P>
      <P>
        (2) Ist der Kunde Kaufmann, juristische Person des öffentlichen Rechts oder öffentlich-rechtliches Sondervermögen, ist Gerichtsstand für alle Streitigkeiten aus dem Vertrag
        Emmendingen.
      </P>
      <P>(3) Ist eine Bestimmung unwirksam, bleibt der Vertrag im Übrigen wirksam; an ihre Stelle treten die gesetzlichen Vorschriften (§ 306 BGB).</P>
    </>
  );
}

export const LEGAL_PAGES = ['impressum', 'datenschutz', 'agb', 'nutzungsbedingungen'] as const;
export type LegalPageId = (typeof LEGAL_PAGES)[number];

export function LegalPage({ page, lang, plans }: { page: LegalPageId; lang: Lang; plans: PlanSettings }) {
  return (
    <article className="mx-auto max-w-[760px] px-5 py-14 text-[15px]">
      {lang === 'en' && <p className="mb-6 rounded-lg bg-white/5 p-3 text-[13px] text-slate-400">The legal texts are binding in German; here is the German text.</p>}
      {page === 'impressum' ? <Imprint /> : page === 'datenschutz' ? <Privacy /> : page === 'agb' ? <Agb /> : <Terms plans={plans} />}
    </article>
  );
}
