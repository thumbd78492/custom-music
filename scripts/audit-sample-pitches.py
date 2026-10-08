#!/usr/bin/env python3
"""Audit pitched recording roots without pretending to be a precision tuner.

Run from the repository root: python scripts/audit-sample-pitches.py
The source and shipped PCM are both measured over a short stable region. A
normalized autocorrelation search compares half, expected, and double periods
to catch octave-label mistakes. Vibrato/inharmonicity remain listening concerns.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import runpy


ROOT = Path(__file__).resolve().parent.parent
READ_MONO = runpy.run_path(str(ROOT / "scripts/import-samples.py"))["read_mono"]


def correlation_peak(signal: list[float], period: float) -> dict[str, float]:
    count = 4000
    reference = signal[:count]
    energy = sum(value * value for value in reference)
    first = max(2, math.floor(period * 0.97))
    last = math.ceil(period * 1.03)
    scores = {}
    for lag in range(first - 1, last + 2):
        comparison = signal[lag:lag + count]
        scores[lag] = sum(left * right for left, right in zip(reference, comparison)) / math.sqrt(
            energy * sum(value * value for value in comparison)
        )
    best = max(range(first, last + 1), key=scores.get)
    previous, current, following = scores[best - 1], scores[best], scores[best + 1]
    denominator = previous - 2 * current + following
    adjustment = 0.5 * (previous - following) / denominator if denominator else 0
    # Edge peaks and non-concave points are not safe to interpolate.
    fractional = best + adjustment if first < best < last and abs(adjustment) <= 1 else best
    return {"periodFrames": fractional, "correlation": current}


def measure(path: Path, midi: int, tune: float, start_seconds: float = 0.5, allow_secondary: bool = True) -> dict:
    mono, metadata = READ_MONO(path)
    rate = metadata["sampleRate"]
    start = round(start_seconds * rate)
    signal = mono[start:start + round(0.25 * rate)]
    period = rate / (440 * 2 ** ((midi - 69) / 12))
    peaks = {name: correlation_peak(signal, period * multiplier) for name, multiplier in [
        ("halfPeriod", 0.5), ("expectedPeriod", 1), ("doublePeriod", 2)
    ]}
    fundamental = rate / peaks["expectedPeriod"]["periodFrames"]
    tuned_frequency = fundamental * 2 ** (tune / 1200)
    tuned_midi = 69 + 12 * math.log2(tuned_frequency / 440)
    expected_score = peaks["expectedPeriod"]["correlation"]
    double_score = peaks["doublePeriod"]["correlation"]
    half_score = peaks["halfPeriod"]["correlation"]
    result = {
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "sampleRate": rate,
        "windowStartSeconds": start_seconds,
        "comparisonFrames": 4000,
        "approximateRawFundamentalHz": fundamental,
        "listedTuneCents": tune,
        "approximateFrequencyAfterListedTuneHz": tuned_frequency,
        "approximateMidiAfterListedTune": tuned_midi,
        "centsFromExpectedAfterListedTune": (tuned_midi - midi) * 100,
        "periodPeaks": peaks,
        "octaveCheckPassed": expected_score > 0.75 and double_score < expected_score + 0.15 and (
            half_score < 0.95 or expected_score > half_score + 0.03
        ),
    }
    if not result["octaveCheckPassed"] and allow_secondary:
        result["primaryWindowOctaveCheckPassed"] = False
        result["secondaryWindow"] = measure(path, midi, tune, 0.1, False)
        result["octaveCheckPassed"] = result["secondaryWindow"]["octaveCheckPassed"]
        result["secondaryWindowReason"] = "A piano beat minimum can leave a strong second harmonic in a single window. Preserve that ambiguous primary result and check an independent early-decay window at 0.1 seconds; no threshold is relaxed."
    return result


def main() -> None:
    provenance = json.loads((ROOT / "docs/sample-provenance.json").read_text(encoding="utf-8"))
    rows = []
    for name in ["piano", "violin", "bass"]:
        for entry in provenance["instruments"][name]["files"]:
            original = ROOT / f".sample-sources/{name}" / Path(entry["originalFile"]).name
            output = ROOT / entry["file"]
            source_measurement = measure(original, entry["rootMidi"], entry["tuneCents"])
            output_measurement = measure(output, entry["rootMidi"], entry["tuneCents"])
            if source_measurement["sha256"] != entry["sourceSha256"] or output_measurement["sha256"] != entry["outputSha256"]:
                raise ValueError(f"Source or output hash changed: {entry['file']}")
            rows.append({
                "instrument": name,
                "file": entry["file"],
                "sourceFile": entry["originalFile"],
                "expectedRootMidi": entry["rootMidi"],
                "source": source_measurement,
                "output": output_measurement,
            })
            print(f"{name}/{output.name}: MIDI {entry['rootMidi']} -> {output_measurement['approximateFrequencyAfterListedTuneHz']:.3f}Hz, {output_measurement['centsFromExpectedAfterListedTune']:+.1f}c, correlation {output_measurement['periodPeaks']['expectedPeriod']['correlation']:.4f}, octave check {output_measurement['octaveCheckPassed']}")
    passed = all(row["source"]["octaveCheckPassed"] and row["output"]["octaveCheckPassed"] for row in rows)
    report = {
        "schemaVersion": 1,
        "auditDate": "2026-10-08",
        "command": "python scripts/audit-sample-pitches.py",
        "method": "Normalized autocorrelation over 4000 frames starting 0.5 seconds into each source and output. Search +/-3% around half/expected/double fundamental periods, with sub-frame parabolic interpolation of interior maxima. Ambiguous octave results retain the original result and add an independent 0.1-second-start window using identical thresholds. Apply only listed tuneCents mathematically to report effective pitch; no audio is altered.",
        "limitations": "A short-window octave/root consistency check, not a precision tuner or perceptual quality result. Piano inharmonicity and violin vibrato can move the estimate. Human tuning, timbre, loop and ensemble listening remain pending.",
        "pitchedAssetCount": len(rows),
        "allOctaveChecksPassed": passed,
        "files": rows,
    }
    (ROOT / "docs/sample-pitch-audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(rows)} source/output comparisons; all octave checks passed: {passed}")


if __name__ == "__main__":
    main()
