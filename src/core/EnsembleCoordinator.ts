import type { EnsembleIntent, InstrumentIntent } from "../contracts/music";

export function coordinate(
  proposals: ReadonlyMap<string, InstrumentIntent>,
): EnsembleIntent {
  const intents = [...proposals]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, value]) => value);
  const mean = (get: (intent: InstrumentIntent) => number) =>
    intents.length
      ? intents.reduce((sum, intent) => sum + get(intent), 0) / intents.length
      : 0;
  const load = (register: string) =>
    mean((intent) =>
      intent.register === register || intent.register === "wide"
        ? intent.density
        : 0,
    );
  return Object.freeze({
    accents: Object.freeze(
      Array.from({ length: 16 }, (_, step) =>
        mean((intent) => intent.accents[step] ?? 0),
      ),
    ),
    density: mean((intent) => intent.density),
    lowRegisterLoad: load("low"),
    midRegisterLoad: load("mid"),
    highRegisterLoad: load("high"),
    leadActivity: mean((intent) => intent.leadActivity ?? 0),
  });
}
