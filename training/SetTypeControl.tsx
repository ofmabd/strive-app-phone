import { useState } from "react";
import { Keyboard, Pressable, StyleSheet, Text, View } from "react-native";
import type { SetType, WorkoutSet } from "./types";
import { SET_TYPES, setType } from "./setTypes";
import WorkoutSheet from "./WorkoutSheet";
import { styles } from "./styles";
export function SetBadge({ set, label, compact = false }: { set: WorkoutSet; label: string; compact?: boolean }) {
  const kind = SET_TYPES.find((item) => item.value === setType(set))!;
  return <View style={[badgeStyles.badge, compact && { minWidth: 44, minHeight: 44 }, { backgroundColor: kind.background }]}>
    <Text style={[styles.buttonText, { color: kind.color }]}>{label}</Text>
  </View>;
}
export default function SetTypeControl({ set, label, disabled, onChange, compact = false }: {
  set: WorkoutSet; label: string; disabled: boolean; onChange: (type: SetType) => void; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const kind = SET_TYPES.find((item) => item.value === setType(set))!;
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${kind.name} set ${label}. Change set type`}
      disabled={disabled} onPress={() => { Keyboard.dismiss(); setOpen(true); }}>
      <SetBadge set={set} label={label} compact={compact} />
    </Pressable>
    <WorkoutSheet visible={open} close={() => setOpen(false)} label="set types">
        <Text style={styles.heading} accessibilityRole="header">Set type</Text>
        {SET_TYPES.map((item) => <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ checked: setType(set) === item.value, disabled }} disabled={disabled}
          style={[styles.option, { backgroundColor: item.background }]} onPress={() => { onChange(item.value); setOpen(false); }}>
          <Text style={[styles.buttonText, { color: item.color }]}>{item.mark ? `${item.mark} · ` : ""}{item.name}</Text>
        </Pressable>)}
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => setOpen(false)}><Text style={styles.buttonText}>Cancel</Text></Pressable>
    </WorkoutSheet>
  </>;
}
const badgeStyles = StyleSheet.create({
  badge: { minWidth: 48, minHeight: 48, borderRadius: 6, justifyContent: "center", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 8 },
});
