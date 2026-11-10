import { useEffect, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import type { TimerPreferences, WorkoutSession } from "./types";
import { changeTimerPreferences, pauseRest, remainingRestMs, restClock, resumeRest, skipRest, startRest } from "./restTimer";
import { colors, styles } from "./styles";
import { manualStyles as ui } from "./manualStyles";

type Props = { session: WorkoutSession; disabled: boolean; edit: (change: (session: WorkoutSession) => WorkoutSession) => void };
export default function RestTimer({ session, disabled, edit }: Props) {
  const focused = useIsFocused();
  const [now, setNow] = useState(Date.now);
  const [foreground, setForeground] = useState(AppState.currentState !== "background" && AppState.currentState !== "inactive");
  const [settings, setSettings] = useState(false);
  const [duration, setDuration] = useState(String(session.timer.durationSeconds));
  const [durationError, setDurationError] = useState(false);
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
  function applyDuration() {
    const value = Number(duration);
    if (!/^\d+$/.test(duration.trim()) || !Number.isSafeInteger(value) || value < 1 || !Number.isSafeInteger(value * 1000) || !Number.isFinite(new Date(Date.now() + value * 1000).getTime())) {
      setDurationError(true); return;
    }
    setDurationError(false);
    act((current, instant) => changeTimerPreferences(current, { ...current.timer, durationSeconds: value }, instant));
  }
  return <View style={timerStyles.panel}>
    <View style={timerStyles.header}>
      <Text style={styles.heading} accessibilityRole="header">Rest timer</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: settings }} accessibilityLabel="Rest timer settings" style={ui.chip} onPress={() => setSettings((value) => !value)}>
        <Text style={styles.buttonText}>{session.timer.mode === "automatic" ? "Automatic" : session.timer.mode === "manual" ? "Manual" : "Off"} · Settings</Text>
      </Pressable>
    </View>
    {settings && <View style={styles.section}>
      <View style={ui.chips} accessibilityRole="radiogroup" accessibilityLabel="Rest timer mode">
        {modes.map((mode) => <Pressable key={mode} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: session.timer.mode === mode, disabled }}
          style={[ui.chip, session.timer.mode === mode && styles.selected]} onPress={() => act((current, instant) => changeTimerPreferences(current, { ...current.timer, mode }, instant))}>
          <Text style={styles.buttonText}>{mode === "automatic" ? "Automatic" : mode === "manual" ? "Manual" : "Off"}</Text>
        </Pressable>)}
      </View>
      <Text style={ui.caption}>Automatic starts after each completed set. Manual starts only when you choose. Changing mode ends the current rest.</Text>
      <Text style={ui.caption}>Rest duration in seconds</Text>
      <TextInput style={ui.input} accessibilityLabel="Rest duration in seconds" value={duration} onChangeText={setDuration} keyboardType="number-pad" editable={!disabled} />
      {durationError && <Text style={styles.error} accessibilityRole="alert">Enter a positive whole number of seconds within the supported date range.</Text>}
      <Pressable accessibilityRole="button" disabled={disabled} style={[styles.button, styles.outline]} onPress={applyDuration}><Text style={styles.buttonText}>Apply duration</Text></Pressable>
      <Text style={ui.caption}>Default: 90 seconds. Longer rests are supported. Duration changes apply to the next start or restart in this workout.</Text>
    </View>}
    {!off && <>
      <Text style={ui.caption} accessibilityLiveRegion="polite">{!hasRest ? `Ready · ${restClock(session.timer.durationSeconds * 1000)}` : remaining === 0 ? "Rest complete" : paused ? "Paused" : "Resting"}</Text>
      {hasRest && <Text style={timerStyles.clock} accessibilityLabel={`${Math.ceil(remaining / 1000)} seconds of rest remaining`}>{restClock(remaining)}</Text>}
      <View style={ui.chips}>
        {(!hasRest || remaining === 0) && <Pressable accessibilityRole="button" disabled={disabled} style={styles.button} onPress={() => act(startRest)}><Text style={styles.buttonText}>Start rest</Text></Pressable>}
        {hasRest && remaining > 0 && <>
          <Pressable accessibilityRole="button" disabled={disabled} style={styles.button} onPress={() => act(paused ? resumeRest : pauseRest)}><Text style={styles.buttonText}>{paused ? "Resume rest" : "Pause rest"}</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={disabled} style={[styles.button, styles.outline]} onPress={() => act(skipRest)}><Text style={styles.buttonText}>Skip rest</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={disabled} style={[styles.button, styles.outline]} onPress={() => act(startRest)}><Text style={styles.buttonText}>Restart rest</Text></Pressable>
        </>}
      </View>
      <Text style={ui.caption}>Next rest: {restClock(session.timer.durationSeconds * 1000)}. Keep logging while it runs.</Text>
    </>}
  </View>;
}
const timerStyles = StyleSheet.create({
  panel: { backgroundColor: "#E7E9DF", borderRadius: 10, padding: 16, gap: 12 },
  header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  clock: { color: colors.ink, fontSize: 32, fontWeight: "600", fontVariant: ["tabular-nums"] },
});
