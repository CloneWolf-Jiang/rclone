package alist

import (
	"context"
	"testing"
	"time"
)

func TestParseModTime(t *testing.T) {
	tests := []struct {
		name   string
		in     string
		isZero bool
		year   int
	}{
		{name: "empty", in: "", isZero: true},
		{name: "unix-seconds", in: "1712100000", year: 2024},
		{name: "unix-millis", in: "1712100000000", year: 2024},
		{name: "rfc3339", in: "2026-04-03T12:34:56Z", year: 2026},
		{name: "common-format", in: "2026-04-03 12:34:56", year: 2026},
		{name: "invalid", in: "not-a-time", isZero: true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := parseModTime(tc.in)
			if tc.isZero {
				if !got.IsZero() {
					t.Fatalf("expected zero time, got %v", got)
				}
				return
			}
			if got.IsZero() {
				t.Fatalf("expected non-zero time")
			}
			if got.Year() != tc.year {
				t.Fatalf("unexpected year: got=%d want=%d", got.Year(), tc.year)
			}
		})
	}
}

func TestAbsPath(t *testing.T) {
	f := &Fs{root: "team/root"}
	if got, want := f.absPath("docs/file.txt"), "/team/root/docs/file.txt"; got != want {
		t.Fatalf("absPath mismatch: got=%q want=%q", got, want)
	}

	f = &Fs{root: ""}
	if got, want := f.absPath("docs/file.txt"), "/docs/file.txt"; got != want {
		t.Fatalf("absPath mismatch at root: got=%q want=%q", got, want)
	}
}

func TestObjectStringNil(t *testing.T) {
	var o *Object
	if got, want := o.String(), "<nil>"; got != want {
		t.Fatalf("unexpected nil string: got=%q want=%q", got, want)
	}
}

func TestObjectStorable(t *testing.T) {
	o := &Object{modTime: time.Now()}
	if !o.Storable() {
		t.Fatal("expected object to be storable")
	}
}

func TestFeaturesPartialUploads(t *testing.T) {
	f := &Fs{}
	f.initFeatures(context.Background())
	if !f.Features().PartialUploads {
		t.Fatal("expected PartialUploads to be enabled for atomic upload support")
	}
}
