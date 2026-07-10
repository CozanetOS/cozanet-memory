# @cozanet/memory

The Memory subsystem for **CozanetOS**.

This package provides a unified tiered cognitive memory framework, organizing information into working memory, persistent long-term storage, semantic conceptual maps, and sequential episodic events.

## Installation

```bash
npm install @cozanet/memory
```

## Architecture

- **Working Memory**: In-memory temporal storage with voluntary TTL support.
- **Long-Term Memory**: Persistent, JSON-backed declarative storage with record retrieval and forgetting mechanisms.
- **Episodic Memory**: Sequential chronological stream representation of events/episodes.
- **Semantic Memory**: Knowledge representation modeling concepts, descriptions, and relationships.
- **Retrieval Engine**: Unified multi-tiered query execution interface.

## Usage

```typescript
import { WorkingMemory, LongTermMemory, SemanticMemory, RetrievalEngine } from '@cozanet/memory';
// Scaffolding components as needed.
```
