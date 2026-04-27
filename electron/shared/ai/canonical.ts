/**
 * Canonical AI types — single source of truth for the Wish Code AI model.
 *
 * Mirrored byte-for-byte by `hermon/crates/hermon-types/src/ai.rs`. Any change
 * here MUST be made in both repos in the same commit and the round-trip
 * fixture (`__fixtures__/canonical-roundtrip.json`) regenerated.
 *
 * Provider-NEUTRAL by construction: no field name may carry a provider id
 * prefix (`anthropic_*`, `openai_*`, `gemini_*`, `xai_*`, `ollama_*`,
 * `hermon_*`). Provider-specific shape is converted at the provider Cell
 * boundary (A-3); these types are what every consumer above the provider
 * boundary sees.
 *
 * See `wish-design/CONVENTIONS.md § 4` for the authoritative spec and
 * `docs/arch/A-0.md` for the migration ADR.
 */

export type AIProviderId = string;

export interface AIProvider {
  id: AIProviderId;
  displayName: string;
  kind: 'first-party' | 'third-party' | 'local' | 'hermon-mediated';
}

export interface AICapabilityProfile {
  streaming: boolean;
  tools: boolean;
  structuredOutput: boolean;
  imageInput: boolean;
  audioInput: boolean;
  fileInput: boolean;
  reasoning: boolean;
}

export interface AIModel {
  id: string;
  providerId: AIProviderId;
  displayName: string;
  capabilities: AICapabilityProfile;
  contextWindow: number;
  maxOutputTokens: number;
}

export type AIRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * Discriminated by `kind`. Wire format: `{ kind: "<snake_case>", ... }` —
 * matches the Rust mirror's `#[serde(tag = "kind", rename_all = "snake_case")]`.
 */
export type AIContentBlock =
  | { kind: 'text'; text: string }
  | { kind: 'image'; mediaType: string; data: string | { url: string } }
  | { kind: 'audio'; mediaType: string; data: string | { url: string } }
  | { kind: 'file'; mediaType: string; name: string; data: string | { url: string } }
  | { kind: 'tool_use'; id: string; name: string; input: unknown }
  | { kind: 'tool_result'; toolUseId: string; output: unknown; isError?: boolean }
  | { kind: 'reasoning'; text: string };

export interface AIMessage {
  id: string;
  role: AIRole;
  blocks: AIContentBlock[];
  /** ISO-8601 timestamp. */
  createdAt: string;
}

export interface AIToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool's input. */
  inputSchema: unknown;
  capabilityRequirements?: string[];
}

export interface AIToolInvocation {
  id: string;
  name: string;
  input: unknown;
  createdAt: string;
}

export interface AIToolResult {
  toolUseId: string;
  output: unknown;
  isError: boolean;
  createdAt: string;
}

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
}

export interface AIError {
  code: string;
  message: string;
  retryable: boolean;
}

/**
 * Stream events use dotted `kind` discriminator values
 * (`response.started`, `tool_call.completed`, …) to match the Rust mirror's
 * `#[serde(tag = "kind", rename = "...")]` per-variant form.
 */
export type AIStreamEvent =
  | { kind: 'response.started'; responseId: string }
  | { kind: 'content.delta'; blockIndex: number; delta: Partial<AIContentBlock> }
  | { kind: 'content.completed'; blockIndex: number; block: AIContentBlock }
  | { kind: 'tool_call.started'; invocation: AIToolInvocation }
  | { kind: 'tool_call.delta'; invocationId: string; inputDelta: unknown }
  | { kind: 'tool_call.completed'; invocation: AIToolInvocation }
  | { kind: 'usage.updated'; usage: AIUsage }
  | { kind: 'response.completed'; responseId: string }
  | { kind: 'response.error'; error: AIError };

export type AIReasoningEffort = 'low' | 'medium' | 'high';

export interface AIReasoningParameters {
  enabled: boolean;
  effort?: AIReasoningEffort;
}

export type AIResponseFormat =
  | { kind: 'text' }
  | { kind: 'json'; schema?: unknown };

export interface AIRequestParameters {
  temperature?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  reasoning?: AIReasoningParameters;
  responseFormat?: AIResponseFormat;
}

export interface AIModelRef {
  providerId: AIProviderId;
  modelId: string;
}

export interface AIRequest {
  sessionId: string;
  model: AIModelRef;
  messages: AIMessage[];
  tools?: AIToolDefinition[];
  parameters?: AIRequestParameters;
  metadata?: Record<string, string>;
}

export type AIFinishReason = 'stop' | 'length' | 'tool_use' | 'error' | 'cancelled';

export interface AIResponse {
  responseId: string;
  sessionId: string;
  message: AIMessage;
  usage: AIUsage;
  finishReason: AIFinishReason;
  /** Optional audit attachment, NEVER the system of record. */
  raw?: unknown;
}

export interface AISession {
  id: string;
  providerId: AIProviderId;
  modelId: string;
  messages: AIMessage[];
  createdAt: string;
  updatedAt: string;
  workspaceId?: string;
  metadata?: Record<string, string>;
}

/** Wire-format version. Bumping this requires an ADR + migration plan. */
export const CANONICAL_AI_VERSION = 1 as const;
