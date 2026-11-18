import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { trainingStore } from "../appStores";
import type { TrainStackParamList } from "./navigationTypes";
import type { WorkoutSession } from "./types";
import { completionSummary } from "./workoutPolish";
import { completedHistory, elapsedLabel } from "./history";
import { styles } from "./styles";
export default function WorkoutSummaryScreen({ navigation, route }: NativeStackScreenProps<TrainStackParamList,"WorkoutSummary">) {
  const [session,setSession]=useState<WorkoutSession | null>(null);
  const [loading,setLoading]=useState(true); const [error,setError]=useState(false); const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true;setLoading(true);
    void trainingStore.load().then(data=>{if(active){setSession(completedHistory(data.sessions).find(s=>s.id===route.params.sessionId)??null);setError(false);}})
      .catch(()=>{if(active)setError(true);}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[route.params.sessionId,retry]);
  const summary=session?completionSummary(session):null;
  return <SafeAreaView edges={["left","right"]} style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
    {loading?<ActivityIndicator accessibilityLabel="Loading verified workout summary"/>:error?<>
      <Text style={styles.error} accessibilityRole="alert">Summary could not be loaded. Your saved workout has not been reset.</Text>
      <Pressable accessibilityRole="button" style={styles.button} onPress={()=>setRetry(v=>v+1)}><Text style={styles.buttonText}>Retry</Text></Pressable>
    </>:!session||!summary?<Text style={styles.body}>Completed workout not found.</Text>:<>
      <Text style={styles.eyebrow}>WORKOUT SAVED</Text><Text style={styles.title} accessibilityRole="header">{session.name}</Text>
      <View style={styles.card}>
        <Text style={[styles.heading,styles.light]}>{summary.completedExercises} exercises completed</Text>
        <Text style={styles.cardBody}>{summary.completedSets} sets completed</Text>
        <Text style={styles.cardBody}>{elapsedLabel(summary.elapsedMs)}</Text>
        <Text style={styles.cardBody}>{summary.volumeKg===null?"Weighted volume unavailable":`${Number(summary.volumeKg.toFixed(2))} kg × reps · total lifted volume`}</Text>
      </View>
      <Text style={styles.body}>Elapsed time includes breaks and background time. Volume includes only completed sets with recorded weight and reps.</Text>
      <Pressable accessibilityRole="button" style={[styles.button,styles.outline]} onPress={()=>navigation.replace("WorkoutDetail",{sessionId:session.id})}><Text style={styles.buttonText}>View saved workout</Text></Pressable>
    </>}
    <Pressable accessibilityRole="button" style={styles.button} onPress={()=>navigation.popTo("TrainHome")}><Text style={styles.buttonText}>Return to Train</Text></Pressable>
  </ScrollView></SafeAreaView>;
}
