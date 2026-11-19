import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { trainingStore } from "../appStores";
import type { TrainingData } from "./types";
import type { TrainStackParamList } from "./navigationTypes";
import { completedHistory, elapsedLabel, historyDate, historySummary } from "./history";
import { exerciseName } from "./catalog";
import { inputWeight, weightUnit } from "./weightUnits";
import { displayWeight } from "./manual";
import { setLabels, setType, SET_TYPES } from "./setTypes";
import { SetBadge } from "./SetTypeControl";
import { styles } from "./styles";
import { manualStyles as ui } from "./manualStyles";
function useHistory() {
  const [data, setData] = useState<TrainingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true; setLoading(true);
    void trainingStore.load().then((saved) => { if (active) { setData(saved); setError(false); } })
      .catch(() => { if (active) { setError(true); setData(null); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]));
  return { data, loading, error, retry: () => setRetry((value) => value + 1) };
}
function LoadState({ error, retry }: { error: boolean; retry: () => void }) {
  return error ? <View style={styles.section}>
    <Text style={styles.error} accessibilityRole="alert">History could not be loaded. Saved workouts have not been reset.</Text>
    <Pressable accessibilityRole="button" style={styles.button} onPress={retry}><Text style={styles.buttonText}>Retry loading</Text></Pressable>
  </View> : <ActivityIndicator accessibilityLabel="Loading workout history" />;
}
export default function WorkoutHistoryScreen({ navigation }: NativeStackScreenProps<TrainStackParamList, "WorkoutHistory">) {
  const state = useHistory();
  const completed = state.data ? completedHistory(state.data.sessions) : [];
  return <SafeAreaView edges={["left", "right"]} style={styles.screen}>
    <FlatList contentContainerStyle={styles.content} data={state.loading || state.error ? [] : completed} keyExtractor={(item) => item.id}
      ListHeaderComponent={<Text style={styles.title} accessibilityRole="header">Workout history</Text>}
      ListEmptyComponent={state.loading || state.error ? <LoadState error={state.error && !state.loading} retry={state.retry} /> : <View style={styles.section}>
        <Text style={styles.heading}>No completed workouts yet</Text>
        <Text style={styles.body}>Finish a structured workout with at least one completed set to see it here. Unfinished sessions and legacy notes are excluded.</Text>
      </View>}
      renderItem={({ item }) => {
        const summary = historySummary(item);
        return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.name}, ${historyDate(item.completedOn)}`} style={styles.option} onPress={() => navigation.navigate("WorkoutDetail", { sessionId: item.id })}>
          <Text style={ui.caption}>{historyDate(item.completedOn)}</Text>
          <Text style={styles.heading}>{item.name}</Text>
          <Text style={ui.caption}>{summary.exerciseCount} exercises · {summary.completedSets} completed sets</Text>
          <Text style={ui.caption}>{elapsedLabel(summary.elapsedMs)}</Text>
        </Pressable>;
      }} />
  </SafeAreaView>;
}
export function WorkoutDetailScreen({ route }: NativeStackScreenProps<TrainStackParamList, "WorkoutDetail">) {
  const state = useHistory();
  const session = state.data ? completedHistory(state.data.sessions).find((item) => item.id === route.params.sessionId) : undefined;
  const summary = session ? historySummary(session) : null;
  const unit = state.data ? weightUnit(state.data) : "kg";
  return <SafeAreaView edges={["left", "right"]} style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}>
      {state.loading || state.error ? <LoadState error={state.error && !state.loading} retry={state.retry} /> : !session ? <Text style={styles.body}>Completed workout not found. Return to history to refresh the list.</Text> : <>
        <View style={styles.section}>
          <Text style={styles.eyebrow}>{historyDate(session.completedOn)} · READ ONLY</Text>
          <Text style={styles.title} accessibilityRole="header">{session.name}</Text>
          <Text style={styles.body}>{summary?.completedSets} completed sets · {elapsedLabel(summary?.elapsedMs ?? null)}{session.finishedEarly ? " · Finished early" : ""}</Text>
        </View>
        {session.exercises.map((movement) => {
          const labels = setLabels(movement.sets);
          return <View key={movement.id} style={ui.exercise}>
            <Text style={styles.heading} accessibilityRole="header">{exerciseName(movement.exerciseId, movement.name)}</Text>
            {movement.sets.length === 0 && <Text style={ui.caption}>No sets recorded.</Text>}
            {movement.sets.map((set, index) => {
              const draft = inputWeight(set, unit);
              return <View key={set.id} style={ui.setRow}>
              <SetBadge set={set} label={labels[index]} />
              <View style={ui.field}>
                <Text style={styles.buttonText}>{SET_TYPES.find((kind) => kind.value === setType(set))!.name} · {set.completed ? "Completed" : "Unfinished"}</Text>
                <Text style={ui.caption}>{set.completed ? `${displayWeight(set.weightKg, unit)} × ${set.reps} reps`
                  : `${draft.value.trim() ? `${draft.value} ${draft.unit}` : "Weight not entered"} · ${set.draft.reps.trim() ? `${set.draft.reps} reps (draft)` : "Reps not entered"}`}</Text>
              </View>
            </View>; })}
          </View>;
        })}
      </>}
    </ScrollView>
  </SafeAreaView>;
}
