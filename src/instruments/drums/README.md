# Drums plugin — M0

Independent percussion plugin. `generator.ts` emits kick on beats 1/3, snare on beats 2/4, and eighth-note hi-hats. A plugin-specific seeded PRNG varies velocities. Composition has no browser/audio dependency; all kit names and synthesis settings belong to `voice.ts`, which uses injected generic audio services.

**Sound: membrane/noise synth placeholders, not recorded drums.** Sample replacement is reserved for M1; the local adapter is `samples/index.ts`.

Run only these unit tests with `npx vitest run src/instruments/drums/__tests__`. Open `/?instrument=drums` for InstrumentLab. No fills, multi-bar variation system, or LLM implementation is included.
