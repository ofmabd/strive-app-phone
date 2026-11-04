import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { useCallback, useState } from "react";
import Svg, { Circle } from "react-native-svg";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import AsyncStorage from "@react-native-async-storage/async-storage";
import TrainScreen from "./TrainScreen";
import type { CompositeScreenProps, NavigatorScreenParams } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { parseScores, parseWorkouts } from "./storage";
import type { ScoreEntry } from "./storage";

type Recommendation = "MAINTAIN" | "PUSH" | "RECOVER";

type TabParamList = {
  Home: {
    score: number;
    recommendation: Recommendation;
    sleep: number | null;
    energy: number | null;
    soreness: number | null;
    intensity: number | null;
  } | undefined;
  Train: undefined;
  Recover: undefined;
  Profile: undefined;
};

type RootStackParamList = {
  Checkin: undefined;
  Main: NavigatorScreenParams<TabParamList>;
};

type CheckinScreenProps = NativeStackScreenProps<RootStackParamList, "Checkin">;
type DashboardScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, "Home">,
  NativeStackScreenProps<RootStackParamList, "Main">
>;

type MetricProps = {
  label: string;
  value: number | null;
  setValue: (value: number) => void;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function CheckinScreen({ navigation }: CheckinScreenProps) {
  const [sleep, setSleep] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [soreness, setSoreness] = useState<number | null>(null);
  const [intensity, setIntensity] = useState<number | null>(null);

  const Metric = ({ label, value, setValue }: MetricProps) => (
  <View style={{ marginBottom: 28 }}>
    <Text
      style={{
        color: "white",
        marginBottom: 10,
        opacity: 0.7,
        fontSize: 14,
      }}
    >
      {label}
    </Text>

    <View style={{ flexDirection: "row" }}>
      {[1, 2, 3, 4, 5].map((num) => {
        const selected = value === num;

        return (
          <TouchableOpacity
            key={num}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setValue(num);
            }}
            style={{
              flex: 1,
              marginHorizontal: 4,
              paddingVertical: 16,
              borderRadius: 14,
              backgroundColor: selected ? "#00ff88" : "#1a1a1a",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: selected ? "#000" : "#fff",
                fontWeight: "600",
              }}
            >
              {num}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  </View>
);

  const calculateScore = () => {
    if (!sleep || !energy || !soreness || !intensity) return null;

    const s = sleep / 5;
    const e = energy / 5;
    const so = soreness / 5;
    const i = intensity / 5;

    const score =
      s * 0.3 +
      e * 0.3 +
      (1 - so) * 0.2 +
      (1 - i) * 0.2;

    return Math.round(score * 100);
  };

  const handleSubmit = async () => {
    const score = calculateScore();
    if (score === null) return;

    let recommendation: Recommendation = "MAINTAIN";
    if (score >= 80) recommendation = "PUSH";
    else if (score < 50) recommendation = "RECOVER";

  const saveScore = async () => {
    try {
      const existing = await AsyncStorage.getItem("scores");
      const scores = parseScores(existing);

      const today = new Date().toDateString();

      const existingIndex = scores.findIndex(
        (item) => item?.date === today
      );

      if (existingIndex !== -1) {
        scores[existingIndex] = { date: today, score };
      } else {
        scores.push({ date: today, score });
      }

      await AsyncStorage.setItem("scores", JSON.stringify(scores));
    } catch (e) {
      console.log("Error saving score", e);
    }
  };

  await saveScore();

    navigation.navigate("Main", {
      screen: "Home",
      params: {
        score,
        recommendation,
        sleep,
        energy,
        soreness,
        intensity,
      },
    });
  };

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
          textAlign: "center",
          marginBottom: 40,
        }}
      >
        How are you feeling today?
      </Text>

      <Metric label="Sleep" value={sleep} setValue={setSleep} />
      <Metric label="Energy" value={energy} setValue={setEnergy} />
      <Metric label="Soreness" value={soreness} setValue={setSoreness} />
      <Metric label="Yesterday's Intensity" value={intensity} setValue={setIntensity} />

      <TouchableOpacity
        onPress={() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          handleSubmit();
        }}
        style={{
          marginTop: 30,
          backgroundColor: "#fff",
          padding: 16,
          borderRadius: 10,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#000", fontWeight: "600" }}>
          Submit
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const dashboardColors = {
  background: "#15191C",
  elevated: "#23292B",
  paper: "#F2F0EA",
  sage: "#B9C9A5",
  text: "#F5F4EF",
  secondary: "#A6AFB2",
};

function DashboardScreen({ route, navigation }: DashboardScreenProps) {
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [todayWorkout, setTodayWorkout] = useState<string | null>(null);
  const [scoresError, setScoresError] = useState(false);
  const [workoutError, setWorkoutError] = useState(false);
  const [loading, setLoading] = useState(true);
  const isFocused = useIsFocused();

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    // Read independently so a damaged payload does not hide the other section.
    const loadScores = async () => {
      try {
        const entries = parseScores(await AsyncStorage.getItem("scores"));
        if (entries.some((entry) => entry.score < 0 || entry.score > 100)) {
          throw new Error("Saved readiness score is outside the 0–100 range.");
        }
        if (active) {
          setScores(entries);
          setScoresError(false);
        }
      } catch (error) {
        console.log("Error loading dashboard scores", error);
        if (active) {
          setScores([]);
          setScoresError(true);
        }
      }
    };
    const loadWorkout = async () => {
      try {
        const entries = parseWorkouts(await AsyncStorage.getItem("workouts"));
        const entry = entries.find((item) => item.date === new Date().toDateString());
        if (active) {
          setTodayWorkout(entry?.workout ?? null);
          setWorkoutError(false);
        }
      } catch (error) {
        console.log("Error loading dashboard workout", error);
        if (active) {
          setTodayWorkout(null);
          setWorkoutError(true);
        }
      }
    };
    void Promise.all([loadScores(), loadWorkout()]).then(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [route.params]));

  const today = new Date();
  const score = scores.find((entry) => entry.date === today.toDateString())?.score;
  const recommendation: Recommendation | null = score === undefined ? null
    : score >= 80 ? "PUSH" : score < 50 ? "RECOVER" : "MAINTAIN";
  const explanation = recommendation === "PUSH"
    ? "Your check-in suggests higher readiness for training today."
    : recommendation === "MAINTAIN"
      ? "Your check-in suggests moderate readiness. Keep today’s effort steady."
      : recommendation === "RECOVER"
        ? "Your check-in suggests lower readiness. Prioritize rest today."
        : "Check in with your sleep, energy, soreness and recent intensity.";
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    return {
      date,
      score: scores.find((entry) => entry.date === date.toDateString())?.score,
    };
  });
  const radius = 94;
  const circumference = 2 * Math.PI * radius;

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={dashboardStyles.screen}>
      {isFocused && <StatusBar style="light" />}
      <ScrollView contentContainerStyle={dashboardStyles.content}>
        <View style={dashboardStyles.header}>
          <Text style={dashboardStyles.brand} accessibilityRole="header">STRIVE LABS</Text>
          <Text style={dashboardStyles.date}>
            {today.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </Text>
        </View>

        <View style={dashboardStyles.readiness}>
          <Text style={dashboardStyles.eyebrow}>DAILY READINESS</Text>
          <View style={dashboardStyles.ring}
            accessible accessibilityLabel={loading ? "Loading readiness" : scoresError
              ? "Readiness unavailable" : score === undefined ? "No check-in today" : `Readiness ${score} out of 100`}>
            <Svg width={224} height={224} style={StyleSheet.absoluteFill} accessible={false}>
              <Circle cx={112} cy={112} r={radius} stroke={dashboardColors.elevated} strokeWidth={7} fill="none" />
              {score !== undefined && <Circle cx={112} cy={112} r={radius}
                stroke={dashboardColors.sage} strokeWidth={7} fill="none"
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={circumference * (1 - score / 100)}
                strokeLinecap="round" rotation={-90} origin="112, 112" />}
            </Svg>
            <Text style={dashboardStyles.score}>{loading ? "…" : score ?? "—"}</Text>
            <Text style={dashboardStyles.scoreCaption}>{score === undefined ? "AWAITING CHECK-IN" : "OUT OF 100"}</Text>
          </View>
          <Text style={dashboardStyles.recommendation} accessibilityRole="header">
            {loading ? "Loading readiness" : scoresError ? "Readiness unavailable" : recommendation ?? "Start with a check-in"}
          </Text>
          <Text style={dashboardStyles.explanation}>
            {scoresError ? "Saved scores could not be read. Your stored data has been kept unchanged." : explanation}
          </Text>
        </View>

        <TouchableOpacity accessibilityRole="button" style={dashboardStyles.checkin}
          onPress={() => navigation.navigate("Checkin")}>
          <Text style={dashboardStyles.checkinTitle}>{score === undefined ? "Complete daily check-in" : "Update daily check-in"}</Text>
          <Text style={dashboardStyles.checkinDetail}>Sleep · Energy · Soreness · Intensity</Text>
        </TouchableOpacity>

        <View style={dashboardStyles.workout}>
          <Text style={dashboardStyles.lightEyebrow}>TODAY’S WORKOUT</Text>
          <Text style={dashboardStyles.workoutTitle} accessibilityRole="header">
            {loading ? "Loading workout…" : workoutError ? "Workout unavailable" : todayWorkout?.trim() ? todayWorkout : "No workout logged"}
          </Text>
          <Text style={dashboardStyles.workoutDetail}>
            {workoutError ? "Your saved workout could not be read. Stored data is unchanged."
              : todayWorkout?.trim() ? "Your saved session for today." : "Record your session when you’re ready."}
          </Text>
          <TouchableOpacity accessibilityRole="button" style={dashboardStyles.workoutAction}
            onPress={() => navigation.navigate("Train")}>
            <Text style={dashboardStyles.workoutActionText}>{todayWorkout?.trim() ? "Edit workout" : "Log workout"}</Text>
          </TouchableOpacity>
        </View>

        <View style={dashboardStyles.history}>
          <Text style={dashboardStyles.sectionTitle} accessibilityRole="header">Readiness history</Text>
          <Text style={dashboardStyles.historyDetail}>Last 7 days · Score out of 100</Text>
          {scoresError || loading ? <Text style={dashboardStyles.historyStatus}>
            {loading ? "Loading saved scores…" : "History unavailable. Saved data is unchanged."}
          </Text> : <>
            <View style={dashboardStyles.week}>
              {days.map((day, index) => (
                <View key={day.date.toDateString()} style={dashboardStyles.day} accessible
                  accessibilityLabel={`${day.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}: ${day.score === undefined ? "No check-in" : `${day.score} out of 100`}`}>
                  <Text style={dashboardStyles.dayScore}>{day.score ?? "—"}</Text>
                  <View style={dashboardStyles.barTrack}>
                    {day.score !== undefined && <View style={[dashboardStyles.bar,
                      { height: `${day.score}%` }, index === 6 && dashboardStyles.todayBar]} />}
                  </View>
                  <Text style={[dashboardStyles.dayLabel, index === 6 && dashboardStyles.todayLabel]}>
                    {day.date.toLocaleDateString(undefined, { weekday: "narrow" })}
                  </Text>
                  <Text style={dashboardStyles.dayNumber}>{day.date.getDate()}</Text>
                </View>
              ))}
            </View>
            <Text style={dashboardStyles.historyDetail}>— No check-in recorded</Text>
          </>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const dashboardStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: dashboardColors.background },
  content: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 32, width: "100%", maxWidth: 560, alignSelf: "center" },
  header: { gap: 8, paddingBottom: 30, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#41494C" },
  brand: { color: dashboardColors.text, fontSize: 16, fontWeight: "700", letterSpacing: 3 },
  date: { color: dashboardColors.secondary, fontSize: 14, lineHeight: 21 },
  readiness: { alignItems: "center", paddingTop: 30, paddingBottom: 26 },
  eyebrow: { color: dashboardColors.secondary, fontSize: 12, fontWeight: "600", letterSpacing: 2 },
  ring: { width: 224, minHeight: 224, alignItems: "center", justifyContent: "center", marginVertical: 12 },
  score: { color: dashboardColors.text, fontSize: 68, fontWeight: "500", letterSpacing: -3, fontVariant: ["tabular-nums"] },
  scoreCaption: { color: dashboardColors.secondary, fontSize: 10, letterSpacing: 1.2, marginTop: 2 },
  recommendation: { color: dashboardColors.sage, fontSize: 24, fontWeight: "600", textAlign: "center", letterSpacing: 0.5 },
  explanation: { color: dashboardColors.secondary, fontSize: 16, lineHeight: 24, textAlign: "center", marginTop: 10, maxWidth: 340 },
  checkin: { backgroundColor: dashboardColors.sage, padding: 18, minHeight: 64, borderRadius: 10, gap: 5 },
  checkinTitle: { color: dashboardColors.background, fontSize: 16, fontWeight: "700" },
  checkinDetail: { color: "#384330", fontSize: 12, lineHeight: 18 },
  workout: { backgroundColor: dashboardColors.paper, padding: 22, borderRadius: 12, marginTop: 28 },
  lightEyebrow: { color: "#515C50", fontSize: 12, fontWeight: "600", letterSpacing: 1.5 },
  workoutTitle: { color: dashboardColors.background, fontSize: 24, lineHeight: 32, fontWeight: "600", marginTop: 16 },
  workoutDetail: { color: "#535C5F", fontSize: 14, lineHeight: 22, marginTop: 8 },
  workoutAction: { alignSelf: "flex-start", minHeight: 48, justifyContent: "center", paddingRight: 20, marginTop: 12 },
  workoutActionText: { color: dashboardColors.background, fontSize: 15, fontWeight: "700", textDecorationLine: "underline" },
  history: { marginTop: 32, paddingTop: 24, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#41494C" },
  sectionTitle: { color: dashboardColors.text, fontSize: 20, fontWeight: "600" },
  historyDetail: { color: dashboardColors.secondary, fontSize: 12, lineHeight: 18, marginTop: 6 },
  historyStatus: { color: dashboardColors.secondary, fontSize: 14, lineHeight: 22, marginVertical: 24 },
  week: { flexDirection: "row", gap: 8, marginTop: 24, marginBottom: 14 },
  day: { flex: 1, alignItems: "center", gap: 8 },
  dayScore: { color: dashboardColors.text, fontSize: 12, fontVariant: ["tabular-nums"] },
  barTrack: { height: 64, width: 6, backgroundColor: dashboardColors.elevated, justifyContent: "flex-end", borderRadius: 3, overflow: "hidden" },
  bar: { width: "100%", backgroundColor: "#899B86", borderRadius: 3 },
  todayBar: { backgroundColor: dashboardColors.sage },
  dayLabel: { color: dashboardColors.secondary, fontSize: 12 },
  todayLabel: { color: dashboardColors.sage, fontWeight: "700" },
  dayNumber: { color: dashboardColors.secondary, fontSize: 11, fontVariant: ["tabular-nums"] },
});

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#0b0b0b",
          borderTopColor: "#1a1a1a",
        },
        tabBarActiveTintColor: "#00ff88",
        tabBarInactiveTintColor: "#888",
      }}
    >
      <Tab.Screen name="Home" component={DashboardScreen} options={{
        tabBarActiveTintColor: dashboardColors.sage,
        tabBarInactiveTintColor: dashboardColors.secondary,
        tabBarStyle: { backgroundColor: dashboardColors.background, borderTopColor: "#41494C" },
      }} />
      
      <Tab.Screen name="Train" component={TrainScreen} />

      <Tab.Screen
        name="Recover"
        component={() => (
          <View style={{ flex: 1, backgroundColor: "#0b0b0b", justifyContent: "center", alignItems: "center" }}>
            <Text style={{ color: "white" }}>Recover</Text>
          </View>
        )}
      />

      <Tab.Screen
        name="Profile"
        component={() => (
          <View style={{ flex: 1, backgroundColor: "#0b0b0b", justifyContent: "center", alignItems: "center" }}>
            <Text style={{ color: "white" }}>Profile</Text>
          </View>
        )}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Checkin" component={CheckinScreen} />
        <Stack.Screen name="Main" component={TabNavigator} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}