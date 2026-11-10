import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { trainingStore } from "../appStores";
import { localDate } from "./consistency";
import type { TrainStackParamList } from "./navigationTypes";
import type { Equipment, Experience, PrimaryGoal, WeeklyTarget } from "./types";
import { EQUIPMENT, EXPERIENCE, FREQUENCIES, GOALS, setupProfile } from "./setup";
import { styles } from "./styles";

type Props = NativeStackScreenProps<TrainStackParamList, "TrainingSetup">;
export default function TrainingSetupScreen({ navigation, route }: Props) {
  const [goal, setGoal] = useState<PrimaryGoal | null>(null);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [frequency, setFrequency] = useState<WeeklyTarget | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void trainingStore.load().then((data) => {
      if (!active) return;
      setGoal(data.profile?.primaryGoal ?? null);
      setExperience(data.profile?.experience ?? null);
      setEquipment(data.profile?.equipment ?? null);
      setFrequency(data.profile?.weeklyTarget ?? null);
      setLoadError(false);
    }).catch((error) => {
      console.log("Error loading training setup", error);
      if (active) setLoadError(true);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);

  async function save() {
    if (!goal || !experience || !equipment || !frequency || saveInFlight.current) return;
    saveInFlight.current = true;
    setSaving(true); setSaveError(false);
    try {
      const current = await trainingStore.load();
      const now = new Date();
      await trainingStore.saveProfile(setupProfile(current.profile, {
        primaryGoal: goal, experience, equipment, weeklyTarget: frequency,
      }, now.toISOString()), localDate(now));
      if (navigation.isFocused()) {
        if (route.params?.continueToSuggested) navigation.replace("SuggestedWorkout");
        else navigation.popTo("TrainHome");
      }
    } catch (error) {
      console.log("Error saving training setup", error);
      setSaveError(true);
    } finally { saveInFlight.current = false; setSaving(false); }
  }
  const titles = ["What is your primary goal?", "What is your experience?", "Where will you train?", "How often will you train?"];
  const selected = [goal, experience, equipment, frequency][step];
  const options = step === 0 ? GOALS.map((item) => ({ ...item, select: () => setGoal(item.value) }))
    : step === 1 ? EXPERIENCE.map((item) => ({ ...item, select: () => setExperience(item.value) }))
      : step === 2 ? EQUIPMENT.map((item) => ({ ...item, select: () => setEquipment(item.value) }))
        : FREQUENCIES.map((value) => ({ value, label: `${value} ${value === 1 ? "workout" : "workouts"} per week`, select: () => setFrequency(value) }));
  return (
    <SafeAreaView edges={["left", "right"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <ActivityIndicator accessibilityLabel="Loading training setup" /> : loadError ? <View style={styles.section}>
          <Text style={styles.error} accessibilityRole="alert">Setup could not be loaded. Stored data has not been reset.</Text>
          <Pressable accessibilityRole="button" style={styles.button} onPress={() => setRetry((value) => value + 1)}><Text style={styles.buttonText}>Retry loading</Text></Pressable>
        </View> : <>
          <Text style={styles.eyebrow} accessibilityLiveRegion="polite">STEP {step + 1} OF 4 · OPTIONAL SETUP</Text>
          <Text style={styles.title} accessibilityRole="header">{titles[step]}</Text>
          <View style={styles.section} accessibilityRole="radiogroup" accessibilityLabel={titles[step]}>
            {options.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: selected === option.value, disabled: saving }}
              disabled={saving} style={[styles.option, selected === option.value && styles.selected]}
              onPress={option.select}><Text style={styles.buttonText}>{option.label}</Text></Pressable>)}
          </View>
          {step === 3 && <Text style={styles.body}>This sets your weekly consistency target. Any target already saved for this week stays unchanged; your new preference applies to weeks without a saved target.</Text>}
          {saveError && <Text style={styles.error} accessibilityRole="alert">Setup could not be saved and verified. Your selections are still here. Please try again.</Text>}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: selected === null || saving }} disabled={selected === null || saving}
            style={[styles.button, (selected === null || saving) && styles.disabled]}
            onPress={() => step < 3 ? setStep((value) => value + 1) : void save()}>
            <Text style={styles.buttonText}>{saving ? "Saving…" : step === 3 ? "Save training setup" : "Continue"}</Text>
          </Pressable>
          {step > 0 && <Pressable accessibilityRole="button" disabled={saving} style={[styles.button, styles.outline]} onPress={() => setStep((value) => value - 1)}>
            <Text style={styles.buttonText}>Previous step</Text>
          </Pressable>}
        </>}
        <Pressable accessibilityRole="button" disabled={saving} style={styles.link} onPress={() => navigation.popTo("TrainHome")}>
          <Text style={styles.linkText}>Skip for now · return to Train</Text>
        </Pressable>
        <Text style={styles.body}>Manual workouts remain available without setup. Answers are saved only when you finish all four steps.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
