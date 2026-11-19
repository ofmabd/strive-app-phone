import { useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import type { TimerPreferences, WorkoutSession } from "./types";
import RestDurationSelector from "./RestDurationSelector";
import WorkoutSheet from "./WorkoutSheet";
import { exerciseName } from "./catalog";
import { adjustRest, changeExerciseRest, changeTimerPreferences, exerciseRestSeconds, restDurationLabel, pauseRest, remainingRestMs, restClock, resumeRest, skipRest, startRest, timerExercise } from "./restTimer";
import { colors, styles } from "./styles";
import { manualStyles as ui } from "./manualStyles";

type Edit = (change: (session: WorkoutSession) => WorkoutSession) => void;
type Props = { session: WorkoutSession; exerciseId?: string; now: number; disabled: boolean; edit: Edit };
export function ExerciseRestControl({ session, exerciseId, disabled, edit }: Omit<Props, "now"> & { exerciseId: string }) {
  const [open, setOpen] = useState(false);
  const exercise = session.exercises.find(item => item.id === exerciseId)!;
  const name = exerciseName(exercise.exerciseId, exercise.name);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${name} rest duration settings`} accessibilityState={{ expanded: open, disabled }}
      disabled={disabled} style={timerStyles.action} onPress={() => { Keyboard.dismiss(); setOpen(true); }}>
      <Text style={timerStyles.secondary}>Rest · {restDurationLabel(exerciseRestSeconds(session, exerciseId))} ⌄</Text>
    </Pressable>
    <WorkoutSheet visible={open} close={() => setOpen(false)} label="exercise rest settings">
      <Text style={styles.heading}>{name}</Text><Text style={ui.caption}>Rest duration · next rest</Text>
      <RestDurationSelector name={name} value={exerciseRestSeconds(session, exerciseId)} disabled={disabled}
        onChange={seconds => edit(current => changeExerciseRest(current, exerciseId, seconds, new Date().toISOString()))} />
      <Pressable accessibilityRole="button" style={styles.button} onPress={() => setOpen(false)}><Text style={styles.buttonText}>Done</Text></Pressable>
    </WorkoutSheet>
  </>;
}
export default function RestTimer({ session, exerciseId, now, disabled, edit }: Props) {
  const [settings, setSettings] = useState(false);
  const owner = timerExercise(session);
  const selected = session.exercises.find(item => item.id === exerciseId) ?? session.exercises[0];
  const remaining = remainingRestMs(session, now);
  const active = remaining > 0;
  const paused = session.restTimer?.status === "paused";
  const off = session.timer.mode === "off";
  const source = active ? owner : selected;
  const name = source ? exerciseName(source.exerciseId, source.name) : "Rest";
  const modes: TimerPreferences["mode"][] = ["automatic", "manual", "off"];
  function act(change: (current: WorkoutSession, instant: string) => WorkoutSession) {
    Keyboard.dismiss(); edit(current => change(current, new Date().toISOString()));
  }
  const start = (current: WorkoutSession, instant: string) => startRest(current, instant, undefined, source?.id);
  const action = (text: string, change: (current: WorkoutSession, instant: string) => WorkoutSession, label = text) =>
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} style={timerStyles.action} onPress={() => act(change)}><Text style={timerStyles.actionText}>{text}</Text></Pressable>;
  const settingsButton = <Pressable accessibilityRole="button" accessibilityLabel="Workout rest timer settings" accessibilityState={{ expanded: settings, disabled }} disabled={disabled}
    style={timerStyles.action} onPress={() => { Keyboard.dismiss(); setSettings(true); }}><Text style={timerStyles.actionText}>···</Text></Pressable>;
  return <View testID="workout-rest-timer" style={timerStyles.panel}>
    {active && !off && <View testID="rest-countdown-row" style={timerStyles.countdown}>
      <View style={timerStyles.left}>{action("−15s", (current, instant) => adjustRest(current, -15, instant), "Subtract 15 seconds")}</View>
      <Text style={timerStyles.clock} accessibilityLabel={`${Math.ceil(remaining / 1000)} seconds remaining${paused ? ", paused" : ""}`}>{restClock(remaining)}</Text>
      <View style={timerStyles.right}>{action("+15s", (current, instant) => adjustRest(current, 15, instant), "Add 15 seconds")}</View>
    </View>}
    <View style={timerStyles.bar}>
      <Text style={timerStyles.context} numberOfLines={1}>{off ? "Rest off" : active ? `${paused ? "Paused" : "Rest"} · ${name}` : `${session.restTimer ? "Rest complete" : `Rest · ${restDurationLabel(exerciseRestSeconds(session, selected?.id))}`}`}</Text>
      {!off && (active ? <>{action(paused ? "Resume" : "Pause", paused ? resumeRest : pauseRest)}{action("Skip", skipRest)}</>
        : selected && action("Start Rest", start))}
      {settingsButton}
    </View>
    <WorkoutSheet visible={settings} close={() => setSettings(false)} label="rest timer settings">
      <Text style={styles.heading}>Rest timer</Text>
      {!off && (session.restTimer && owner
        ? action("Restart rest", (current, instant) => startRest(current, instant, undefined, owner.id))
        : source && action("Start rest", start))}
      <Text style={ui.caption}>Workout mode · changing mode ends current rest</Text>
      <View style={ui.chips} accessibilityRole="radiogroup" accessibilityLabel="Workout rest timer mode">
        {modes.map(mode => <Pressable key={mode} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked: session.timer.mode === mode, disabled }}
          style={[ui.chip, session.timer.mode === mode && styles.selected]} onPress={() => act((current, instant) => changeTimerPreferences(current, { ...current.timer, mode }, instant))}>
          <Text style={styles.buttonText}>{mode === "automatic" ? "Automatic" : mode === "manual" ? "Manual" : "Off"}</Text>
        </Pressable>)}
      </View>
      <Text style={ui.caption}>Workout default · next rest</Text>
      <RestDurationSelector name="Workout default" value={session.timer.durationSeconds} disabled={disabled}
        onChange={durationSeconds => act((current, instant) => changeTimerPreferences(current, { ...current.timer, durationSeconds }, instant))} />
      <Pressable accessibilityRole="button" style={styles.button} onPress={() => setSettings(false)}><Text style={styles.buttonText}>Done</Text></Pressable>
    </WorkoutSheet>
  </View>;
}
const timerStyles = StyleSheet.create({
  panel: { paddingHorizontal: 16, paddingVertical: 2, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.paper, width: "100%", maxWidth: 560, alignSelf: "center" },
  countdown: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  left: { flex: 1, alignItems: "flex-end" }, right: { flex: 1, alignItems: "flex-start" },
  clock: { minWidth: 96, textAlign: "center", color: colors.ink, fontSize: 24, fontWeight: "600", fontVariant: ["tabular-nums"] },
  bar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 },
  context: { flex: 1, minWidth: 40, color: colors.muted, fontSize: 12 },
  secondary: { color: colors.muted, fontSize: 13 },
  action: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, justifyContent: "center", alignItems: "center", alignSelf: "flex-start" },
  actionText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
});
