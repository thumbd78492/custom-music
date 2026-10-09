/** Owned recording entry points, in source seconds. Keep a bow onset for separated notes.
 * M2 controlled playback measurements live in docs/M2_VIOLIN_DIAGNOSIS.md.
 * The Loud recordings were more stable than Soft or phase-independent blends.
 */
export const bowRegions: Readonly<
  Record<
    string,
    { bowOffset: number; legatoOffset: number; bowAttenuationDb: number }
  >
> = {
  c5: { bowOffset: 0.06, legatoOffset: 1.2, bowAttenuationDb: 0 },
  e5: { bowOffset: 0.03, legatoOffset: 1.2, bowAttenuationDb: 0 },
  g5: { bowOffset: 0.06, legatoOffset: 1.2, bowAttenuationDb: -1.8 },
  a5: { bowOffset: 0.16, legatoOffset: 1.2, bowAttenuationDb: -1.2 },
  c6: { bowOffset: 0.09, legatoOffset: 1.2, bowAttenuationDb: 0 },
};
