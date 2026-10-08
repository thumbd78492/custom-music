"""Measured recording calibration; no samples or master gain are modified."""
import hashlib
import json
import math
import pathlib
import struct
import wave

root = pathlib.Path(__file__).resolve().parent.parent
records = []
for path in sorted((root / "src/instruments/violin/samples").glob("*.wav")):
    with wave.open(str(path), "rb") as recording:
        rate = recording.getframerate()
        measurements = []
        for start, end in [(0, 0.15), (0.3, 1.1), (1.2, 3.1)]:
            recording.setpos(round(start * rate))
            frames = round(end * rate) - round(start * rate)
            values = struct.unpack("<" + str(frames) + "h", recording.readframes(frames))
            rms = math.sqrt(sum((value / 32768) ** 2 for value in values) / frames)
            measurements.append({"from": start, "to": end, "rmsDbfs": 20 * math.log10(rms)})
        records.append({"key": path.stem, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "windows": measurements, "gainDb": round(-21 - measurements[-1]["rmsDbfs"], 3)})
output = {"referenceSustainRmsDbfs": -21, "windowSeconds": [1.2, 3.1], "method": "PCM16 mono RMS calibration of source recordings, not master normalisation or a perceptual acceptance", "recordings": records}
(root / "docs/violin-sample-calibration.json").write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
print("Measured 10 unchanged recordings: docs/violin-sample-calibration.json")
