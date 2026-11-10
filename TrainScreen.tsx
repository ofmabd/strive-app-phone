import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { scoreStore, trainingStore } from "./appStores";
import { consecutiveSuccessfulWeeks, isCompletedWorkout, localDate, weeklyProgress } from "./training/consistency";
import type { RootStackParamList } from "./navigationTypes";
import type { TrainStackParamList } from "./training/navigationTypes";
import type { TrainingData } from "./training/types";
import { hasCompletedSetup } from "./training/setup";
import { styles } from "./training/styles";

type Props = CompositeScreenProps<NativeStackScreenProps<TrainStackParamList, "TrainHome">,
  NativeStackScreenProps<RootStackParamList, "Main">>;

export default function TrainScreen({ navigation }: Props) {
  const [data, setData] = useState<TrainingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [scoreError, setScoreError] = useState(false);
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    const loadTraining = async () => {
      try {
        let next = await trainingStore.load();
        if (next.profile) {
          await trainingStore.snapshotWeek(localDate(new Date()), new Date().toISOString());
          next = await trainingStore.load();
        }
        if (active) { setData(next); setError(false); }
      } catch (cause) {
        console.log("Error loading Train", cause);
        if (active) { setData(null); setError(true); }
      }
    };
    const loadReadiness = async () => {
      try {
        const entries = await scoreStore.load();
        const today = entries.find((entry) => entry.date === new Date().toDateString());
        if (active) { setScore(today?.score ?? null); setScoreError(false); }
      } catch (cause) {
        console.log("Error loading Train readiness", cause);
        if (active) { setScore(null); setScoreError(true); }
      }
    };
    void Promise.all([loadTraining(), loadReadiness()]).then(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]));

  const today = localDate(new Date());
  const progress = data ? weeklyProgress(data.sessions, data.weeklyTargets, today) : null;
  const streak = data ? consecutiveSuccessfulWeeks(data.sessions, data.weeklyTargets, today) : 0;
  const unfinished = data?.sessions.find((session) => session.status === "draft" || session.status === "active");
  const hasHistory = data?.sessions.some(isCompletedWorkout);
  const recommendation = score === null ? null : score >= 80 ? "PUSH" : score < 50 ? "RECOVER" : "MAINTAIN";

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.eyebrow}>STRIVE LABS</Text>
          <Text style={styles.title} accessibilityRole="header">Train</Text>
        </View>
        <View style={styles.card}>
          <Text style={[styles.eyebrow, styles.sage]}>WEEKLY CONSISTENCY</Text>
          {loading ? <ActivityIndicator color="#B9C9A5" accessibilityLabel="Loading weekly consistency" />
            : error ? <>
              <Text style={styles.cardBody}>Training data could not be loaded. Stored data has not been reset.</Text>
              <Pressable accessibilityRole="button" style={styles.button} onPress={() => setRetry((value) => value + 1)}>
                <Text style={styles.buttonText}>Retry loading</Text>
              </Pressable>
            </> : <>
              <Text style={styles.count} accessibilityLabel={`${progress?.completed ?? 0} completed workouts, ${progress?.target === null ? "weekly target not set" : `weekly target ${progress?.target}`}`}>
                {progress?.completed ?? 0}{progress?.target !== null ? ` / ${progress?.target}` : " workouts"}
              </Text>
              <Text style={styles.cardBody}>Monday–Sunday · {progress?.target === null ? "Weekly target not set" : "Completed workouts"}</Text>
              <Text style={[styles.heading, styles.light]}>{streak} consecutive successful {streak === 1 ? "week" : "weeks"}</Text>
              {!hasHistory && <Text style={styles.cardBody}>No completed training sessions yet. A workout counts after at least one set is completed and the session is finished.</Text>}
              {!data?.profile && <Pressable accessibilityRole="button" style={styles.button} onPress={() => navigation.navigate("TrainingSetup")}>
                <Text style={styles.buttonText}>Set your weekly target</Text>
              </Pressable>}
            </>}
        </View>
        <View style={styles.section}>
          <Text style={styles.eyebrow}>TODAY’S READINESS</Text>
          <Text style={styles.heading} accessibilityRole="header">{loading ? "Loading readiness…" : scoreError ? "Readiness unavailable" : recommendation ? `${recommendation} · ${score}/100` : "Check in before you train"}</Text>
          <Text style={styles.body}>{scoreError ? "Saved scores could not be read. You can still open manual training."
            : score === null ? "Your daily check-in provides readiness context. No score is assumed."
              : "Based on today’s saved check-in. No workout adjustments have been applied."}</Text>
          {!loading && score === null && <Pressable accessibilityRole="button" style={styles.link} onPress={() => navigation.navigate("Checkin")}>
            <Text style={styles.linkText}>Open daily check-in</Text>
          </Pressable>}
        </View>
        {unfinished && !loading && <View style={styles.divider}>
          <Text style={styles.heading} accessibilityRole="header">Workout in progress</Text>
          <Text style={styles.body}>{unfinished.name}</Text>
          <Pressable accessibilityRole="button" style={styles.button} onPress={() => navigation.navigate("ResumeWorkout", { sessionId: unfinished.id })}>
            <Text style={styles.buttonText}>Resume workout</Text>
          </Pressable>
        </View>}
        <View style={styles.divider}>
          <Text style={styles.heading} accessibilityRole="header">Your training</Text>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: loading || error }} disabled={loading || error} style={[styles.button, (loading || error) && styles.disabled]}
            onPress={() => hasCompletedSetup(data?.profile ?? null) ? navigation.navigate("SuggestedWorkout") : navigation.navigate("TrainingSetup", { continueToSuggested: true })}>
            <Text style={styles.buttonText}>Suggested workout</Text>
          </Pressable>
          <Text style={styles.body}>Suggested workouts require setup. Manual training does not.</Text>
          <Pressable accessibilityRole="button" style={[styles.button, styles.outline]} onPress={() => navigation.navigate("ManualWorkout")}>
            <Text style={styles.buttonText}>Manual workout</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={[styles.button, styles.outline]} onPress={() => navigation.navigate("WorkoutHistory")}>
            <Text style={styles.buttonText}>Workout history</Text>
          </Pressable>
          <Text style={styles.body}>Workout creation, logging and history views are coming in later milestones.</Text>
          <Pressable accessibilityRole="button" style={styles.link} onPress={() => navigation.navigate("TrainingSetup")}>
            <Text style={styles.linkText}>{hasCompletedSetup(data?.profile ?? null) ? "Edit training setup" : "Training setup · optional"}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
