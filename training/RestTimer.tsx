import { useEffect, useState } from "react";
import { AppState, Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import type { TimerPreferences, WorkoutSession } from "./types";
import RestDurationSelector from "./RestDurationSelector";
import { exerciseName } from "./catalog";
import { changeTimerPreferences, exerciseRestSeconds, restDurationLabel, pauseRest, remainingRestMs, restClock, resumeRest, skipRest, startRest } from "./restTimer";
import { colors, styles } from "./styles";
import { manualStyles as ui } from "./manualStyles";

type Props = { session: WorkoutSession; exerciseId?: string; disabled: boolean; edit: (change: (session: WorkoutSession) => WorkoutSession) => void };
export default function RestTimer({ session, exerciseId, disabled, edit }: Props) {
  const focused = useIsFocused();
  const [now, setNow] = useState(Date.now);
  const [foreground, setForeground] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  const [settings, setSettings] = useState(false);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      setForeground(next === "active"); setNow(Date.now());
    });
    return () => subscription.remove();
  }, []);
  const remaining = remainingRestMs(session, now);
  const ticking = focused && foreground && session.restTimer?.status === "running" && remaining > 0 && session.timer.mode !== "off";
  const deadline = session.restTimer?.status === "running" ? session.restTimer.deadlineAt : undefined;
  useEffect(() => {
    setNow(Date.now());
    if (!ticking) return;
    // Refresh pixels only. The persisted deadline, not interval counts, is truth.
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [ticking, deadline, focused, foreground]);
  const paused = session.restTimer?.status === "paused" && remaining > 0;
  const hasRest = !!session.restTimer;
  const off = session.timer.mode === "off";
  const modes: TimerPreferences["mode"][] = ["automatic", "manual", "off"];
  function act(change: (current: WorkoutSession, instant: string) => WorkoutSession) {
    edit((current) => change(current, new Date().toISOString())); setNow(Date.now());
  }
  const selected = session.exercises.find((item) => item.id === exerciseId) ?? session.exercises[0];
  const activeExercise = session.exercises.find((item) => item.id === session.restTimer?.exerciseId)
    ?? session.exercises.find((item) => item.sets.some((set) => set.id === session.restTimer?.triggerSetId));
  const nextDuration = exerciseRestSeconds(session, selected?.id);
  const runningName = hasRest ? activeExercise : selected;
  const chip = (text: string, action: (current: WorkoutSession, instant: string) => WorkoutSession) => <Pressable accessibilityRole="button" disabled={disabled} style={ui.chip} onPress={() => act(action)}><Text style={styles.buttonText}>{text}</Text></Pressable>;
  return <View style={timerStyles.panel}>
    <View style={timerStyles.header}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={ui.caption} numberOfLines={2}>{off ? "Rest off" : runningName ? exerciseName(runningName.exerciseId, runningName.name) : "Rest"}</Text>
        {!off && <Text style={timerStyles.clock} accessibilityLabel={`${Math.ceil((hasRest ? remaining : nextDuration * 1000) / 1000)} seconds of rest`}>{restClock(hasRest ? remaining : nextDuration * 1000)}</Text>}
      </View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: settings }} accessibilityLabel="Rest timer settings" style={ui.chip} onPress={() => { Keyboard.dismiss(); setSettings((value) => !value); }}>
        <Text style={styles.buttonText}>{session.timer.mode === "automatic" ? "Auto" : session.timer.mode === "manual" ? "Manual" : "Off"} · Settings</Text>
      </Pressable>
    </View>
    {!off && <>
      <Text style={ui.caption} accessibilityLiveRegion="polite">{!hasRest ? "Ready" : remaining === 0 ? "Rest complete" : paused ? "Paused" : "Resting"}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {(!hasRest || remaining === 0) && chip("Start rest", (current, instant) => startRest(current, instant, undefined, selected?.id))}
        {hasRest && remaining > 0 && <>
          {chip(paused ? "Resume" : "Pause", paused ? resumeRest : pauseRest)}
          {chip("Skip", skipRest)}
          {chip("Restart", (current, instant) => startRest(current, instant, undefined, activeExercise?.id ?? selected?.id))}
        </>}
      </ScrollView>
    </>}
    {settings && <ScrollView style={{ maxHeight: 160 }} contentContainerStyle={{ gap: 10 }} nestedScrollEnabled>
      <View style={ui.chips} accessibilityRole="radiogroup" accessibilityLabel="Rest timer mode">
        {modes.map((mode) => <Pressable key={mode} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: session.timer.mode === mode, disabled }}
          style={[ui.chip, session.timer.mode === mode && styles.selected]} onPress={() => act((current, instant) => changeTimerPreferences(current, { ...current.timer, mode }, instant))}>
          <Text style={styles.buttonText}>{mode === "automatic" ? "Automatic" : mode === "manual" ? "Manual" : "Off"}</Text>
        </Pressable>)}
      </View>
      <Text style={ui.caption}>Workout default · {restDurationLabel(session.timer.durationSeconds)}</Text>
      <RestDurationSelector name="Workout default" value={session.timer.durationSeconds} disabled={disabled}
        onChange={(durationSeconds) => act((current, instant) => changeTimerPreferences(current, { ...current.timer, durationSeconds }, instant))} />
      <Text style={ui.caption}>Each exercise can override this default. Duration edits apply to the next rest; changing mode ends the current rest.</Text>
    </ScrollView>}
  </View>;
}
const timerStyles = StyleSheet.create({
  panel: { backgroundColor: "#E7E9DF", paddingHorizontal: 20, paddingVertical: 10, gap: 4, borderTopWidth: 1, borderTopColor: colors.line, width: "100%", maxWidth: 560, alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  clock: { color: colors.ink, fontSize: 24, fontWeight: "600", fontVariant: ["tabular-nums"] },
});
