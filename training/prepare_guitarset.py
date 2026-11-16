# turns guitarset jams annotations into a csv of labeled chord clips.
# it reads the expert-verified chord layer and keeps only the fretted chords in the app vocabulary.
# output goes to data/raw, which git ignores, and feeds the chroma notebooks in training/notebooks.
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ANNOTATION_DIR = ROOT / "data" / "raw" / "guitarset" / "annotation"
AUDIO_DIR = ROOT / "data" / "raw" / "guitarset" / "audio"
OUT_CSV = ROOT / "data" / "raw" / "guitarset" / "chord_clips.csv"

# harte labels (without inversion suffix) mapped to the app's chord vocabulary
VOCAB = {"C:maj": "C", "G:maj": "G", "A:min": "Am", "F:maj": "F"}
MIN_SECONDS = 1.0
VERIFIED_PREFIX = "Semi-automatic"
# guitarset mono mic mix; change to "_hex.wav" for the hexaphonic pickup
AUDIO_SUFFIX = "_mic.wav"


# reads one jams file and yields (start, duration, chord) for verified target chords.
def target_segments(jams_path):
    jams = json.loads(jams_path.read_text(encoding="utf-8"))
    for ann in jams["annotations"]:
        if ann["namespace"] != "chord":
            continue
        if not ann["annotation_metadata"]["data_source"].startswith(VERIFIED_PREFIX):
            continue
        for obs in ann["data"]:
            # drop the inversion suffix, such as "C:maj/3", since the chord is the same
            chord = VOCAB.get(obs["value"].split("/")[0])
            if chord and obs["duration"] >= MIN_SECONDS:
                yield obs["time"], obs["duration"], chord


# writes one csv row per clip, skipping files whose audio has not been downloaded yet.
def main():
    rows, missing_audio = [], 0
    for jams_path in sorted(ANNOTATION_DIR.glob("*.jams")):
        stem = jams_path.stem
        audio_path = AUDIO_DIR / f"{stem}{AUDIO_SUFFIX}"
        if not audio_path.exists():
            missing_audio += 1
        for start, duration, chord in target_segments(jams_path):
            rows.append({
                "audio": str(audio_path.relative_to(ROOT)).replace("\\", "/"),
                "start": round(start, 3),
                "duration": round(duration, 3),
                "chord": chord,
            })

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with OUT_CSV.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["audio", "start", "duration", "chord"])
        writer.writeheader()
        writer.writerows(rows)

    counts = {chord: sum(1 for r in rows if r["chord"] == chord) for chord in VOCAB.values()}
    print(f"wrote {len(rows)} clips to {OUT_CSV}")
    print("clips per chord:", counts)
    if missing_audio:
        print(f"{missing_audio} files have no audio yet at {AUDIO_DIR}")


if __name__ == "__main__":
    main()
