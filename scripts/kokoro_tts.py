#!/usr/bin/env python3
"""
Kokoro traffic TTS helper for SkyEcho.

Usage:
python3 scripts/kokoro_tts.py \
  --text "Clearance, Caribbean Wings five five six six, request IFR clearance to TGPY." \
  --out public/audio/test.wav \
  --voice af_heart \
  --speed 1.0

Outputs a WAV file at 24000 Hz.
"""

import argparse
import os
import re
import sys
from pathlib import Path

import soundfile as sf
from kokoro import KPipeline


SAFE_VOICES = {
    # Kokoro voices may vary by installed model release.
    # Keep these configurable. If a voice is unavailable, the script falls back.
    "af_heart",
    "af_bella",
    "af_sarah",
    "am_adam",
    "am_michael",
    "bf_emma",
    "bm_george",
}


def clean_for_tts(text: str) -> str:
    text = text or ""
    text = text.replace("→", " to ")
    text = re.sub(r"\s+", " ", text).strip()

    # Keep ATC phraseology numeric groups from becoming "one thousand four hundred..."
    # This protects squawk codes before Kokoro sees them.
    text = re.sub(r"\bsquawk\s+(\d)\s+(\d)\s+(\d)\s+(\d)\b", r"squawk \1 \2 \3 \4", text, flags=re.I)
    text = re.sub(r"\bsquawk\s+(\d{4})\b", lambda m: "squawk " + " ".join(m.group(1)), text, flags=re.I)

    # ICAO-style runway pronunciation.
    text = re.sub(r"\brunway\s+0?7\b", "runway zero seven", text, flags=re.I)
    text = re.sub(r"\brwy\s+0?7\b", "runway zero seven", text, flags=re.I)

    return text


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--text", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--voice", default="af_heart")
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument("--lang", default="a", help="Kokoro language code. Use 'a' for American English.")
    args = parser.parse_args()

    text = clean_for_tts(args.text)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    voice = args.voice if args.voice in SAFE_VOICES else "af_heart"

    try:
        pipeline = KPipeline(lang_code=args.lang)
        generator = pipeline(text, voice=voice, speed=args.speed)

        # Kokoro may yield multiple chunks. Concatenate by writing chunks in sequence.
        chunks = []
        for _, _, audio in generator:
            chunks.append(audio)

        if not chunks:
            raise RuntimeError("Kokoro returned no audio chunks")

        if len(chunks) == 1:
            audio = chunks[0]
        else:
            import numpy as np
            audio = np.concatenate(chunks)

        sf.write(str(out_path), audio, 24000)
        print(str(out_path))
        return 0

    except Exception as exc:
        print(f"KOKORO_ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
