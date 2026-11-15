import React, { useEffect, useRef, useState } from 'react';
import { useStudio } from '../store';
import { makeCanvas } from '../core/image';

/** Foto mit der Kamera aufnehmen (Windows-Tablet/Webcam). */
export function CameraModal() {
  const { cameraOpen, setCameraOpen, loadBlob, notify, pickFile } = useStudio();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    setErr(null);
    setReady(false);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Keine Kamera-API');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 2560 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch (e) {
        setErr(
          'Keine Kamera verfügbar oder Zugriff verweigert. Du kannst stattdessen ein Bild laden – auf dem Handy/Tablet einfach „Bild öffnen“ nutzen.'
        );
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [cameraOpen]);

  if (!cameraOpen) return null;

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = makeCanvas(video.videoWidth, video.videoHeight);
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.94));
    if (blob) {
      await loadBlob(blob, 'Kamera-Foto');
      setCameraOpen(false);
    } else {
      notify('Aufnahme fehlgeschlagen', 'err');
    }
  };

  return (
    <div className="modal-back" onClick={() => setCameraOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Foto aufnehmen</span>
          <button className="btn ghost small" onClick={() => setCameraOpen(false)}>
            Schließen
          </button>
        </div>
        <div className="modal-body">
          {err ? (
            <div>
              <p style={{ color: 'var(--warn)', lineHeight: 1.6 }}>{err}</p>
              <div className="row">
                <button className="btn primary" onClick={() => setCameraOpen(false)}>
                  Bild stattdessen laden
                </button>
              </div>
            </div>
          ) : (
            <>
              <video ref={videoRef} className="camera-view" playsInline muted />
              <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--muted-2)', fontSize: 12 }}>
                  {ready ? 'Motiv ruhig und mit klarem Kontrast aufnehmen – Gegenlicht vermeiden.' : 'Kamera startet…'}
                </span>
                <button className="btn primary" disabled={!ready} onClick={capture}>
                  Auslösen
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
