/**
 * Public barrel for the K-0 knowledge registry.
 *
 * K-1 (indexer) and K-2 (retrieval) consume this barrel. The IPC
 * handler (D-2) and Settings UI (S-3) read sources to render
 * citation chips + the source-management view.
 */

export type {
  KnowledgeScope,
  KnowledgeSource,
  KnowledgeStore,
  NewSourceInput,
  ProvenanceRef,
  SourceCapabilities,
  SourceFilter,
  SourceKind,
  SourceStatus,
} from './types.js'
export { DEFAULT_CAPABILITIES } from './types.js'

export { InMemoryKnowledgeStore } from './in-memory-store.js'

export {
  BM25Indexer,
  chunkText,
  tokenize,
  type Chunk,
  type IndexerOptions,
  type SearchHit,
  type SearchOptions,
} from './indexer.js'

export {
  Retriever,
  type RetrievalRequest,
  type RetrievalResult,
} from './retrieval.js'

export {
  InMemoryProvenanceStore,
  type NewProvenanceInput,
  type ProvenanceActionKind,
  type ProvenanceFilter,
  type ProvenanceRecord,
  type ProvenanceStore,
} from './provenance.js'
