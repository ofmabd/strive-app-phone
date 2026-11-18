import { useEffect, useState } from "react";
import { AppState, Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import type { TimerPreferences, WorkoutSession } from "./types";
import RestDurationSelector from "./RestDurationSelector";
import { exerciseName } from "./catalog";
import { adjustRest, changeTimerPreferences, exerciseRestSeconds, restDurationLabel, pauseRest, remainingRestMs, restClock, resumeRest, skipRest, startRest } from "./restTimer";
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
  const chip = (text: string, action: (current: WorkoutSession, instant: string) => WorkoutSession) => <Pressable accessibilityRole="button" disabled={disabled} style={timerStyles.action} onPress={() => act(action)}><Text style={timerStyles.actionText}>{text}</Text></Pressable>;
  return <View style={timerStyles.panel}>
    <View style={timerStyles.bar}>
      {!off ? <View style={timerStyles.countdown}>
        {hasRest && remaining > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Subtract 15 seconds from current rest" disabled={disabled} style={timerStyles.action} onPress={() => act((current, instant) => adjustRest(current, -15, instant))}><Text style={timerStyles.actionText}>−15s</Text></Pressable>}
        <Text style={timerStyles.clock} accessibilityLabel={`${Math.ceil((hasRest ? remaining : nextDuration * 1000) / 1000)} seconds of rest`}>{restClock(hasRest ? remaining : nextDuration * 1000)}</Text>
        {hasRest && remaining > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Add 15 seconds to current rest" disabled={disabled} style={timerStyles.action} onPress={() => act((current, instant) => adjustRest(current, 15, instant))}><Text style={timerStyles.actionText}>+15s</Text></Pressable>}
      </View> : <Text style={ui.caption}>Rest off</Text>}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: settings }} accessibilityLabel={`Rest timer settings. Mode: ${session.timer.mode}`} style={timerStyles.action} onPress={() => { Keyboard.dismiss(); setSettings((value) => !value); }}>
        <Text style={timerStyles.actionText}>{session.timer.mode === "automatic" ? "Auto" : session.timer.mode === "manual" ? "Manual" : "Off"} ⌄</Text>
      </Pressable>
    </View>
    {!off && <View style={timerStyles.bar}>
      <Text style={timerStyles.context} numberOfLines={1} accessibilityLiveRegion="polite">{!hasRest ? "Ready" : remaining === 0 ? "Rest complete" : paused ? "Paused" : "Resting"}{runningName ? ` · ${exerciseName(runningName.exerciseId, runningName.name)}` : ""}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, maxWidth: 210 }} contentContainerStyle={{ gap: 2 }}>
        {(!hasRest || remaining === 0) && chip("Start rest", (current, instant) => startRest(current, instant, undefined, selected?.id))}
        {hasRest && remaining > 0 && <>
          {chip(paused ? "Resume" : "Pause", paused ? resumeRest : pauseRest)}
          {chip("Skip", skipRest)}
          {chip("Restart", (current, instant) => startRest(current, instant, undefined, activeExercise?.id ?? selected?.id))}
        </>}
      </ScrollView>
    </View>}
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
      <Text style={ui.caption}>Next rest only. Mode changes end the current rest.</Text>
    </ScrollView>}
  </View>;
}
const timerStyles = StyleSheet.create({
  panel: { backgroundColor: "#E7E9DF", paddingHorizontal: 16, paddingVertical: 6, gap: 0, borderTopWidth: 1, borderTopColor: colors.line, width: "100%", maxWidth: 560, alignSelf: "center" },
  bar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 4 },
  countdown: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 2 },
  action: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, justifyContent: "center", alignItems: "center" },
  actionText: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  context: { color: colors.muted, fontSize: 12, flex: 1, minWidth: 40 },
  clock: { color: colors.ink, fontSize: 22, minWidth: 64, textAlign: "center", fontWeight: "600", fontVariant: ["tabular-nums"] },
});
