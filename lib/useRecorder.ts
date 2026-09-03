"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderStatus = "idle" | "granted" | "denied" | "unsupported";

export interface Recording {
  id: string;
  url: string;
  mimeType: string;
  durationMs: number;
}

/**
 * iOS Safari only gained WebM support in 18.4, but every browser can play
 * Safari's mp4/AAC. Preferring mp4 therefore gives the widest playback
 * compatibility for clips recorded on any device.
 */
const PREFERRED_MIME_TYPES = [
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_MIME_TYPES.find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

export interface UseRecorder {
  status: RecorderStatus;
  isRecording: boolean;
  start: () => Promise<boolean>;
  stop: () => Promise<Recording | null>;
  releaseAll: () => void;
}

export function useRecorder(): UseRecorder {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [isRecording, setIsRecording] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const resolveStopRef = useRef<((r: Recording | null) => void) | null>(null);
  const urlsRef = useRef<string[]>([]);
  const counterRef = useRef(0);

  const releaseAll = useCallback(() => {
    for (const url of urlsRef.current) URL.revokeObjectURL(url);
    urlsRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      for (const url of urlsRef.current) URL.revokeObjectURL(url);
      urlsRef.current = [];
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  /**
   * Requested on the first speaking transition rather than on mount, so simply
   * opening the app never triggers a permission prompt. The stream is then
   * reused for every later rep so you are only asked once.
   */
  const ensureStream = useCallback(async (): Promise<MediaStream | null> => {
    if (streamRef.current) return streamRef.current;

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setStatus("unsupported");
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setStatus("granted");
      return stream;
    } catch {
      setStatus("denied");
      return null;
    }
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    const stream = await ensureStream();
    if (!stream) return false;

    try {
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );

      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];

        const resolve = resolveStopRef.current;
        resolveStopRef.current = null;
        if (!resolve) return;

        if (blob.size === 0) {
          resolve(null);
          return;
        }

        const url = URL.createObjectURL(blob);
        urlsRef.current.push(url);
        counterRef.current += 1;

        resolve({
          id: `rec-${counterRef.current}`,
          url,
          mimeType: type,
          durationMs: Date.now() - startedAtRef.current,
        });
      };

      recorder.start();
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setIsRecording(true);
      return true;
    } catch {
      setStatus("unsupported");
      return false;
    }
  }, [ensureStream]);

  const stop = useCallback((): Promise<Recording | null> => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    setIsRecording(false);

    if (!recorder || recorder.state === "inactive") {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      resolveStopRef.current = resolve;
      recorder.stop();
    });
  }, []);

  return { status, isRecording, start, stop, releaseAll };
}
