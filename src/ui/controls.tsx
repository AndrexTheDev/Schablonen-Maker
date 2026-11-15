import React, { useState } from 'react';

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  desc?: string;
  disabled?: boolean;
}) {
  const { label, value, min, max, step = 1, unit = '', format, onChange, desc, disabled } = props;
  return (
    <div className="field">
      <div className="field-head">
        <span className="field-label">{label}</span>
        <span className="field-value">
          {format ? format(value) : value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      {desc && <div className="field-desc">{desc}</div>}
    </div>
  );
}

export function Toggle(props: { label: string; on: boolean; onChange: (v: boolean) => void; desc?: string }) {
  return (
    <div className="field">
      <div className={`toggle ${props.on ? 'on' : ''}`} onClick={() => props.onChange(!props.on)} role="switch" aria-checked={props.on} tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && props.onChange(!props.on)}>
        <div className="toggle-track">
          <div className="toggle-knob" />
        </div>
        <span className="toggle-label">{props.label}</span>
      </div>
      {props.desc && <div className="field-desc">{props.desc}</div>}
    </div>
  );
}

export function Segmented<T extends string | number>(props: {
  label?: string;
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      {props.label && (
        <div className="field-head">
          <span className="field-label">{props.label}</span>
        </div>
      )}
      <div className="segmented">
        {props.options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            title={o.title}
            className={props.value === o.value ? 'on' : ''}
            onClick={() => props.onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Section(props: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  right?: React.ReactNode;
}) {
  const [open, setOpen] = useState(props.defaultOpen !== false);
  return (
    <div className="section">
      <div className="section-head" onClick={() => setOpen(!open)}>
        <span className="section-title">{props.title}</span>
        {props.right}
        {props.hint && <span className="section-hint">{props.hint}</span>}
        <span style={{ color: 'var(--muted-2)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>
          <Chevron />
        </span>
      </div>
      {open && <div className="section-body">{props.children}</div>}
    </div>
  );
}

export function Chevron({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Field(props: { label: string; children: React.ReactNode; desc?: string }) {
  return (
    <div className="field">
      <div className="field-head">
        <span className="field-label">{props.label}</span>
      </div>
      {props.children}
      {props.desc && <div className="field-desc">{props.desc}</div>}
    </div>
  );
}

export function Checkbox(props: { on: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <div className="export-item" onClick={() => props.onChange(!props.on)} style={{ cursor: 'pointer' }}>
      <div className={`checkbox ${props.on ? 'on' : ''}`}>
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.4">
          <path d="M3 8.5l3.2 3.2L13 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="export-label">
        {props.label}
        {props.desc && <div className="export-desc">{props.desc}</div>}
      </div>
    </div>
  );
}

export const Icons = {
  image: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  camera: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 8.5h2.5L8 6h8l1.5 2.5H20a1 1 0 011 1V18a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5a1 1 0 011-1z" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.3" />
    </svg>
  ),
  rotate: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M20 12a8 8 0 11-2.34-5.66" strokeLinecap="round" />
      <path d="M20 3.5V7h-3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  crop: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M6 2v14a2 2 0 002 2h14" strokeLinecap="round" />
      <path d="M2 6h14a2 2 0 012 2v14" strokeLinecap="round" />
    </svg>
  ),
  layers: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M12 3l9 5-9 5-9-5 9-5z" strokeLinejoin="round" />
      <path d="M3 13l9 5 9-5" strokeLinejoin="round" />
      <path d="M3 17l9 5 9-5" strokeLinejoin="round" />
    </svg>
  ),
  download: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M12 3v12" strokeLinecap="round" />
      <path d="M7.5 11l4.5 4.5 4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20h16" strokeLinecap="round" />
    </svg>
  ),
  save: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M5 3h11l4 4v14H5z" strokeLinejoin="round" />
      <path d="M8 3v6h7V3M8 21v-6h8v6" strokeLinejoin="round" />
    </svg>
  ),
  folder: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3 7a2 2 0 012-2h4l2 2.5h8a2 2 0 012 2V18a2 2 0 01-2 2H5a2 2 0 01-2-2z" strokeLinejoin="round" />
    </svg>
  ),
  help: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.2a2.6 2.6 0 115 1c0 1.6-2.5 1.9-2.5 3.4" strokeLinecap="round" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  ),
  grid: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  ),
  spark: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" strokeLinejoin="round" />
      <path d="M18.5 16.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" strokeLinejoin="round" />
    </svg>
  ),
  brand: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="3" fill="#1d2530" stroke="#38424f" />
      <path d="M7 8.5h5.5a2.5 2.5 0 010 5H9" stroke="#ff4d3d" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="8" cy="17" r="1.3" fill="#e8ecf1" />
      <path d="M13 17h4" stroke="#e8ecf1" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
};
