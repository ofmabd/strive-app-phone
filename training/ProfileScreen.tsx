import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { trainingStore } from "../appStores";
import type { WeightUnit } from "./types";
import { weightUnit } from "./weightUnits";
import { styles } from "./styles";

export default function ProfileScreen() {
  const focused = useIsFocused();
  const [unit, setUnit] = useState<WeightUnit | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const inFlight = useRef(false);
  useFocusEffect(useCallback(() => {
    let active = true; setLoading(true);
    void trainingStore.load().then(data => { if (active) { setUnit(weightUnit(data)); setError(null); } })
      .catch(() => { if (active) { setUnit(null); setError("Preferences could not be loaded. Stored data is unchanged."); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]));
  async function choose(next: WeightUnit) {
    if (inFlight.current || loading || unit === null) return;
    inFlight.current = true; setSaving(true); setError(null);
    try { await trainingStore.setWeightUnit(next, new Date().toISOString()); setUnit(next); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Preference could not be verified. Try again."); }
    finally { inFlight.current = false; setSaving(false); }
  }
  return <SafeAreaView edges={["top", "left", "right"]} style={styles.screen}>
    {focused && <StatusBar style="dark" />}
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>STRIVE LABS</Text>
      <Text style={styles.title} accessibilityRole="header">Profile</Text>
      <View style={styles.section}>
        <Text style={styles.heading} accessibilityRole="header">Weight Units</Text>
        {loading ? <ActivityIndicator accessibilityLabel="Loading weight units" /> : <View accessibilityRole="radiogroup" accessibilityLabel="Weight Units" style={styles.section}>
          {(["lb", "kg"] as const).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={value === "lb" ? "Pounds (lb)" : "Kilograms (kg)"}
            accessibilityState={{ checked: unit === value, disabled: saving || unit === null }} disabled={saving || unit === null}
            style={[styles.option, unit === value && styles.selected]} onPress={() => void choose(value)}>
            <Text style={styles.buttonText}>{value === "lb" ? "Pounds (lb)" : "Kilograms (kg)"}{unit === value ? "  ✓" : ""}</Text>
          </Pressable>)}
        </View>}
        {saving && <Text style={styles.body} accessibilityLiveRegion="polite">Saving preference…</Text>}
        {error && <><Text style={styles.error} accessibilityRole="alert">{error}</Text>
          <Pressable accessibilityRole="button" style={styles.link} disabled={saving} onPress={() => setRetry(value => value + 1)}><Text style={styles.linkText}>Reload preference</Text></Pressable></>}
      </View>
    </ScrollView>
  </SafeAreaView>;
}
