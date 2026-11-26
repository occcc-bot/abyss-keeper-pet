#!/usr/bin/env python3
"""
Synthesize copyright-free Bullfrog Dungeon Keeper style dark retro fantasy SFX
using numpy & scipy waveforms + envelopes (22050 Hz, 16-bit mono WAV).
"""
from pathlib import Path
import wave
import numpy as np
from scipy import signal

SR = 22050
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "assets" / "sfx"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def save_wav(name: str, samples: np.ndarray) -> None:
    peak = float(np.max(np.abs(samples))) if samples.size else 1.0
    if peak > 0:
        samples = samples / peak * 0.88
    pcm = np.clip(samples * 32767.0, -32768, 32767).astype(np.int16)
    out = OUT_DIR / f"{name}.wav"
    with wave.open(str(out), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())
    print(f"[gen_sfx] Wrote {out.name} ({len(pcm) / SR:.2f}s)")


def lowpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    b, a = signal.butter(4, min(0.95, cutoff / (SR * 0.5)), btype="low")
    return signal.lfilter(b, a, x)


def bandpass(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    b, a = signal.butter(3, [lo / (SR * 0.5), min(0.95, hi / (SR * 0.5))], btype="band")
    return signal.lfilter(b, a, x)


def synth_slap_whack(rng: np.random.Generator) -> np.ndarray:
    """Crisp Bullfrog slap: punchy mid-high smack transient + cheeky pitch zip."""
    dur = 0.24
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    noise = rng.standard_normal(t.size)
    smack = bandpass(noise, 700, 4800) * np.exp(-t * 42.0)
    body = np.sin(2 * np.pi * (260 * np.exp(-t * 14.0) + 90) * t) * np.exp(-t * 24.0)
    chirp = np.sin(2 * np.pi * (520 + 680 * np.exp(-t * 28.0)) * t) * np.exp(-t * 32.0) * 0.35
    return smack * 1.15 + body * 0.7 + chirp


def synth_hand_grab(rng: np.random.Generator) -> np.ndarray:
    """Upward magical claw whoosh + cloth grab pop."""
    dur = 0.22
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    freq = 220 + 620 * (t / dur) ** 1.4
    tone = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.sin(np.pi * t / dur)
    whoosh = bandpass(rng.standard_normal(t.size), 500, 2200) * np.sin(np.pi * t / dur) * 0.4
    return tone * 0.75 + whoosh


def synth_hand_drop(rng: np.random.Generator) -> np.ndarray:
    """Soft weighty thud on stone dungeon floor."""
    dur = 0.20
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    freq = 165 * np.exp(-t * 18.0) + 48
    thud = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t * 19.0)
    gravel = lowpass(rng.standard_normal(t.size), 900) * np.exp(-t * 34.0) * 0.45
    return thud + gravel


def synth_pickaxe_dig(rng: np.random.Generator) -> np.ndarray:
    """Metallic pickaxe clink on gold ore + crumbling rock."""
    dur = 0.26
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    clang = (
        np.sin(2 * np.pi * 1760 * t) * 0.55
        + np.sin(2 * np.pi * 2480 * t) * 0.4
        + np.sin(2 * np.pi * 3310 * t) * 0.25
    ) * np.exp(-t * 26.0)
    chips = bandpass(rng.standard_normal(t.size), 1200, 5200) * np.exp(-np.maximum(0, t - 0.03) * 28.0) * 0.55
    return clang + chips


def synth_gold_chime() -> np.ndarray:
    """Shimmering double-coin clink into the Abyssal Treasury."""
    dur = 0.42
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    note1 = (np.sin(2 * np.pi * 1318.5 * t) + 0.45 * np.sin(2 * np.pi * 2637.0 * t)) * np.exp(-t * 11.0)
    t2 = np.maximum(0, t - 0.085)
    mask2 = (t >= 0.085).astype(float)
    note2 = mask2 * (np.sin(2 * np.pi * 1760.0 * t2) + 0.5 * np.sin(2 * np.pi * 3520.0 * t2)) * np.exp(-t2 * 9.5)
    return note1 * 0.7 + note2 * 0.9


def synth_chicken_gulp() -> np.ndarray:
    """Comedic cluck-cluck followed by a quick cartoon gulp."""
    dur = 0.36
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    # Cluck pulse 1
    f1 = 620 + 280 * np.sin(2 * np.pi * 18 * t)
    cluck = np.sin(2 * np.pi * np.cumsum(f1) / SR) * np.exp(-((t - 0.07) / 0.032) ** 2) * 0.7
    # Gulp downward-upward pop
    t2 = np.maximum(0, t - 0.16)
    m2 = (t >= 0.16).astype(float)
    f2 = 240 + 420 * np.exp(-t2 * 14.0) * np.sin(2 * np.pi * 8 * t2)
    gulp = m2 * np.sin(2 * np.pi * np.cumsum(np.maximum(110, f2)) / SR) * np.exp(-t2 * 14.0) * 0.95
    return cluck + gulp


def synth_boulder_crush(rng: np.random.Generator) -> np.ndarray:
    """Deep rolling dungeon stone rumble + heavy boulder impact."""
    dur = 0.75
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    rumble = lowpass(rng.standard_normal(t.size), 240) * (1 - np.exp(-t * 12)) * np.exp(-t * 2.2)
    impact = np.sin(2 * np.pi * (88 * np.exp(-t * 7.0) + 34) * t) * np.exp(-t * 4.5) * 0.85
    crumble = bandpass(rng.standard_normal(t.size), 300, 1400) * np.exp(-t * 5.0) * 0.45
    return rumble * 1.4 + impact + crumble


def synth_corruption_complete() -> np.ndarray:
    """Gothic dark pipe-organ minor chord swell (D minor -> Abyssal diminished)."""
    dur = 1.25
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    env = (1 - np.exp(-t * 9.0)) * np.exp(-np.maximum(0, t - 0.35) * 2.6)
    freqs = [146.83, 220.0, 293.66, 349.23, 440.0, 587.33]  # D3 A3 D4 F4 A4 D5
    chord = np.zeros_like(t)
    for i, f in enumerate(freqs):
        # Organ pipe harmonics (fundamental + 2nd + 3rd + slight detune)
        w = 1.0 / (1.0 + i * 0.25)
        chord += w * (
            np.sin(2 * np.pi * f * t)
            + 0.4 * np.sin(2 * np.pi * (f * 2.002) * t)
            + 0.2 * np.sin(2 * np.pi * (f * 3.0) * t)
        )
    shimmer = np.sin(2 * np.pi * 880.0 * t + 1.5 * np.sin(2 * np.pi * 5.5 * t)) * np.exp(-t * 3.0) * 0.18
    return lowpass(chord, 2600) * env + shimmer


def synth_payday_bell() -> np.ndarray:
    """Deep ominous Bullfrog Payday gong/bell chime."""
    dur = 1.35
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    # Inharmonic bell partials
    partials = [(220.0, 1.0, 2.2), (440.0, 0.55, 3.0), (528.0, 0.4, 3.4), (661.0, 0.3, 4.2), (883.0, 0.2, 5.5)]
    bell = np.zeros_like(t)
    for f, amp, decay in partials:
        bell += amp * np.sin(2 * np.pi * f * t) * np.exp(-t * decay)
    strike = np.sin(2 * np.pi * 110.0 * t) * np.exp(-t * 14.0) * 0.65
    return bell + strike


def synth_spell_cast(rng: np.random.Generator) -> np.ndarray:
    """Arcane abyssal thunderbolt + resonant sweep."""
    dur = 0.55
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    zap = np.sin(2 * np.pi * (920 * np.exp(-t * 6.5) + 120) * t) * np.exp(-t * 5.0)
    crackle = bandpass(rng.standard_normal(t.size), 1400, 6200) * np.exp(-t * 11.0) * 0.65
    return zap + crackle


def synth_fusion_ritual() -> np.ndarray:
    """Rising arcane harmonic chime for Altar 2-in-1 evolution."""
    dur = 0.95
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    notes = [293.66, 369.99, 440.0, 587.33, 739.99]
    out = np.zeros_like(t)
    for idx, f in enumerate(notes):
        start = idx * 0.11
        local = np.maximum(0, t - start)
        mask = (t >= start).astype(float)
        out += mask * (np.sin(2 * np.pi * f * local) + 0.35 * np.sin(2 * np.pi * f * 2 * local)) * np.exp(-local * 4.2)
    return out


def synth_trap_snap(rng: np.random.Generator) -> np.ndarray:
    """Sharp iron mechanism snap for spikes/spring traps."""
    dur = 0.18
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    snap = bandpass(rng.standard_normal(t.size), 1500, 5500) * np.exp(-t * 55.0)
    ping = np.sin(2 * np.pi * 980 * t) * np.exp(-t * 32.0) * 0.5
    return snap + ping


def main() -> None:
    rng = np.random.default_rng(20261126)
    save_wav("slap_whack", synth_slap_whack(rng))
    save_wav("hand_grab", synth_hand_grab(rng))
    save_wav("hand_drop", synth_hand_drop(rng))
    save_wav("pickaxe_dig", synth_pickaxe_dig(rng))
    save_wav("gold_chime", synth_gold_chime())
    save_wav("chicken_gulp", synth_chicken_gulp())
    save_wav("boulder_crush", synth_boulder_crush(rng))
    save_wav("corruption_complete", synth_corruption_complete())
    save_wav("payday_bell", synth_payday_bell())
    save_wav("spell_cast", synth_spell_cast(rng))
    save_wav("fusion_ritual", synth_fusion_ritual())
    save_wav("trap_snap", synth_trap_snap(rng))
    print(f"[gen_sfx] Done! All 12 SFX saved to {OUT_DIR}")


if __name__ == "__main__":
    main()
