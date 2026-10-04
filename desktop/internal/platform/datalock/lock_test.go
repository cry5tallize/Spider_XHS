package datalock

import "testing"

func TestDataDirectoryHasOneOwnerAndReleases(t *testing.T) {
	dir := t.TempDir()
	first, err := Acquire(dir)
	if err != nil {
		t.Fatal(err)
	}
	if second, err := Acquire(dir); err == nil {
		second.Close()
		first.Close()
		t.Fatal("two owners accepted")
	}
	if err = first.Close(); err != nil {
		t.Fatal(err)
	}
	next, err := Acquire(dir)
	if err != nil {
		t.Fatal(err)
	}
	if err = next.Close(); err != nil {
		t.Fatal(err)
	}
}
