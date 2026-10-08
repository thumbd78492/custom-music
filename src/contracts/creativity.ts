export interface CreativeIntent {
  readonly mood?: "calm" | "bright" | "melancholic" | "tense";
  readonly energyTarget?: number;
  readonly complexityTarget?: number;
  readonly groove?: "straight" | "swing";
  readonly densityTarget?: number;
  readonly harmonyColor?: "simple" | "jazzy";
  readonly sectionRequest?: "continue" | "build" | "breakdown" | "return";
}

export interface CreativeDirectorPort {
  interpret(request: string, signal?: AbortSignal): Promise<CreativeIntent>;
}
