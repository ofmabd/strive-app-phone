import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ComponentRef } from "react";
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
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
import { remainingRestMs, restClock, timerExercise } from "./restTimer";
import { useRestClock } from "./useRestClock";
import { captureSet, previousSetReference, reorderExercises, restoreSet, withTimerOwner } from "./workoutInteractions";
import type { DeletedSet } from "./workoutInteractions";
import ReorderExercises from "./ReorderExercises";
import SwipeSetRow from "./SwipeSetRow";
import WorkoutIcon from "./WorkoutIcon";
import { addExercise, changeSetType, addSet, editSet, finishSummary, removeExercise, removeSet, toggleSet } from "./manual";
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
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [undo, setUndo] = useState<(DeletedSet & { expires: number }) | null>(null);
  const [favorites, setFavorites] = useState(data.exercisePreferences?.favoriteIds ?? []);
  const [favoriteBusy, setFavoriteBusy] = useState<string[]>([]);
  const favoriteLocks = useRef(new Set<string>());
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [positions, setPositions] = useState<Record<string, { card: number; timer: number; height: number }>>({});
  const [viewport, setViewport] = useState({ y: 0, height: 0 });
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
  const [finishError, setFinishError] = useState<string | null>(null);
  const finishingRef = useRef(false);
  const pendingRef = useRef(false);
  const confirmingRef = useRef(false);
  const insets = useSafeAreaInsets();
  const unit = data.profile?.preferredWeightUnit ?? "kg";
  const blocked = confirming || finishing || pendingFinish;
  function position(id: string, change: Partial<{ card: number; timer: number; height: number }>) {
    setPositions(current => {
      const before = current[id] ?? { card: 0, timer: 0, height: 44 };
      if (Object.entries(change).every(([key, value]) => before[key as keyof typeof before] === value)) return current;
      return { ...current, [id]: { ...before, ...change } };
    });
  }
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
  const owner = timerExercise(state.session);
  const remaining = remainingRestMs(state.session, now);
  const ownerPosition = owner ? positions[owner.id] : undefined;
  const ownerY = ownerPosition ? ownerPosition.card + ownerPosition.timer : undefined;
  const showRestLink = owner && remaining > 0 && ownerY !== undefined &&
    (ownerY < viewport.y || ownerY + (ownerPosition?.height ?? 44) > viewport.y + viewport.height);
  return <SafeAreaView edges={["left", "right"]} style={styles.screen}>
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={insets.top + 44}>
      {undo && <View style={activeStyles.notice} accessibilityLiveRegion="polite">
        <Text style={activeStyles.noticeText}>Set deleted</Text>
        <Pressable accessibilityRole="button" disabled={blocked} style={activeStyles.smallAction} onPress={() => {
          if (edit(current => restoreSet(current, undo, new Date().toISOString()))) setUndo(null);
        }}><Text style={activeStyles.actionText}>Undo</Text></Pressable>
      </View>}
      {showRestLink && <Pressable accessibilityRole="button" accessibilityLabel={`Go to rest timer for ${exerciseName(owner.exerciseId, owner.name)}`}
        style={activeStyles.notice} onPress={() => { Keyboard.dismiss(); scroll.current?.scrollTo({ y: Math.max(0, ownerY - 8), animated: true }); }}>
        <Text style={activeStyles.noticeText} numberOfLines={1}>{state.session.restTimer?.status === "paused" ? "Paused" : "Rest"} · {exerciseName(owner.exerciseId, owner.name)}</Text>
        <Text style={activeStyles.actionText}>{restClock(remaining)} ↑</Text>
      </Pressable>}
      <ScrollView ref={scroll} contentContainerStyle={[styles.content, activeStyles.content]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        scrollEventThrottle={100} onScroll={event => { const y = event.nativeEvent.contentOffset.y; setViewport(current => ({ ...current, y })); }}
        onLayout={event => { const height = event.nativeEvent.layout.height; setViewport(current => ({ ...current, height })); }}>
        <View style={activeStyles.section}>
          <Text style={[styles.title, activeStyles.title]} accessibilityRole="header">{state.session.name}</Text>
          <Text style={state.error ? styles.error : ui.saved} accessibilityLiveRegion="polite">
            {state.error ? `Not saved: ${state.error} Latest edits are kept on this screen. Keep the app open and retry.` : state.dirty || state.saving ? "Saving edits…" : "Saved"}
          </Text>
          {favoriteError && <Text style={styles.error} accessibilityRole="alert">{favoriteError}</Text>}
          {state.error && <Pressable accessibilityRole="button" disabled={finishing} style={styles.button} onPress={() => { void draft.flush().catch(() => {}); }}><Text style={styles.buttonText}>Retry saving edits</Text></Pressable>}
        </View>
        {state.session.exercises.length === 0 && <Text style={styles.body}>No exercises remain. Add an exercise to continue; this unfinished workout does not count toward consistency.</Text>}
        {state.session.exercises.map((movement) => {
          const open = expanded.has(movement.id);
          const name = exerciseName(movement.exerciseId, movement.name);
          const labels = setLabels(movement.sets);
          return <View key={movement.id} style={[ui.exercise, activeStyles.exercise]} onLayout={event => position(movement.id, { card: event.nativeEvent.layout.y })}>
            <View style={activeStyles.cardHeader}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${name}, ${open ? "collapse" : "expand"}`}
                style={activeStyles.exerciseHeader} onPress={() => { Keyboard.dismiss(); setExpanded((items) => { const next = new Set(items); if (open) next.delete(movement.id); else next.add(movement.id); return next; }); }}>
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
            <View onLayout={event => position(movement.id, { timer: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height })}>
              <RestTimer session={state.session} exerciseId={movement.id} now={now} disabled={blocked} edit={edit} />
            </View>
            {open && <>
              <View style={[ui.setRow, activeStyles.setRow]} accessible accessibilityLabel="Columns: Set, Weight, Reps, Complete">
                <Text style={{width:44}}>Set</Text><Text style={ui.field}>Weight</Text><Text style={ui.field}>Reps</Text><Text style={{width:44}}>Done</Text>
              </View>
              {movement.sets.map((set, index) => {
                const reference = previousSetReference(data.sessions, movement, set.id, state.session.id);
                const label = `${name} set ${labels[index]}, row ${index + 1}`;
                const deleteRow = () => deleteSet(movement.id, set.id);
                return <SwipeSetRow key={set.id} disabled={blocked} editing={editingSetId === set.id} label={label} onDelete={deleteRow}>
                  {revealDelete => <View style={[ui.set, activeStyles.set]}>
                    <View style={[ui.setRow, activeStyles.setRow]}>
                      <SetTypeControl compact set={set} label={labels[index]} disabled={blocked} onDelete={deleteRow} revealDelete={revealDelete}
                        onChange={(type) => edit((current) => changeSetType(current, movement.id, set.id, type, new Date().toISOString()))} />
                      <View style={ui.field}>
                        <TextInput style={[ui.input, activeStyles.input, activeStyles.weightInput]} value={set.draft.weight} placeholder={reference?.weight || "—"}
                          placeholderTextColor="#697270" keyboardType="decimal-pad" editable={!blocked} onFocus={() => setEditingSetId(set.id)} onBlur={() => setEditingSetId(null)}
                          accessibilityLabel={`${label}, weight in ${set.draft.weightUnit}`} accessibilityHint={reference?.weight ? `Last: ${reference.weight} ${reference.unit}. Reference only; not entered.` : undefined}
                          onChangeText={(text) => edit((current) => editSet(current, movement.id, set.id, "weight", text, new Date().toISOString()))} />
                        <View pointerEvents="none" style={activeStyles.unit}><Text accessible={false} style={activeStyles.unitText}>{set.draft.weightUnit}</Text></View>
                      </View>
                      <View style={ui.field}>
                        <TextInput style={[ui.input, activeStyles.input]} value={set.draft.reps} placeholder={reference?.reps ?? "—"} placeholderTextColor="#697270"
                          keyboardType="number-pad" editable={!blocked} onFocus={() => setEditingSetId(set.id)} onBlur={() => setEditingSetId(null)}
                          accessibilityLabel={`${label}, reps`} accessibilityHint={reference ? `Last: ${reference.reps} reps. Reference only; not entered.` : undefined}
                          onChangeText={(text) => edit((current) => editSet(current, movement.id, set.id, "reps", text, new Date().toISOString()))} />
                      </View>
                      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: set.completed, disabled: blocked }} disabled={blocked}
                        accessibilityLabel={`${set.completed ? "Undo" : "Complete"} ${label}`}
                        style={[ui.check, activeStyles.check, set.completed && styles.selected, blocked && styles.disabled]}
                        onPress={() => { Keyboard.dismiss(); edit((current) => toggleSet(current, movement.id, set.id, new Date().toISOString())); }}><Text style={ui.checkText}>{set.completed ? "✓" : "○"}</Text></Pressable>
                    </View>
                  </View>}
                </SwipeSetRow>;
              })}
              <Pressable accessibilityRole="button" disabled={blocked} style={activeStyles.inlineAction} accessibilityLabel={`Add set to ${name}`}
                onPress={() => { Keyboard.dismiss(); edit((current) => addSet(current, movement.id, unit, new Date().toISOString())); }}><Text style={activeStyles.actionText}>+ Add Set</Text></Pressable>

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
          {finishError && <Text style={styles.error} accessibilityRole="alert">{finishError} Completion was not confirmed. {pendingFinish ? "Editing is paused while completion is uncertain. Retry finishing to check the saved result." : "Retry saving your edits before finishing."}</Text>}
          <Pressable accessibilityRole="button" disabled={finishing || confirming} style={[styles.button, activeStyles.finishButton, (finishing || confirming) && styles.disabled]}
            onPress={() => pendingFinish ? void finish() : confirmFinish()}><Text style={styles.buttonText}>{finishing ? "Verifying completion…" : pendingFinish ? "Retry finish verification" : "Finish workout"}</Text></Pressable>
        </View>
      </ScrollView>
      {reordering && <ReorderExercises exercises={state.session.exercises} onClose={ids => {
        edit(current => reorderExercises(current, ids, new Date().toISOString())); setReordering(false);
      }} />}
    </KeyboardAvoidingView>
  </SafeAreaView>;
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
  set: { paddingTop: 2 }, setRow: { gap: 6 }, input: { paddingVertical: 6, minHeight: 44 },
  weightInput: { paddingRight: 24 }, unit: { position: "absolute", right: 6, top: 0, bottom: 0, justifyContent: "center" }, unitText: { color: "#515C5F", fontSize: 11 },
  check: { width: 44, minHeight: 44 }, finish: { paddingTop: 12, gap: 8 }, finishButton: { minHeight: 48, paddingVertical: 10 },
});
