# Violin plugin — M0

Independent sustained melody plugin. `generator.ts` chooses two upper-register chord tones per bar from the Director's shared harmony and a plugin-specific seeded PRNG. Composition has no browser/audio dependency; `voice.ts` uses injected audio services. No other instrument is imported or required.

**Sound: sawtooth synth placeholder, not real violin samples.** Sample replacement is reserved for M1; the local adapter is `samples/index.ts`.

Run only these unit tests with `npx vitest run src/instruments/violin/__tests__`. Open `/?instrument=violin` for InstrumentLab. No motif memory, responsive ensemble phrasing, or LLM implementation is included.
