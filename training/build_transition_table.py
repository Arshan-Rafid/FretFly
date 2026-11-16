# counts chord-to-chord transitions in the guitarset verified annotations.
# writes a small json table that the backend suggestion engine can load without the raw data.
# only directly adjacent segments count, so a chord outside the vocabulary breaks the sequence.
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ANNOTATION_DIR = ROOT / "data" / "raw" / "guitarset" / "annotation"
OUT_PATH = ROOT / "backend" / "app" / "data" / "chord_transitions.json"

# harte labels (without inversion suffix) mapped to the app's chord vocabulary
VOCAB = {"C:maj": "C", "G:maj": "G", "A:min": "Am", "F:maj": "F"}
VERIFIED_PREFIX = "Semi-automatic"
# segments can be split by a few milliseconds, so a small gap still counts as adjacent
GAP_TOLERANCE = 0.05


# returns the verified chord segments of one jams file in time order.
def verified_segments(jams_path):
    jams = json.loads(jams_path.read_text(encoding="utf-8"))
    segments = []
    for ann in jams["annotations"]:
        if ann["namespace"] != "chord":
            continue
        if not ann["annotation_metadata"]["data_source"].startswith(VERIFIED_PREFIX):
            continue
        for obs in ann["data"]:
            label = VOCAB.get(obs["value"].split("/")[0])
            segments.append((obs["time"], obs["duration"], label))
    return sorted(segments, key=lambda s: s[0])


# counts pairs of directly adjacent, different vocabulary chords across all recordings.
def count_transitions():
    counts = Counter()
    recordings = 0
    for jams_path in sorted(ANNOTATION_DIR.glob("*.jams")):
        recordings += 1
        segments = verified_segments(jams_path)
        for (t0, d0, prev), (t1, _, cur) in zip(segments, segments[1:]):
            if prev is None or cur is None or prev == cur:
                continue
            if abs(t1 - (t0 + d0)) > GAP_TOLERANCE:
                continue
            counts[(prev, cur)] += 1
    return counts, recordings


# builds a nested dict of counts and probabilities for each starting chord.
def build_table(counts, recordings):
    chords = list(VOCAB.values())
    count_table = {a: {b: counts[(a, b)] for b in chords if b != a} for a in chords}
    prob_table = {}
    for a in chords:
        total = sum(count_table[a].values())
        prob_table[a] = {b: (round(n / total, 3) if total else 0.0) for b, n in count_table[a].items()}
    return {
        "source": "GuitarSet verified chord annotations (expert-verified layer)",
        "recordings": recordings,
        "chords": chords,
        "counts": count_table,
        "probabilities": prob_table,
    }


# writes the table into the backend package so the suggestion engine can load it.
def main():
    counts, recordings = count_transitions()
    table = build_table(counts, recordings)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(table, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT_PATH} from {recordings} recordings")
    for a in table["chords"]:
        row = ", ".join(f"{b} {table['counts'][a][b]}" for b in table["chords"] if b != a)
        print(f"  from {a:>3}: {row}")


if __name__ == "__main__":
    main()
