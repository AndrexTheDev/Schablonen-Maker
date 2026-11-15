import React, { useEffect } from 'react';
import { StudioProvider, useStudio } from './store';
import { StepDetail, StepExport, StepImage, StepLayers } from './ui/steps';
import { CameraModal } from './ui/CameraModal';
import { Icons } from './ui/controls';
import { isDesktop } from './platform';

const STEPS = [
  { id: 0, name: 'Bild' },
  { id: 1, name: 'Detail' },
  { id: 2, name: 'Schablonen' },
  { id: 3, name: 'Export' },
];

function Topbar() {
  const s = useStudio();
  const { result, busy, error, step, source, settings } = s;
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">{Icons.brand}</div>
        <div>
          <div className="brand-title">Schablonen Maker</div>
          <div className="brand-sub">Banksy-Stil · Mehrlagen-Stencil</div>
        </div>
      </div>

      <nav className="stepper">
        {STEPS.map((st, i) => (
          <React.Fragment key={st.id}>
            {i > 0 && <span className="step-sep" />}
            <button
              className={`step ${step === st.id ? 'active' : ''} ${step > st.id ? 'done' : ''}`}
              disabled={st.id > 0 && !source}
              onClick={() => s.setStep(st.id)}
            >
              <span className="step-num">{step > st.id ? '✓' : st.id + 1}</span>
              {st.name}
            </button>
          </React.Fragment>
        ))}
      </nav>

      <div className="topbar-right">
        <span className="status-pill" title={error ?? ''}>
          <span className={`dot ${error ? 'err' : busy ? 'busy' : ''}`} />
          {error ? 'Fehler' : busy ? 'rechnet…' : result ? `${result.width}×${result.height} px · ${result.stats.ms} ms` : 'bereit'}
        </span>
        <button className="btn ghost small" onClick={() => void s.openProject()} title="Projekt öffnen">
          {Icons.folder}
        </button>
        <button className="btn ghost small" onClick={() => void s.saveProject()} title="Projekt speichern (Strg+S)" disabled={!source}>
          {Icons.save}
        </button>
        <button className="btn ghost small" onClick={() => s.setHelpOpen(true)} title="Hilfe">
          {Icons.help}
        </button>
      </div>
    </header>
  );
}

function Toasts() {
  const { toasts } = useStudio();
  return (
    <div className="toast-wrap">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

function HelpModal() {
  const { helpOpen, setHelpOpen, desktop } = useStudio();
  if (!helpOpen) return null;
  return (
    <div className="modal-back" onClick={() => setHelpOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Hilfe & Hintergrund</span>
          <button className="btn ghost small" onClick={() => setHelpOpen(false)}>
            Schließen
          </button>
        </div>
        <div className="modal-body help">
          <h3 style={{ marginTop: 0 }}>In vier Schritten zur Schablone</h3>
          <ol>
            <li>
              <b>Bild</b> – Foto aufnehmen, laden oder einfügen. Zuschneiden, drehen, Helligkeit und Kontrast einstellen.
              Bei unruhigem Hintergrund die automatische Hintergrund-Entfernung nutzen.
            </li>
            <li>
              <b>Detail</b> – Detailstufe wählen: von der plakativen Silhouette (1 Schablone) bis zu sechs Tonstufen. Dazu
              die Motivgröße in Millimetern festlegen – daraus ergeben sich Schnittbarkeit und Stegbreite.
            </li>
            <li>
              <b>Schablonen</b> – jede Ebene prüfen: Inseln (rot) und Stege (blau) einblenden, Farben anpassen.
            </li>
            <li>
              <b>Export</b> – Druck-PDF (mit Passmarken und Anleitung), SVG/DXF für Plotter und Laser, PNG, alles als ZIP.
            </li>
          </ol>

          <h3>Warum Stege?</h3>
          <p>
            Eine Schablone ist ein Blech mit Ausschnitten. Material, das vollständig von Ausschnitten umschlossen ist – das
            Innere eines „O“, die Pupille im Auge, ein Glanzlicht auf der Lippe – fällt beim Ausschneiden heraus. Solche
            Stellen heißen <i>Inseln</i>. Der Schablonen Maker findet jede Insel automatisch und verbindet sie mit einem
            kurzen Materialsteg. Bevorzugt werden Stellen, die eine spätere, dunklere Ebene übermalt – dort ist der Steg im
            Ergebnis unsichtbar.
          </p>

          <h3>Die Ebenen</h3>
          <p>
            Jede Tonstufe wird eine eigene Schablone. Gesprüht wird von hell nach dunkel: die hellste Fläche ist oft einfach
            das Papier. Das Ergebnis ist eine harte, grafische Kante – der typische Stencil-Look.
          </p>

          <h3>Tastenkürzel</h3>
          <table>
            <tbody>
              <tr>
                <td>
                  <code>Strg+O</code>
                </td>
                <td>Bild öffnen</td>
              </tr>
              <tr>
                <td>
                  <code>Strg+V</code>
                </td>
                <td>Bild aus der Zwischenablage einfügen</td>
              </tr>
              <tr>
                <td>
                  <code>Strg+S</code>
                </td>
                <td>Projekt speichern</td>
              </tr>
              <tr>
                <td>
                  <code>Strg+E</code>
                </td>
                <td>Alles als ZIP exportieren</td>
              </tr>
              <tr>
                <td>
                  <code>Strg+P</code>
                </td>
                <td>Druck-PDF erzeugen</td>
              </tr>
            </tbody>
          </table>

          <h3>Datenschutz</h3>
          <p>
            Alle Berechnungen laufen lokal {desktop ? 'in dieser Anwendung' : 'im Browser'}. Es werden keine Bilder
            hochgeladen und keine Daten gesendet.
          </p>
        </div>
      </div>
    </div>
  );
}

function Shell() {
  const s = useStudio();
  return (
    <div className="app">
      <Topbar />
      {s.step === 0 && <StepImage />}
      {s.step === 1 && <StepDetail />}
      {s.step === 2 && <StepLayers />}
      {s.step === 3 && <StepExport />}
      <Toasts />
      <CameraModal />
      <HelpModal />
      {s.progress && s.step !== 3 && (
        <div className="toast-wrap">
          <div className="toast info" style={{ minWidth: 320 }}>
            {s.progress.msg}
            <div className="progress">
              <div style={{ width: `${s.progress.pct}%` }} />
            </div>
          </div>
        </div>
      )}
      {!isDesktop() && (
        <div style={{ position: 'fixed', right: 12, bottom: 10, fontSize: 10.5, color: '#4d5560', pointerEvents: 'none' }}>
          Browser-Vorschau · Windows-App: npm run dist:win
        </div>
      )}
    </div>
  );
}

export default function App() {
  useEffect(() => {
    document.title = 'Schablonen Maker – Banksy-Stil';
  }, []);
  return (
    <StudioProvider>
      <Shell />
    </StudioProvider>
  );
}
