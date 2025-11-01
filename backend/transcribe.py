#!/usr/bin/env python3
# transcribe.py — Vosk with preprocessing + optional faster-whisper fallback

import sys
import os
import wave
import json
import tempfile
from pydub import AudioSegment, effects
from vosk import Model, KaldiRecognizer
import numpy as np

# Optional faster-whisper fallback (install only if you want to use it)
USE_WHISPER_FALLBACK = os.getenv("USE_WHISPER_FALLBACK", "0") == "1"
if USE_WHISPER_FALLBACK:
    try:
        from faster_whisper import WhisperModel
    except Exception as e:
        print(f"[WARN] faster-whisper requested but not installed: {e}", file=sys.stderr)
        USE_WHISPER_FALLBACK = False

# Config
DEFAULT_CHUNK_MS = int(os.getenv("CHUNK_MS", "90000"))  # default 90s chunks
VOSK_MODEL_PATH = os.getenv("VOSK_MODEL_PATH", "vosk-model-small-en-us-0.15")
SAMPLE_RATE = 16000

# -------------------------
# Helpers
# -------------------------
def convert_to_wav16mono(src_path):
    """Convert audio to WAV 16kHz mono and return path."""
    ext = src_path.rsplit(".", 1)[-1].lower()
    if ext == "wav":
        # still force conversion to required format to ensure sample rate/channels
        audio = AudioSegment.from_wav(src_path)
    else:
        audio = AudioSegment.from_file(src_path)
    audio = effects.normalize(audio)                # normalize volume
    # gentle filtering to remove unnecessary band noise (tweak cutoffs if needed)
    audio = audio.high_pass_filter(80)              # remove rumble <80Hz
    audio = audio.low_pass_filter(8000)             # remove ultra-high >8k
    audio = audio.set_frame_rate(SAMPLE_RATE).set_channels(1)
    out_path = tempfile.mktemp(suffix="__converted.wav")
    audio.export(out_path, format="wav")
    print(f"[DEBUG] Converted to {out_path}", file=sys.stderr)
    return out_path

def split_wav(wav_path, chunk_ms=DEFAULT_CHUNK_MS):
    audio = AudioSegment.from_wav(wav_path)
    chunks = []
    for i in range(0, len(audio), chunk_ms):
        chunk = audio[i:i+chunk_ms]
        chunk_name = tempfile.mktemp(suffix=f"_chunk_{i//chunk_ms}.wav")
        chunk.export(chunk_name, format="wav")
        chunks.append(chunk_name)
    print(f"[DEBUG] Split into {len(chunks)} chunk(s).", file=sys.stderr)
    return chunks

def cleanup_files(paths):
    for p in paths:
        try:
            if p and os.path.exists(p):
                os.remove(p)
        except Exception as e:
            print(f"[WARN] cleanup {p}: {e}", file=sys.stderr)

# -------------------------
# Vosk transcribe for one chunk
# -------------------------
def transcribe_chunk_vosk(chunk_path, model):
    wf = wave.open(chunk_path, "rb")
    rec = KaldiRecognizer(model, wf.getframerate())
    rec.SetWords(True)  # include word timestamps if needed
    text_out = []
    while True:
        data = wf.readframes(4000)
        if len(data) == 0:
            break
        if rec.AcceptWaveform(data):
            res = json.loads(rec.Result())
            text_out.append(res.get("text", ""))
        # else: partial = json.loads(rec.PartialResult())   # could log partial if desired
    # final result
    final = json.loads(rec.FinalResult())
    if final.get("text"):
        text_out.append(final.get("text"))
    wf.close()
    return " ".join([t for t in text_out if t]).strip()

# -------------------------
# Whisper fallback (faster-whisper)
# -------------------------
def transcribe_with_whisper_whole(file_path):
    # use faster-whisper: transcribe whole file (recommended for best accuracy)
    model_name = os.getenv("WHISPER_MODEL", "small")  # tiny, base, small, medium, large
    device = os.getenv("WHISPER_DEVICE", "cpu")       # "cpu" or "cuda"
    print(f"[DEBUG] Whisper fallback: model={model_name}, device={device}", file=sys.stderr)
    model = WhisperModel(model_name, device=device, compute_type="int8_float16" if device!="cpu" else "int8")
    segments, info = model.transcribe(file_path, beam_size=5)
    text = " ".join([seg.text for seg in segments])
    return text.strip()

# -------------------------
# Main
# -------------------------
def main():
    if len(sys.argv) < 2:
        print("Usage: python transcribe.py <audio_file>", file=sys.stderr)
        sys.exit(1)

    input_file = sys.argv[1]
    converted = None
    chunk_files = []
    try:
        # 1) Convert & clean
        converted = convert_to_wav16mono(input_file)

        # If user requested whisper fallback direct (whole-file), do it now
        if USE_WHISPER_FALLBACK and os.getenv("WHISPER_DIRECT", "1") == "1":
            try:
                result = transcribe_with_whisper_whole(converted)
                print(result)
                return
            except Exception as e:
                print(f"[WARN] Whisper fallback failed: {e}", file=sys.stderr)
                # fall back to Vosk below

        # 2) Split into chunks
        chunk_files = split_wav(converted)

        # 3) Load Vosk model
        if not os.path.exists(VOSK_MODEL_PATH):
            print(f"[ERROR] Vosk model not found at '{VOSK_MODEL_PATH}'. Please download and set VOSK_MODEL_PATH.", file=sys.stderr)
            # If whisper fallback allowed, try it now
            if USE_WHISPER_FALLBACK:
                result = transcribe_with_whisper_whole(converted)
                print(result)
                return
            sys.exit(1)

        print(f"[DEBUG] Loading Vosk model from {VOSK_MODEL_PATH} (this may take a few seconds)...", file=sys.stderr)
        model = Model(VOSK_MODEL_PATH)
        print("[DEBUG] Model loaded", file=sys.stderr)

        # 4) Transcribe each chunk
        full_text_parts = []
        for i, chunk in enumerate(chunk_files):
            print(f"[INFO] Transcribing chunk {i+1}/{len(chunk_files)}...", file=sys.stderr)
            text = transcribe_chunk_vosk(chunk, model)
            print(f"[DEBUG] chunk {i+1} text preview: {text[:120]}", file=sys.stderr)
            full_text_parts.append(text)
        full_text = " ".join([t for t in full_text_parts if t]).strip()

        # If Vosk output is empty or too short, optionally attempt Whisper fallback
        if (not full_text or len(full_text.split()) < 3) and USE_WHISPER_FALLBACK:
            print("[WARN] Vosk produced very little text — trying Whisper fallback...", file=sys.stderr)
            full_text = transcribe_with_whisper_whole(converted)

        print(full_text)
    except Exception as e:
        print(f"[ERROR] Transcription failed. Python error: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        cleanup_files(chunk_files)
        if converted and converted != input_file:
            cleanup_files([converted])


if __name__ == "__main__":
    main()
