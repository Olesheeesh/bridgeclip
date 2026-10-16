"""
Fork: sound effects (Faaah, vine boom, explosion...) placed by AI and mixed
under a rendered clip.

A language model reads the clip's words with their output-time positions and
picks moments (reactions, punchlines, fails) and which of the user's sounds to
play. Its answer is only a suggestion: every time is clamped to the clip,
moved into a pause between words when speech must stay clear, spaced apart,
and capped by the chosen intensity. Without a key, or if the model fails, a
simple heuristic places the sounds instead, so a render never fails over SFX.
"""

import json
import logging
import os
from dataclasses import dataclass
from typing import Any, Optional

import httpx

from clip_engine.services.openrouter import OpenRouterError, apply_reasoning, chat_completion, json_schema_format, message_text

logger = logging.getLogger(__name__)

SFX_KINDS = ("reaction", "impact", "transition", "other")
# Placements per clip for each intensity.
INTENSITY_COUNTS = {"subtle": (1, 2), "normal": (3, 4), "wild": (5, 7)}
MAX_SOUNDS = 40
MAX_SOUND_BYTES = 20 * 1024 * 1024
# Keep sounds this far from the clip edges and from each other.
EDGE_MS = 300
MIN_SPACING_MS = 1500
# A pause this long between words can take a sound without covering speech.
MIN_GAP_MS = 180
MAX_PROMPT_WORDS = 700
REACTION_WORDS = {"what", "no", "bro", "oh", "wait", "omg", "wow", "yo", "dude", "huh", "why", "how", "stop", "lol", "lmao"}


@dataclass(frozen=True)
class SoundEffect:
    path: str
    name: str
    kind: str
    volume: float


@dataclass(frozen=True)
class SfxSettings:
    sounds: tuple[SoundEffect, ...]
    intensity: str = "normal"
    keep_speech_clear: bool = True

    @classmethod
    def parse(cls, raw: Any) -> Optional["SfxSettings"]:
        """Validated settings from the job config, or None when there is nothing to place."""
        if raw is None:
            return None
        if not isinstance(raw, dict) or not isinstance(raw.get("sounds"), list) or len(raw["sounds"]) > MAX_SOUNDS:
            raise ValueError("Invalid sound effects")
        intensity = raw.get("intensity", "normal")
        keep = raw.get("keep_speech_clear", True)
        if intensity not in INTENSITY_COUNTS or not isinstance(keep, bool):
            raise ValueError("Invalid sound effects")
        sounds = []
        for item in raw["sounds"]:
            if not isinstance(item, dict):
                raise ValueError("Invalid sound effect")
            path, name, kind, volume = item.get("path"), item.get("name"), item.get("kind", "other"), item.get("volume", 0.8)
            if (not isinstance(path, str) or not os.path.isabs(path) or not os.path.isfile(path) or os.path.getsize(path) > MAX_SOUND_BYTES
                    or not isinstance(name, str) or not 0 < len(name) <= 80 or kind not in SFX_KINDS
                    or not isinstance(volume, (int, float)) or isinstance(volume, bool) or not 0 <= volume <= 1.5):
                raise ValueError("Invalid sound effect")
            sounds.append(SoundEffect(path, name, kind, float(volume)))
        return cls(tuple(sounds), intensity, keep) if sounds else None


@dataclass(frozen=True)
class Placement:
    sound: int
    at_ms: int


Word = tuple[int, int, str]


def output_words(segments, window_start_ms: int) -> list[Word]:
    """(start, end, text) on the clip's output clock from remapped transcript segments."""
    words: list[Word] = []
    for seg in segments or []:
        if seg.words:
            words.extend((w.start_time_ms - window_start_ms, w.end_time_ms - window_start_ms, w.word) for w in seg.words)
        elif seg.text:
            words.append((seg.start_time_ms - window_start_ms, seg.end_time_ms - window_start_ms, seg.text))
    return sorted(words)


def speech_gaps(words: list[Word], duration_ms: int) -> list[tuple[int, int]]:
    """Pauses with no speech, at least MIN_GAP_MS long."""
    gaps, cursor = [], 0
    for start, end, _ in words:
        if start - cursor >= MIN_GAP_MS:
            gaps.append((cursor, start))
        cursor = max(cursor, end)
    if duration_ms - cursor >= MIN_GAP_MS:
        gaps.append((cursor, duration_ms))
    return gaps


def _snap(at_ms: int, gaps: list[tuple[int, int]]) -> Optional[int]:
    """The nearest moment inside a pause, just after it starts (a sound lands on the beat)."""
    best = None
    for start, end in gaps:
        point = min(max(at_ms, start + 60), end - 60)
        if best is None or abs(point - at_ms) < abs(best - at_ms):
            best = point
    return best


def finalize(raw: list[Placement], settings: SfxSettings, words: list[Word], duration_ms: int) -> list[Placement]:
    """Clamp, keep speech clear, space apart and cap the suggested placements."""
    low, high = INTENSITY_COUNTS[settings.intensity]
    gaps = speech_gaps(words, duration_ms)
    kept: list[Placement] = []
    for placement in sorted(raw, key=lambda p: p.at_ms):
        if not 0 <= placement.sound < len(settings.sounds):
            continue
        at = placement.at_ms
        if settings.keep_speech_clear and words:
            at = _snap(at, gaps)
            if at is None:
                continue
        if not EDGE_MS <= at <= duration_ms - EDGE_MS:
            continue
        if kept and at - kept[-1].at_ms < MIN_SPACING_MS:
            continue
        kept.append(Placement(placement.sound, int(at)))
        if len(kept) >= high:
            break
    return kept


def heuristic_placements(settings: SfxSettings, words: list[Word], duration_ms: int) -> list[Placement]:
    """Reactions after exclamations/questions/reaction words, impacts in the longest pauses."""
    low, high = INTENSITY_COUNTS[settings.intensity]
    by_kind = {kind: [i for i, s in enumerate(settings.sounds) if s.kind == kind] for kind in SFX_KINDS}
    reactions = by_kind["reaction"] or list(range(len(settings.sounds)))
    impacts = by_kind["impact"] or reactions
    candidates: list[tuple[float, int, list[int]]] = []
    for start, end, text in words:
        clean = text.strip().lower().strip(".,!?\"'")
        if text.rstrip().endswith(("!", "?")) or clean in REACTION_WORDS:
            candidates.append((2.0, end + 80, reactions))
    for start, end in speech_gaps(words, duration_ms):
        if end - start >= 600:
            candidates.append((1.0 + (end - start) / 4000, start + 60, impacts))
    if not candidates:
        candidates = [(1.0, int(duration_ms * f), reactions) for f in (0.3, 0.6, 0.85)]
    candidates.sort(key=lambda c: -c[0])
    raw = [Placement(pool[i % len(pool)], at) for i, (_, at, pool) in enumerate(candidates[: high * 3])]
    return finalize(raw, settings, words, duration_ms)


PLACEMENT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["placements"],
    "properties": {
        "placements": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["sound", "at_ms", "reason"],
                "properties": {"sound": {"type": "integer"}, "at_ms": {"type": "integer"}, "reason": {"type": "string"}},
            },
        }
    },
}


async def plan_placements(settings: SfxSettings, words: list[Word], duration_ms: int, api_key: Optional[str], model: str) -> list[Placement]:
    """AI placements, or the heuristic when no key is set or the model fails."""
    if not api_key:
        return heuristic_placements(settings, words, duration_ms)
    low, high = INTENSITY_COUNTS[settings.intensity]
    prompt = {
        "clip_duration_ms": duration_ms,
        "place_between": [low, high],
        "sounds": [{"sound": i, "name": s.name, "kind": s.kind} for i, s in enumerate(settings.sounds)],
        "words": [{"start_ms": a, "end_ms": b, "text": t} for a, b, t in words[:MAX_PROMPT_WORDS]],
    }
    payload: dict[str, Any] = {
        "model": model,
        "max_tokens": 1500,
        "messages": [
            {"role": "system", "content": (
                "You add short meme sound effects to a vertical gaming/stream clip to keep viewers watching. "
                "Pick moments that earn a sound: a reaction, a punchline, a fail, a surprise, a sudden twist. "
                "Choose a sound whose name and kind fit the moment. Place each sound right after the moment, "
                "in a pause, never inside a word. Spread them out; do not stack them. Use only the listed sounds."
            )},
            {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
        ],
        "response_format": json_schema_format("sound_effect_placements", PLACEMENT_SCHEMA),
    }
    apply_reasoning(payload, "none", temperature=0.4)
    try:
        async with httpx.AsyncClient(base_url="https://openrouter.ai/api/v1", timeout=45,
                                     headers={"Authorization": f"Bearer {api_key}"}) as client:
            body, _ = await chat_completion(client, payload)
        content, _ = message_text(body)
        data = json.loads(content or "{}")
        raw = [Placement(int(p["sound"]), int(p["at_ms"])) for p in data.get("placements", [])
               if isinstance(p, dict) and isinstance(p.get("sound"), int) and isinstance(p.get("at_ms"), int)]
        placed = finalize(raw, settings, words, duration_ms)
        if len(placed) >= low:
            return placed
        logger.info("sfx.ai_too_few", extra={"placed": len(placed)})
    except (OpenRouterError, ValueError, KeyError, TypeError) as error:
        logger.warning("sfx.ai_failed: %s", type(error).__name__)
    return heuristic_placements(settings, words, duration_ms)


def mix_filter(placements: list[Placement], settings: SfxSettings, first_input: int, speed: float, audio_label: str = "[aout]") -> tuple[list[str], str, str]:
    """Extra audio inputs, the filter appended to the graph, and the new audio label.

    Placements are on the edited (pre-speed) clock; audio is already at the
    final speed, so each delay is divided by the playback speed.
    """
    used = sorted({p.sound for p in placements})
    if not used:
        return [], "", audio_label
    inputs = [settings.sounds[i].path for i in used]
    index_of = {sound: first_input + n for n, sound in enumerate(used)}
    parts: list[str] = []
    for sound in used:
        uses = [j for j, p in enumerate(placements) if p.sound == sound]
        labels = "".join(f"[fxs{j}]" for j in uses)
        parts.append(f"[{index_of[sound]}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,"
                     f"asplit={len(uses)}{labels}" if len(uses) > 1 else
                     f"[{index_of[sound]}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo{labels}")
    for j, placement in enumerate(placements):
        delay = max(0, round(placement.at_ms / speed))
        parts.append(f"[fxs{j}]volume={settings.sounds[placement.sound].volume:.3f},adelay={delay}:all=1[fx{j}]")
    mixed = "".join(f"[fx{j}]" for j in range(len(placements)))
    parts.append(f"{audio_label}aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[fxbase];"
                 f"[fxbase]{mixed}amix=inputs={len(placements) + 1}:duration=first:dropout_transition=0:normalize=0,"
                 f"alimiter=limit=0.97[aoutfx]")
    return inputs, ";" + ";".join(parts), "[aoutfx]"
