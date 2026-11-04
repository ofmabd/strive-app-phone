import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseWorkouts } from "./storage";

export default function TrainScreen() {
  const [workout, setWorkout] = useState("");
  const [savedWorkout, setSavedWorkout] = useState("");

  const saveWorkout = async () => {
    try {
      const existing = await AsyncStorage.getItem("workouts");
      const workouts = parseWorkouts(existing);

      const today = new Date().toDateString();

      const existingIndex = workouts.findIndex(
        (item) => item?.date === today
      );

      if (existingIndex !== -1) {
        workouts[existingIndex] = { date: today, workout };
      } else {
        workouts.push({ date: today, workout });
      }

      await AsyncStorage.setItem("workouts", JSON.stringify(workouts));

      setSavedWorkout(workout);
      setWorkout("");
    } catch (e) {
      console.log("Error saving workout", e);
    }
  };

  const loadWorkout = async () => {
    try {
      const existing = await AsyncStorage.getItem("workouts");
      const workouts = parseWorkouts(existing);

      const today = new Date().toDateString();

      const todayEntry = workouts.find(
        (item) => item?.date === today
      );

      if (todayEntry) {
        setSavedWorkout(todayEntry.workout);
      }
    } catch (e) {
      console.log("Error loading workout", e);
    }
  };

  useEffect(() => {
    loadWorkout();
  }, []);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#0b0b0b",
        padding: 24,
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: "white",
          fontSize: 22,
          fontWeight: "600",
          marginBottom: 20,
        }}
      >
        What did you do today?
      </Text>

      <TextInput
        value={workout}
        onChangeText={setWorkout}
        placeholder="e.g. Chest workout, 5k run..."
        placeholderTextColor="#666"
        style={{
          backgroundColor: "#1a1a1a",
          color: "white",
          padding: 16,
          borderRadius: 10,
          marginBottom: 20,
        }}
      />

      <TouchableOpacity
        onPress={saveWorkout}
        style={{
          backgroundColor: "#00ff88",
          padding: 16,
          borderRadius: 10,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#000", fontWeight: "600" }}>
          Save Workout
        </Text>
      </TouchableOpacity>

      {savedWorkout ? (
        <Text
          style={{
            color: "#888",
            marginTop: 20,
            textAlign: "center",
          }}
        >
          Today’s workout: {savedWorkout}
        </Text>
      ) : null}
    </View>
  );
}