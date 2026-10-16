"""Fork: user framing for screen + webcam shots (StackStyle) and title card looks."""

import pytest
from PIL import Image

from clip_engine.services.layout_analyzer import Box, LayoutType, ShotLayout, StackStyle
from clip_engine.services.layout_renderer import (
    caption_anchor,
    screen_cam_panels,
    shot_chain,
    shot_views,
    stacked_panel_heights,
    title_y,
)
from clip_engine.services.rendering_service import RenderingService

SRC_W, SRC_H, OUT_W, OUT_H = 1920, 1080, 1080, 1920
CAM = Box(0.70, 0.62, 0.28, 0.36)
FACE = Box(0.80, 0.68, 0.08, 0.14)


def shot(style=None, face=FACE):
    return ShotLayout(0, 4000, LayoutType.SCREEN_CAM, cam_box=CAM, cam_face=face, screen_box=Box(0, 0, 1, 1),
                      screen_focus=Box(0.3, 0.3, 0.3, 0.3), stack_style=style)


def test_parse_accepts_defaults_and_rejects_bad_values():
    assert StackStyle.parse(None) is None
    assert StackStyle.parse({}) == StackStyle()
    assert StackStyle.parse({"screen_ratio": 0.6, "cam_position": "top", "screen_fit": "whole", "cam_zoom": "face"}).cam_position == "top"
    for bad in ({"screen_ratio": 0.95}, {"screen_ratio": True}, {"cam_position": "left"}, {"screen_fit": "huge"},
                {"cam_zoom": "eyes"}, {"cam_inset": 0.5}):
        with pytest.raises(ValueError):
            StackStyle.parse(bad)


def test_stock_shot_is_unchanged_by_the_fork():
    plain = shot()
    assert stacked_panel_heights(plain, SRC_H, OUT_H) == stacked_panel_heights(shot(), SRC_H, OUT_H)
    assert stacked_panel_heights(plain, SRC_H, OUT_H)[0] >= int(OUT_H * 0.6) // 2 * 2
    assert "vstack" in shot_chain(0, plain, SRC_W, SRC_H, OUT_W, OUT_H)
    assert "[sx0]" not in shot_chain(0, plain, SRC_W, SRC_H, OUT_W, OUT_H)


def test_ratio_sets_the_seam_and_camera_can_go_on_top():
    bottom = shot(StackStyle(screen_ratio=0.75, cam_position="bottom", screen_fit="zoom"))
    assert screen_cam_panels(bottom, SRC_H, OUT_H) == ((0, 1440), (1440, 480))
    assert caption_anchor(bottom, SRC_W, SRC_H, OUT_W, OUT_H) == (5, 1440)
    top = shot(StackStyle(screen_ratio=0.75, cam_position="top", screen_fit="zoom"))
    assert screen_cam_panels(top, SRC_H, OUT_H) == ((480, 1440), (0, 480))
    assert caption_anchor(top, SRC_W, SRC_H, OUT_W, OUT_H) == (5, 480)
    # The title moves below the webcam instead of covering the face.
    assert title_y(top, SRC_W, SRC_H, OUT_W, OUT_H, 100) > 480
    assert "[cam0][scr0]vstack" in shot_chain(0, top, SRC_W, SRC_H, OUT_W, OUT_H)
    assert "[scr0][cam0]vstack" in shot_chain(0, bottom, SRC_W, SRC_H, OUT_W, OUT_H)


def test_whole_screen_shows_the_full_width_over_a_blurred_fill():
    style = StackStyle(screen_ratio=0.64, cam_position="bottom", screen_fit="whole")
    views = shot_views(shot(style), 0, SRC_W, SRC_H, OUT_W, OUT_H)
    (sx, sy, sw, sh), (dx, dy, dw, dh) = views[0]
    assert (sw, sh) == (SRC_W, SRC_H)
    assert dw == OUT_W and dh == 606 and dx == 0
    # Sits against the webcam seam, blur above it.
    assert dy + dh == screen_cam_panels(shot(style), SRC_H, OUT_H)[0][1]
    assert "gblur" in shot_chain(0, shot(style), SRC_W, SRC_H, OUT_W, OUT_H)


def test_wide_shows_more_than_the_zoomed_crop():
    zoom = shot_views(shot(StackStyle(screen_fit="zoom")), 0, SRC_W, SRC_H, OUT_W, OUT_H)[0][0]
    wide = shot_views(shot(StackStyle(screen_fit="wide")), 0, SRC_W, SRC_H, OUT_W, OUT_H)[0][0]
    assert wide[2] > zoom[2] * 1.3


def test_hidden_camera_renders_only_the_screen():
    style = StackStyle(cam_position="off", screen_fit="whole")
    views = shot_views(shot(style), 0, SRC_W, SRC_H, OUT_W, OUT_H)
    assert len(views) == 1
    chain = shot_chain(0, shot(style), SRC_W, SRC_H, OUT_W, OUT_H)
    assert "vstack" not in chain and chain.endswith("[v0]")


def test_camera_crop_stays_inside_the_trimmed_webcam_and_zooms_on_request():
    def cam_view(zoom):
        # A small face: zooming in has room before it fills the 2:1 webcam panel.
        views = shot_views(shot(StackStyle(cam_zoom=zoom), Box(0.82, 0.70, 0.04, 0.06)), 0, SRC_W, SRC_H, OUT_W, OUT_H)
        return views[1][0]
    whole, shoulders, face = cam_view("whole"), cam_view("shoulders"), cam_view("face")
    left = CAM.x * SRC_W + CAM.w * SRC_W * 0.05
    right = (CAM.x + CAM.w) * SRC_W - CAM.w * SRC_W * 0.05
    for x, y, w, h in (whole, shoulders, face):
        assert x >= left - 2 and x + w <= right + 2
    assert whole[2] >= shoulders[2] >= face[2]
    assert face[2] < whole[2]


@pytest.mark.parametrize("style", ["box", "none", "outline", "shadow"])
def test_title_card_styles(tmp_path, style):
    service = RenderingService.__new__(RenderingService)
    service._font_path = ""
    path = tmp_path / f"{style}.png"
    card = service._build_title_card("Half Filled Portal Glitch", 1080, 0, str(path), 1.0, style)
    assert card is not None
    corner = Image.open(path).getpixel((2, card["height"] // 2))
    # Only the stock box paints the card background.
    assert (corner[3] > 200) == (style == "box")
