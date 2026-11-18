import { Pressable, ScrollView, Text } from "react-native";
import { REST_DURATIONS, restDurationLabel } from "./restTimer";
import { styles } from "./styles";
import { manualStyles as ui } from "./manualStyles";
export default function RestDurationSelector({ value, disabled, onChange, name }: {
  value: number; disabled: boolean; onChange: (seconds: number) => void; name: string;
}) {
  // Preserve older custom durations (including >5m) until the user chooses a preset.
  const choices = REST_DURATIONS.includes(value) ? REST_DURATIONS : [...REST_DURATIONS, value].sort((a, b) => a - b);
  return <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel={`${name} rest duration`} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
    {choices.map((seconds) => <Pressable key={seconds} accessibilityRole="radio" accessibilityLabel={`${name}, ${restDurationLabel(seconds)}`} accessibilityState={{ checked: seconds === value, disabled }} disabled={disabled}
      style={[ui.chip, seconds === value && styles.selected]} onPress={() => onChange(seconds)}><Text style={styles.buttonText}>{restDurationLabel(seconds)}</Text></Pressable>)}
  </ScrollView>;
}
