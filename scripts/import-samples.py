#!/usr/bin/env python3
"""Reproduce the reviewed CC0 sample subset, preserving source recordings.

License text is fetched and verified before any audio is downloaded. Run from the
repository root: python scripts/import-samples.py piano
Only explicitly reviewed instruments have import commands.
"""

from __future__ import annotations

import argparse
import array
import hashlib
import json
import math
from pathlib import Path
import re
import sys
import urllib.parse
import urllib.request
import wave


ROOT = Path(__file__).resolve().parent.parent
VCSL_COMMIT = "c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e"
PITCHES = [
    ("C3", "c4", 60, 4, 0),
    ("D3", "d4", 62, 7, 0),
    ("E3", "e4", 64, -1, -3),
    ("F#3", "fs4", 66, 4, 1),
    ("G#3", "gs4", 68, 3, -2),
    ("A#3", "as4", 70, 18, -8),
    ("C4", "c5", 72, 4, 1),
]


def url(path: str) -> str:
    return (
        f"https://raw.githubusercontent.com/sgossner/VCSL/{VCSL_COMMIT}/"
        + urllib.parse.quote(path, safe="/")
    )


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def retrieve(source_url: str, destination: Path) -> bytes:
    if destination.exists():
        return destination.read_bytes()
    request = urllib.request.Request(source_url, headers={"User-Agent": "GenerativeEnsemble-M1/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        content = response.read()
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(content)
    return content


def read_mono(path: Path) -> tuple[list[float], dict[str, int]]:
    with wave.open(str(path), "rb") as source:
        channels = source.getnchannels()
        width = source.getsampwidth()
        frames = source.getnframes()
        rate = source.getframerate()
        if source.getcomptype() != "NONE" or width not in (2, 3, 4):
            raise ValueError(f"Unsupported PCM format: {path}")
        data = source.readframes(frames)
    maximum = float(1 << (width * 8 - 1))
    mono = [
        sum(
            int.from_bytes(data[offset + channel * width : offset + (channel + 1) * width], "little", signed=True)
            / maximum
            for channel in range(channels)
        )
        / channels
        for offset in range(0, len(data), width * channels)
    ]
    return mono, {"channels": channels, "bitsPerSample": width * 8, "sampleRate": rate, "frames": frames}


def piano() -> None:
    raw_dir = ROOT / ".sample-sources/piano"
    output_dir = ROOT / "src/instruments/piano/samples"
    output_dir.mkdir(parents=True, exist_ok=True)
    license_url = url("LICENSE")
    license_bytes = retrieve(license_url, raw_dir / "LICENSE-CC0.txt")
    license_text = license_bytes.decode("utf-8")
    if "CC0 1.0 Universal" not in license_text or "redistribute" not in license_text:
        raise ValueError("Source license could not be positively verified as CC0; audio download stopped")
    (output_dir / "LICENSE-CC0.txt").write_bytes(license_bytes)
    print("Verified and saved CC0 license before audio retrieval", flush=True)

    entries: list[dict] = []
    for source_note, target_note, midi, soft_tune, loud_tune in PITCHES:
        for layer, suffix, tune in [(1, "soft", soft_tune), (3, "loud", loud_tune)]:
            original_name = f"GPiano_sus_{source_note}_v{layer}_rr1_Player.wav"
            original_path = "Chordophones/Zithers/Grand Piano, Kawai/Sustains/" + original_name
            source_url = url(original_path)
            raw_path = raw_dir / original_name
            raw = retrieve(source_url, raw_path)
            mono, source_format = read_mono(raw_path)
            peak = max(map(abs, mono))
            entries.append({
                "originalFile": original_path,
                "sourceUrl": source_url,
                "sourceSha256": sha256(raw),
                "sourceBytes": len(raw),
                "sourceFormat": source_format,
                "originalNoteName": source_note,
                "rootMidi": midi,
                "velocityLayer": layer,
                "velocityLayerName": suffix,
                "tuneCents": tune,
                "recommendedSourceOffsetFrames": 500 if layer == 3 and source_note in ("C3", "A#3") else 31 if layer == 1 and source_note == "D3" else 21 if layer == 1 and source_note == "G#3" else 0,
                "file": f"src/instruments/piano/samples/{target_note}-{suffix}.wav",
                "sourceDurationSeconds": source_format["frames"] / source_format["sampleRate"],
                "monoPeakBeforeGain": peak,
                "monoRmsBeforeGain": math.sqrt(sum(value * value for value in mono) / len(mono)),
                "_mono": mono,
            })
            print(f"Read MIDI {midi} v{layer}: {len(raw)} bytes, {entries[-1]['sourceDurationSeconds']:.2f}s, peak {peak:.5f}", flush=True)

    # One gain for the complete layer preserves relative note levels within it.
    # Event velocity and layer choice remain plugin-owned performance decisions.
    layer_target = {1: 0.6, 3: 0.85}
    gains = {
        layer: target / max(entry["monoPeakBeforeGain"] for entry in entries if entry["velocityLayer"] == layer)
        for layer, target in layer_target.items()
    }
    for entry in entries:
        gain = gains[entry["velocityLayer"]]
        mono = entry.pop("_mono")
        maximum_frames = 8 * entry["sourceFormat"]["sampleRate"]
        trimmed = len(mono) > maximum_frames
        if trimmed:
            mono = mono[:maximum_frames]
            fade_frames = round(0.15 * entry["sourceFormat"]["sampleRate"])
            for index in range(fade_frames):
                mono[len(mono) - fade_frames + index] *= (1 + math.cos(math.pi * index / (fade_frames - 1))) / 2
        pcm = array.array("h", (round(max(-1, min(1, value * gain)) * 32767) for value in mono))
        if sys.byteorder != "little":
            pcm.byteswap()
        output_path = ROOT / entry["file"]
        with wave.open(str(output_path), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(entry["sourceFormat"]["sampleRate"])
            output.writeframes(pcm.tobytes())
        output_bytes = output_path.read_bytes()
        entry.update({
            "outputSha256": sha256(output_bytes),
            "outputBytes": len(output_bytes),
            "outputFormat": {"channels": 1, "bitsPerSample": 16, "sampleRate": entry["sourceFormat"]["sampleRate"]},
            "normalizationGain": gain,
            "normalizationScope": "common gain for all selected piano samples in this velocity layer",
            "outputPeak": max(map(abs, mono)) * gain,
            "durationSeconds": len(mono) / entry["sourceFormat"]["sampleRate"],
            "trimmedToEightSeconds": trimmed,
            "endFadeSeconds": 0.15 if trimmed else 0,
            "sourceOffsetApplied": False,
            "processing": "Arithmetic stereo-to-mono average; common layer gain; retain at most 8 seconds; final 150 ms raised-cosine fade only when trimmed; round to PCM16. No resampling, retuning, denoising or looping. Recommended SFZ onset offset is documented but not applied.",
        })
    provenance_path = ROOT / "docs/sample-provenance.json"
    provenance = json.loads(provenance_path.read_text(encoding="utf-8")) if provenance_path.exists() else {"schemaVersion": 1, "instruments": {}}
    provenance["instruments"]["piano"] = {
        "sourceName": "Versilian Community Sample Library — Grand Piano, Kawai",
        "sourcePage": "https://versilian-studios.com/vcsl-keys/",
        "sourceRepository": "https://github.com/sgossner/VCSL",
        "sourceCommit": VCSL_COMMIT,
        "license": "CC0-1.0",
        "licenseUrl": license_url,
        "licenseSha256": sha256(license_bytes),
        "attributionRequired": False,
        "credit": "Versilian Studios LLC.; original sample mapping by Peter Eastman",
        "licenseVerifiedBeforeDownload": True,
        "verificationDate": "2026-10-08",
        "referenceMapUrl": "https://raw.githubusercontent.com/sgossner/VCSL/dfcf4a4918771eee884b96ad4493de82ef84daf6/Chordophones/Zithers/Grand%20Piano%2C%20Kawai.sfz",
        "noteNaming": "Official VCSL map uses original C3 for MIDI 60 (scientific C4). rootMidi follows that map; filenames use scientific pitch.",
        "decayLimitation": "Web subset preserves the first 8 seconds of each acoustic recording, with a 150 ms end fade. Original complete recordings remain in .sample-sources/piano; acoustic decay beyond 8 seconds is not shipped. Plugin note-off envelopes may damp earlier.",
        "conversionCommand": "python scripts/import-samples.py piano",
        "totalOutputBytes": sum(entry["outputBytes"] for entry in entries),
        "files": entries,
    }
    provenance_path.write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(entries)} files, {sum(entry['outputBytes'] for entry in entries)} output bytes. Layer gains: {gains}")


def violin() -> None:
    commit = "440300901dfe9275fd84e0b7763af1f8443ae62e"
    prefix = f"https://raw.githubusercontent.com/sgossner/VSCO-2-CE/{commit}/"
    raw_dir = ROOT / ".sample-sources/violin"
    output_dir = ROOT / "src/instruments/violin/samples"
    output_dir.mkdir(parents=True, exist_ok=True)
    license_url = prefix + "LICENSE"
    license_bytes = retrieve(license_url, raw_dir / "LICENSE-CC0.txt")
    license_text = license_bytes.decode("utf-8")
    if "CC0 1.0 Universal" not in license_text or "redistribute" not in license_text:
        raise ValueError("Source license could not be verified as CC0; audio download stopped")
    (output_dir / "LICENSE-CC0.txt").write_bytes(license_bytes)
    print("Verified and saved violin CC0 license before audio retrieval", flush=True)

    entries: list[dict] = []
    for source_note, midi in [("C5", 72), ("E5", 76), ("G5", 79), ("A5", 81), ("C6", 84)]:
        for layer, suffix in [("p", "soft"), ("f", "loud")]:
            original_name = f"LLVln_ArcoVib_{source_note}_{layer}.wav"
            original_path = "Strings/Solo Violin/Arco Vib/" + original_name
            source_url = prefix + urllib.parse.quote(original_path, safe="/")
            raw_path = raw_dir / original_name
            raw = retrieve(source_url, raw_path)
            mono, source_format = read_mono(raw_path)
            rate = source_format["sampleRate"]
            if rate != 44100 or len(mono) < rate * 3.5:
                raise ValueError(f"Unexpected source format/duration; loop preparation stopped: {original_name}")
            loop_start = round(1.2 * rate)
            loop_end = round(3.2 * rate)
            crossfade_frames = round(0.15 * rate)
            loop_signal = mono[loop_start:loop_end]
            loop_rms = math.sqrt(sum(value * value for value in loop_signal) / len(loop_signal))
            window_frames = round(0.2 * rate)
            minimum_window_rms = min(
                math.sqrt(sum(value * value for value in loop_signal[index:index + window_frames]) / len(loop_signal[index:index + window_frames]))
                for index in range(0, len(loop_signal), window_frames)
            )
            peak = max(map(abs, mono))
            if minimum_window_rms < 0.000001 or loop_rms / peak < 0.01:
                raise ValueError(f"Suspiciously quiet sustain loop; requires review: {original_name}")
            entries.append({
                "originalFile": original_path,
                "sourceUrl": source_url,
                "sourceSha256": sha256(raw),
                "sourceBytes": len(raw),
                "sourceFormat": source_format,
                "sourceDurationSeconds": len(mono) / rate,
                "originalNoteName": source_note,
                "rootMidi": midi,
                "velocityLayer": layer,
                "velocityLayerName": suffix,
                "tuneCents": 0,
                "file": f"src/instruments/violin/samples/{source_note.lower()}-{suffix}.wav",
                "monoPeakBeforeGain": peak,
                "loopStartSeconds": 1.2,
                "loopEndSeconds": 3.2,
                "loopStartFrame": loop_start,
                "loopEndFrameExclusive": loop_end,
                "loopCrossfadeSeconds": 0.15,
                "loopCrossfadeFrames": crossfade_frames,
                "loopRmsBeforeGain": loop_rms,
                "minimumLoopWindowRmsBeforeGain": minimum_window_rms,
                "loopWindowSeconds": 0.2,
                "loopSignalChecksPassed": True,
                "_mono": mono,
            })
            print(f"Read {original_name}: {len(mono) / rate:.2f}s, peak {peak:.5f}, loop RMS {loop_rms:.6f}, minimum window {minimum_window_rms:.6f}", flush=True)

    gains = {
        layer: target / max(entry["monoPeakBeforeGain"] for entry in entries if entry["velocityLayer"] == layer)
        for layer, target in [("p", 0.6), ("f", 0.85)]
    }
    for entry in entries:
        gain = gains[entry["velocityLayer"]]
        original = entry.pop("_mono")
        rate = entry["sourceFormat"]["sampleRate"]
        mono = original[:round(3.3 * rate)]
        loop_start = entry["loopStartFrame"]
        loop_end = entry["loopEndFrameExclusive"]
        crossfade_frames = entry["loopCrossfadeFrames"]
        # Blend the loop's outgoing region into the samples immediately before
        # its incoming point. The wrap therefore continues two adjacent source
        # frames instead of creating an unrelated waveform discontinuity.
        for index in range(crossfade_frames):
            weight = (1 - math.cos(math.pi * index / (crossfade_frames - 1))) / 2
            mono[loop_end - crossfade_frames + index] = (
                original[loop_end - crossfade_frames + index] * (1 - weight)
                + original[loop_start - crossfade_frames + index] * weight
            )
        fade_frames = round(0.05 * rate)
        for index in range(fade_frames):
            mono[len(mono) - fade_frames + index] *= (1 + math.cos(math.pi * index / (fade_frames - 1))) / 2
        pcm = array.array("h", (round(max(-1, min(1, value * gain)) * 32767) for value in mono))
        loop_delta_pcm = abs(pcm[loop_end - 1] - pcm[loop_start])
        local_max_delta_pcm = max(abs(pcm[index + 1] - pcm[index]) for index in range(loop_start - 100, loop_start + 100))
        window_frames = round(0.2 * rate)
        minimum_output_loop_rms = min(
            math.sqrt(sum(value * value for value in pcm[index:min(index + window_frames, loop_end)]) / (min(index + window_frames, loop_end) - index)) / 32768
            for index in range(loop_start, loop_end, window_frames)
        )
        if minimum_output_loop_rms < 0.005 or loop_delta_pcm > local_max_delta_pcm:
            raise ValueError(f"Prepared loop failed signal validation: {entry['file']}")
        if sys.byteorder != "little":
            pcm.byteswap()
        output_path = ROOT / entry["file"]
        with wave.open(str(output_path), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(rate)
            output.writeframes(pcm.tobytes())
        output_bytes = output_path.read_bytes()
        entry.update({
            "outputSha256": sha256(output_bytes),
            "outputBytes": len(output_bytes),
            "outputFormat": {"channels": 1, "bitsPerSample": 16, "sampleRate": rate},
            "durationSeconds": len(mono) / rate,
            "normalizationGain": gain,
            "normalizationScope": "common gain for all selected violin samples in this velocity layer",
            "outputPeak": max(map(abs, mono)) * gain,
            "loopBoundaryDeltaPcm16": loop_delta_pcm,
            "nearbyMaximumDeltaPcm16": local_max_delta_pcm,
            "minimumOutputLoopWindowRms": minimum_output_loop_rms,
            "outputLoopChecksPassed": True,
            "endFadeSeconds": 0.05,
            "processing": "Arithmetic stereo-to-mono average; common layer gain; first 3.3 seconds retained. A 150 ms complementary raised-cosine crossfade before loopEnd blends into the original 150 ms before loopStart. Loop points 1.2 to 3.2 seconds; wrap continues adjacent original frames. Final 50 ms raised-cosine file-end fade, outside loop. PCM16; no resampling, retuning or synthesized audio.",
        })
    provenance_path = ROOT / "docs/sample-provenance.json"
    provenance = json.loads(provenance_path.read_text(encoding="utf-8"))
    provenance["instruments"]["violin"] = {
        "sourceName": "VSCO 2 Community Edition — Solo Violin Arco Vibrato",
        "sourcePage": "https://versilian-studios.com/vsco-community/",
        "sourceRepository": "https://github.com/sgossner/VSCO-2-CE",
        "sourceCommit": commit,
        "license": "CC0-1.0",
        "licenseUrl": license_url,
        "licenseSha256": sha256(license_bytes),
        "attributionRequired": False,
        "credit": "Versilian Studios LLC.; solo violin performed by Lily Lyons",
        "licenseVerifiedBeforeDownload": True,
        "verificationDate": "2026-10-08",
        "referenceMapUrl": "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/6dd651d55dde97fd4028699be9d4481f26917891/SViolinVib.sfz",
        "recordingEvidenceUrl": "https://freesound.org/people/sgossner/sounds/373769/",
        "loopLimitation": "Sustained recording loop is prepared from recorded vibrato, not a recorded bow transition. Crossfade and non-silence checks are automated; expressive quality and loop audibility require human listening. Voice release envelope supplies the release tail; original end-of-bow decay is not retained in the compact loop.",
        "conversionCommand": "python scripts/import-samples.py violin",
        "totalOutputBytes": sum(entry["outputBytes"] for entry in entries),
        "files": entries,
    }
    provenance_path.write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(entries)} violin files, {sum(entry['outputBytes'] for entry in entries)} bytes. Layer gains: {gains}")


def flac_metadata(data: bytes) -> dict[str, int | float]:
    """Read native FLAC STREAMINFO without decoding or modifying audio."""
    if data[:4] != b"fLaC":
        raise ValueError("Expected a native FLAC recording")
    position = 4
    while position + 4 <= len(data):
        header = data[position]
        length = int.from_bytes(data[position + 1:position + 4], "big")
        block = data[position + 4:position + 4 + length]
        if (header & 0x7F) == 0:
            if len(block) != 34:
                raise ValueError("Invalid FLAC STREAMINFO length")
            packed = int.from_bytes(block[10:18], "big")
            rate = packed >> 44
            channels = ((packed >> 41) & 7) + 1
            bits = ((packed >> 36) & 31) + 1
            frames = packed & ((1 << 36) - 1)
            if rate <= 0 or frames <= 0:
                raise ValueError("Invalid FLAC sample rate or frame count")
            return {"sampleRate": rate, "channels": channels, "bitsPerSample": bits, "frames": frames, "durationSeconds": frames / rate}
        position += 4 + length
        if header & 0x80:
            break
    raise ValueError("FLAC STREAMINFO metadata not found")


def drums() -> None:
    commit = "9f04cf9a734527edfbb0a4eee1f674e45bbf71bc"
    prefix = f"https://raw.githubusercontent.com/sfzinstruments/virtuosity_drums/{commit}/"
    raw_dir = ROOT / ".sample-sources/drums"
    output_dir = ROOT / "src/instruments/drums/samples"
    output_dir.mkdir(parents=True, exist_ok=True)
    license_url = prefix + "LICENSE"
    license_bytes = retrieve(license_url, raw_dir / "LICENSE-CC0.txt")
    license_text = license_bytes.decode("utf-8")
    if "CC0 1.0 Universal" not in license_text or "redistribute" not in license_text:
        raise ValueError("Source license could not be verified as CC0; audio download stopped")
    (output_dir / "LICENSE-CC0.txt").write_bytes(license_bytes)
    print("Verified and saved drums CC0 license before audio retrieval", flush=True)
    selections = [
        ("Samples/kickmic/kick/kickmic_kick_snon_vl2_rr1.flac", "kick-soft", "kick", "soft", 2, 1),
        ("Samples/kickmic/kick/kickmic_kick_snon_vl4_rr1.flac", "kick-accent", "kick", "accent", 4, 1),
        ("Samples/snaremic/snare/snaremic_snare_center_vl8.flac", "snare-soft", "snare", "soft", 8, None),
        ("Samples/snaremic/snare/snaremic_snare_center_vl18.flac", "snare-medium", "snare", "medium", 18, None),
        ("Samples/snaremic/snare/snaremic_snare_center_vl28.flac", "snare-accent", "snare", "accent", 28, None),
        ("Samples/oh/hh/oh_hh_closed_vl2_rr1.flac", "hat-soft-1", "hat", "soft", 2, 1),
        ("Samples/oh/hh/oh_hh_closed_vl2_rr2.flac", "hat-soft-2", "hat", "soft", 2, 2),
        ("Samples/oh/hh/oh_hh_closed_vl4_rr1.flac", "hat-accent-1", "hat", "accent", 4, 1),
        ("Samples/oh/hh/oh_hh_closed_vl4_rr2.flac", "hat-accent-2", "hat", "accent", 4, 2),
    ]
    entries = []
    for original_path, output_name, key, layer_name, layer, round_robin in selections:
        source_url = prefix + urllib.parse.quote(original_path, safe="/")
        raw = retrieve(source_url, raw_dir / Path(original_path).name)
        metadata = flac_metadata(raw)
        output_path = output_dir / f"{output_name}.flac"
        output_path.write_bytes(raw)
        entries.append({
            "originalFile": original_path,
            "sourceUrl": source_url,
            "sourceSha256": sha256(raw),
            "sourceBytes": len(raw),
            "sourceFormat": {key: value for key, value in metadata.items() if key != "durationSeconds"},
            "sourceDurationSeconds": metadata["durationSeconds"],
            "sampleKey": key,
            "velocityLayer": layer,
            "velocityLayerName": layer_name,
            "roundRobin": round_robin,
            "articulation": "closed hi-hat" if key == "hat" else "center hit" if key == "snare" else "kick with snares on",
            "microphone": "overhead" if key == "hat" else "snare close mic" if key == "snare" else "kick close mic",
            "file": f"src/instruments/drums/samples/{output_name}.flac",
            "outputSha256": sha256(output_path.read_bytes()),
            "outputBytes": len(raw),
            "outputFormat": "Native source FLAC, unchanged",
            "durationSeconds": metadata["durationSeconds"],
            "processing": "None. Exact source FLAC bytes retained; no trimming, normalization, resampling or synthesized audio. Dynamic-layer selection and one-shot playback are plugin-owned.",
            "decodeValidation": "Native FLAC STREAMINFO validated here; actual browser AudioBuffer decoding is verified by the browser E2E gate.",
        })
        print(f"Imported {output_name}.flac: {len(raw)} bytes, {metadata['durationSeconds']:.3f}s, {metadata['channels']} channel(s), {metadata['sampleRate']}Hz", flush=True)
    provenance_path = ROOT / "docs/sample-provenance.json"
    provenance = json.loads(provenance_path.read_text(encoding="utf-8"))
    provenance["instruments"]["drums"] = {
        "sourceName": "Virtuosity Drums",
        "sourcePage": "https://versilian-studios.com/virtuosity-drums/",
        "sourceRepository": "https://github.com/sfzinstruments/virtuosity_drums",
        "sourceCommit": commit,
        "license": "CC0-1.0",
        "licenseUrl": license_url,
        "licenseSha256": sha256(license_bytes),
        "attributionRequired": False,
        "credit": "Versilian Studios LLC. and Karoryfer Samples; performed by Austin McMahon at Virtuosity Musical Instruments, Boston",
        "licenseVerifiedBeforeDownload": True,
        "verificationDate": "2026-10-08",
        "dynamicMapping": "Retains two recorded kick layers, three center-snare layers, and two closed-hi-hat layers each with two round robins. Plugin mapping defines velocity thresholds; source layer numbers are retained per file.",
        "conversionCommand": "python scripts/import-samples.py drums",
        "totalOutputBytes": sum(entry["outputBytes"] for entry in entries),
        "files": entries,
    }
    provenance_path.write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(entries)} unchanged FLAC files, {sum(entry['outputBytes'] for entry in entries)} bytes.")


def bass() -> None:
    commit = "6e7d674cdb41be7a54dbccb15472401ad01099b9"
    prefix = f"https://raw.githubusercontent.com/sfzinstruments/karoryfer.black-and-blue-basses/{commit}/"
    raw_dir = ROOT / ".sample-sources/bass"
    output_dir = ROOT / "src/instruments/bass/samples"
    output_dir.mkdir(parents=True, exist_ok=True)
    license_url = prefix + "license"
    license_bytes = retrieve(license_url, raw_dir / "LICENSE-CC0.txt")
    license_text = license_bytes.decode("utf-8")
    if "CC0 1.0 Universal" not in license_text or "redistribute" not in license_text:
        raise ValueError("Source license could not be verified as CC0; audio download stopped")
    (output_dir / "LICENSE-CC0.txt").write_bytes(license_bytes)
    print("Verified and saved bass CC0 license before audio retrieval", flush=True)
    reference_map_url = prefix + "Programs/maps/darkblack_reg_mf_map.sfz"
    reference_map = retrieve(reference_map_url, raw_dir / "darkblack_reg_mf_map.sfz").decode("utf-8")
    entries: list[dict] = []
    for note, source_note, midi in [("c2", "c3", 36), ("e2", "e3", 40), ("g2", "g3", 43), ("b2", "b3", 47)]:
        for layer, suffix in [("p", "soft"), ("mf", "loud")]:
            original_name = f"darkblack_{source_note}_{layer}_rr1.wav"
            original_path = "Samples/darkblack/reg/" + original_name
            source_url = prefix + urllib.parse.quote(original_path, safe="/")
            raw_path = raw_dir / original_name
            raw = retrieve(source_url, raw_path)
            mono, source_format = read_mono(raw_path)
            peak = max(map(abs, mono))
            if peak <= 0:
                raise ValueError(f"Silent source recording: {original_name}")
            reference_region = next(region for region in reference_map.split("<region>") if f"darkblack_{source_note}_mf_rr1.wav" in region)
            written_root = int(re.search(r"pitch_keycenter=(\d+)", reference_region).group(1))
            if written_root != midi + 12:
                raise ValueError(f"Unexpected official bass written-pitch mapping: {original_name}")
            rate = source_format["sampleRate"]
            expected_period = rate / (440 * 2 ** ((midi - 69) / 12))
            signal = mono[round(0.5 * rate):round(0.75 * rate)]
            window_frames = 4000
            reference = signal[:window_frames]
            reference_energy = sum(value * value for value in reference)
            correlations = {}
            for lag in range(round(expected_period * 0.98) - 1, round(expected_period * 1.02) + 2):
                comparison = signal[lag:lag + window_frames]
                correlations[lag] = sum(left * right for left, right in zip(reference, comparison)) / math.sqrt(reference_energy * sum(value * value for value in comparison))
            best_lag = max(correlations, key=correlations.get)
            correlation = correlations[best_lag]
            if correlation < 0.95:
                raise ValueError(f"Bass recording does not match expected sounding pitch: {original_name}")
            # Sub-frame parabolic interpolation reduces integer-lag rounding.
            previous, current, following = correlations[best_lag - 1], correlations[best_lag], correlations[best_lag + 1]
            fractional_lag = best_lag + 0.5 * (previous - following) / (previous - 2 * current + following)
            frequency = rate / fractional_lag
            estimated_midi = 69 + 12 * math.log2(frequency / 440)
            entries.append({
                "originalFile": original_path,
                "sourceUrl": source_url,
                "sourceSha256": sha256(raw),
                "sourceBytes": len(raw),
                "sourceFormat": source_format,
                "sourceDurationSeconds": len(mono) / source_format["sampleRate"],
                "originalNoteName": source_note,
                "officialSfzWrittenRootMidi": written_root,
                "rootMidi": midi,
                "measuredFundamentalHz": frequency,
                "measuredSoundingMidi": estimated_midi,
                "pitchAudit": {
                    "method": "Normalized autocorrelation near expected fundamental period with sub-frame parabolic peak interpolation",
                    "sourceWindowStartSeconds": 0.5,
                    "comparisonWindowFrames": window_frames,
                    "lagSearchTolerancePercent": 2,
                    "peakCorrelation": correlation,
                    "estimatedPeriodFrames": fractional_lag,
                    "passed": True,
                },
                "velocityLayer": layer,
                "velocityLayerName": suffix,
                "roundRobin": 1,
                "articulation": "finger-plucked hollowbody electric bass, regular pluck",
                "tuneCents": 0,
                "file": f"src/instruments/bass/samples/{note}-{suffix}.wav",
                "monoPeakBeforeGain": peak,
                "monoRmsBeforeGain": math.sqrt(sum(value * value for value in mono) / len(mono)),
                "_mono": mono,
            })
            print(f"Read {original_name}: {len(mono) / source_format['sampleRate']:.3f}s, peak {peak:.5f}, measured {frequency:.3f}Hz/MIDI{estimated_midi:.3f}, correlation {correlation:.5f}", flush=True)
    gains = {
        layer: target / max(entry["monoPeakBeforeGain"] for entry in entries if entry["velocityLayer"] == layer)
        for layer, target in [("p", 0.6), ("mf", 0.85)]
    }
    for entry in entries:
        mono = entry.pop("_mono")
        rate = entry["sourceFormat"]["sampleRate"]
        gain = gains[entry["velocityLayer"]]
        maximum_frames = rate * 8
        trimmed = len(mono) > maximum_frames
        if trimmed:
            mono = mono[:maximum_frames]
            fade_frames = round(0.15 * rate)
            for index in range(fade_frames):
                mono[len(mono) - fade_frames + index] *= (1 + math.cos(math.pi * index / (fade_frames - 1))) / 2
        pcm = array.array("h", (round(max(-1, min(1, value * gain)) * 32767) for value in mono))
        if max(map(abs, pcm)) >= 32767:
            raise ValueError(f"PCM clipping detected: {entry['file']}")
        if sys.byteorder != "little":
            pcm.byteswap()
        output_path = ROOT / entry["file"]
        with wave.open(str(output_path), "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(rate)
            output.writeframes(pcm.tobytes())
        output_bytes = output_path.read_bytes()
        entry.update({
            "outputSha256": sha256(output_bytes),
            "outputBytes": len(output_bytes),
            "outputFormat": {"channels": 1, "bitsPerSample": 16, "sampleRate": rate},
            "durationSeconds": len(mono) / rate,
            "normalizationGain": gain,
            "normalizationScope": "common gain for all selected bass samples in this velocity layer",
            "outputPeak": max(map(abs, mono)) * gain,
            "trimmedToEightSeconds": trimmed,
            "endFadeSeconds": 0.15 if trimmed else 0,
            "loop": False,
            "processing": "PCM16 at original sample rate; arithmetic stereo-to-mono average if needed; common layer gain. Complete original recording retained when at most 8 seconds; otherwise truncated at 8 seconds with a final 150 ms raised-cosine fade. No resampling, retuning, looping or synthesized audio. Plugin note-off envelope controls pluck damping.",
        })
    provenance_path = ROOT / "docs/sample-provenance.json"
    provenance = json.loads(provenance_path.read_text(encoding="utf-8"))
    provenance["instruments"]["bass"] = {
        "sourceName": "Karoryfer Black And Blue Basses — Darkblack regular finger plucks",
        "sourcePage": "https://shop.karoryfer.com/pages/free-black-and-blue-basses",
        "sourceRepository": "https://github.com/sfzinstruments/karoryfer.black-and-blue-basses",
        "sourceCommit": commit,
        "license": "CC0-1.0",
        "licenseUrl": license_url,
        "licenseSha256": sha256(license_bytes),
        "attributionRequired": False,
        "credit": "Karoryfer Samples / D. Smolken",
        "licenseVerifiedBeforeDownload": True,
        "verificationDate": "2026-10-08",
        "referenceMapUrl": reference_map_url,
        "performanceReferenceUrl": prefix + "Programs/controls/common.sfz",
        "sourceInstrument": "Real black hollowbody five-string electric bass, played with fingers; no samples from the processed babyblue fake articulations are used.",
        "noteNaming": "The source filenames and official SFZ use bass written pitches, one octave above the recordings' sounding pitches. Original c3/e3/g3/b3 (official SFZ MIDI 48/52/55/59) are measured sounding C2/E2/G2/B2 and mapped to MIDI 36/40/43/47. No octave retuning is applied to the recordings.",
        "excludedInitialSubset": "An initial c2/e2/g2/b2 source subset was found by autocorrelation to sound at MIDI 24/28/31/35 (correlation 0.9990 to 0.9997). Those original files remain in .sample-sources/bass as evidence, but are excluded from the shipped subset. They were replaced by the correct sounding-octave c3/e3/g3/b3 sources below; event generators were unchanged.",
        "conversionCommand": "python scripts/import-samples.py bass",
        "totalOutputBytes": sum(entry["outputBytes"] for entry in entries),
        "files": entries,
    }
    provenance_path.write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(entries)} bass files, {sum(entry['outputBytes'] for entry in entries)} bytes. Layer gains: {gains}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("instrument", choices=["piano", "violin", "drums", "bass"])
    args = parser.parse_args()
    {"piano": piano, "violin": violin, "drums": drums, "bass": bass}[args.instrument]()
