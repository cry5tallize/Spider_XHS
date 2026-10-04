package downloads

import (
	"context"
	"crypto/rand"
	"sort"
	"sync"
	"time"
)

const EventName = "downloads:changed"

type EventBatch struct {
	SchemaVersion int    `json:"schema_version"`
	RunID         string `json:"run_id"`
	Sequence      int64  `json:"sequence"`
	EmittedAtMS   int64  `json:"emitted_at_ms"`
	NeedsResync   bool   `json:"needs_resync"`
	Changes       []Task `json:"changes"`
}
type ActiveSnapshot struct {
	RunID    string `json:"run_id"`
	Sequence int64  `json:"sequence"`
	Tasks    []Task `json:"tasks"`
}
type ChangesInput struct {
	RunID    string `json:"run_id"`
	Sequence int64  `json:"sequence"`
}
type Changes struct {
	RunID       string       `json:"run_id"`
	Sequence    int64        `json:"sequence"`
	NeedsResync bool         `json:"needs_resync"`
	Batches     []EventBatch `json:"batches"`
}

// Hub coalesces byte updates and bounds both pending changes and its replay ring.
// The emitter runs on the hub goroutine, never on a download worker.
type Hub struct {
	mu       sync.Mutex
	ctx      context.Context
	cancel   context.CancelFunc
	done     chan struct{}
	wake     chan struct{}
	run      string
	sequence int64
	pending  map[string]Task
	ring     []EventBatch
	overflow bool
	emit     func(EventBatch)
	once     sync.Once
}

func NewHub(parent context.Context, emit func(EventBatch)) *Hub {
	ctx, cancel := context.WithCancel(parent)
	h := &Hub{ctx: ctx, cancel: cancel, done: make(chan struct{}), wake: make(chan struct{}, 1), run: rand.Text(), pending: map[string]Task{}, emit: emit}
	go h.loop()
	return h
}
func (h *Hub) Publish(t Task, immediate bool) {
	h.mu.Lock()
	if len(h.pending) >= 256 {
		if _, exists := h.pending[t.ID]; !exists {
			h.overflow = true
			h.mu.Unlock()
			if immediate {
				select {
				case h.wake <- struct{}{}:
				default:
				}
			}
			return
		}
	}
	old, exists := h.pending[t.ID]
	if !exists || old.Revision <= t.Revision {
		h.pending[t.ID] = t
	}
	h.mu.Unlock()
	if immediate {
		select {
		case h.wake <- struct{}{}:
		default:
		}
	}
}
func (h *Hub) loop() {
	defer close(h.done)
	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-h.ctx.Done():
			return
		case <-h.wake:
			h.flush()
		case <-ticker.C:
			h.flush()
		}
	}
}
func (h *Hub) flush() {
	h.mu.Lock()
	if len(h.pending) == 0 && !h.overflow {
		h.mu.Unlock()
		return
	}
	h.sequence++
	b := EventBatch{SchemaVersion: 1, RunID: h.run, Sequence: h.sequence, EmittedAtMS: time.Now().UnixMilli(), NeedsResync: h.overflow, Changes: make([]Task, 0, len(h.pending))}
	for _, t := range h.pending {
		b.Changes = append(b.Changes, t)
	}
	sort.Slice(b.Changes, func(i, j int) bool { return b.Changes[i].ID < b.Changes[j].ID })
	h.pending = map[string]Task{}
	h.overflow = false
	h.ring = append(h.ring, b)
	if len(h.ring) > 64 {
		copy(h.ring, h.ring[len(h.ring)-64:])
		h.ring = h.ring[:64]
	}
	h.mu.Unlock()
	if h.emit != nil {
		h.emit(b)
	}
}
func (h *Hub) Checkpoint() (string, int64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.run, h.sequence
}
func (h *Hub) Since(input ChangesInput) Changes {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := Changes{RunID: h.run, Sequence: h.sequence, Batches: []EventBatch{}}
	if input.RunID != h.run || input.Sequence < 0 || input.Sequence > h.sequence || (len(h.ring) > 0 && input.Sequence < h.ring[0].Sequence-1) {
		out.NeedsResync = true
		return out
	}
	for _, b := range h.ring {
		if b.Sequence > input.Sequence {
			out.Batches = append(out.Batches, b)
			if b.NeedsResync {
				out.NeedsResync = true
			}
		}
	}
	return out
}
func (h *Hub) Close() { h.once.Do(func() { h.cancel(); <-h.done }) }
