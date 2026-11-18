import { useEffect, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { trainingStore } from "../appStores";
import { EXERCISE_EQUIPMENT, MUSCLES, label } from "./catalog";
import { customExercise } from "./manual";
import type { Exercise, ExerciseEquipment, MuscleGroup, TrainingData } from "./types";
import { pickerSections } from "./workoutPolish";
import { styles } from "./styles";
import { manualStyles as ui } from "./manualStyles";

type Props = { saved: Exercise[]; selected: string[]; toggle?: boolean; disabled?: boolean;
  onChoose: (exercise: Exercise) => void; onCreated: (exercise: Exercise) => void };
export default function ExercisePicker({ saved, selected, toggle = false, disabled, onChoose, onCreated }: Props) {
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState(false);
  const [name, setName] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [equipment, setEquipment] = useState<ExerciseEquipment | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const pendingExercise = useRef<Exercise | null>(null);
  const [preferences,setPreferences]=useState<TrainingData | null>(null);
  const [preferenceError,setPreferenceError]=useState(false);
  const [pendingFavorite,setPendingFavorite]=useState(false);
  const [retryPreferences,setRetryPreferences]=useState(0);
  useEffect(()=>{let active=true;void trainingStore.load().then(data=>{if(active){setPreferences(data);setPreferenceError(false);}}).catch(()=>{if(active)setPreferenceError(true);});return()=>{active=false;};},[retryPreferences]);
  const sections=pickerSections({...preferences, schemaVersion:1, profile:preferences?.profile??null, sessions:preferences?.sessions??[],weeklyTargets:preferences?.weeklyTargets??[],exercises:saved},query);
  async function favorite(id:string){
    if(!preferences||pendingFavorite)return;
    setPendingFavorite(true);
    const selected=!preferences.exercisePreferences?.favoriteIds.includes(id);
    try{await trainingStore.setExerciseFavorite(id,selected);setPreferences(await trainingStore.load());setPreferenceError(false);}
    catch{setPreferenceError(true);}finally{setPendingFavorite(false);}
  }
  async function createCustom() {
    if (!muscle || !equipment || !name.trim() || inFlight.current) return;
    inFlight.current = true; setSaving(true); setError(null);
    try {
      const previous = pendingExercise.current;
      const exercise = previous && previous.name === name.trim() && previous.primaryMuscle === muscle && previous.equipment === equipment
        ? previous : customExercise(name, muscle, equipment, new Date().toISOString());
      pendingExercise.current = exercise;
      await trainingStore.saveExercise(exercise);
      onCreated(exercise); onChoose(exercise);
      pendingExercise.current = null;
      setName(""); setMuscle(null); setEquipment(null); setCustom(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Custom exercise could not be saved."); }
    finally { setSaving(false); inFlight.current = false; }
  }
  return <View style={styles.section}>
    <Text style={styles.heading} accessibilityRole="header">Exercise library</Text>
    <TextInput accessibilityLabel="Search exercises" placeholder="Search exercises" placeholderTextColor="#515C5F" style={ui.input} value={query} onChangeText={setQuery} />
    {preferenceError && <View><Text style={styles.error} accessibilityRole="alert">Favorites could not be verified.</Text><Pressable accessibilityRole="button" style={styles.link} onPress={()=>setRetryPreferences(v=>v+1)}><Text style={styles.linkText}>Retry loading favorites</Text></Pressable></View>}
    {sections.every(section=>!section.exercises.length) && <Text style={styles.body}>No matching exercises. You can create a custom exercise below.</Text>}
    {sections.map(section=><View key={section.title} style={{gap:8}}>
      <Text style={styles.eyebrow}>{section.title}</Text>
      {!section.exercises.length && <Text style={ui.caption}>{section.title==="Favorites"?"No favorites yet.":section.title==="Recently Used"?"No recent exercises.":"No other exercises."}</Text>}
      {section.exercises.map((exercise) => {
      const checked = selected.includes(exercise.id);
      return <View key={exercise.id} style={{flexDirection:"row",gap:6,alignItems:"center"}}><Pressable accessibilityRole="checkbox" accessibilityLabel={`${exercise.name}, ${checked ? "selected" : "not selected"}`}
        accessibilityState={{ checked, disabled: disabled || (checked && !toggle) }} disabled={disabled || (checked && !toggle)}
        style={[styles.option, {flex:1}, checked && styles.selected]} onPress={() => onChoose(exercise)}>
        <Text style={styles.buttonText}>{exercise.name}{checked ? "  ✓" : ""}</Text>
        <Text style={ui.caption}>{exercise.primaryMuscle ? label(exercise.primaryMuscle) : "Legacy exercise"} · {exercise.equipment ? label(exercise.equipment) : "Equipment not recorded"}</Text>
      </Pressable><Pressable accessibilityRole="button" accessibilityLabel={`${preferences?.exercisePreferences?.favoriteIds.includes(exercise.id)?"Unfavorite":"Favorite"} ${exercise.name}`} accessibilityState={{disabled:!preferences||pendingFavorite||disabled}} disabled={!preferences||pendingFavorite||disabled} style={ui.chip} onPress={()=>void favorite(exercise.id)}>
        <Text style={styles.buttonText}>{preferences?.exercisePreferences?.favoriteIds.includes(exercise.id)?"★":"☆"}</Text>
      </Pressable></View>;
    })}</View>)}
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: custom }} style={styles.link} disabled={disabled || saving} onPress={() => setCustom((value) => !value)}>
      <Text style={styles.linkText}>{custom ? "Close custom exercise" : "Create custom exercise"}</Text>
    </Pressable>
    {custom && <View style={styles.divider}>
      <Text style={styles.heading}>Custom exercise</Text>
      <TextInput style={ui.input} accessibilityLabel="Custom exercise name" placeholder="Exercise name" placeholderTextColor="#515C5F" value={name} onChangeText={setName} editable={!saving && !disabled} maxLength={120} />
      <Text style={styles.body}>Primary muscle group</Text>
      <View style={ui.chips} accessibilityRole="radiogroup" accessibilityLabel="Primary muscle group">
        {MUSCLES.map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: muscle === value }} disabled={saving || disabled}
          style={[ui.chip, muscle === value && styles.selected]} onPress={() => setMuscle(value)}><Text style={ui.caption}>{label(value)}</Text></Pressable>)}
      </View>
      <Text style={styles.body}>Equipment</Text>
      <View style={ui.chips} accessibilityRole="radiogroup" accessibilityLabel="Exercise equipment">
        {EXERCISE_EQUIPMENT.map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: equipment === value }} disabled={saving || disabled}
          style={[ui.chip, equipment === value && styles.selected]} onPress={() => setEquipment(value)}><Text style={ui.caption}>{label(value)}</Text></Pressable>)}
      </View>
      {error && <Text style={styles.error} accessibilityRole="alert">{error} Your entries are still here; try saving again.</Text>}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving || disabled || !name.trim() || !muscle || !equipment }} disabled={saving || disabled || !name.trim() || !muscle || !equipment}
        style={[styles.button, (saving || disabled || !name.trim() || !muscle || !equipment) && styles.disabled]} onPress={() => void createCustom()}>
        <Text style={styles.buttonText}>{saving ? "Saving exercise…" : "Save and select exercise"}</Text>
      </Pressable>
    </View>}
  </View>;
}
