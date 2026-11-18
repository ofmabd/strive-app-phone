import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { usePreventRemove } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { trainingStore } from "../appStores";
import type { TrainStackParamList } from "./navigationTypes";
import type { TrainingData, WorkoutSession } from "./types";
import { createSessionAutosave } from "./autosave";
import { exerciseName } from "./catalog";
import { setLabels } from "./setTypes";
import SetTypeControl from "./SetTypeControl";
import RestDurationSelector from "./RestDurationSelector";
import { changeExerciseRest, exerciseRestSeconds, restDurationLabel } from "./restTimer";
import { addExercise, changeSetType, addSet, displayWeight, editSet, finishSummary, previousPerformance, removeExercise, removeSet, toggleSet } from "./manual";
import { moveExercise } from "./workoutPolish";
import ExerciseActions from "./ExerciseActions";
import RestTimer from "./RestTimer";
import ExercisePicker from "./ExercisePicker";
import { styles } from "./styles";
import { manualStyles as ui } from "./manualStyles";

type Props = NativeStackScreenProps<TrainStackParamList, "ResumeWorkout">;
export default function ActiveWorkoutScreen({ navigation, route }: Props) {
  const [data, setData] = useState<TrainingData | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setError(false); setData(null);
    void trainingStore.load().then((loaded) => { if (active) setData(loaded); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [route.params.sessionId, retry]);
  const session = data?.sessions.find((item) => item.id === route.params.sessionId);
  if (session && (session.status === "active" || session.status === "draft") && data) {
    return <SessionEditor key={session.id} initial={session} data={data} navigation={navigation} />;
  }
  return <SafeAreaView edges={["left", "right"]} style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}>
      {error ? <>
        <Text style={styles.error} accessibilityRole="alert">Workout could not be loaded. Saved data has not been reset.</Text>
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => setRetry((value) => value + 1)}><Text style={styles.buttonText}>Retry loading</Text></Pressable>
      </> : !data ? <ActivityIndicator accessibilityLabel="Loading saved workout" /> : <>
        <Text style={styles.title}>{session?.status === "completed" ? "Workout already finished" : "No unfinished workout found"}</Text>
        <Text style={styles.body}>No session has been changed. Return to Train to see your saved progress.</Text>
      </>}
      <Pressable accessibilityRole="button" style={[styles.button, styles.outline]} onPress={() => navigation.popTo("TrainHome")}><Text style={styles.buttonText}>Back to Train</Text></Pressable>
    </ScrollView>
  </SafeAreaView>;
}

function SessionEditor({ initial, data, navigation }: { initial: WorkoutSession; data: TrainingData; navigation: Props["navigation"] }) {
  const draft = useMemo(() => createSessionAutosave(initial, (session) => trainingStore.saveSession(session)), [initial]);
  const state = useSyncExternalStore(draft.subscribe, draft.getSnapshot, draft.getSnapshot);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initial.exercises.slice(0, 1).map((item) => item.id)));
  const [picker, setPicker] = useState(false);
  const [restExerciseId, setRestExerciseId] = useState(initial.exercises[0]?.id);
  const [restPicker, setRestPicker] = useState<string | null>(null);
  const [catalog, setCatalog] = useState(data.exercises);
  const [confirming, setConfirming] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [pendingFinish, setPendingFinish] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const finishingRef = useRef(false);
  const pendingRef = useRef(false);
  const confirmingRef = useRef(false);
  const insets = useSafeAreaInsets();
  const unit = data.profile?.preferredWeightUnit ?? "kg";
  const blocked = confirming || finishing || pendingFinish;
  usePreventRemove(state.dirty || finishing, ({ data: event }) => {
    if (finishingRef.current) {
      Alert.alert("Finishing workout", "Wait for persistence verification before leaving.");
      return;
    }
    void draft.flush().then(() => navigation.dispatch(event.action)).catch(() => {
      Alert.alert("Edits are not saved", "Your latest edits are still on this screen. Retry saving before leaving.");
    });
  });
  function edit(change: (session: WorkoutSession) => WorkoutSession) {
    if (finishingRef.current || pendingRef.current || confirmingRef.current) return;
    try { draft.edit(change); } catch (cause) {
      Alert.alert("Check this set", cause instanceof Error ? cause.message : "The set could not be changed.");
    }
  }
  async function finish() {
    if (finishingRef.current) return;
    finishingRef.current = true; setFinishing(true); setFinishError(null);
    try {
      await draft.flush();
      pendingRef.current = true; setPendingFinish(true);
      const saved = draft.getSnapshot().session;
      await trainingStore.finishSession(saved.id, saved.updatedAt, new Date().toISOString());
      finishingRef.current = false; setFinishing(false);
      navigation.replace("WorkoutSummary", { sessionId: saved.id });
    } catch (cause) {
      setFinishError(cause instanceof Error ? cause.message : "Completion could not be verified.");
    } finally { finishingRef.current = false; setFinishing(false); }
  }
  function confirmFinish() {
    if (blocked || confirmingRef.current || finishingRef.current || pendingRef.current) return;
    const summary = finishSummary(draft.getSnapshot().session);
    if (!summary.canFinish) {
      Alert.alert("No completed sets", "Complete at least one set before finishing this workout.");
      return;
    }
    confirmingRef.current = true; setConfirming(true);
    Alert.alert("Finish workout?", `${summary.completed} completed sets\n${summary.unfinished} unfinished sets\n\n${summary.unfinished ? "Finish early and keep unfinished sets in the session history?" : "Save this workout as completed?"}`, [
      { text: "Keep logging", style: "cancel", onPress: () => { confirmingRef.current = false; setConfirming(false); } },
      { text: summary.unfinished ? "Finish early" : "Finish workout", onPress: () => { confirmingRef.current = false; setConfirming(false); void finish(); } },
    ], { cancelable: false });
  }
  const summary = finishSummary(state.session);
  return <SafeAreaView edges={["left", "right"]} style={styles.screen}>
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={insets.top + 44}>
      <ScrollView contentContainerStyle={[styles.content, activeStyles.content]} keyboardShouldPersistTaps="handled">
        <View style={activeStyles.section}>
          <Text style={[styles.title, activeStyles.title]} accessibilityRole="header">{state.session.name}</Text>
          <Text style={state.error ? styles.error : ui.saved} accessibilityLiveRegion="polite">
            {state.error ? `Not saved: ${state.error} Latest edits are kept on this screen. Keep the app open and retry.` : state.dirty || state.saving ? "Saving edits…" : "Saved"}
          </Text>
          {state.error && <Pressable accessibilityRole="button" disabled={finishing} style={styles.button} onPress={() => { void draft.flush().catch(() => {}); }}><Text style={styles.buttonText}>Retry saving edits</Text></Pressable>}
        </View>
        {state.session.exercises.length === 0 && <Text style={styles.body}>No exercises remain. Add an exercise to continue; this unfinished workout does not count toward consistency.</Text>}
        {state.session.exercises.map((movement, exerciseIndex) => {
          const open = expanded.has(movement.id);
          const name = exerciseName(movement.exerciseId, movement.name);
          const labels = setLabels(movement.sets);
          const previous = previousPerformance(data.sessions, movement.exerciseId, state.session.id);
          return <View key={movement.id} style={[ui.exercise, activeStyles.exercise]}>
            <View style={activeStyles.cardHeader}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${name}, ${open ? "collapse" : "expand"}`}
              style={[ui.exerciseHeader, activeStyles.exerciseHeader]} onPress={() => { setRestExerciseId(movement.id); setExpanded((items) => { const next = new Set(items); if (open) next.delete(movement.id); else next.add(movement.id); return next; }); }}>
              <Text style={[styles.heading, activeStyles.exerciseName]}>{name} {open ? "−" : "+"}</Text>
              <Text style={activeStyles.caption}>{movement.sets.filter((set) => set.completed).length} / {movement.sets.length} sets complete</Text>
            </Pressable>
              <ExerciseActions name={name} disabled={blocked} first={exerciseIndex === 0} last={exerciseIndex === state.session.exercises.length-1}
                move={(direction) => edit(current => moveExercise(current,movement.id,direction,new Date().toISOString()))}
                remove={() => edit(current => removeExercise(current,movement.id,new Date().toISOString()))} />
            </View>
            {open && <>
              {previous.length > 0 && <Text style={ui.caption}>Previous: {previous.map((set) => `${displayWeight(set.weightKg, unit)} × ${set.reps}`).join("; ")}</Text>}
              <Pressable accessibilityRole="button" disabled={blocked} accessibilityState={{ expanded: restPicker === movement.id }} style={activeStyles.inlineAction}
                onPress={() => { setRestExerciseId(movement.id); setRestPicker((id) => id === movement.id ? null : movement.id); }}>
                <Text style={activeStyles.actionText}>Rest · {restDurationLabel(exerciseRestSeconds(state.session, movement.id))}</Text>
              </Pressable>
              {restPicker === movement.id && <>
                <RestDurationSelector name={name} value={exerciseRestSeconds(state.session, movement.id)} disabled={blocked}
                  onChange={(seconds) => edit((current) => changeExerciseRest(current, movement.id, seconds, new Date().toISOString()))} />
                <Text style={ui.caption}>Applies to the next rest.</Text>
              </>}
              <View style={[ui.setRow, activeStyles.setRow]} accessible accessibilityLabel="Columns: Set, Weight, Reps, Complete">
                <Text style={{width:44}}>Set</Text><Text style={ui.field}>Weight</Text><Text style={ui.field}>Reps</Text><Text style={{width:44}}>Done</Text>
              </View>
              {movement.sets.map((set, index) => <View key={set.id} style={[ui.set, activeStyles.set]}>
                <View style={[ui.setRow, activeStyles.setRow]}>
                  <SetTypeControl compact set={set} label={labels[index]} disabled={blocked}
                    onChange={(type) => edit((current) => changeSetType(current, movement.id, set.id, type, new Date().toISOString()))} onRemove={() => edit(current => removeSet(current,movement.id,set.id,new Date().toISOString()))} />
                  <View style={ui.field}>
                    <TextInput style={[ui.input, activeStyles.input]} value={set.draft.weight} placeholder={set.draft.weightUnit} placeholderTextColor="#515C5F" keyboardType="decimal-pad" editable={!blocked} onFocus={() => setRestExerciseId(movement.id)}
                      accessibilityLabel={`${name}, set ${labels[index]}, row ${index + 1}, weight in ${set.draft.weightUnit}`}
                      onChangeText={(text) => edit((current) => editSet(current, movement.id, set.id, "weight", text, new Date().toISOString()))} />
                  </View>
                  <View style={ui.field}>
                    <TextInput style={[ui.input, activeStyles.input]} value={set.draft.reps} keyboardType="number-pad" editable={!blocked} onFocus={() => setRestExerciseId(movement.id)}
                      accessibilityLabel={`${name}, set ${labels[index]}, row ${index + 1}, reps`}
                      onChangeText={(text) => edit((current) => editSet(current, movement.id, set.id, "reps", text, new Date().toISOString()))} />
                  </View>
                  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: set.completed, disabled: blocked }} disabled={blocked}
                    accessibilityLabel={`${set.completed ? "Undo" : "Complete"} ${name} set ${labels[index]}, row ${index + 1}`}
                    style={[ui.check, activeStyles.check, set.completed && styles.selected, blocked && styles.disabled]}
                    onPress={() => { setRestExerciseId(movement.id); edit((current) => toggleSet(current, movement.id, set.id, new Date().toISOString())); }}><Text style={ui.checkText}>{set.completed ? "✓" : "○"}</Text></Pressable>
                </View>

              </View>)}
              <Pressable accessibilityRole="button" disabled={blocked} style={activeStyles.inlineAction} accessibilityLabel={`Add set to ${name}`}
                onPress={() => edit((current) => addSet(current, movement.id, unit, new Date().toISOString()))}><Text style={activeStyles.actionText}>+ Add Set</Text></Pressable>

            </>}
          </View>;
        })}
        {!pendingFinish && <Pressable accessibilityRole="button" disabled={blocked} accessibilityState={{ expanded: picker }} style={[styles.button, styles.outline]} onPress={() => setPicker((value) => !value)}>
          <Text style={styles.buttonText}>{picker ? "Close exercise library" : "Add exercises"}</Text>
        </Pressable>}
        {picker && !pendingFinish && <ExercisePicker saved={catalog} selected={state.session.exercises.map((item) => item.exerciseId)} disabled={blocked}
          onCreated={(exercise) => setCatalog((items) => [...items, exercise])}
          onChoose={(exercise) => edit((current) => {
            const next = addExercise(current, exercise, unit, new Date().toISOString());
            setExpanded((items) => new Set([...items, next.exercises[next.exercises.length - 1].id]));
            return next;
          })} />}
        <View style={[styles.divider, activeStyles.finish]}>
          <Text style={styles.body}>{summary.completed} completed sets · {summary.unfinished} unfinished sets</Text>
          {finishError && <Text style={styles.error} accessibilityRole="alert">{finishError} Completion was not confirmed. {pendingFinish ? "Editing is paused while completion is uncertain. Retry finishing to check the saved result." : "Retry saving your edits before finishing."}</Text>}
          <Pressable accessibilityRole="button" disabled={finishing || confirming} style={[styles.button, activeStyles.finishButton, (finishing || confirming) && styles.disabled]}
            onPress={() => pendingFinish ? void finish() : confirmFinish()}><Text style={styles.buttonText}>{finishing ? "Verifying completion…" : pendingFinish ? "Retry finish verification" : "Finish workout"}</Text></Pressable>
        </View>
      </ScrollView>
      <RestTimer session={state.session} exerciseId={restExerciseId} disabled={blocked} edit={edit} />
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const activeStyles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20, gap: 12 },
  section: { gap: 4 }, title: { fontSize: 24, lineHeight: 30 },
  exercise: { padding: 10, gap: 4 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 4 },
  exerciseHeader: { flex: 1, minHeight: 44, gap: 0 },
  exerciseName: { fontSize: 18, lineHeight: 24 },
  caption: { color: "#515C5F", fontSize: 12, lineHeight: 18 },
  inlineAction: { minHeight: 44, paddingHorizontal: 4, paddingVertical: 8, justifyContent: "center", alignSelf: "flex-start" },
  actionText: { color: "#15191C", fontSize: 14, fontWeight: "600" },
  set: { paddingTop: 2 }, setRow: { gap: 6 }, input: { paddingVertical: 6, minHeight: 44 },
  check: { width: 44, minHeight: 44 }, finish: { paddingTop: 12, gap: 8 }, finishButton: { minHeight: 48, paddingVertical: 10 },
});
