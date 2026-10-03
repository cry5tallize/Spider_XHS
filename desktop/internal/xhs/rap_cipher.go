package xhs

import "fmt"

// XHS substitutes this S-box in both SubBytes and key expansion.
var rapSBox = [256]byte{122, 1, 88, 224, 80, 78, 2, 121, 29, 75, 83, 218, 107, 72, 212, 82, 237, 119, 18, 33, 20, 21, 236, 16, 24, 229, 185, 241, 12, 8, 252, 125, 249, 205, 181, 200, 230, 55, 38, 135, 86, 186, 184, 43, 173, 240, 104, 247, 139, 141, 211, 94, 54, 77, 46, 146, 49, 130, 242, 41, 112, 61, 45, 215, 182, 64, 178, 67, 68, 128, 120, 210, 13, 73, 74, 9, 99, 108, 7, 58, 158, 213, 6, 198, 225, 98, 244, 52, 36, 89, 169, 87, 42, 0, 62, 23, 44, 10, 26, 66, 250, 147, 190, 220, 245, 179, 106, 19, 232, 3, 199, 151, 187, 115, 118, 134, 227, 70, 114, 71, 208, 5, 76, 56, 124, 31, 129, 171, 117, 81, 235, 243, 50, 116, 17, 143, 132, 137, 156, 113, 34, 126, 157, 207, 63, 145, 105, 101, 60, 109, 150, 162, 152, 153, 51, 57, 154, 202, 195, 159, 160, 188, 228, 163, 164, 84, 127, 167, 168, 4, 111, 93, 172, 183, 39, 175, 176, 40, 65, 174, 180, 110, 11, 27, 223, 142, 48, 177, 254, 144, 97, 96, 192, 203, 92, 14, 239, 22, 131, 234, 32, 233, 201, 85, 196, 69, 133, 204, 30, 170, 103, 138, 123, 53, 214, 25, 216, 217, 194, 219, 148, 221, 28, 222, 166, 255, 248, 191, 91, 90, 15, 231, 193, 189, 209, 102, 197, 37, 238, 140, 226, 95, 136, 161, 59, 165, 246, 206, 149, 47, 100, 35, 251, 253, 79, 155}
var rapRoundKeys = expandRAPKey([]byte("kqI1DTcwKX90ZtAy"))
var rapInvBox = func() (out [256]byte) {
	for i, v := range rapSBox {
		out[v] = byte(i)
	}
	return
}()

func gfMul(a, b byte) byte {
	var r byte
	for i := 0; i < 8; i++ {
		if b&1 != 0 {
			r ^= a
		}
		hi := a & 128
		a <<= 1
		if hi != 0 {
			a ^= 0x1b
		}
		b >>= 1
	}
	return r
}
func expandRAPKey(key []byte) (w [44][4]byte) {
	for i := 0; i < 4; i++ {
		copy(w[i][:], key[i*4:])
	}
	rcon := []byte{1, 2, 4, 8, 16, 32, 64, 128, 27, 54}
	for i := 4; i < 44; i++ {
		t := w[i-1]
		if i%4 == 0 {
			t = [4]byte{rapSBox[t[1]], rapSBox[t[2]], rapSBox[t[3]], rapSBox[t[0]]}
			t[0] ^= rcon[i/4-1]
		}
		for j := 0; j < 4; j++ {
			w[i][j] = w[i-4][j] ^ t[j]
		}
	}
	return
}
func rapECB(data []byte, decrypt bool) ([]byte, error) {
	if len(data)%16 != 0 {
		return nil, fmt.Errorf("RAP cipher input must be block aligned")
	}
	out := make([]byte, len(data))
	for offset := 0; offset < len(data); offset += 16 {
		var s [16]byte
		for c := 0; c < 4; c++ {
			for r := 0; r < 4; r++ {
				s[r*4+c] = data[offset+c*4+r]
			}
		}
		addKey := func(round int) {
			for c := 0; c < 4; c++ {
				for r := 0; r < 4; r++ {
					s[r*4+c] ^= rapRoundKeys[round*4+c][r]
				}
			}
		}
		shift := func(reverse bool) {
			old := s
			for r := 1; r < 4; r++ {
				for c := 0; c < 4; c++ {
					column := (c + r) % 4
					if reverse {
						column = (c - r + 4) % 4
					}
					s[r*4+c] = old[r*4+column]
				}
			}
		}
		mix := func(reverse bool) {
			old := s
			matrix := [4][4]byte{{2, 3, 1, 1}, {1, 2, 3, 1}, {1, 1, 2, 3}, {3, 1, 1, 2}}
			if reverse {
				matrix = [4][4]byte{{14, 11, 13, 9}, {9, 14, 11, 13}, {13, 9, 14, 11}, {11, 13, 9, 14}}
			}
			for c := 0; c < 4; c++ {
				for r := 0; r < 4; r++ {
					var v byte
					for k := 0; k < 4; k++ {
						v ^= gfMul(old[k*4+c], matrix[r][k])
					}
					s[r*4+c] = v
				}
			}
		}
		if decrypt {
			addKey(10)
			for round := 9; round >= 0; round-- {
				shift(true)
				for i := range s {
					s[i] = rapInvBox[s[i]]
				}
				addKey(round)
				if round > 0 {
					mix(true)
				}
			}
		} else {
			addKey(0)
			for round := 1; round <= 10; round++ {
				for i := range s {
					s[i] = rapSBox[s[i]]
				}
				shift(false)
				if round < 10 {
					mix(false)
				}
				addKey(round)
			}
		}
		for c := 0; c < 4; c++ {
			for r := 0; r < 4; r++ {
				out[offset+c*4+r] = s[r*4+c]
			}
		}
	}
	return out, nil
}
