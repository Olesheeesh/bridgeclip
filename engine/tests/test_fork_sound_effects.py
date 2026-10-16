"""Fork: AI-placed sound effects - validation, placement rules and the FFmpeg mix."""

import asyncio
import os
import shutil
import subprocess

import pytest

from clip_engine.services.sound_effects import (
    INTENSITY_COUNTS,
    MIN_SPACING_MS,
    Placement,
    SfxSettings,
    SoundEffect,
    finalize,
    heuristic_placements,
    mix_filter,
    plan_placements,
    speech_gaps,
)

WORDS = [(0, 400, "bro"), (450, 900, "look"), (950, 1300, "at"), (1350, 1800, "this!"), (2600, 3000, "what"),
         (3050, 3500, "no"), (3550, 4000, "way?"), (5200, 5600, "he"), (5650, 6100, "actually"), (6150, 6600, "did"), (6650, 7000, "it")]
DURATION = 9000


def settings(n=3, intensity="normal", keep=True, path="C:/x.wav"):
    kinds = ["reaction", "impact", "transition"]
    return SfxSettings(tuple(SoundEffect(path, f"s{i}", kinds[i % 3], 0.8) for i in range(n)), intensity, keep)


def test_parse_validates_files_and_values(tmp_path):
    sound = tmp_path / "faaah.wav"
    sound.write_bytes(b"RIFF")
    ok = SfxSettings.parse({"sounds": [{"path": str(sound), "name": "Faaah", "kind": "reaction", "volume": 0.7}], "intensity": "wild"})
    assert ok.sounds[0].name == "Faaah" and ok.intensity == "wild"
    assert SfxSettings.parse(None) is None
    assert SfxSettings.parse({"sounds": []}) is None
    for bad in ({"sounds": [{"path": "relative.wav", "name": "x"}]}, {"sounds": [{"path": str(sound), "name": "x", "kind": "music"}]},
                {"sounds": [{"path": str(sound), "name": "x", "volume": 3}]}, {"sounds": [], "intensity": "max"},
                {"sounds": [{"path": str(tmp_path / "missing.wav"), "name": "x"}]}):
        with pytest.raises(ValueError):
            SfxSettings.parse(bad)


def test_gaps_and_finalize_keep_speech_clear_spaced_and_capped():
    gaps = speech_gaps(WORDS, DURATION)
    assert (1800, 2600) in gaps and (4000, 5200) in gaps
    raw = [Placement(0, 1500), Placement(1, 1600), Placement(2, 4500), Placement(0, 8900), Placement(9, 3000), Placement(1, 7100)]
    placed = finalize(raw, settings(), WORDS, DURATION)
    for p in placed:
        assert not any(start < p.at_ms < end for start, end, _ in WORDS), p
        assert 300 <= p.at_ms <= DURATION - 300
    assert all(b.at_ms - a.at_ms >= MIN_SPACING_MS for a, b in zip(placed, placed[1:]))
    assert len(placed) <= INTENSITY_COUNTS["normal"][1]
    assert all(p.sound < 3 for p in placed)


def test_heuristic_reacts_to_exclamations_and_questions():
    placed = heuristic_placements(settings(intensity="wild"), WORDS, DURATION)
    assert len(placed) >= 2
    assert any(1800 <= p.at_ms <= 2600 for p in placed)  # after "this!"


def test_without_a_key_the_heuristic_is_used():
    placed = asyncio.run(plan_placements(settings(), WORDS, DURATION, None, "model"))
    assert placed == heuristic_placements(settings(), WORDS, DURATION)


@pytest.mark.skipif(not shutil.which("ffmpeg") and not os.path.isfile(os.path.join(os.path.dirname(__file__), "..", "..", "engine-bin", "ffmpeg.exe")), reason="FFmpeg not available")
def test_mix_filter_runs_in_ffmpeg(tmp_path):
    ffmpeg = shutil.which("ffmpeg") or os.path.join(os.path.dirname(__file__), "..", "..", "engine-bin", "ffmpeg.exe")
    beep = tmp_path / "beep.wav"
    subprocess.run([ffmpeg, "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=880:duration=0.4", str(beep)], check=True)
    sfx = SfxSettings((SoundEffect(str(beep), "Beep", "impact", 0.9), SoundEffect(str(beep), "Boop", "reaction", 0.5)))
    placements = [Placement(0, 500), Placement(1, 2500), Placement(0, 4200)]
    inputs, graph, label = mix_filter(placements, sfx, 1, 1.25)
    assert label == "[aoutfx]" and len(inputs) == 2
    full = "[0:a]anull[aout]" + graph
    cmd = [ffmpeg, "-v", "error", "-f", "lavfi", "-t", "6", "-i", "anullsrc=r=48000:cl=stereo"]
    for path in inputs:
        cmd += ["-i", path]
    out = tmp_path / "mixed.wav"
    subprocess.run(cmd + ["-filter_complex", full, "-map", label, str(out)], check=True)
    loud = subprocess.run([ffmpeg, "-v", "info", "-i", str(out), "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True).stderr
    assert "max_volume: -inf" not in loud


def _engine_ffmpeg():
    local = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "engine-bin", "ffmpeg.exe"))
    return local if os.path.isfile(local) else shutil.which("ffmpeg")


@pytest.mark.skipif(not _engine_ffmpeg(), reason="FFmpeg not available")
def test_full_render_with_layout_title_style_and_sound_effects(tmp_path, monkeypatch):
    """One real render through RenderingService: styled screen + webcam, outlined title, mixed SFX."""
    from clip_engine.services import rendering_service as module
    from clip_engine.services.layout_analyzer import Box, ClipLayoutPlan, LayoutType, ShotLayout, StackStyle
    from clip_engine.services.rendering_service import RenderingService, RenderRequest
    from clip_engine.services.transcription_service import TranscriptSegment, TranscriptWord
    from .test_av_sync import source

    ffmpeg = _engine_ffmpeg()
    monkeypatch.setenv("PATH", os.path.dirname(ffmpeg) + os.pathsep + os.environ.get("PATH", ""))
    service = RenderingService()
    service._video_codec_args = lambda *args: ["-c:v", "mpeg4", "-q:v", "2", "-bf", "2"]
    service.settings = service.settings.model_copy(update={"openrouter_api_key": None})  # heuristic placement, no network
    monkeypatch.setattr(module, "get_output_dimensions", lambda *_: (180, 320))

    async def plan(request, width, height, start, duration):
        return ClipLayoutPlan([ShotLayout(0, duration, LayoutType.SCREEN_CAM, cam_box=Box(0.7, 0.6, 0.28, 0.38),
                                          screen_box=Box(0, 0, 1, 1))], width, height)

    monkeypatch.setattr(service, "_plan_layout", plan)
    path = source(tmp_path, duration=6)
    beep = tmp_path / "boom.wav"
    subprocess.run([ffmpeg, "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=0.5", str(beep)], check=True)
    words = [TranscriptWord("no", 1000, 1300), TranscriptWord("way!", 1350, 1700), TranscriptWord("look", 3500, 3800)]
    request = RenderRequest(str(path), str(tmp_path / "clip.mp4"), 0, 6000, 64, 64, pacing="natural", apply_padding=False,
                            transcript_segments=[TranscriptSegment(1000, 3800, "no way! look", words=words)], include_captions=False,
                            title_text="Half Filled Portal Glitch", include_title=True, title_style="outline",
                            stack_style=StackStyle(0.7, "top", "whole", "whole"),
                            sfx=SfxSettings((SoundEffect(str(beep), "Boom", "impact", 1.0),), "wild", True))
    result = asyncio.run(service.render_clip(request))
    assert result.render_fallback is None and os.path.isfile(result.output_path)
    streams = subprocess.run([ffmpeg, "-v", "error", "-i", result.output_path, "-f", "null", "-"], capture_output=True, text=True)
    assert streams.returncode == 0
