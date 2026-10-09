import type {
  CharacterDefinition,
  InstrumentManifest,
  InstrumentInstance,
} from "../contracts/instrument";

export function characters(
  manifest: InstrumentManifest,
): readonly CharacterDefinition[] {
  return (
    manifest.characters ?? [
      {
        id: manifest.id,
        displayName: manifest.displayName,
        capabilities: manifest.capabilities,
        default: true,
        phrase: { tasks: ["support", "rest"], leadWeight: 0 },
      },
    ]
  );
}

/** Stable stage slots, never allocated in asynchronous completion order. */
export function instances(manifest: InstrumentManifest) {
  return characters(manifest).map((character) => ({
    character,
    identity: Object.freeze({
      pluginId: manifest.id,
      characterId: character.id,
      instanceId: `${character.id}:1`,
    } satisfies InstrumentInstance),
  }));
}
