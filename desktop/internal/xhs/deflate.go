package xhs

import (
	"encoding/binary"
	"fmt"
	"hash/crc32"
	"sort"
)

var lengthBase = []int{3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258}
var lengthExtra = []int{0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0}
var distanceBase = []int{1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577}
var distanceExtra = []int{0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13}
var codeLengthOrder = []int{16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15}

type deflateToken struct {
	literal, length, distance int
	end                       bool
}

func lz77(data []byte) []deflateToken {
	var tokens []deflateToken
	for pos := 0; pos < len(data); {
		bestLen, bestDistance := 0, 0
		for back := pos - 1; back >= max(0, pos-128); back-- {
			n := 0
			for n < min(5, len(data)-pos) && data[back+n] == data[pos+n] {
				n++
			}
			if n >= 3 && n > bestLen {
				bestLen, bestDistance = n, pos-back
				if n == 5 {
					break
				}
			}
		}
		if bestLen >= 3 {
			tokens = append(tokens, deflateToken{length: bestLen, distance: bestDistance})
			pos += bestLen
		} else {
			tokens = append(tokens, deflateToken{literal: int(data[pos])})
			pos++
		}
	}
	return append(tokens, deflateToken{end: true})
}

type huffmanNode struct {
	frequency, symbol int
	left, right       *huffmanNode
}

func huffmanLengths(freq []int, maxBits int) ([]int, error) {
	lens := make([]int, len(freq))
	depths := make([]int, len(freq))
	leaves := []*huffmanNode{}
	for i, f := range freq {
		if f > 0 {
			leaves = append(leaves, &huffmanNode{frequency: f, symbol: i})
		}
	}
	if len(leaves) == 0 {
		return lens, nil
	}
	if len(leaves) == 1 {
		lens[leaves[0].symbol] = 1
		return lens, nil
	}
	heap := append([]*huffmanNode(nil), leaves...)
	sort.SliceStable(heap, func(i, j int) bool { return heap[i].frequency < heap[j].frequency })
	for len(heap) > 1 {
		a, b := heap[0], heap[1]
		heap = heap[2:]
		parent := &huffmanNode{frequency: a.frequency + b.frequency, symbol: -1, left: a, right: b}
		i := 0
		for i < len(heap) && heap[i].frequency <= parent.frequency {
			i++
		}
		heap = append(heap, nil)
		copy(heap[i+1:], heap[i:])
		heap[i] = parent
	}
	var walk func(*huffmanNode, int)
	walk = func(n *huffmanNode, depth int) {
		if n.symbol >= 0 {
			lens[n.symbol] = max(depth, 1)
			depths[n.symbol] = lens[n.symbol]
			return
		}
		walk(n.left, depth+1)
		walk(n.right, depth+1)
	}
	walk(heap[0], 0)
	overflow := 0
	counts := make([]int, maxBits+1)
	for _, n := range lens {
		if n > maxBits {
			overflow++
		}
		if n > 0 {
			counts[min(n, maxBits)]++
		}
	}
	if overflow == 0 {
		return lens, nil
	}
	for overflow > 0 {
		bits := maxBits - 1
		for bits > 0 && counts[bits] == 0 {
			bits--
		}
		if bits == 0 {
			return nil, fmt.Errorf("Huffman length limit cannot be satisfied")
		}
		counts[bits]--
		counts[bits+1] += 2
		counts[maxBits]--
		overflow -= 2
	}
	sort.Slice(leaves, func(i, j int) bool {
		a, b := leaves[i], leaves[j]
		if a.frequency != b.frequency {
			return a.frequency < b.frequency
		}
		if depths[a.symbol] != depths[b.symbol] {
			return depths[a.symbol] < depths[b.symbol]
		}
		return a.symbol < b.symbol
	})
	lens = make([]int, len(freq))
	h := 0
	for bits := maxBits; bits > 0; bits-- {
		for n := counts[bits]; n > 0; n-- {
			if h >= len(leaves) {
				return nil, fmt.Errorf("invalid Huffman leaf count")
			}
			lens[leaves[h].symbol] = bits
			h++
		}
	}
	return lens, nil
}
func canonical(lens []int) []int {
	maxLen := 0
	for _, n := range lens {
		maxLen = max(maxLen, n)
	}
	counts, next := make([]int, maxLen+1), make([]int, maxLen+1)
	for _, n := range lens {
		if n > 0 {
			counts[n]++
		}
	}
	code := 0
	for bits := 1; bits <= maxLen; bits++ {
		code = (code + counts[bits-1]) << 1
		next[bits] = code
	}
	codes := make([]int, len(lens))
	for i, n := range lens {
		if n > 0 {
			codes[i] = next[n]
			next[n]++
		}
	}
	return codes
}

type bitWriter struct {
	data   []byte
	buffer uint32
	count  int
}

func (w *bitWriter) bits(value, n int) {
	w.buffer |= uint32(value) << uint(w.count)
	w.count += n
	for w.count >= 8 {
		w.data = append(w.data, byte(w.buffer))
		w.buffer >>= 8
		w.count -= 8
	}
}
func (w *bitWriter) code(value, n int) {
	rev := 0
	for i := 0; i < n; i++ {
		rev |= ((value >> (n - 1 - i)) & 1) << i
	}
	w.bits(rev, n)
}
func (w *bitWriter) flush() []byte {
	if w.count > 0 {
		w.data = append(w.data, byte(w.buffer))
		w.buffer = 0
		w.count = 0
	}
	return w.data
}

type lengthRun struct{ symbol, extra, extraBits int }

func rleLengths(lens []int) []lengthRun {
	var out []lengthRun
	for i := 0; i < len(lens); {
		cur := lens[i]
		run := 1
		for i+run < len(lens) && lens[i+run] == cur {
			run++
		}
		i += run
		if cur == 0 {
			for run >= 11 {
				n := min(run, 138)
				out = append(out, lengthRun{18, n - 11, 7})
				run -= n
			}
			for run >= 3 {
				n := min(run, 10)
				out = append(out, lengthRun{17, n - 3, 3})
				run -= n
			}
			for run > 0 {
				out = append(out, lengthRun{})
				run--
			}
		} else {
			out = append(out, lengthRun{symbol: cur})
			run--
			for run >= 3 {
				n := min(run, 6)
				out = append(out, lengthRun{16, n - 3, 2})
				run -= n
			}
			for run > 0 {
				out = append(out, lengthRun{symbol: cur})
				run--
			}
		}
	}
	return out
}
func matchCode(value int, bases, extras []int, offset int) (int, int, int) {
	for i, b := range bases {
		if value >= b && (i == len(bases)-1 || value < bases[i+1]) {
			return i + offset, extras[i], value - b
		}
	}
	panic("invalid internal LZ77 match")
}
func EncodeDeflate(data []byte) ([]byte, error) {
	tokens := lz77(data)
	litFreq, distFreq := make([]int, 286), make([]int, 30)
	litFreq[256] = 1
	for _, t := range tokens {
		if t.end {
			continue
		}
		if t.length > 0 {
			lc, _, _ := matchCode(t.length, lengthBase, lengthExtra, 257)
			dc, _, _ := matchCode(t.distance, distanceBase, distanceExtra, 0)
			litFreq[lc]++
			distFreq[dc]++
		} else {
			litFreq[t.literal]++
		}
	}
	litLens, e := huffmanLengths(litFreq, 15)
	if e != nil {
		return nil, e
	}
	distLens, e := huffmanLengths(distFreq, 15)
	if e != nil {
		return nil, e
	}
	hlit, hdist := 0, 0
	for i := 285; i > 256; i-- {
		if litLens[i] > 0 {
			hlit = i - 256
			break
		}
	}
	for i := 29; i > 0; i-- {
		if distLens[i] > 0 {
			hdist = i
			break
		}
	}
	litLens = litLens[:hlit+257]
	distLens = distLens[:hdist+1]
	rle := rleLengths(append(append([]int{}, litLens...), distLens...))
	clFreq := make([]int, 19)
	for _, r := range rle {
		clFreq[r.symbol]++
	}
	clLens, e := huffmanLengths(clFreq, 7)
	if e != nil {
		return nil, e
	}
	hclen := 0
	for i := 18; i >= 4; i-- {
		if clLens[codeLengthOrder[i]] > 0 {
			hclen = i - 3
			break
		}
	}
	litCodes, distCodes, clCodes := canonical(litLens), canonical(distLens), canonical(clLens)
	w := bitWriter{}
	w.bits(1, 1)
	w.bits(2, 2)
	w.bits(hlit, 5)
	w.bits(hdist, 5)
	w.bits(hclen, 4)
	for i := 0; i < hclen+4; i++ {
		w.bits(clLens[codeLengthOrder[i]], 3)
	}
	for _, r := range rle {
		w.code(clCodes[r.symbol], clLens[r.symbol])
		if r.extraBits > 0 {
			w.bits(r.extra, r.extraBits)
		}
	}
	for _, t := range tokens {
		if t.end {
			w.code(litCodes[256], litLens[256])
		} else if t.length > 0 {
			lc, lb, lv := matchCode(t.length, lengthBase, lengthExtra, 257)
			dc, db, dv := matchCode(t.distance, distanceBase, distanceExtra, 0)
			w.code(litCodes[lc], litLens[lc])
			if lb > 0 {
				w.bits(lv, lb)
			}
			w.code(distCodes[dc], distLens[dc])
			if db > 0 {
				w.bits(dv, db)
			}
		} else {
			w.code(litCodes[t.literal], litLens[t.literal])
		}
	}
	return w.flush(), nil
}
func EncodeGzip(data []byte, mtime uint32) ([]byte, error) {
	compressed, e := EncodeDeflate(data)
	if e != nil {
		return nil, e
	}
	out := []byte{0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3}
	binary.LittleEndian.PutUint32(out[4:], mtime)
	out = append(out, compressed...)
	out = binary.LittleEndian.AppendUint32(out, crc32.ChecksumIEEE(data))
	out = binary.LittleEndian.AppendUint32(out, uint32(len(data)))
	return out, nil
}
