"use client";

import { useEffect, useRef, useState } from "react";

interface TimerRingProps {
  /** Absolute epoch-ms deadline. */
  deadline: number;
  durationMs: number;
  onComplete: () => void;
}

const RADIUS = 44;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function TimerRing({
  deadline,
  durationMs,
  onComplete,
}: TimerRingProps) {
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, deadline - Date.now()),
  );

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    let fired = false;
    setRemainingMs(Math.max(0, deadline - Date.now()));

    // Derived from an absolute deadline rather than accumulated ticks, so a
    // throttled background tab cannot make the countdown drift.
    const id = window.setInterval(() => {
      const left = Math.max(0, deadline - Date.now());
      setRemainingMs(left);
      if (left <= 0 && !fired) {
        fired = true;
        onCompleteRef.current();
      }
    }, 100);

    return () => window.clearInterval(id);
  }, [deadline]);

  const fraction = durationMs > 0 ? remainingMs / durationMs : 0;
  const seconds = Math.ceil(remainingMs / 1000);

  return (
    <div className="relative h-24 w-24" aria-hidden="true">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          className="opacity-20"
        />
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          stroke="var(--color-clay)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-3xl tabular-nums">
        {seconds}
      </span>
    </div>
  );
}
