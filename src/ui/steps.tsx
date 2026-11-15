import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStudio } from '../store';
import { Field, Icons, Section, Segmented, Slider, Toggle, Checkbox } from './controls';
import { LayerThumb, LayerView, MaskCanvas, RgbaCanvas } from './CanvasViews';
import { ZoomPane, type Rect } from './ZoomPane';
import { DETAIL_PRESETS, PALETTES, QUALITY_PX } from '../core/types';
import { pageSizeMm, PAPER_SIZES } from '../core/units';
import { deriveFromDetail } from '../core/types';

/* ------------------------------------------------------------------ */
/* Hilfen                                                              */
/* ------------------------------------------------------------------ */

function BitmapView({ bitmap }: { bitmap: ImageBitmap }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = bitmap.width;
    c.height = bitmap.height;
    const ctx = c.getContext('2d');
    if (ctx) ctx.drawImage(bitmap, 0, 0);
  }, [bitmap]);
  return <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />;
}

function EmptyStage() {
  const { loadFromDesktop, setCameraOpen } = useStudio();
  return (
    <div className="empty-stage">
      <div className="dropzone">
        <div style={{ fontSize: 40, lineHeight: 1 }}>🖼️</div>
        <h2>Bild hierher ziehen</h2>
        <p>
          Ein Foto oder eine Zeichnung ablegen, einfügen (Strg+V) oder direkt mit der Kamera aufnehmen. Alles bleibt auf
          diesem Rechner – nichts wird hochgeladen.
        </p>
        <div className="dropzone-actions">
          <button className="btn primary" onClick={() => void loadFromDesktop()}>
            {Icons.folder} Bild öffnen
          </button>
          <button className="btn" onClick={() => setCameraOpen(true)}>
            {Icons.camera} Foto aufnehmen
          </button>
        </div>
      </div>
    </div>
  );
}

function StageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="stage-toolbar">
      <strong style={{ fontSize: 13, marginRight: 8 }}>{title}</strong>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Schritt 1 – Bild                                                    */
/* ------------------------------------------------------------------ */

export function StepImage() {
  const s = useStudio();
  const [cropMode, setCropMode] = useState(false);
  const [cropRect, setCropRect] = useState<Rect | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const { source, settings } = s;

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await s.loadBlob(file, file.name);
  };

  useEffect(() => {
    if (!source) setCropMode(false);
  }, [source]);

  return (
    <div className="main">
      <aside className="sidebar">
        <div className="sidebar-scroll">
          <Section title="Bildquelle" defaultOpen>
            <div className="row wrap" style={{ marginTop: 8 }}>
              <button className="btn grow" onClick={() => void s.loadFromDesktop()}>
                {Icons.folder} Öffnen…
              </button>
              <button className="btn grow" onClick={() => s.setCameraOpen(true)}>
                {Icons.camera} Foto
              </button>
            </div>
            <div className="field-desc" style={{ marginTop: 8 }}>
              Bild in die Fläche ziehen oder mit <code>Strg+V</code> aus der Zwischenablage einfügen.
            </div>
          </Section>

          {source && (
            <>
              <Section title="Ausrichtung" hint={`${source.width} × ${source.height} px`}>
                <div className="row wrap" style={{ marginTop: 8 }}>
                  <button className="btn" onClick={() => void s.rotate()}>
                    {Icons.rotate} Drehen
                  </button>
                  <button
                    className={`btn ${cropMode ? 'primary' : ''}`}
                    onClick={() => {
                      setCropMode(!cropMode);
                      setCropRect(null);
                    }}
                  >
                    {Icons.crop} Zuschneiden
                  </button>
                  <button className="btn ghost" onClick={() => void s.resetImage()}>
                    Zurücksetzen
                  </button>
                </div>
                {cropMode && (
                  <div className="field-desc">
                    Ausschnitt im Bild aufziehen. {cropRect && cropRect.w > 4 ? (
                      <b style={{ color: 'var(--accent-2)' }}>
                        {Math.round(cropRect.w)} × {Math.round(cropRect.h)} px
                      </b>
                    ) : (
                      'Noch keine Auswahl.'
                    )}
                  </div>
                )}
              </Section>

              <Section title="Tonwerte">
                <Slider
                  label="Helligkeit"
                  value={settings.brightness}
                  min={-60}
                  max={60}
                  onChange={(v) => s.setSettings({ brightness: v })}
                  desc="Hebt das ganze Bild an oder ab – hilft bei dunklen Handyfotos."
                />
                <Slider
                  label="Kontrast"
                  value={settings.contrast}
                  min={0}
                  max={100}
                  onChange={(v) => s.setSettings({ contrast: v })}
                  desc="Mehr Kontrast = klarere Tonflächen, weniger Zwischentöne. 50 ist neutral."
                />
                <Toggle
                  label="Invertieren (hell ↔ dunkel)"
                  on={settings.invert}
                  onChange={(v) => s.setSettings({ invert: v })}
                  desc="Für Negative oder Motive vor dunklem Grund."
                />
              </Section>

              <Section title="Hintergrund" hint={settings.removeBackground ? 'an' : 'aus'}>
                <Toggle
                  label="Hintergrund freistellen"
                  on={settings.removeBackground}
                  onChange={(v) => s.setSettings({ removeBackground: v })}
                  desc="Flutfüllung vom Bildrand: gleichmäßige Hintergründe (Himmel, Studio, glatte Wand) werden zu Papier. Bei unruhigem Hintergrund aus lassen."
                />
                {settings.removeBackground && (
                  <Slider
                    label="Toleranz"
                    value={settings.bgTolerance}
                    min={2}
                    max={70}
                    onChange={(v) => s.setSettings({ bgTolerance: v })}
                    format={(v) => String(v)}
                    desc="Zu niedrig: Reste bleiben. Zu hoch: Teile des Motivs verschwinden."
                  />
                )}
              </Section>

              <Section title="Rechenqualität" hint={`${QUALITY_PX[settings.quality]} px`}>
                <Segmented
                  value={settings.quality}
                  options={[
                    { value: 'schnell', label: 'Schnell' },
                    { value: 'standard', label: 'Standard' },
                    { value: 'hoch', label: 'Hoch' },
                  ]}
                  onChange={(v) => s.setSettings({ quality: v })}
                />
                <div className="field-desc">
                  Höher = feinere Konturen, aber längere Rechenzeit. Für Wandbilder lohnt „Hoch“.
                </div>
              </Section>
            </>
          )}
        </div>

        <div className="sidebar-foot">
          <button className="btn primary grow" disabled={!source} onClick={() => s.setStep(1)}>
            Weiter: Detail
          </button>
        </div>
      </aside>

      <section
        className="stage"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={dragOver ? { outline: '2px dashed var(--accent)', outlineOffset: -10 } : undefined}
      >
        {!source ? (
          <EmptyStage />
        ) : (
          <>
            <StageHeader title="Original">
              {cropMode && (
                <>
                  <button
                    className="btn primary small"
                    disabled={!cropRect || cropRect.w < 8 || cropRect.h < 8}
                    onClick={async () => {
                      if (cropRect) {
                        await s.crop(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
                        setCropMode(false);
                        setCropRect(null);
                      }
                    }}
                  >
                    Ausschnitt übernehmen
                  </button>
                  <button
                    className="btn small"
                    onClick={() => {
                      setCropMode(false);
                      setCropRect(null);
                    }}
                  >
                    Abbrechen
                  </button>
                </>
              )}
              <div style={{ flex: 1 }} />
              <span className="chip">{source.name}</span>
              <span className="chip">
                {source.width} × {source.height} px
              </span>
            </StageHeader>
            <div className="stage-body">
              <ZoomPane
                imageW={source.width}
                imageH={source.height}
                cropMode={cropMode}
                cropRect={cropRect}
                onCropChange={setCropRect}
                hint={
                  cropMode
                    ? 'Ausschnitt mit der Maus aufziehen'
                    : 'Mausrad: zoomen · Ziehen: verschieben · Doppelklick: zurücksetzen'
                }
              >
                <BitmapView bitmap={source.bitmap} />
              </ZoomPane>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Schritt 2 – Detail                                                  */
/* ------------------------------------------------------------------ */

export function StepDetail() {
  const s = useStudio();
  const { settings, result, source } = s;
  const activePreset = useMemo(
    () =>
      DETAIL_PRESETS.find(
        (p) =>
          p.patch.levels === settings.levels &&
          (p.patch.outline ?? false) === settings.outline &&
          (p.patch.mode ?? 'mono') === settings.mode
      )?.id,
    [settings.levels, settings.outline, settings.mode]
  );

  const derived = deriveFromDetail(settings.detail);

  return (
    <div className="main">
      <aside className="sidebar">
        <div className="sidebar-scroll">
          <Section title="Detailstufe" hint={`${settings.levels} Ebene(n)`} defaultOpen>
            <div className="presets" style={{ marginTop: 10 }}>
              {DETAIL_PRESETS.map((p) => {
                const layers = (p.patch.levels ?? 3) + ((p.patch.outline ?? false) ? 1 : 0);
                return (
                  <button
                    key={p.id}
                    className={`preset ${activePreset === p.id ? 'on' : ''}`}
                    onClick={() => s.applyPreset(p)}
                    title={p.desc}
                  >
                    <div className="preset-bars">
                      {Array.from({ length: Math.max(1, layers) }).map((_, i) => (
                        <div
                          key={i}
                          className="preset-bar"
                          style={{
                            background:
                              PALETTES[p.patch.palette ?? 'banksy']?.colors?.[i] ??
                              ['#8a8a8a', '#4a4a4a', '#1b1b1b'][i] ??
                              '#000',
                          }}
                        />
                      ))}
                    </div>
                    <div className="preset-name">{p.name}</div>
                    <div className="preset-desc">{p.desc}</div>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Grundwerte">
            <Slider
              label="Anzahl Schablonen"
              value={settings.levels}
              min={1}
              max={6}
              onChange={(v) => s.setSettings({ levels: v })}
              desc="Jede Ebene = ein Blech = ein Sprühgang. Drei ist der Banksy-Klassiker."
            />
            <Slider
              label="Feinheit"
              value={settings.detail}
              min={0}
              max={100}
              onChange={(v) => s.setSettings({ detail: v, ...deriveFromDetail(v) })}
              format={(v) => (v < 30 ? 'grob' : v < 55 ? 'mittel' : v < 78 ? 'fein' : 'sehr fein')}
              desc={`Steuert Mindestgrößen für Schnittbarkeit: kleinste Öffnung ${derived.minHoleMm.toFixed(
                1
              )} mm, kleinste Insel ${derived.minFeatureMm.toFixed(1)} mm, Steg ${derived.minStripMm.toFixed(1)} mm.`}
            />
            <Slider
              label="Glättung"
              value={settings.smoothing}
              min={0}
              max={100}
              onChange={(v) => s.setSettings({ smoothing: v })}
              desc="Entfernt Hautstruktur und Rauschen, hält Kanten. Zu viel = Details verschmieren."
            />
            <Slider
              label="Kontrast"
              value={settings.contrast}
              min={0}
              max={100}
              onChange={(v) => s.setSettings({ contrast: v })}
            />
          </Section>

          <Section title="Motivgröße" hint={`${settings.widthMm.toFixed(0)} mm breit`}>
            <Slider
              label="Breite"
              value={settings.widthMm}
              min={50}
              max={2000}
              step={10}
              onChange={(v) => s.setSettings({ widthMm: v })}
              format={(v) => `${v} mm`}
            />
            <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
              {[
                { l: 'A5 · 148', v: 148 },
                { l: 'A4 · 210', v: 210 },
                { l: 'A3 · 297', v: 297 },
                { l: '50 cm', v: 500 },
                { l: '1 m', v: 1000 },
              ].map((p) => (
                <button key={p.v} className="btn small" onClick={() => s.setSettings({ widthMm: p.v })}>
                  {p.l}
                </button>
              ))}
            </div>
            {result && (
              <div className="field-desc">
                Ergibt <b>{result.heightMm.toFixed(0)} mm</b> Höhe · {result.stats.pxPerMm.toFixed(1)} px/mm ·{' '}
                {(result.width * result.height * 1e-6).toFixed(2)} MP Arbeitsbild
              </div>
            )}
          </Section>

          <Section title="Schablonen-Technik" hint={settings.model === 'separate' ? 'separat' : 'kumulativ'}>
            <Segmented
              label="Ebenen-Modell"
              value={settings.model}
              options={[
                { value: 'separate', label: 'Separate Blätter', title: 'Je Ebene ein eigenes Blech' },
                { value: 'cumulative', label: 'Ineinander', title: 'Öffnungen werden von Ebene zu Ebene größer (nacheinander aus einem Blech geschnitten)' },
              ]}
              onChange={(v) => s.setSettings({ model: v as 'separate' | 'cumulative' })}
            />
            <Toggle
              label="Automatische Stege"
              on={settings.bridges}
              onChange={(v) => s.setSettings({ bridges: v })}
              desc="Verbindet herausfallende Inseln mit dem Rahmen – ohne Stege ist die Schablone nicht benutzbar."
            />
            <Slider
              label="Stegbreite"
              value={settings.bridgeMm}
              min={0.4}
              max={6}
              step={0.1}
              onChange={(v) => s.setSettings({ bridgeMm: v })}
              format={(v) => v.toFixed(1)}
              unit=" mm"
              desc="Breiter = stabiler, aber sichtbarer im Ergebnis."
            />
            <Slider
              label="Farbübergriff"
              value={settings.spreadMm}
              min={0}
              max={2}
              step={0.1}
              onChange={(v) => s.setSettings({ spreadMm: v })}
              format={(v) => v.toFixed(1)}
              unit=" mm"
              desc="Dunklere Ebenen werden leicht vergrößert, damit keine hellen Blitzer an den Rändern entstehen."
            />
            <Toggle
              label="Kanten glätten"
              on={settings.smoothEdges}
              onChange={(v) => s.setSettings({ smoothEdges: v })}
              desc="Rundet Treppchen ab – leichter zu schneiden."
            />
            <Toggle
              label="Hellster Ton = Papier"
              on={settings.paperAsLightest}
              onChange={(v) => s.setSettings({ paperAsLightest: v })}
              desc="Die hellste Fläche wird nicht gesprüht, sondern bleibt der Untergrund."
            />
          </Section>

          <Section title="Konturen-Ebene" hint={settings.outline ? `${settings.outlineMm} mm` : 'aus'} defaultOpen={false}>
            <Toggle
              label="Konturen zuletzt sprühen"
              on={settings.outline}
              onChange={(v) => s.setSettings({ outline: v })}
              desc="Eine zusätzliche Schablone mit den wichtigsten Kanten – rettet Details in Gesichtern."
            />
            {settings.outline && (
              <>
                <Slider
                  label="Linienstärke"
                  value={settings.outlineMm}
                  min={0.3}
                  max={3}
                  step={0.1}
                  onChange={(v) => s.setSettings({ outlineMm: v })}
                  format={(v) => v.toFixed(1)}
                  unit=" mm"
                />
                <Slider
                  label="Empfindlichkeit"
                  value={settings.outlineStrength}
                  min={0}
                  max={100}
                  onChange={(v) => s.setSettings({ outlineStrength: v })}
                  desc="Höher = mehr Kanten (auch Rauschen)."
                />
              </>
            )}
          </Section>

          <Section title="Farben" hint={PALETTES[settings.palette]?.name ?? 'Palette'} defaultOpen={false}>
            <Field label="Palette">
              <select value={settings.palette} onChange={(e) => s.setSettings({ palette: e.target.value, layerColors: [] })}>
                {Object.entries(PALETTES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Modus">
              <div className="segmented">
                <button className={settings.mode === 'mono' ? 'on' : ''} onClick={() => s.setSettings({ mode: 'mono' })}>
                  Schwarzweiß
                </button>
                <button className={settings.mode === 'color' ? 'on' : ''} onClick={() => s.setSettings({ mode: 'color' })}>
                  Farbe (Lab)
                </button>
              </div>
            </Field>
            <Field label="Papierfarbe">
              <input
                type="color"
                value={settings.paperColor}
                onChange={(e) => s.setSettings({ paperColor: e.target.value })}
                style={{ width: '100%', height: 32, background: 'transparent', border: '1px solid var(--line-2)', borderRadius: 8 }}
              />
            </Field>
          </Section>
        </div>

        <div className="sidebar-foot">
          <button className="btn" onClick={() => s.setStep(0)}>
            Zurück
          </button>
          <button className="btn primary grow" disabled={!source || !result} onClick={() => s.setStep(2)}>
            Weiter: Schablonen
          </button>
        </div>
      </aside>

      <section className="stage">
        <StageHeader title="Vorschau">
          {result && (
            <>
              <span className="chip">{result.layers.length} Ebenen</span>
              <span className="chip">{result.stats.ms} ms</span>
              <span className="chip">{settings.model === 'separate' ? 'separate Blätter' : 'kumulativ'}</span>
            </>
          )}
          <div style={{ flex: 1 }} />
          {result?.stats.warnings.map((w) => (
            <span key={w} className="chip warn">
              {w}
            </span>
          ))}
        </StageHeader>
        <div className="stage-body">
          {result ? (
            <ZoomPane imageW={result.width} imageH={result.height} hint="Erwartetes Sprühergebnis · Mausrad: zoomen">
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                <RgbaCanvas rgba={result.composite} w={result.width} h={result.height} />
                <div className="spray-noise" />
              </div>
            </ZoomPane>
          ) : (
            <div className="empty-stage">
              <div style={{ color: 'var(--muted)' }}>Bild laden, um die Vorschau zu sehen.</div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Schritt 3 – Schablonen                                              */
/* ------------------------------------------------------------------ */

type LayerTab = 'sim' | 'single' | 'compare';

export function StepLayers() {
  const s = useStudio();
  const { result, settings } = s;
  const [tab, setTab] = useState<LayerTab>('sim');
  const [selected, setSelected] = useState(0);
  const [showIslands, setShowIslands] = useState(false);
  const [showBridges, setShowBridges] = useState(false);
  const [comparePos, setComparePos] = useState(50);

  useEffect(() => {
    if (selected >= (result?.layers.length ?? 0)) setSelected(0);
  }, [result, selected]);

  const layer = result?.layers[Math.min(selected, (result?.layers.length ?? 1) - 1)];

  const setColor = (index: number, color: string) => {
    const next = [...(settings.layerColors ?? [])];
    while (next.length < (result?.layers.length ?? 0)) next.push('');
    next[index] = color;
    s.setSettings({ layerColors: next });
  };

  return (
    <div className="main">
      <aside className="sidebar">
        <div className="sidebar-scroll">
          <Section title="Ebenen" hint={`${result?.layers.length ?? 0} Stück`} defaultOpen>
            <div className="layer-list" style={{ marginTop: 10 }}>
              {result?.layers.map((l, i) => {
                const warn = l.stats.warnings.length > 0;
                return (
                  <div
                    key={l.id}
                    className={`layer-card ${selected === i && tab === 'single' ? 'on' : ''}`}
                    onClick={() => {
                      setSelected(i);
                      setTab('single');
                    }}
                  >
                    <LayerThumb layer={l} result={result} />
                    <div className="layer-info">
                      <div className="layer-head">
                        <span className="layer-name">
                          {l.name} {i === 0 && <span style={{ color: 'var(--muted-2)', fontWeight: 400 }}>· zuerst</span>}
                        </span>
                        <input
                          className="layer-swatch"
                          type="color"
                          value={l.color}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setColor(i, e.target.value)}
                          title="Sprühfarbe ändern"
                        />
                      </div>
                      <div className="layer-meta">
                        {l.stats.paths} Pfade · {l.stats.cutLengthMm.toFixed(0)} mm Schnitt · {(l.stats.paintPct * 100).toFixed(0)} % Farbe
                      </div>
                      <div className="badge-row">
                        <span className={`chip ${l.stats.bridges > 0 ? 'ok' : ''}`}>{l.stats.bridges} Stege</span>
                        {l.stats.islands > 0 && <span className="chip warn">{l.stats.islands} Inseln</span>}
                        {warn && <span className="chip err">Hinweis</span>}
                      </div>
                      {l.stats.warnings.map((w) => (
                        <div key={w} className="layer-warn">
                          ⚠ {w}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {!result && <div style={{ color: 'var(--muted-2)', fontSize: 12 }}>Noch nichts berechnet.</div>}
            </div>
          </Section>

          <Section title="Anzeige">
            <Toggle label="Inseln hervorheben" on={showIslands} onChange={setShowIslands} desc="Rot = Material, das ohne Steg herausfallen würde." />
            <Toggle label="Stege hervorheben" on={showBridges} onChange={setShowBridges} desc="Blau = automatisch ergänzte Materialbrücken." />
          </Section>
        </div>
        <div className="sidebar-foot">
          <button className="btn" onClick={() => s.setStep(1)}>
            Zurück
          </button>
          <button className="btn primary grow" disabled={!result} onClick={() => s.setStep(3)}>
            Weiter: Export
          </button>
        </div>
      </aside>

      <section className="stage">
        <StageHeader title="Schablonen">
          <div className="segmented" style={{ width: 300 }}>
            <button className={tab === 'sim' ? 'on' : ''} onClick={() => setTab('sim')}>
              Simulation
            </button>
            <button className={tab === 'single' ? 'on' : ''} onClick={() => setTab('single')}>
              {layer ? layer.name : 'Ebene'}
            </button>
            <button className={tab === 'compare' ? 'on' : ''} onClick={() => setTab('compare')}>
              Vergleich
            </button>
          </div>
          {tab === 'single' && result && (
            <select
              value={selected}
              onChange={(e) => setSelected(Number(e.target.value))}
              style={{ width: 150 }}
            >
              {result.layers.map((l, i) => (
                <option key={l.id} value={i}>
                  {l.name} · {l.color}
                </option>
              ))}
            </select>
          )}
          <div style={{ flex: 1 }} />
          {result && tab === 'single' && layer && (
            <button className="btn small" onClick={() => void s.exportPng(selected)}>
              {Icons.download} PNG
            </button>
          )}
        </StageHeader>

        {tab === 'compare' && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Original</span>
            <input type="range" min={0} max={100} value={comparePos} onChange={(e) => setComparePos(Number(e.target.value))} />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Ergebnis</span>
          </div>
        )}

        <div className="stage-body">
          {!result ? (
            <div className="empty-stage">
              <div style={{ color: 'var(--muted)' }}>Noch keine Schablone berechnet.</div>
            </div>
          ) : tab === 'sim' ? (
            <ZoomPane imageW={result.width} imageH={result.height} hint="So sieht das gesprühte Ergebnis aus (Stege sichtbar)">
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                <RgbaCanvas rgba={result.composite} w={result.width} h={result.height} />
                <div className="spray-noise" />
              </div>
            </ZoomPane>
          ) : tab === 'single' && layer ? (
            <ZoomPane imageW={result.width} imageH={result.height} hint="Schwarz = Blech bleibt stehen · Weiß = ausschneiden">
              <LayerView layer={layer} result={result} showIslands={showIslands} showBridges={showBridges} />
            </ZoomPane>
          ) : (
            <ZoomPane imageW={result.width} imageH={result.height} hint="Regler unten: Original ↔ Ergebnis">
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                <RgbaCanvas rgba={result.original} w={result.width} h={result.height} />
                <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 0 0 ${comparePos}%)` }}>
                  <RgbaCanvas rgba={result.composite} w={result.width} h={result.height} />
                </div>
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${comparePos}%`,
                    width: 2,
                    background: '#fff',
                    boxShadow: '0 0 8px rgba(0,0,0,.6)',
                  }}
                />
              </div>
            </ZoomPane>
          )}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Schritt 4 – Export                                                  */
/* ------------------------------------------------------------------ */

export function StepExport() {
  const s = useStudio();
  const { result, settings, formats, progress } = s;
  const page = pageSizeMm(settings.paper, settings.orientation);

  const totalCut = result?.layers.reduce((a, l) => a + l.stats.cutLengthMm, 0) ?? 0;
  const totalBridges = result?.layers.reduce((a, l) => a + l.stats.bridges, 0) ?? 0;
  const totalPaths = result?.layers.reduce((a, l) => a + l.stats.paths, 0) ?? 0;

  return (
    <div className="main">
      <aside className="sidebar">
        <div className="sidebar-scroll">
          <Section title="Blatt & Druck" defaultOpen>
            <div className="grid2">
              <Field label="Papierformat">
                <select
                  value={settings.paper}
                  onChange={(e) => s.setSettings({ paper: e.target.value as typeof settings.paper })}
                >
                  {Object.entries(PAPER_SIZES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.name} · {v.w} × {v.h}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ausrichtung">
                <select
                  value={settings.orientation}
                  onChange={(e) => s.setSettings({ orientation: e.target.value as 'portrait' | 'landscape' })}
                >
                  <option value="portrait">Hochformat</option>
                  <option value="landscape">Querformat</option>
                </select>
              </Field>
            </div>
            <Segmented
              label="Druckauflösung"
              value={settings.dpi}
              options={[
                { value: 150, label: '150 dpi' },
                { value: 300, label: '300 dpi' },
                { value: 600, label: '600 dpi' },
              ]}
              onChange={(v) => s.setSettings({ dpi: Number(v) })}
            />
            <Slider
              label="Seitenrand"
              value={settings.marginMm}
              min={0}
              max={25}
              onChange={(v) => s.setSettings({ marginMm: v })}
              format={(v) => v.toFixed(0)}
              unit=" mm"
              desc="Platz für Passmarken und Beschriftung."
            />
            <Slider
              label="Überlappung bei mehreren Blättern"
              value={settings.tileOverlapMm}
              min={0}
              max={40}
              onChange={(v) => s.setSettings({ tileOverlapMm: v })}
              format={(v) => v.toFixed(0)}
              unit=" mm"
            />
            <Toggle
              label="Passmarken (Fadenkreuze)"
              on={settings.registration}
              onChange={(v) => s.setSettings({ registration: v })}
              desc="Zum exakten Übereinanderlegen der Ebenen und Blätter."
            />
            <div className="field-desc">
              Nutzfläche je Blatt: {(page.w - 2 * settings.marginMm).toFixed(0)} ×{' '}
              {(page.h - 2 * settings.marginMm).toFixed(0)} mm · Motiv {settings.widthMm.toFixed(0)} ×{' '}
              {result ? result.heightMm.toFixed(0) : '–'} mm
            </div>
          </Section>

          <Section title="Dateien" defaultOpen>
            <div className="export-list" style={{ marginTop: 6 }}>
              <Checkbox on={formats.pdf} onChange={(v) => s.setFormats({ pdf: v })} label="Druck-PDF (empfohlen)" desc="Alle Ebenen maßstabsgetreu, mit Passmarken und Anleitung – direkt druckbar." />
              <Checkbox on={formats.svg} onChange={(v) => s.setFormats({ svg: v })} label="SVG je Ebene" desc="Vektoren in mm – Plotter, Laser, Cricut, Silhouette, Inkscape." />
              <Checkbox on={formats.svgCut} onChange={(v) => s.setFormats({ svgCut: v })} label="SVG als Schnittlinien" desc="Nur rote Schnittlinien, ohne Füllung." />
              <Checkbox on={formats.dxf} onChange={(v) => s.setFormats({ dxf: v })} label="DXF je Ebene" desc="Für CNC/Laser-Software (LightBurn, RDWorks)." />
              <Checkbox on={formats.png} onChange={(v) => s.setFormats({ png: v })} label="PNG je Ebene" desc={`Raster mit ${settings.dpi} dpi`} />
              <Checkbox on={formats.txt} onChange={(v) => s.setFormats({ txt: v })} label="Anleitung (TXT)" desc="Sprüfreihenfolge, Maße, Hinweise." />
              <Checkbox on={formats.project} onChange={(v) => s.setFormats({ project: v })} label="Projektdatei" desc="Zum späteren Weiterarbeiten." />
            </div>
          </Section>

          <Section title="Schnellzugriff" defaultOpen={false}>
            <div className="row wrap" style={{ marginTop: 8 }}>
              <button className="btn" disabled={!result} onClick={() => void s.exportPdf(false)}>
                {Icons.download} PDF
              </button>
              <button className="btn" disabled={!result} onClick={() => void s.exportSvg()}>
                {Icons.download} SVG
              </button>
              <button className="btn" disabled={!result} onClick={() => void s.saveProject()}>
                {Icons.save} Projekt
              </button>
            </div>
          </Section>
        </div>

        <div className="sidebar-foot">
          <button className="btn" onClick={() => s.setStep(2)}>
            Zurück
          </button>
          <button className="btn primary grow" disabled={!result || !!progress} onClick={() => void s.exportZip()}>
            {Icons.download} Alles als ZIP
          </button>
        </div>
      </aside>

      <section className="stage">
        <StageHeader title="Ausgabe">
          <span className="chip">{[formats.svg && 'SVG', formats.dxf && 'DXF', formats.png && 'PNG', formats.pdf && 'PDF'].filter(Boolean).join(' · ') || '—'}</span>
          <div style={{ flex: 1 }} />
          {result && <span className="chip">{result.layers.length} Ebenen</span>}
        </StageHeader>
        <div className="stage-body" style={{ overflowY: 'auto', padding: 20 }}>
          {!result ? (
            <div className="empty-stage">
              <div style={{ color: 'var(--muted)' }}>Noch keine Schablone berechnet.</div>
            </div>
          ) : (
            <div style={{ maxWidth: 900, margin: '0 auto' }}>
              <div className="summary">
                <div className="summary-cell">
                  <div className="summary-k">Motiv</div>
                  <div className="summary-v">
                    {settings.widthMm.toFixed(0)} × {result.heightMm.toFixed(0)} mm
                  </div>
                </div>
                <div className="summary-cell">
                  <div className="summary-k">Ebenen</div>
                  <div className="summary-v">{result.layers.length}</div>
                </div>
                <div className="summary-cell">
                  <div className="summary-k">Schnittlänge gesamt</div>
                  <div className="summary-v">{(totalCut / 1000).toFixed(2)} m</div>
                </div>
                <div className="summary-cell">
                  <div className="summary-k">Stege / Pfade</div>
                  <div className="summary-v">
                    {totalBridges} / {totalPaths}
                  </div>
                </div>
              </div>

              <div className="layer-list" style={{ marginBottom: 16 }}>
                {result.layers.map((l, i) => (
                  <div key={l.id} className="layer-card" style={{ cursor: 'default' }}>
                    <LayerThumb layer={l} result={result} />
                    <div className="layer-info">
                      <div className="layer-head">
                        <span className="layer-name">
                          {i + 1}. {l.name}
                        </span>
                        <span className="chip">{l.color}</span>
                      </div>
                      <div className="layer-meta">
                        {l.stats.paths} Pfade · {(l.stats.cutLengthMm / 10).toFixed(0)} cm Schnitt · {l.stats.bridges} Stege ·{' '}
                        {(l.stats.paintPct * 100).toFixed(0)} % Farbe
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="section">
                <div className="section-head" style={{ cursor: 'default' }}>
                  <span className="section-title">Anleitung (Auszug)</span>
                </div>
                <div className="section-body help" style={{ fontSize: 12.5 }}>
                  <ol>
                    <li>Alle Seiten in 100 % auf 120–200 g Karton oder Folie drucken (keine Seitenanpassung).</li>
                    <li>Blätter über die Fadenkreuz-Passmarken exakt ausrichten.</li>
                    <li>Graue Flächen ausschneiden – weiße Flächen bleiben stehen. Innenflächen zuerst.</li>
                    <li>Stege nicht durchtrennen, sie halten die Inseln im Blech.</li>
                    <li>Von Ebene 1 (hell) nach {result.layers.length} (dunkel) sprühen, dazwischen trocknen lassen.</li>
                  </ol>
                  <p style={{ color: 'var(--muted-2)' }}>
                    Vollständig in der ZIP-Datei als <code>ANLEITUNG.txt</code> und im Druck-PDF auf der ersten Seite.
                  </p>
                </div>
              </div>

              {progress && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{progress.msg}</div>
                  <div className="progress">
                    <div style={{ width: `${progress.pct}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
