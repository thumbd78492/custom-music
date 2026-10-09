"""Plot measured M2 violin curves as standalone SVGs, without third-party dependencies."""
import argparse
import html
import json
import math
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("before", type=Path)
parser.add_argument("after", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=False)

def read(directory, name):
    return json.loads((directory / (name + ".json")).read_text(encoding="utf-8"))

def label(x, y, text, size=14, color="#334155", anchor="start"):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" text-anchor="{anchor}">{html.escape(text)}</text>'

def chart(x, y, width, height, title, series, xlabel, zero=False):
    xs = [p[0] for _, _, points in series for p in points]
    ys = [p[1] for _, _, points in series for p in points]
    xmin, xmax = min(xs), max(xs)
    ymin, ymax = math.floor(min(ys) - 1), math.ceil(max(ys) + 1)
    px = lambda value: x + (value - xmin) / (xmax - xmin) * width
    py = lambda value: y + height - (value - ymin) / (ymax - ymin) * height
    svg = [label(x, y - 30, title, 17)]
    for i in range(6):
        value = ymin + (ymax - ymin) * i / 5
        sy = py(value)
        svg += [f'<line x1="{x}" y1="{sy}" x2="{x+width}" y2="{sy}" stroke="#dce3ed"/>', label(x - 10, sy + 5, f"{value:.1f}", anchor="end")]
    for i in range(7):
        value = xmin + (xmax - xmin) * i / 6
        sx = px(value)
        svg += [f'<line x1="{sx}" y1="{y}" x2="{sx}" y2="{y+height}" stroke="#eef2f6"/>', label(sx, y + height + 25, f"{value:.0f}", anchor="middle")]
    svg += [label(x, y - 8, "RMS dBFS, before Master 0.65", 12), label(x + width / 2, y + height + 50, xlabel, anchor="middle")]
    if zero:
        svg.append(f'<line x1="{px(0)}" y1="{y}" x2="{px(0)}" y2="{y+height}" stroke="#64748b" stroke-dasharray="5 5"/>')
    for i, (name, color, points) in enumerate(series):
        coordinates = " ".join(f"{px(a):.2f},{py(b):.2f}" for a, b in points)
        svg += [f'<polyline points="{coordinates}" fill="none" stroke="{color}" stroke-width="2.4"/>', label(x + i * 330, y + height + 80, name, color=color)]
    return "".join(svg)

def save(name, elements, width, height):
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}"><rect width="100%" height="100%" fill="#ffffff"/><g font-family="Arial, sans-serif">{elements}</g></svg>'
    (args.output / name).write_text(svg, encoding="utf-8")

rows = []
for name in ["scale-v0.56", "bows-v0.5", "bows-v0.56", "bows-v0.62", "bows-v0.74", "lengths-v0.56", "lengths-low-v0.56", "lengths-high-v0.56", "same-v0.56", "frozen-events"]:
    before = read(args.before, name + "-dual-current")
    after = read(args.after, name + "-candidate")
    assert [(n["midi"], n["velocity"], n["start"], n["end"], n["articulation"]) for n in before["perNote"]] == [(n["midi"], n["velocity"], n["start"], n["end"], n["articulation"]) for n in after["perNote"]]
    rows.append({"case": name, "before": before["summary"], "after": after["summary"]})

elements = label(85, 35, "M2 violin: measured per-note stability; human approval pending", 22)
for row, name in enumerate(["scale-v0.56", "bows-v0.56"]):
    series = []
    for variant, directory, color, title in [("dual-current", args.before, "#bc433c", "Before: frozen dual-layer 0.2.1"), ("candidate", args.after, "#137a66", "After: single Loud + bow calibration")]:
        data = read(directory, name + "-" + variant)
        series.append((title, color, [(n["index"], n["stableRmsDbfs"]) for n in data["perNote"]]))
    elements += chart(85, 110 + row * 380, 1100, 240, name + ": identical pitches, velocities, lengths and bows", series, "Note index")
save("stable-note-rms.svg", elements, 1240, 850)

def worst_contiguous(data):
    cases = []
    for t in data["transitions"]:
        if abs(t["gapSeconds"]) > .01:
            continue
        for w in t["windows"]:
            for p in w["raw"]:
                cases.append((p["rmsDbfs"] - w["referenceDbfs"], t))
    return min(cases, key=lambda c: c[0])

bow_before = read(args.before, "bows-v0.56-dual-current")
bow_after = read(args.after, "bows-v0.56-candidate")
frozen_before = read(args.before, "frozen-events-dual-current")
frozen_after = read(args.after, "frozen-events-candidate")
elements = label(85, 35, "Raw curves: before worst, after worst, and actual melody after worst", 22)
worst_cases = []
for row, (selected, before, after, title) in enumerate([(bow_before, bow_before, bow_after, "Bows: before worst"), (bow_after, bow_before, bow_after, "Bows: after worst"), (frozen_after, frozen_before, frozen_after, "Actual melody: after worst")]):
    relative, transition = worst_contiguous(selected)
    worst_cases.append({"title": title, "relativeDb": relative, "transition": transition, "fromNote": selected["perNote"][transition["from"]], "toNote": selected["perNote"][transition["to"]]})
    for col, width in enumerate([.02, .1]):
        series = []
        for data, color, name in [(before, "#bc433c", "Before"), (after, "#137a66", "After")]:
            t = data["transitions"][transition["from"]]
            window = next(w for w in t["windows"] if w["widthSeconds"] == width)
            series.append((name, color, [((p["time"] - t["time"]) * 1000, p["rmsDbfs"]) for p in window["raw"]]))
        elements += chart(85 + col * 680, 115 + row * 390, 570, 230, f"{title}: notes {transition['from']} to {transition['to']}; {width * 1000:.0f} ms", series, "Window start relative to note change (ms)", zero=True)
save("worst-transition-curves.svg", elements, 1390, 1275)

(args.output / "comparison.json").write_text(json.dumps({"before": str(args.before), "after": str(args.after), "measurementPoint": "Violin output before Master 0.65; WAVs include unchanged Master", "fixedVelocityEngineeringTargetDb": 3, "humanAcceptance": "Pending; previous note-entry and melody-loudness feedback failed", "cases": rows, "worstContiguousCases": worst_cases}, indent=2) + "\n", encoding="utf-8")
print(args.output / "comparison.json")
