"""A phone photo stored sideways with an EXIF orientation tag must come out upright: the re-encoded JPEG has no
EXIF, so the rotation has to be applied to the pixels (the 2026 Singapore GP photo rendered rotated 90 degrees)."""

from io import BytesIO

from PIL import Image

from ergast_utils import _resize_photo


def test_resize_photo_applies_exif_orientation():
    sideways = Image.new("RGB", (400, 300), "white")
    exif = sideways.getexif()
    exif[0x0112] = 6  # Orientation: rotate 90 CW to display
    buf = BytesIO()
    sideways.save(buf, format="JPEG", exif=exif)

    out = Image.open(BytesIO(_resize_photo(buf.getvalue())))
    assert out.size == (300, 400)
