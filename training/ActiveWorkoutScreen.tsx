import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { usePreventRemove } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { trainingStore } from "../appStores";
import type { TrainStackParamList } from "./navigationTypes";
import type { TrainingData, WorkoutSession } from "./types";
import { createSessionAutosave } from "./autosave";
import { addExercise, addSet, displayWeight, editSet, finishSummary, previousPerformance, removeExercise, removeSet, toggleSet } from "./manual";
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
      // Pop this Train stack even if the user switched tabs during verification.
      navigation.popTo("TrainHome");
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Text style={styles.eyebrow}>ACTIVE WORKOUT</Text>
          <Text style={styles.title} accessibilityRole="header">{state.session.name}</Text>
          <Text style={styles.body}>Complete exercises in any order. Editing a completed set marks it unfinished until you check it again.</Text>
          <Text style={state.error ? styles.error : ui.saved} accessibilityLiveRegion="polite">
            {state.error ? `Not saved: ${state.error} Latest edits are kept on this screen. Keep the app open and retry.` : state.dirty || state.saving ? "Saving edits…" : "All edits saved and verified"}
          </Text>
          {state.error && <Pressable accessibilityRole="button" disabled={finishing} style={styles.button} onPress={() => { void draft.flush().catch(() => {}); }}><Text style={styles.buttonText}>Retry saving edits</Text></Pressable>}
        </View>
        <RestTimer session={state.session} disabled={blocked} edit={edit} />
        {state.session.exercises.length === 0 && <Text style={styles.body}>No exercises remain. Add an exercise to continue; this unfinished workout does not count toward consistency.</Text>}
        {state.session.exercises.map((movement) => {
          const open = expanded.has(movement.id);
          const previous = previousPerformance(data.sessions, movement.exerciseId, state.session.id);
          return <View key={movement.id} style={ui.exercise}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${movement.name}, ${open ? "collapse" : "expand"}`}
              style={ui.exerciseHeader} onPress={() => setExpanded((items) => { const next = new Set(items); if (open) next.delete(movement.id); else next.add(movement.id); return next; })}>
              <Text style={styles.heading}>{movement.name} {open ? "−" : "+"}</Text>
              <Text style={ui.caption}>{movement.sets.filter((set) => set.completed).length} / {movement.sets.length} sets complete</Text>
            </Pressable>
            {open && <>
              <Text style={ui.caption}>{previous.length ? `Previous completed session: ${previous.map((set) => `${displayWeight(set.weightKg, unit)} × ${set.reps}`).join("; ")}` : "No previous completed performance recorded."}</Text>
              <Text style={ui.caption}>Leave weight blank for an unweighted set. Partial numbers are saved as typed.</Text>
              {movement.sets.map((set, index) => <View key={set.id} style={ui.set}>
                <Text style={ui.caption}>Set {index + 1}</Text>
                <View style={ui.setRow}>
                  <View style={ui.field}>
                    <Text style={ui.caption}>Weight ({set.draft.weightUnit})</Text>
                    <TextInput style={ui.input} value={set.draft.weight} keyboardType="decimal-pad" editable={!blocked}
                      accessibilityLabel={`${movement.name}, set ${index + 1}, weight in ${set.draft.weightUnit}`}
                      onChangeText={(text) => edit((current) => editSet(current, movement.id, set.id, "weight", text, new Date().toISOString()))} />
                  </View>
                  <View style={ui.field}>
                    <Text style={ui.caption}>Reps</Text>
                    <TextInput style={ui.input} value={set.draft.reps} keyboardType="number-pad" editable={!blocked}
                      accessibilityLabel={`${movement.name}, set ${index + 1}, reps`}
                      onChangeText={(text) => edit((current) => editSet(current, movement.id, set.id, "reps", text, new Date().toISOString()))} />
                  </View>
                  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: set.completed, disabled: blocked }} disabled={blocked}
                    accessibilityLabel={`${set.completed ? "Undo" : "Complete"} ${movement.name} set ${index + 1}`}
                    style={[ui.check, set.completed && styles.selected, blocked && styles.disabled]}
                    onPress={() => edit((current) => toggleSet(current, movement.id, set.id, new Date().toISOString()))}><Text style={ui.checkText}>{set.completed ? "✓" : "○"}</Text></Pressable>
                </View>
                <Pressable accessibilityRole="button" disabled={blocked} style={styles.link} accessibilityLabel={`Remove ${movement.name} set ${index + 1}`}
                  onPress={() => Alert.alert("Remove set?", "This removes its saved values from this unfinished workout.", [
                    { text: "Keep set", style: "cancel" }, { text: "Remove set", style: "destructive", onPress: () => edit((current) => removeSet(current, movement.id, set.id, new Date().toISOString())) },
                  ])}><Text style={styles.linkText}>Remove set</Text></Pressable>
              </View>)}
              <Pressable accessibilityRole="button" disabled={blocked} style={[styles.button, styles.outline]} accessibilityLabel={`Add set to ${movement.name}`}
                onPress={() => edit((current) => addSet(current, movement.id, unit, new Date().toISOString()))}><Text style={styles.buttonText}>Add set</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={blocked} style={styles.link} accessibilityLabel={`Remove ${movement.name}`}
                onPress={() => Alert.alert("Remove exercise?", "This removes the exercise and its sets from this unfinished workout.", [
                  { text: "Keep exercise", style: "cancel" }, { text: "Remove exercise", style: "destructive", onPress: () => edit((current) => removeExercise(current, movement.id, new Date().toISOString())) },
                ])}><Text style={styles.linkText}>Remove exercise</Text></Pressable>
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
        <View style={styles.divider}>
          <Text style={styles.body}>{summary.completed} completed sets · {summary.unfinished} unfinished sets</Text>
          {finishError && <Text style={styles.error} accessibilityRole="alert">{finishError} Completion was not confirmed. {pendingFinish ? "Editing is paused while completion is uncertain. Retry finishing to check the saved result." : "Retry saving your edits before finishing."}</Text>}
          <Pressable accessibilityRole="button" disabled={finishing || confirming} style={[styles.button, (finishing || confirming) && styles.disabled]}
            onPress={() => pendingFinish ? void finish() : confirmFinish()}><Text style={styles.buttonText}>{finishing ? "Verifying completion…" : pendingFinish ? "Retry finish verification" : "Finish workout"}</Text></Pressable>
          <Text style={ui.caption}>Leaving this screen keeps your verified unfinished workout available from Train. Unfinished workouts do not count toward your weekly target.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
