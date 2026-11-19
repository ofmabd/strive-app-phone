import { useState } from "react";
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { TimerPreferences, WorkoutSession } from "./types";
import RestDurationSelector from "./RestDurationSelector";
import { exerciseName } from "./catalog";
import { adjustRest, changeExerciseRest, changeTimerPreferences, exerciseRestSeconds, restDurationLabel, pauseRest, remainingRestMs, restClock, resumeRest, skipRest, startRest, timerExercise } from "./restTimer";
import { colors, styles } from "./styles";
import { manualStyles as ui } from "./manualStyles";

type Props = { session: WorkoutSession; exerciseId: string; now: number; disabled: boolean; edit: (change: (session: WorkoutSession) => WorkoutSession) => void };
export default function RestTimer({ session, exerciseId, now, disabled, edit }: Props) {
  const [settings, setSettings] = useState(false);
  const exercise = session.exercises.find((item) => item.id === exerciseId)!;
  const name = exerciseName(exercise.exerciseId, exercise.name);
  const ownsRest = timerExercise(session)?.id === exerciseId;
  const remaining = ownsRest ? remainingRestMs(session, now) : 0;
  const paused = session.restTimer?.status === "paused";
  const off = session.timer.mode === "off";
  const modes: TimerPreferences["mode"][] = ["automatic", "manual", "off"];
  function act(change: (current: WorkoutSession, instant: string) => WorkoutSession) {
    Keyboard.dismiss();
    edit((current) => change(current, new Date().toISOString()));
  }
  const start = (current: WorkoutSession, instant: string) => startRest(current, instant, undefined, exerciseId);
  const chip = (text: string, action: (current: WorkoutSession, instant: string) => WorkoutSession, label = text) =>
    <Pressable accessibilityRole="button" accessibilityLabel={`${name}: ${label}`} disabled={disabled} style={timerStyles.action} onPress={() => act(action)}><Text style={timerStyles.actionText}>{text}</Text></Pressable>;
  return <View>
    <View style={timerStyles.bar}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: settings, disabled }} disabled={disabled}
        accessibilityLabel={`${name} rest settings, ${restDurationLabel(exerciseRestSeconds(session, exerciseId))}, ${session.timer.mode} mode`}
        style={timerStyles.setting} onPress={() => { Keyboard.dismiss(); setSettings(true); }}>
        <Text style={timerStyles.settingText}>Rest · {off ? "Off" : restDurationLabel(exerciseRestSeconds(session, exerciseId))} ⌄</Text>
      </Pressable>
      {ownsRest && !off && <Text style={timerStyles.clock} accessibilityLabel={`${name}, ${paused && remaining > 0 ? "paused, " : ""}${Math.ceil(remaining / 1000)} seconds remaining`}>{remaining > 0 ? `${paused ? "Ⅱ " : ""}${restClock(remaining)}` : "Rest complete"}</Text>}
      {!off && remaining === 0 && session.timer.mode === "manual" && chip("Start", start, "Start rest")}
    </View>
    {ownsRest && remaining > 0 && !off && <View style={timerStyles.controls}>
      {chip("−15s", (current, instant) => adjustRest(current, -15, instant), "Subtract 15 seconds")}
      {chip("+15s", (current, instant) => adjustRest(current, 15, instant), "Add 15 seconds")}
      {chip(paused ? "Resume" : "Pause", paused ? resumeRest : pauseRest)}
      {chip("Skip", skipRest)}
    </View>}
    <Modal transparent visible={settings} onRequestClose={() => setSettings(false)} animationType="fade">
      <View style={timerStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close rest settings" onPress={() => setSettings(false)} />
        <ScrollView style={timerStyles.scroll} contentContainerStyle={timerStyles.sheet} accessibilityViewIsModal keyboardShouldPersistTaps="handled">
          <Text style={styles.heading} accessibilityRole="header">Rest settings</Text>
          <Text style={ui.caption}>{name} · next rest</Text>
          <RestDurationSelector name={name} value={exerciseRestSeconds(session, exerciseId)} disabled={disabled}
            onChange={(seconds) => act((current, instant) => changeExerciseRest(current, exerciseId, seconds, instant))} />
          {!off && chip(ownsRest ? "Restart rest" : "Start rest", start)}
          <Text style={ui.caption}>Workout mode · changing mode ends the current rest</Text>
          <View style={ui.chips} accessibilityRole="radiogroup" accessibilityLabel="Workout rest timer mode">
            {modes.map((mode) => <Pressable key={mode} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: session.timer.mode === mode, disabled }}
              style={[ui.chip, session.timer.mode === mode && styles.selected]} onPress={() => act((current, instant) => changeTimerPreferences(current, { ...current.timer, mode }, instant))}>
              <Text style={styles.buttonText}>{mode === "automatic" ? "Automatic" : mode === "manual" ? "Manual" : "Off"}</Text>
            </Pressable>)}
          </View>
          <Text style={ui.caption}>Workout default · next rest</Text>
          <RestDurationSelector name="Workout default" value={session.timer.durationSeconds} disabled={disabled}
            onChange={(durationSeconds) => act((current, instant) => changeTimerPreferences(current, { ...current.timer, durationSeconds }, instant))} />
          <Pressable accessibilityRole="button" style={styles.button} onPress={() => setSettings(false)}><Text style={styles.buttonText}>Done</Text></Pressable>
        </ScrollView>
      </View>
    </Modal>
  </View>;
}
const timerStyles = StyleSheet.create({
  bar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 4 },
  setting: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4, flexShrink: 1 },
  settingText: { color: colors.muted, fontSize: 13, fontWeight: "500" },
  controls: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 4, backgroundColor: "#E4E9DC", borderRadius: 6 },
  action: { minHeight: 44, minWidth: 44, paddingHorizontal: 10, justifyContent: "center", alignItems: "center" },
  actionText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  clock: { color: colors.ink, fontSize: 16, paddingHorizontal: 4, fontWeight: "600", fontVariant: ["tabular-nums"] },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 20 },
  scroll: { maxHeight: "85%", width: "100%", maxWidth: 480, alignSelf: "center" },
  sheet: { backgroundColor: colors.paper, padding: 16, borderRadius: 12, gap: 10 },
});
