import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ScoreEntry } from "../storage";
import { scoreStore, trainingStore } from "../appStores";
import type { TrainStackParamList } from "./navigationTypes";
import type { Exercise, ReadinessSnapshot, TrainingData, WeeklyTarget } from "./types";
import { createManualSession, manualProfile } from "./manual";
import { localDate } from "./consistency";
import { FREQUENCIES } from "./setup";
import ExercisePicker from "./ExercisePicker";
import { styles } from "./styles";
import { manualStyles as ui } from "./manualStyles";

type Props = NativeStackScreenProps<TrainStackParamList, "ManualWorkout">;
export default function ManualWorkoutScreen({ navigation }: Props) {
  const [data, setData] = useState<TrainingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Exercise[]>([]);
  const [target, setTarget] = useState<WeeklyTarget | null>(null);
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    let active = true; setLoading(true);
    void trainingStore.load().then((next) => {
      if (active) { setData(next); setLoadError(false); }
    }).catch(() => { if (active) setLoadError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  const unfinished = data?.sessions.find((item) => item.status === "active" || item.status === "draft");
  async function start() {
    if (!data || !selected.length || (!data.profile && !target) || startingRef.current) return;
    startingRef.current = true; setStarting(true); setError(null);
    try {
      // Missing/unreadable readiness never blocks manual logging.
      let scores: ScoreEntry[] = [];
      try { scores = await scoreStore.load(); } catch { /* Preserve an explicit missing snapshot. */ }
      const clock = new Date();
      const now = clock.toISOString();
      const profile = data.profile ?? manualProfile(target!, now);
      const saved = scores.find((item) => item.date === clock.toDateString());
      const readiness: ReadinessSnapshot = saved
        ? { status: "available", score: saved.score, localDate: localDate(clock) }
        : { status: "missing" };
      const session = await trainingStore.beginManualSession(createManualSession(name, selected, profile, readiness, now), data.profile ? undefined : profile);
      if (navigation.isFocused()) navigation.replace("ResumeWorkout", { sessionId: session.id });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Workout could not be started."); }
    finally { startingRef.current = false; setStarting(false); }
  }
  return <SafeAreaView edges={["left", "right"]} style={styles.screen}>
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={insets.top + 44}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title} accessibilityRole="header">Build your workout</Text>
        {loading ? <ActivityIndicator accessibilityLabel="Loading manual workout" /> : loadError ? <View style={styles.section}>
          <Text style={styles.error} accessibilityRole="alert">Training data could not be loaded. Nothing has been reset.</Text>
          <Pressable accessibilityRole="button" style={styles.button} onPress={() => setRetry((value) => value + 1)}><Text style={styles.buttonText}>Retry loading</Text></Pressable>
        </View> : unfinished ? <View style={styles.section}>
          <Text style={styles.body}>An unfinished workout is already saved. Resume it before starting another.</Text>
          <Pressable accessibilityRole="button" style={styles.button} onPress={() => navigation.replace("ResumeWorkout", { sessionId: unfinished.id })}><Text style={styles.buttonText}>Resume {unfinished.name}</Text></Pressable>
        </View> : data && <>
          <Text style={styles.body}>Select exercises, then start logging. No training setup is required. Your session is saved when you start.</Text>
          <TextInput style={ui.input} accessibilityLabel="Workout name" placeholder="Manual workout" placeholderTextColor="#515C5F" value={name} onChangeText={setName} editable={!starting} maxLength={120} />
          {!data.profile && <View style={styles.section}>
            <Text style={styles.heading}>Choose your weekly target</Text>
            <Text style={styles.body}>Used for weekly consistency only. This does not complete training setup.</Text>
            <View style={ui.chips} accessibilityRole="radiogroup" accessibilityLabel="Weekly workout target">
              {FREQUENCIES.map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`${value} workouts per week`} accessibilityState={{ checked: target === value }} disabled={starting}
                style={[ui.chip, target === value && styles.selected]} onPress={() => setTarget(value)}><Text style={styles.buttonText}>{value}</Text></Pressable>)}
            </View>
          </View>}
          <ExercisePicker saved={data.exercises} selected={selected.map((item) => item.id)} toggle disabled={starting}
            onChoose={(exercise) => setSelected((items) => items.some((item) => item.id === exercise.id) ? items.filter((item) => item.id !== exercise.id) : [...items, exercise])}
            onCreated={(exercise) => setData((current) => current && ({ ...current, exercises: [...current.exercises, exercise] }))} />

        </>}
      </ScrollView>
      {!loading && !loadError && data && !unfinished && <View style={ui.footer}>
          <Text style={styles.body}>{selected.length} {selected.length === 1 ? "exercise" : "exercises"} selected.</Text>
          {error && <Text style={styles.error} accessibilityRole="alert">{error} Selections are still here. Try starting again; an existing session will be resumed.</Text>}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: starting || !selected.length || (!data.profile && !target) }} disabled={starting || !selected.length || (!data.profile && !target)}
            style={[styles.button, (starting || !selected.length || (!data.profile && !target)) && styles.disabled]} onPress={() => void start()}>
            <Text style={styles.buttonText}>{starting ? "Saving workout…" : "Start workout"}</Text>
          </Pressable>
      </View>}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
