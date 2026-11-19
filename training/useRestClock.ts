import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import type { WorkoutSession } from "./types";
import { remainingRestMs } from "./restTimer";

// One display clock per screen. Persisted deadlines remain the source of truth.
export function useRestClock(session: WorkoutSession) {
  const focused = useIsFocused();
  const [now, setNow] = useState(Date.now);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      setForeground(next === "active"); setNow(Date.now());
    });
    return () => subscription.remove();
  }, []);
  const ticking = focused && foreground && session.restTimer?.status === "running" && remainingRestMs(session, now) > 0;
  const deadline = session.restTimer?.status === "running" ? session.restTimer.deadlineAt : undefined;
  useEffect(() => {
    setNow(Date.now());
    if (!ticking) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [ticking, deadline, focused, foreground]);
  return now;
}
