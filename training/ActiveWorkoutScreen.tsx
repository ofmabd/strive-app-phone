import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFocusEffect, usePreventRemove } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { trainingStore } from "../appStores";
import type { TrainStackParamList } from "./navigationTypes";
import type { TrainingData, WeightUnit, WorkoutSession } from "./types";
import { createSessionAutosave } from "./autosave";
import { exerciseName } from "./catalog";
import { setLabels } from "./setTypes";
import SetTypeControl from "./SetTypeControl";
import { inputWeight, weightUnit } from "./weightUnits";
import { dismissKeyboardOutsideInput } from "./keyboard";
import { useRestClock } from "./useRestClock";
import { captureSet, previousSetReference, reorderExercises, restoreSet, withTimerOwner } from "./workoutInteractions";
import type { DeletedSet } from "./workoutInteractions";
import ReorderExercises from "./ReorderExercises";
import SwipeSetRow from "./SwipeSetRow";
import WorkoutIcon from "./WorkoutIcon";
import { addExercise, changeSetType, addSet, editSet, finishSummary, removeExercise, removeSet, toggleSet } from "./manual";
import ExerciseActions from "./ExerciseActions";
import RestTimer, { ExerciseRestControl } from "./RestTimer";
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
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [undo, setUndo] = useState<(DeletedSet & { expires: number }) | null>(null);
  const [favorites, setFavorites] = useState(data.exercisePreferences?.favoriteIds ?? []);
  const [favoriteBusy, setFavoriteBusy] = useState<string[]>([]);
  const favoriteLocks = useRef(new Set<string>());
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const [restExerciseId, setRestExerciseId] = useState(initial.exercises[0]?.id);
  const [editSets, setEditSets] = useState<string | null>(null);
  const [unit, setUnit] = useState<WeightUnit>(() => weightUnit(data));
  const [unitError, setUnitError] = useState(false);
  const now = useRestClock(state.session);
  useEffect(() => {
    if (!undo) return;
    const timeout = setTimeout(() => setUndo(null), Math.max(0, undo.expires - Date.now()));
    return () => clearTimeout(timeout);
  }, [undo]);
  const [catalog, setCatalog] = useState(data.exercises);
  const [confirming, setConfirming] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [pendingFinish, setPendingFinish] = useState(false);
  const [pendingDiscard, setPendingDiscard] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const finishingRef = useRef(false);
  const pendingRef = useRef(false);
  const confirmingRef = useRef(false);
  const insets = useSafeAreaInsets();
  const blocked = confirming || finishing || pendingFinish || pendingDiscard;
  useFocusEffect(useCallback(() => {
    let active = true;
    void draft.flush().then(() => trainingStore.load()).then(saved => {
      if (active) { setUnit(weightUnit(saved)); setUnitError(false); }
    }).catch(() => { if (active) setUnitError(true); });
    return () => { active = false; };
  }, [draft]));
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
    if (finishingRef.current || pendingRef.current || confirmingRef.current) return false;
    try { draft.edit(current => change(withTimerOwner(current))); return true; } catch (cause) {
      Alert.alert("Workout not changed", cause instanceof Error ? cause.message : "The edit could not be applied.");
      return false;
    }
  }
  function deleteSet(exerciseId: string, setId: string) {
    if (blocked) return;
    const current = draft.getSnapshot().session;
    if (!current.exercises.find(item => item.id === exerciseId)?.sets.some(set => set.id === setId)) return;
    const deleted = captureSet(current, exerciseId, setId);
    if (edit(current => removeSet(current, exerciseId, setId, new Date().toISOString()))) {
      Keyboard.dismiss(); setEditingSetId(null);
      setUndo({ ...deleted, expires: Date.now() + 6000 });
    }
  }
  async function toggleFavorite(exerciseId: string) {
    if (blocked || favoriteLocks.current.has(exerciseId)) return;
    Keyboard.dismiss();
    const selected = !favorites.includes(exerciseId);
    favoriteLocks.current.add(exerciseId); setFavoriteBusy([...favoriteLocks.current]); setFavoriteError(null);
    try {
      await trainingStore.setExerciseFavorite(exerciseId, selected);
      setFavorites(ids => selected ? [...new Set([...ids, exerciseId])] : ids.filter(id => id !== exerciseId));
    } catch { setFavoriteError("Favorite could not be verified. Try again."); }
    finally { favoriteLocks.current.delete(exerciseId); setFavoriteBusy([...favoriteLocks.current]); }
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
  async function discard() {
    if (finishingRef.current) return;
    finishingRef.current = true; setFinishing(true); setFinishError(null);
    try {
      await draft.flush(); pendingRef.current = true; setPendingDiscard(true);
      const saved = draft.getSnapshot().session;
      await trainingStore.discardSession(saved.id, saved.updatedAt, new Date().toISOString());
      finishingRef.current = false; setFinishing(false); navigation.popTo("TrainHome");
    } catch (cause) { setFinishError(cause instanceof Error ? cause.message : "Discard could not be verified."); }
    finally { finishingRef.current = false; setFinishing(false); }
  }
  function confirmDiscard() {
    if (blocked) return;
    Keyboard.dismiss(); confirmingRef.current = true; setConfirming(true);
    Alert.alert("Discard workout?", "This workout will not count toward consistency. Its saved record will be retained.", [
      { text: "Keep logging", style: "cancel", onPress: () => { confirmingRef.current = false; setConfirming(false); } },
      { text: "Discard workout", style: "destructive", onPress: () => { confirmingRef.current = false; setConfirming(false); void discard(); } },
    ], { cancelable: false });
  }
  function confirmFinish() {
    if (blocked || confirmingRef.current || finishingRef.current || pendingRef.current) return;
    Keyboard.dismiss();
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
  return <GestureHandlerRootView style={styles.screen}><SafeAreaView edges={["left", "right"]} style={styles.screen}>
    <KeyboardAvoidingView style={styles.screen} onTouchStart={dismissKeyboardOutsideInput} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={insets.top + 44}>
      {undo && <View style={activeStyles.notice} accessibilityLiveRegion="polite">
        <Text style={activeStyles.noticeText}>Set deleted</Text>
        <Pressable accessibilityRole="button" disabled={blocked} style={activeStyles.smallAction} onPress={() => {
          if (edit(current => restoreSet(current, undo, new Date().toISOString()))) setUndo(null);
        }}><Text style={activeStyles.actionText}>Undo</Text></Pressable>
      </View>}
      <ScrollView contentContainerStyle={[styles.content, activeStyles.content]} keyboardShouldPersistTaps="always" keyboardDismissMode="on-drag">
        <View style={activeStyles.section}>
          <Text style={[styles.title, activeStyles.title]} accessibilityRole="header">{state.session.name}</Text>
          <Text style={state.error ? styles.error : ui.saved} accessibilityLiveRegion="polite">
            {state.error ? `Not saved: ${state.error} Latest edits are kept on this screen. Keep the app open and retry.` : state.dirty || state.saving ? "Saving edits…" : "Saved"}
          </Text>
          {unitError && <Text style={styles.error} accessibilityRole="alert">Weight preference could not be refreshed. Displayed units are unchanged; reopen the workout to retry.</Text>}
          {favoriteError && <Text style={styles.error} accessibilityRole="alert">{favoriteError}</Text>}
          {state.error && <Pressable accessibilityRole="button" disabled={finishing} style={styles.button} onPress={() => { void draft.flush().catch(() => {}); }}><Text style={styles.buttonText}>Retry saving edits</Text></Pressable>}
        </View>
        {state.session.exercises.length === 0 && <Text style={styles.body}>No exercises remain. Add an exercise to continue; this unfinished workout does not count toward consistency.</Text>}
        {state.session.exercises.map((movement) => {
          const open = expanded.has(movement.id);
          const name = exerciseName(movement.exerciseId, movement.name);
          const labels = setLabels(movement.sets);
          return <View key={movement.id} style={[ui.exercise, activeStyles.exercise]}>
            <View style={activeStyles.cardHeader}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${name}, ${open ? "collapse" : "expand"}`}
                style={activeStyles.exerciseHeader} disabled={blocked} onLongPress={() => { Keyboard.dismiss(); setReordering(true); }} delayLongPress={350}
                accessibilityHint="Hold to reorder exercises. Reorder is also available in Actions." onPress={() => { Keyboard.dismiss(); setExpanded((items) => { const next = new Set(items); if (open) next.delete(movement.id); else next.add(movement.id); return next; }); }}>
                <WorkoutIcon name={open ? "chevron-up" : "chevron-down"} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.heading, activeStyles.exerciseName]}>{name}</Text>
                  <Text style={activeStyles.caption}>{movement.sets.filter((set) => set.completed).length} / {movement.sets.length} complete</Text>
                </View>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`${favorites.includes(movement.exerciseId) ? "Unfavorite" : "Favorite"} ${name}`}
                accessibilityState={{ selected: favorites.includes(movement.exerciseId), disabled: blocked || favoriteBusy.includes(movement.exerciseId) }}
                disabled={blocked || favoriteBusy.includes(movement.exerciseId)} style={activeStyles.smallAction} onPress={() => void toggleFavorite(movement.exerciseId)}>
                <WorkoutIcon name="star" filled={favorites.includes(movement.exerciseId)} />
              </Pressable>
              <ExerciseActions name={name} disabled={blocked} reorder={() => setReordering(true)}
                remove={() => edit(current => removeExercise(current,movement.id,new Date().toISOString()))} />
            </View>
            {open && <ExerciseRestControl session={state.session} exerciseId={movement.id} disabled={blocked} edit={edit} />}
            {open && <>
              <View style={[ui.setRow, activeStyles.setRow]} accessible accessibilityLabel="Columns: Set, Weight, Reps, Complete">
                <Text style={{width:44}}>{editSets === movement.id ? "Delete" : "Set"}</Text><Text style={ui.field}>Weight ({unit})</Text><Text style={ui.field}>Reps</Text><Text style={{width:44}}>Done</Text>
              </View>
              {movement.sets.map((set, index) => {
                const weight = inputWeight(set, unit);
                const reference = previousSetReference(data.sessions, movement, set.id, state.session.id, weight.unit);
                const label = `${name} set ${labels[index]}, row ${index + 1}`;
                const deleteRow = () => deleteSet(movement.id, set.id);
                return <SwipeSetRow key={set.id} disabled={blocked} editing={editingSetId === set.id} label={label} onDelete={deleteRow}>
                  {() => <View style={[ui.set, activeStyles.set]}>
                    <View style={[ui.setRow, activeStyles.setRow]}>
                      {editSets === movement.id ? <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${label}`} disabled={blocked} style={activeStyles.deleteSet} onPress={deleteRow}>
                        <Text style={activeStyles.deleteText}>−</Text>
                      </Pressable> : <SetTypeControl compact set={set} label={labels[index]} disabled={blocked}
                        onChange={(type) => edit((current) => changeSetType(current, movement.id, set.id, type, new Date().toISOString()))} />}
                      <View style={ui.field}>
                        <TextInput style={[ui.input, activeStyles.input, activeStyles.weightInput]} value={weight.value} placeholder={reference?.weight || "—"}
                          placeholderTextColor="#626B68" keyboardType="decimal-pad" editable={!blocked} onFocus={() => { setEditingSetId(set.id); setRestExerciseId(movement.id); }} onBlur={() => setEditingSetId(null)}
                          accessibilityLabel={`${label}, weight in ${weight.unit}`} accessibilityHint={reference?.weight ? `Previous workout: ${reference.weight} ${reference.unit}. Reference only; not entered.` : undefined}
                          onChangeText={(text) => edit((current) => editSet(current, movement.id, set.id, "weight", text, new Date().toISOString(), weight.unit))} />
                        <View pointerEvents="none" style={activeStyles.unit}><Text accessible={false} style={activeStyles.unitText}>{weight.unit}</Text></View>
                      </View>
                      <View style={ui.field}>
                        <TextInput style={[ui.input, activeStyles.input]} value={set.draft.reps} placeholder={reference?.reps ?? "—"} placeholderTextColor="#626B68"
                          keyboardType="number-pad" editable={!blocked} onFocus={() => { setEditingSetId(set.id); setRestExerciseId(movement.id); }} onBlur={() => setEditingSetId(null)}
                          accessibilityLabel={`${label}, reps`} accessibilityHint={reference ? `Previous workout: ${reference.reps} reps. Reference only; not entered.` : undefined}
                          onChangeText={(text) => edit((current) => editSet(current, movement.id, set.id, "reps", text, new Date().toISOString()))} />
                      </View>
                      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: set.completed, disabled: blocked }} disabled={blocked}
                        accessibilityLabel={`${set.completed ? "Undo" : "Complete"} ${label}`}
                        style={[ui.check, activeStyles.check, set.completed && styles.selected, blocked && styles.disabled]}
                        onPress={() => { Keyboard.dismiss(); setRestExerciseId(movement.id); edit((current) => toggleSet(current, movement.id, set.id, new Date().toISOString())); }}><Text style={ui.checkText}>{set.completed ? "✓" : "○"}</Text></Pressable>
                    </View>
                    {weight.unit !== unit && <Text style={styles.error}>Finish or clear this {weight.unit} entry to use {unit}.</Text>}
                  </View>}
                </SwipeSetRow>;
              })}
              <View style={activeStyles.setActions}>
                <Pressable accessibilityRole="button" disabled={blocked} style={activeStyles.inlineAction} accessibilityLabel={`Add set to ${name}`}
                  onPress={() => { Keyboard.dismiss(); edit((current) => addSet(current, movement.id, unit, new Date().toISOString())); }}><Text style={activeStyles.actionText}>+ Add Set</Text></Pressable>
                <Pressable accessibilityRole="button" disabled={blocked} style={activeStyles.inlineAction} accessibilityLabel={`${editSets === movement.id ? "Done editing" : "Edit"} sets for ${name}`}
                  accessibilityState={{ expanded: editSets === movement.id }} onPress={() => { Keyboard.dismiss(); setEditSets(id => id === movement.id ? null : movement.id); }}>
                  <Text style={activeStyles.caption}>{editSets === movement.id ? "Done" : "Edit sets"}</Text>
                </Pressable>
              </View>

            </>}
          </View>;
        })}
        {!pendingFinish && <Pressable accessibilityRole="button" disabled={blocked} accessibilityState={{ expanded: picker }} style={[styles.button, styles.outline]} onPress={() => { Keyboard.dismiss(); setPicker((value) => !value); }}>
          <Text style={styles.buttonText}>{picker ? "Close exercise library" : "Add exercises"}</Text>
        </Pressable>}
        {picker && !pendingFinish && <ExercisePicker saved={catalog} selected={state.session.exercises.map((item) => item.exerciseId)} disabled={blocked}
          favorites={{ ids: favorites, saving: favoriteBusy.length > 0, toggle: id => void toggleFavorite(id) }}
          onCreated={(exercise) => setCatalog((items) => [...items, exercise])}
          onChoose={(exercise) => edit((current) => {
            const next = addExercise(current, exercise, unit, new Date().toISOString());
            setExpanded((items) => new Set([...items, next.exercises[next.exercises.length - 1].id]));
            return next;
          })} />}
        <View style={[styles.divider, activeStyles.finish]}>
          <Text style={styles.body}>{summary.completed} completed sets · {summary.unfinished} unfinished sets</Text>
          {finishError && <Text style={styles.error} accessibilityRole="alert">{finishError} The operation was not confirmed. {pendingFinish || pendingDiscard ? "Editing is paused while persistence is uncertain. Retry to check the saved result." : "Retry saving your edits before finishing."}</Text>}
          <Pressable accessibilityRole="button" disabled={finishing || confirming} style={[styles.button, activeStyles.finishButton, (finishing || confirming) && styles.disabled]}
            onPress={() => pendingDiscard ? void discard() : pendingFinish ? void finish() : confirmFinish()}><Text style={styles.buttonText}>{finishing ? "Verifying…" : pendingDiscard ? "Retry discard verification" : pendingFinish ? "Retry finish verification" : "Finish workout"}</Text></Pressable>
          {!pendingFinish && !pendingDiscard && <Pressable accessibilityRole="button" disabled={blocked} style={activeStyles.inlineAction} onPress={confirmDiscard}><Text style={activeStyles.caption}>Discard workout</Text></Pressable>}
        </View>
      </ScrollView>
      <RestTimer session={state.session} exerciseId={restExerciseId} now={now} disabled={blocked} edit={edit} />
      {reordering && <ReorderExercises exercises={state.session.exercises} onClose={ids => {
        edit(current => reorderExercises(current, ids, new Date().toISOString())); setReordering(false);
      }} />}
    </KeyboardAvoidingView>
  </SafeAreaView></GestureHandlerRootView>;
}

const activeStyles = StyleSheet.create({
  notice: { minHeight: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 12, backgroundColor: "#E4E9DC" },
  noticeText: { flex: 1, color: "#15191C", fontSize: 14 },
  smallAction: { minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center" },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20, gap: 12 },
  section: { gap: 4 }, title: { fontSize: 24, lineHeight: 30 },
  exercise: { padding: 10, gap: 4 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 0 },
  exerciseHeader: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6 },
  exerciseName: { fontSize: 18, lineHeight: 24 },
  caption: { color: "#515C5F", fontSize: 12, lineHeight: 18 },
  inlineAction: { minHeight: 44, paddingHorizontal: 4, paddingVertical: 8, justifyContent: "center", alignSelf: "flex-start" },
  actionText: { color: "#15191C", fontSize: 14, fontWeight: "600" },
  setActions: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  deleteSet: { width: 44, minHeight: 44, justifyContent: "center", alignItems: "center" }, deleteText: { color: "#8B302A", fontSize: 26, fontWeight: "600" },
  set: { paddingTop: 2 }, setRow: { gap: 6 }, input: { paddingVertical: 6, minHeight: 44 },
  weightInput: { paddingRight: 24 }, unit: { position: "absolute", right: 6, top: 0, bottom: 0, justifyContent: "center" }, unitText: { color: "#515C5F", fontSize: 11 },
  check: { width: 44, minHeight: 44 }, finish: { paddingTop: 12, gap: 8 }, finishButton: { minHeight: 48, paddingVertical: 10 },
});
