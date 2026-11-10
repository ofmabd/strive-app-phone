import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useIsFocused } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import TrainScreen from "../TrainScreen";
import { trainingStore } from "../appStores";
import ManualWorkoutScreen from "./ManualWorkoutScreen";
import ActiveWorkoutScreen from "./ActiveWorkoutScreen";
import TrainingSetupScreen from "./TrainingSetupScreen";
import type { TrainStackParamList } from "./navigationTypes";
import { hasCompletedSetup } from "./setup";
import { colors, styles } from "./styles";

const Stack = createNativeStackNavigator<TrainStackParamList>();
type PlaceholderProps = NativeStackScreenProps<TrainStackParamList,
  "SuggestedWorkout" | "WorkoutHistory">;
function TrainingPlaceholder({ navigation, route }: PlaceholderProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    if (route.name !== "SuggestedWorkout") {
      setLoading(false);
      return;
    }
    setLoading(true);
    void trainingStore.load().then((data) => {
      if (!active) return;
      if (route.name === "SuggestedWorkout" && !hasCompletedSetup(data.profile)) {
        navigation.replace("TrainingSetup", { continueToSuggested: true });
        return;
      }
      setError(false);
    }).catch((cause) => {
      console.log("Error opening training destination", cause);
      if (active) setError(true);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [navigation, route.name, route.params, retry]);
  const title = route.name === "SuggestedWorkout" ? "Suggested workout" : "Workout history";
  return (
    <SafeAreaView edges={["left", "right"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>TRAINING · PREVIEW</Text>
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        {loading ? <ActivityIndicator accessibilityLabel="Loading training data" /> : error ? <>
          <Text style={styles.error} accessibilityRole="alert">Training data could not be loaded. No workout was changed.</Text>
          <Pressable accessibilityRole="button" style={styles.button} onPress={() => setRetry((value) => value + 1)}><Text style={styles.buttonText}>Retry loading</Text></Pressable>
        </> : <>
          <Text style={styles.body}>{route.name === "SuggestedWorkout"
            ? "Setup is complete. Workout suggestions will be available in a later milestone. No workout has been generated."
            : "The history view will be available in a later milestone. Existing structured sessions and legacy workout notes are unchanged."}</Text>
        </>}
        <Pressable accessibilityRole="button" style={[styles.button, styles.outline]} onPress={() => navigation.popTo("TrainHome")}><Text style={styles.buttonText}>Back to Train</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
export default function TrainingNavigator() {
  const focused = useIsFocused();
  return <>
    {focused && <StatusBar style="dark" />}
    <Stack.Navigator initialRouteName="TrainHome" screenOptions={{ headerStyle: { backgroundColor: colors.paper }, headerTintColor: colors.ink,
      headerShadowVisible: false, contentStyle: { backgroundColor: colors.paper } }}>
      <Stack.Screen name="TrainHome" component={TrainScreen} options={{ headerShown: false, title: "Train" }} />
      <Stack.Screen name="TrainingSetup" component={TrainingSetupScreen} options={{ title: "Training setup" }} />
      <Stack.Screen name="SuggestedWorkout" component={TrainingPlaceholder} options={{ title: "Suggested workout" }} />
      <Stack.Screen name="ManualWorkout" component={ManualWorkoutScreen} options={{ title: "Manual workout" }} />
      <Stack.Screen name="WorkoutHistory" component={TrainingPlaceholder} options={{ title: "Workout history" }} />
      <Stack.Screen name="ResumeWorkout" component={ActiveWorkoutScreen} options={{ title: "Workout" }} />
    </Stack.Navigator>
  </>;
}
