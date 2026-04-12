package handlers

import (
	"sync"

	"github.com/google/uuid"

	"github.com/Chrainx/docuquery/backend/internal/models"
)

// ProgressBroker pub/sub for document processing events.
// Each subscriber gets its own buffered channel. Channels are closed
// (and cleaned up) once a terminal event (ready/error) is published.
type ProgressBroker struct {
	mu   sync.Mutex
	subs map[uuid.UUID][]chan models.ProgressEvent
}

func newProgressBroker() *ProgressBroker {
	return &ProgressBroker{
		subs: make(map[uuid.UUID][]chan models.ProgressEvent),
	}
}

// Subscribe returns a channel that receives events for docID.
// Call the returned cleanup function when done (e.g., on client disconnect).
func (b *ProgressBroker) Subscribe(docID uuid.UUID) (<-chan models.ProgressEvent, func()) {
	ch := make(chan models.ProgressEvent, 8)
	b.mu.Lock()
	b.subs[docID] = append(b.subs[docID], ch)
	b.mu.Unlock()

	cleanup := func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		list := b.subs[docID]
		for i, c := range list {
			if c == ch {
				b.subs[docID] = append(list[:i], list[i+1:]...)
				break
			}
		}
		if len(b.subs[docID]) == 0 {
			delete(b.subs, docID)
		}
	}
	return ch, cleanup
}

// Publish sends an event to all subscribers for docID.
// If the event is terminal (ready/error), channels are closed and removed.
func (b *ProgressBroker) Publish(docID uuid.UUID, event models.ProgressEvent) {
	b.mu.Lock()
	defer b.mu.Unlock()

	terminal := event.Stage == "ready" || event.Stage == "error"
	list := b.subs[docID]
	for _, ch := range list {
		select {
		case ch <- event:
		default: // subscriber too slow — skip
		}
		if terminal {
			close(ch)
		}
	}
	if terminal {
		delete(b.subs, docID)
	}
}
