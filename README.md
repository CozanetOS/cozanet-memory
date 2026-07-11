# cozanet-memory

[![CozanetOS Memory](https://img.shields.io/badge/CozanetOS-Memory-blue.svg)]()
[![AI-Native OS](https://img.shields.io/badge/Architecture-AI--Native%20OS-brightgreen.svg)]()
[![License](https://img.shields.io/badge/License-Apache%202.0-orange.svg)]()

`cozanet-memory` is the high-performance multi-tiered memory architecture of **CozanetOS**. Acting as the hippocampus of the operating system, it manages multi-tier caching, long-term persistence, vector embedding, episodic recall, semantic conceptual mapping, and background memory compression. By providing agents with instantaneous, context-aware information retrieval, `cozanet-memory` eliminates LLM context-window exhaustion and ensures absolute operational continuity across sessions.

---

## 🚀 Key Capabilities

*   **Working Memory Layer (L1 Hot):** In-memory, sub-millisecond context cache for fast ongoing session iterations (built on ultra-fast Redis and localized memory constructs).
*   **Long-Term Memory Layer (L2/L3 Persistent):** Durable memory systems preserved across reboots, sessions, and system migrations.
*   **Episodic Memory Management:** Automatically records user interactions, completed tasks, and system execution trees as sequential chronological "episodes" for structural replay.
*   **Semantic Memory & Knowledge Graphing:** Builds conceptual maps, indexing factual rules, user attributes, organizational details, and generic knowledge structures.
*   **Project-Specific Memory Boundaries:** Isolates source codes, architectural styles, dependencies, and environments strictly on a per-project level.
*   **API & Configuration Memory:** Safely records external API endpoints, usage constraints, schema versions, and key authorizations.
*   **Hybrid Vector & Keyword Indexing:** Offers multi-modal search engines pairing Semantic Vector search (HNSW indexes) with traditional inverted keyword indexing.
*   **Automatic Memory Organization & Compression:** Periodically schedules background consolidation tasks to deduplicate, group-tag, and compress long histories into summarized episodic narratives.
*   **Memory Tiering Model:** 
    *   **L1 Hot:** Redis-backed high-velocity memory for current agent conversations.
    *   **L2 Warm:** Document-database backed (MongoDB/PostgreSQL) records of overall histories.
    *   **L3 Cold:** Embedded vector store (Qdrant/Milvus/pgvector) optimized for dense semantic lookups.

---

## 🏛️ Architecture & Tier Breakdown

```
        +-----------------------------------------------------------+
        |                  cozanet-memory Client                    |
        +-----------------------------+-----------------------------+
                                      |
                                      v
        +-----------------------------+-----------------------------+
        |                 Memory Router & Cache Layer               |
        +-------+---------------------+---------------------+-------+
                |                     |                     |
                v [Fast Read/Write]   v [Structured Search] v [Dense Search]
        +-------+-------+     +-------+-------+     +-------+-------+
        |    L1 Hot     |     |    L2 Warm    |     |    L3 Cold    |
        | (Redis/RAM)   |     | (Document DB) |     |  (Vector DB)  |
        +---------------+     +---------------+     +---------------+
                |                     |                     |
                +---------------------+---------------------+
                                      |
                                      v
        +-----------------------------+-----------------------------+
        |        Memory Synthesizer, Compactor & Archiver           |
        +-----------------------------------------------------------+
```

---

## 🔌 API & Interface Overview

### 1. Store Session Context into Working Memory
```python
from cozanet_memory import MemoryClient

client = MemoryClient.connect()

# Store short-term interaction event
client.working.set(
    key="session:99011:last_intent",
    value="Synthesize quarterly system performance analytics",
    ttl=600  # 10 minute expiration
)
```

### 2. Query Memory Layer Semantically
*   **Endpoint:** `POST /api/v1/memory/search`
*   **Payload:**
```json
{
  "query": "Who is the primary administrator and what is our deployment region?",
  "memory_tiers": ["L2", "L3"],
  "filter": { "project": "CozanetCloud" },
  "max_results": 3
}
```
*   **Response:**
```json
{
  "matches": [
    {
      "tier": "L3_VECTOR",
      "text": "System Administrator user 'Sarah' configured target cloud deployment in region 'us-west-2' on 2026-03-12.",
      "score": 0.941
    },
    {
      "tier": "L2_DOCUMENT",
      "text": "Project metadata: { 'owner': 'Sarah', 'region': 'us-west-2', 'stack': 'kubernetes' }",
      "score": 0.892
    }
  ]
}
```

---

## 🔗 Integration with Other CozanetOS Modules

*   **`cozanet-core`:** Powers planning, context boundaries, constitution safety, and goal storage.
*   **`cozanet-learning`:** Integrates directly with memory structures to optimize heuristics and compile habits from consolidated execution graphs.
*   **`cozanet-database`:** Leverages physical SQL/NoSQL storage structures to host L2/L3 databases locally.

---

## ⚡ Quick-Start Notes

### Startup Local Memory Services via Docker Compose
Ensure Redis and your preferred Vector Database are running:
```bash
docker-compose -f docker/memory-services.yml up -d
```

### Run Memory Consolidation Agent Job
```bash
# Triggers background memory compression, deduplication, and vector indexing
cozanet-memory consolidate --project "CozanetCloud"
```
