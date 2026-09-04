"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import SessionLog, { type Rep } from "@/components/SessionLog";
import TimerRing from "@/components/TimerRing";
import { useRecorder } from "@/lib/useRecorder";
import { useStats } from "@/lib/useStats";
import {
  createPicker,
  DEFAULT_TIERS,
  TIERS,
  type Draw,
  type Mode,
  type Picker,
  type Tier,
} from "@/lib/words";

const MODES: { id: Mode; label: string }[] = [
  { id: "single", label: "Word" },
  { id: "chain", label: "Chain" },
  { id: "distinction", label: "Pair" },
];

const DURATIONS = [
  { ms: 30_000, label: "30s" },
  { ms: 60_000, label: "60s" },
  { ms: 90_000, label: "90s" },
] as const;

function formatLabel(draw: Draw): string {
  if (draw.mode === "distinction") return `${draw.words[0]} / ${draw.words[1]}`;
  return draw.words.join(" · ");
}

function formatSpoken(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

function gapNote(draw: Draw): string | undefined {
  return draw.entries.find((entry) => entry.gap)?.gap;
}

export default function Trainer() {
  const recorder = useRecorder();
  const { stats, loaded, recordRep } = useStats();

  const [mode, setMode] = useState<Mode>("single");
  const [tiers, setTiers] = useState<Tier[]>(DEFAULT_TIERS);
  const [durationMs, setDurationMs] = useState(60_000);
  const [draw, setDraw] = useState<Draw | null>(null);
  const [reps, setReps] = useState<Rep[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [deadline, setDeadline] = useState<number | null>(null);

  const pickerRef = useRef<Picker | null>(null);
  const speakingRef = useRef(false);
  const busyRef = useRef(false);
  const startedAtRef = useRef(0);
  const activeDrawRef = useRef<Draw | null>(null);

  const redraw = useCallback((nextMode: Mode, nextTiers: Tier[]) => {
    if (!pickerRef.current) pickerRef.current = createPicker();
    setDraw(pickerRef.current.draw(nextMode, nextTiers));
  }, []);

  useEffect(() => {
    redraw(mode, tiers);
  }, [mode, tiers, redraw]);

  useEffect(() => {
    return () => {
      delete document.body.dataset.speaking;
    };
  }, []);

  const endSpeaking = useCallback(async () => {
    if (!speakingRef.current || busyRef.current) return;
    busyRef.current = true;
    speakingRef.current = false;

    const spokenMs = Date.now() - startedAtRef.current;
    const current = activeDrawRef.current;
    const recording = await recorder.stop();

    setSpeaking(false);
    setDeadline(null);
    delete document.body.dataset.speaking;

    if (current && spokenMs >= 1_000) {
      setReps((previous) => [
        {
          id: `rep-${Date.now()}`,
          label: formatLabel(current),
          mode: current.mode,
          spokenMs,
          recording,
        },
        ...previous,
      ]);
      recordRep(Math.round(spokenMs / 1000));
    }

    redraw(mode, tiers);
    busyRef.current = false;
  }, [mode, recordRep, recorder, redraw, tiers]);

  const startSpeaking = useCallback(async () => {
    if (speakingRef.current || busyRef.current || !draw) return;
    busyRef.current = true;
    activeDrawRef.current = draw;

    await recorder.start();

    speakingRef.current = true;
    startedAtRef.current = Date.now();
    setSpeaking(true);
    setDeadline(Date.now() + durationMs);
    document.body.dataset.speaking = "true";
    busyRef.current = false;
  }, [draw, durationMs, recorder]);

  const toggleSpeaking = useCallback(() => {
    if (speakingRef.current) {
      void endSpeaking();
      return;
    }
    void startSpeaking();
  }, [endSpeaking, startSpeaking]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space") return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      event.preventDefault();
      if (event.repeat) return;
      toggleSpeaking();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSpeaking]);

  function toggleTier(tier: Tier) {
    if (speaking) return;
    setTiers((current) => {
      if (current.includes(tier)) {
        if (current.length === 1) return current;
        return current.filter((item) => item !== tier);
      }
      return TIERS.filter((item) => current.includes(item) || item === tier);
    });
  }

  function skip() {
    if (speakingRef.current) return;
    redraw(mode, tiers);
  }

  const prompt = draw?.prompt ?? "";
  const note = draw ? gapNote(draw) : undefined;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-6 py-8 sm:px-8">
      <header className="flex items-baseline justify-between gap-4">
        <p className="font-sans text-[11px] font-medium uppercase tracking-[0.14em] text-cloud-dark">
          Word Trainer
        </p>
        <p
          className="font-sans text-[11px] tabular-nums text-cloud-dark"
          aria-live="polite"
        >
          {loaded && stats.totalReps > 0
            ? [
                stats.streakDays > 0
                  ? `${stats.streakDays}-day streak`
                  : null,
                `${stats.totalReps} ${stats.totalReps === 1 ? "rep" : "reps"}`,
                formatSpoken(stats.totalSeconds),
              ]
                .filter(Boolean)
                .join(" · ")
            : "C1 speaking practice"}
        </p>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center py-16 text-center">
        <div aria-live="polite" aria-atomic="true" className="w-full">
          {!draw ? (
            <p className="font-display text-3xl text-cloud">…</p>
          ) : draw.mode === "distinction" ? (
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-6">
              <h1 className="font-display text-5xl leading-none tracking-tight sm:text-7xl">
                {draw.words[0]}
              </h1>
              <span className="font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-cloud">
                vs
              </span>
              <h1 className="font-display text-5xl leading-none tracking-tight sm:text-7xl">
                {draw.words[1]}
              </h1>
            </div>
          ) : draw.mode === "chain" ? (
            <ul className="flex flex-col items-center gap-4">
              {draw.words.map((word) => (
                <li
                  key={word}
                  className="font-display text-4xl leading-none tracking-tight sm:text-6xl"
                >
                  {word}
                </li>
              ))}
            </ul>
          ) : (
            <h1 className="font-display text-5xl leading-none tracking-tight sm:text-7xl">
              {draw.words[0]}
            </h1>
          )}
        </div>

        <p className="mt-6 max-w-md font-sans text-sm leading-relaxed text-ink-soft">
          {prompt}
        </p>

        {note && !speaking ? (
          <p className="mt-3 max-w-md font-sans text-xs leading-relaxed text-cloud-dark">
            {note}
          </p>
        ) : null}

        <div className="mt-10 flex flex-col items-center gap-5">
          {speaking && deadline ? (
            <TimerRing
              deadline={deadline}
              durationMs={durationMs}
              onComplete={endSpeaking}
            />
          ) : (
            <button
              type="button"
              onClick={toggleSpeaking}
              className="flex h-24 w-24 items-center justify-center rounded-full border border-oat font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-ink transition-colors hover:border-clay hover:text-clay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
            >
              Speak
            </button>
          )}

          <p className="font-sans text-[11px] tracking-wide text-cloud">
            {speaking ? "Press Space to stop" : "Press Space to speak"}
          </p>

          {speaking ? (
            <button
              type="button"
              onClick={() => void endSpeaking()}
              className="font-sans text-[11px] uppercase tracking-[0.14em] text-cloud transition-colors hover:text-ivory focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
            >
              Stop early
            </button>
          ) : (
            <button
              type="button"
              onClick={skip}
              className="font-sans text-[11px] uppercase tracking-[0.14em] text-cloud transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay"
            >
              Another word
            </button>
          )}
        </div>

        {recorder.status === "denied" ? (
          <p className="mt-6 max-w-sm font-sans text-xs leading-relaxed text-cloud-dark">
            Microphone blocked — you can still practise, just without a
            recording.
          </p>
        ) : null}
        {recorder.status === "unsupported" ? (
          <p className="mt-6 max-w-sm font-sans text-xs leading-relaxed text-cloud-dark">
            This browser cannot record audio. The timer still works.
          </p>
        ) : null}
      </section>

      {!speaking ? (
        <footer className="flex flex-col items-center gap-8 pb-6">
          <div className="flex w-full max-w-md flex-col gap-4">
            <ControlRow label="Mode">
              {MODES.map((item) => (
                <Chip
                  key={item.id}
                  active={mode === item.id}
                  onClick={() => setMode(item.id)}
                >
                  {item.label}
                </Chip>
              ))}
            </ControlRow>

            <ControlRow label="Level">
              {TIERS.map((tier) => (
                <Chip
                  key={tier}
                  active={tiers.includes(tier)}
                  onClick={() => toggleTier(tier)}
                >
                  {tier}
                </Chip>
              ))}
            </ControlRow>

            <ControlRow label="Timer">
              {DURATIONS.map((item) => (
                <Chip
                  key={item.ms}
                  active={durationMs === item.ms}
                  onClick={() => setDurationMs(item.ms)}
                >
                  {item.label}
                </Chip>
              ))}
            </ControlRow>
          </div>

          <SessionLog reps={reps} />
        </footer>
      ) : null}
    </main>
  );
}

function ControlRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="shrink-0 font-sans text-[11px] font-medium uppercase tracking-[0.14em] text-cloud">
        {label}
      </span>
      <div className="flex flex-wrap justify-end gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full px-3 py-1 font-sans text-[11px] font-medium tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay ${
        active
          ? "bg-ink text-ivory"
          : "text-ink-soft hover:bg-ivory-medium"
      }`}
    >
      {children}
    </button>
  );
}
