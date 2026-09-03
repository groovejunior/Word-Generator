"use client";

import { useRef, useState } from "react";
import type { Recording } from "@/lib/useRecorder";
import type { Mode } from "@/lib/words";

export interface Rep {
  id: string;
  label: string;
  mode: Mode;
  spokenMs: number;
  recording: Recording | null;
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function SessionLog({ reps }: { reps: Rep[] }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  if (reps.length === 0) return null;

  function toggle(rep: Rep) {
    const audio = audioRef.current;
    if (!audio || !rep.recording) return;

    if (playingId === rep.id) {
      audio.pause();
      return;
    }

    audio.src = rep.recording.url;
    void audio
      .play()
      .then(() => setPlayingId(rep.id))
      .catch(() => setPlayingId(null));
  }

  return (
    <div className="w-full max-w-md">
      <h2 className="font-sans text-[11px] font-medium uppercase tracking-[0.14em] text-cloud-dark">
        This session
      </h2>

      <ul className="mt-3 divide-y divide-oat border-t border-oat">
        {reps.map((rep) => {
          const isPlaying = playingId === rep.id;
          return (
            <li
              key={rep.id}
              className="flex items-center gap-3 py-2.5 text-left"
            >
              {rep.recording ? (
                <button
                  type="button"
                  onClick={() => toggle(rep)}
                  aria-label={
                    isPlaying ? `Pause ${rep.label}` : `Play ${rep.label}`
                  }
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-oat text-ink transition-colors hover:border-clay hover:text-clay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
                >
                  {isPlaying ? (
                    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5">
                      <rect x="1" y="1" width="3.5" height="10" fill="currentColor" />
                      <rect x="7.5" y="1" width="3.5" height="10" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 12 12" className="ml-0.5 h-2.5 w-2.5">
                      <path d="M1 1 L11 6 L1 11 Z" fill="currentColor" />
                    </svg>
                  )}
                </button>
              ) : (
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-oat text-[10px] text-cloud"
                  title="No recording for this rep"
                >
                  &mdash;
                </span>
              )}

              <span className="min-w-0 flex-1 truncate font-display text-lg">
                {rep.label}
              </span>

              <span className="shrink-0 font-sans text-xs tabular-nums text-cloud-dark">
                {formatDuration(rep.spokenMs)}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 font-sans text-[11px] leading-relaxed text-cloud">
        Recordings stay on this device and are gone when you close the tab.
        Nothing is uploaded.
      </p>

      <audio
        ref={audioRef}
        onEnded={() => setPlayingId(null)}
        onPause={() => setPlayingId(null)}
        className="hidden"
      />
    </div>
  );
}
