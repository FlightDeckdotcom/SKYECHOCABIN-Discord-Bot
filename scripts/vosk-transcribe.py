#!/usr/bin/env python3
import json, os, sys, wave, tempfile, subprocess

def fail(message, code=2):
    print(json.dumps({"ok": False, "error": message, "text": "", "confidence": 0}))
    sys.exit(code)

def ensure_16k_mono_wav(input_path):
    try:
        with wave.open(input_path, "rb") as wf:
            if wf.getnchannels() == 1 and wf.getframerate() == 16000 and wf.getsampwidth() == 2 and wf.getcomptype() == "NONE":
                return input_path, None
    except Exception:
        pass
    ffmpeg = os.environ.get("FFMPEG_BINARY", "ffmpeg")
    out = tempfile.NamedTemporaryFile(prefix="skyecho-vosk-", suffix=".wav", delete=False)
    out.close()
    cmd = [ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", input_path, "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", out.name]
    try:
        subprocess.check_call(cmd)
    except FileNotFoundError:
        fail("ffmpeg not found. Install ffmpeg or set FFMPEG_BINARY to its full path.")
    except subprocess.CalledProcessError as e:
        fail(f"ffmpeg conversion failed: {e}")
    return out.name, out.name

def main():
    if len(sys.argv) < 3:
        fail("Usage: vosk-transcribe.py <audio.wav> <vosk_model_path>")
    audio_path, model_path = sys.argv[1], sys.argv[2]
    if not os.path.exists(audio_path): fail(f"Audio file not found: {audio_path}")
    if not os.path.isdir(model_path): fail(f"Vosk model folder not found: {model_path}")
    try:
        from vosk import Model, KaldiRecognizer, SetLogLevel
    except Exception as e:
        fail(f"Python package 'vosk' is not installed. Run: python3 -m pip install vosk. Detail: {e}")
    temp_path = None
    try:
        wav_path, temp_path = ensure_16k_mono_wav(audio_path)
        SetLogLevel(-1)
        model = Model(model_path)
        with wave.open(wav_path, "rb") as wf:
            rec = KaldiRecognizer(model, wf.getframerate())
            rec.SetWords(True)
            chunks = []
            while True:
                data = wf.readframes(4000)
                if len(data) == 0: break
                if rec.AcceptWaveform(data): chunks.append(json.loads(rec.Result()))
            chunks.append(json.loads(rec.FinalResult()))
        texts, confs = [], []
        for c in chunks:
            if c.get("text"): texts.append(c["text"])
            for w in c.get("result", []) or []:
                if "conf" in w: confs.append(float(w["conf"]))
        text = " ".join(texts).strip()
        confidence = sum(confs)/len(confs) if confs else (0.65 if text else 0)
        print(json.dumps({"ok": True, "text": text, "confidence": confidence, "engine": "vosk-local"}))
    finally:
        if temp_path:
            try: os.unlink(temp_path)
            except Exception: pass

if __name__ == "__main__": main()
