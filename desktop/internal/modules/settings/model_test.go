package settings

import "testing"

func TestInvalidModesAndConcurrencyAreRejected(t *testing.T) {
	for _, mode := range []ThemeMode{ThemeUnknown, -1, 4, 127} {
		g := Defaults()
		g.ThemeMode = mode
		if g.Validate() == nil {
			t.Fatalf("accepted theme %d", mode)
		}
	}
	for _, count := range []int{-1, 0, 33} {
		g := Defaults()
		g.MaxConcurrentNotes = count
		if g.Validate() == nil {
			t.Fatalf("accepted concurrent notes %d", count)
		}
	}
	if err := Defaults().Validate(); err != nil {
		t.Fatal(err)
	}
}
