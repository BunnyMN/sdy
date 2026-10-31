package profile

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"
)

func testJPEG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for x := 0; x < w; x++ {
		for y := 0; y < h; y++ {
			img.Set(x, y, color.RGBA{uint8(x), uint8(y), 120, 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, nil); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// withEXIF puts an APP1 "Exif" segment, carrying a recognisable marker,
// right after the JPEG's SOI — where a phone camera writes its GPS position.
func withEXIF(raw []byte, marker string) []byte {
	payload := append([]byte("Exif\x00\x00"), []byte(marker)...)
	seg := []byte{0xFF, 0xE1, byte((len(payload) + 2) >> 8), byte(len(payload) + 2)}
	seg = append(seg, payload...)
	out := append([]byte{}, raw[:2]...)
	out = append(out, seg...)
	return append(out, raw[2:]...)
}

func TestAPhotoIsStoredWithoutItsMetadata(t *testing.T) {
	raw := withEXIF(testJPEG(t, 300, 300), "GPS-47.9184N-106.9177E")
	if !bytes.Contains(raw, []byte("GPS-47.9184N")) {
		t.Fatal("the fixture lost its EXIF marker")
	}
	out, err := normalisePhoto(raw)
	if err != nil {
		t.Fatalf("a valid JPEG was refused: %v", err)
	}
	if bytes.Contains(out, []byte("GPS-47.9184N")) || bytes.Contains(out, []byte("Exif")) {
		t.Fatal("the stored photo still carries the upload's EXIF")
	}
	cfg, err := jpeg.DecodeConfig(bytes.NewReader(out))
	if err != nil || cfg.Width != 300 || cfg.Height != 300 {
		t.Fatalf("stored photo %dx%d err=%v, want 300x300", cfg.Width, cfg.Height, err)
	}
}

func TestALargePhotoIsScaledDown(t *testing.T) {
	out, err := normalisePhoto(testJPEG(t, 2000, 1000))
	if err != nil {
		t.Fatal(err)
	}
	cfg, _ := jpeg.DecodeConfig(bytes.NewReader(out))
	if cfg.Width != StoredPhotoSide || cfg.Height != StoredPhotoSide/2 {
		t.Fatalf("scaled to %dx%d, want %dx%d", cfg.Width, cfg.Height, StoredPhotoSide, StoredPhotoSide/2)
	}
}

func TestWhatIsNotAPhotoIsRefused(t *testing.T) {
	var pngBuf bytes.Buffer
	_ = png.Encode(&pngBuf, image.NewRGBA(image.Rect(0, 0, 200, 200)))
	for name, raw := range map[string][]byte{
		"png":       pngBuf.Bytes(),
		"too small": testJPEG(t, 32, 32),
		"text":      []byte("<?php echo 'hi'; ?>"),
		"truncated": testJPEG(t, 300, 300)[:200],
		"empty":     nil,
	} {
		if _, err := normalisePhoto(raw); err == nil {
			t.Errorf("%s was accepted as a photo", name)
		}
	}
}
