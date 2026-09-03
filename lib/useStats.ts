"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "word-trainer:stats:v1";

export interface Stats {
  streakDays: number;
  totalSeconds: number;
  totalReps: number;
  /** Local calendar day of the last completed rep, as YYYY-MM-DD. */
  lastPracticeDate: string | null;
}

const EMPTY: Stats = {
  streakDays: 0,
  totalSeconds: 0,
  totalReps: 0,
  lastPracticeDate: null,
};

/** Local calendar day, not UTC — a streak should follow the user's midnight. */
function dayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDayKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  // Midday avoids daylight-saving transitions shifting the day.
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

function daysApart(from: string, to: string): number | null {
  const a = parseDayKey(from);
  const b = parseDayKey(to);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function isStats(value: unknown): value is Stats {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Stats>;
  return (
    typeof candidate.streakDays === "number" &&
    typeof candidate.totalSeconds === "number" &&
    typeof candidate.totalReps === "number"
  );
}

/**
 * A streak that survives a missed day is not a streak, so it is recomputed on
 * load rather than trusted from storage: practising today or yesterday keeps
 * the stored count, anything older resets the display to zero.
 */
function reconcileOnLoad(stored: Stats): Stats {
  if (!stored.lastPracticeDate) return { ...stored, streakDays: 0 };
  const gap = daysApart(stored.lastPracticeDate, dayKey());
  if (gap === null || gap > 1) return { ...stored, streakDays: 0 };
  return stored;
}

export interface UseStats {
  stats: Stats;
  /** True once localStorage has been read, so the UI can avoid a flash of zeros. */
  loaded: boolean;
  recordRep: (spokenSeconds: number) => void;
}

export function useStats(): UseStats {
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isStats(parsed)) setStats(reconcileOnLoad(parsed));
      }
    } catch {
      // Private browsing or a corrupted value: fall back to empty stats.
    }
    setLoaded(true);
  }, []);

  const recordRep = useCallback((spokenSeconds: number) => {
    setStats((previous) => {
      const today = dayKey();
      const gap = previous.lastPracticeDate
        ? daysApart(previous.lastPracticeDate, today)
        : null;

      let streakDays: number;
      if (gap === 0) {
        streakDays = Math.max(1, previous.streakDays);
      } else if (gap === 1) {
        streakDays = previous.streakDays + 1;
      } else {
        streakDays = 1;
      }

      const next: Stats = {
        streakDays,
        totalSeconds: previous.totalSeconds + Math.max(0, spokenSeconds),
        totalReps: previous.totalReps + 1,
        lastPracticeDate: today,
      };

      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Stats are a nicety; never let a storage failure break a rep.
      }

      return next;
    });
  }, []);

  return { stats, loaded, recordRep };
}
