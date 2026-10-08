# Drums samples

M0 uses **synth placeholders** for kick, snare and closed hi-hat. No recorded drum samples or third-party audio are included.

The local `voice.ts` owns every kit key and synthesis setting. For M1, map the same local keys to licensed sample URLs in `index.ts` as a percussion `SampleBank`. Verify licenses and record original/converted filenames in `docs/SAMPLE_LICENSES.md` before including any audio. The shared audio service knows no drum names.
