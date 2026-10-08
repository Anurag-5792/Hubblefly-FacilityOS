'use client';

import { useEffect, useRef, useState } from 'react';

type Props = {
  onDetected: (value: string) => void;
};

export default function CameraScanner({ onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState('Camera scanner is off. You can still use a USB/Bluetooth scanner or type an ID.');

  useEffect(() => () => stop(), []);

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage('Camera access is not available in this browser. Use the manual/scanner input below.');
      return;
    }

    const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
    if (!Detector) {
      setMessage('This browser does not provide native QR decoding yet. Camera capture is unavailable; manual and hardware scanners still work.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setActive(true);
      setMessage('Point the camera at a FacilityOS QR label.');

      const detector = new Detector({ formats: ['qr_code'] });
      timerRef.current = setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const value = codes[0]?.rawValue?.trim();
          if (value) {
            onDetected(value);
            setMessage(`Detected: ${value}`);
            stop();
          }
        } catch {
          // A transient decode error should not stop the camera loop.
        }
      }, 450);
    } catch (error) {
      setMessage(error instanceof Error ? `Camera could not start: ${error.message}` : 'Camera could not start.');
      stop();
    }
  }

  function stop() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  }

  return (
    <div className="camera-scanner">
      <div className="camera-box">
        <video ref={videoRef} className={active ? 'camera-video active' : 'camera-video'} playsInline muted />
        {!active && <div className="camera-frame">QR</div>}
        {active && <div className="camera-guide" aria-hidden="true" />}
      </div>
      <div className="camera-controls">
        <button className="action action-featured" type="button" onClick={active ? stop : start}>
          {active ? 'Stop Camera' : 'Start Camera'}
        </button>
        <span>{message}</span>
      </div>
    </div>
  );
}
