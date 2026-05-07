import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, Text, TouchableOpacity } from "react-native";
import { useState } from "react";
import Svg, { Circle } from "react-native-svg";
import { useEffect, useRef } from "react";
import { Animated } from "react-native";
import * as Haptics from "expo-haptics";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import AsyncStorage from "@react-native-async-storage/async-storage";
import TrainScreen from "./TrainScreen";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function CheckinScreen({ navigation }) {
  const [sleep, setSleep] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [soreness, setSoreness] = useState<number | null>(null);
  const [intensity, setIntensity] = useState<number | null>(null);

  const Metric = ({ label, value, setValue }) => (
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

    let recommendation = "MAINTAIN";
    if (score >= 80) recommendation = "PUSH";
    else if (score < 50) recommendation = "RECOVER";

  const saveScore = async () => {
    try {
      const existing = await AsyncStorage.getItem("scores");
      const scores = existing ? JSON.parse(existing) : [];

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

function DashboardScreen({ route, navigation }) {
  const score = route.params?.score ?? 0;
  const recommendation = route.params?.recommendation ?? "MAINTAIN";

  const sleep = route.params?.sleep ?? 0;
  const energy = route.params?.energy ?? 0;
  const soreness = route.params?.soreness ?? 0;
  
  const [trend, setTrend] = useState("");
  const [hasCheckedInToday, setHasCheckedInToday] = useState(false);
  const [todayWorkout, setTodayWorkout] = useState("");
    
  const fireScale = useRef(new Animated.Value(1)).current;
  const [streak, setStreak] = useState(1);
  const getColor = () => {
  if (score >= 85) return "#00ff88";   // Green
  if (score >= 70) return "#a3e635";   // Light green
  if (score >= 60) return "#facc15";   // Yellow
  if (score >= 40) return "#fb923c";   // Orange
  return "#ef4444";                    // Red
};
  const animatedValue = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: score,
      duration: 1200,
      useNativeDriver: false,
  }).start();
}, []);

useEffect(() => {
  Animated.loop(
    Animated.sequence([
      Animated.timing(fireScale, {
        toValue: 1.2,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(fireScale, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
    ])
  ).start();
}, []);

useEffect(() => {
  const loadTrend = async () => {
    try {
      const existing = await AsyncStorage.getItem("scores");
      const scores = existing ? JSON.parse(existing) : [];

      let currentStreak = 0;

      for (let i = scores.length - 1; i >= 0; i--) {
        const entryDate = new Date(scores[i].date);
        const now = new Date();

        const diffDays = Math.floor(
          (now - entryDate) / (1000 * 60 * 60 * 24)
        );

        if (diffDays === currentStreak) {
          currentStreak++;
        } else {
          break;
        }
      }

      setStreak(currentStreak);

      const today = new Date().toDateString();
      const workoutData = await AsyncStorage.getItem("workouts");
      const workouts = workoutData ? JSON.parse(workoutData) : [];

      const todayWorkoutEntry = workouts.find(
        (item) => item?.date === today
      );

      if (todayWorkoutEntry) {
        setTodayWorkout(todayWorkoutEntry.workout);
      }

      const todayEntry = scores.find((item) => item?.date === today);

      if (todayEntry) {
        setHasCheckedInToday(true);
      }

      if (scores.length < 2) {
        setTrend("No trend yet");
        return;
      }

      const latest = scores[scores.length - 1]?.score;
      const previous = scores[scores.length - 2]?.score;
      const diff = latest - previous;

      if (diff > 0) setTrend(`↑ +${diff}% vs last check`);
      else if (diff < 0) setTrend(`↓ ${diff}% vs last check`);
      else setTrend("→ No change");
    } catch (e) {
      console.log("Error loading trend", e);
    }
  };

  loadTrend();
  }, [route.params]);

  const radius = 100;
  const circumference = 2 * Math.PI * radius;
  const animatedStroke = animatedValue.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
  });

  const getMessage = () => {
    if (recommendation === "PUSH")
      return "High readiness detected. You're primed for a strong session.";
    if (recommendation === "MAINTAIN")
      return "Moderate readiness. Stay consistent and train smart.";
    return "Your body needs recovery. Prioritize rest today.";
  };
  const getAction = () => {
    if (recommendation === "PUSH") return "TRAIN HARD";
    if (recommendation === "MAINTAIN") return "TRAIN SMART";
    return "RECOVER";
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#0b0b0b",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: 260,
          height: 260,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Svg
          width={260}
          height={260}
          style={{ transform: [{ rotate: "-90deg" }] }}
        >
          <Circle
            cx="130"
            cy="130"
            r={radius}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="14"
            fill="none"
          />

          <AnimatedCircle
            cx="130"
            cy="130"
            r={radius}
            stroke={getColor()}
            strokeWidth="14"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={animatedStroke}
            strokeLinecap="round"
          />
        </Svg>

        <Text
          style={{
            position: "absolute",
            color: "white",
            fontSize: 48,
            fontWeight: "700",
          }}
        >
          {score}
        </Text>
      </View>

      <Text
        style={{
          color: "white",
          fontSize: 26,
          fontWeight: "600",
          marginTop: 30,
        }}
      >
        {recommendation}
      </Text>

      <Animated.Text
        style={{
          color: "#00ff88",
          fontSize: 16,
          marginTop: 10,
          fontWeight: "600",
          transform: [{ scale: fireScale }],
        }}
      >
        🔥 {streak} Day Streak
      </Animated.Text>
      <Text
        style={{
          color: "#888",
          fontSize: 13,
          marginTop: 6,
        }}
      >
        {trend}
      </Text>
      <TouchableOpacity
          onPress={() => {
            if (hasCheckedInToday) {
              navigation.navigate("Checkin");
            } else {
              navigation.navigate("Train");
            }
          }}
          style={{
            marginTop: 30,
            backgroundColor: getColor(),
            paddingVertical: 16,
            width: "80%",
            alignItems: "center",
            borderRadius: 14,
          }}
        >
        <Text
          style={{
            color: "#000",
            fontWeight: "700",
            fontSize: 16,
          }}
        >
          {hasCheckedInToday ? "UPDATE TODAY'S CHECK-IN" : getAction()}
        </Text>
      </TouchableOpacity>
      {todayWorkout ? (
        <Text
          style={{
            color: "#888",
            fontSize: 14,
            marginTop: 12,
            textAlign: "center",
          }}
        >
          Today’s workout: {todayWorkout}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 30,
          width: "80%",
        }}
      >
        {[
          { label: "Sleep", value: sleep },
          { label: "Energy", value: energy },
          { label: "Soreness", value: soreness },
        ].map((item) => (
          <View key={item.label} style={{ alignItems: "center" }}>
            <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>
              {item.value}
            </Text>
            <Text style={{ color: "#888", fontSize: 12, marginTop: 4 }}>
              {item.label}
            </Text>
          </View>
        ))}
      </View>

      <Text
        style={{
          color: "white",
          opacity: 0.6,
          fontSize: 14,
          textAlign: "center",
          marginTop: 12,
          paddingHorizontal: 30,
        }}
      >
        {getMessage()}
      </Text>
    </View>
  );
}

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
      <Tab.Screen name="Home" component={DashboardScreen} />
      
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