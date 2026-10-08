# Electric Bass plugin — M0

Independent bass plugin. `generator.ts` places four low root/fifth notes per bar using the Director's shared harmony and a plugin-specific seeded PRNG. The first beat is always the chord root. Composition has no browser/audio dependency; `voice.ts` uses injected audio services. A drummer or any other instrument is never required.

**Sound: triangle synth placeholder, not real electric bass samples.** Sample replacement is reserved for M1; the local adapter is `samples/index.ts`.

Run only these unit tests with `npx vitest run src/instruments/bass/__tests__`. Open `/?instrument=bass` for InstrumentLab. No passing-note algorithm, responsive ensemble rhythm, or LLM implementation is included.
