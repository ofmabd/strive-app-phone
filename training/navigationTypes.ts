export type TrainStackParamList = {
  TrainHome: undefined;
  TrainingSetup: { continueToSuggested?: boolean } | undefined;
  SuggestedWorkout: undefined;
  ManualWorkout: undefined;
  WorkoutHistory: undefined;
  WorkoutSummary: { sessionId: string };
  WorkoutDetail: { sessionId: string };
  ResumeWorkout: { sessionId: string };
};
