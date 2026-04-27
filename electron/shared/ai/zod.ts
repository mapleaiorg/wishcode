/**
 * Zod schemas for the canonical AI types. These validate JSON shape at
 * runtime (IPC boundary, provider Cell boundary, Hermon-client boundary).
 *
 * The schemas are derived from `canonical.ts`. Every change to a TS type
 * MUST be reflected here; the test suite in `__tests__/zod.spec.ts`
 * exercises both directions.
 */

import { z } from 'zod';
import type { AIProvider, AIModel, AIUsage, AIError } from './canonical.js';

// --- primitives -----------------------------------------------------------

export const AIProviderIdSchema = z.string().min(1);

export const AIProviderKindSchema = z.enum([
  'first-party',
  'third-party',
  'local',
  'hermon-mediated',
]);

export const AIRoleSchema = z.enum(['system', 'user', 'assistant', 'tool']);

export const AIFinishReasonSchema = z.enum([
  'stop',
  'length',
  'tool_use',
  'error',
  'cancelled',
]);

export const AIReasoningEffortSchema = z.enum(['low', 'medium', 'high']);

const DataRefSchema = z.union([
  z.string(),
  z.object({ url: z.string() }).strict(),
]);

// --- provider / model -----------------------------------------------------

export const AIProviderSchema: z.ZodType<AIProvider> = z.object({
  id: AIProviderIdSchema,
  displayName: z.string(),
  kind: AIProviderKindSchema,
});

export const AICapabilityProfileSchema = z.object({
  streaming: z.boolean(),
  tools: z.boolean(),
  structuredOutput: z.boolean(),
  imageInput: z.boolean(),
  audioInput: z.boolean(),
  fileInput: z.boolean(),
  reasoning: z.boolean(),
});

export const AIModelSchema: z.ZodType<AIModel> = z.object({
  id: z.string().min(1),
  providerId: AIProviderIdSchema,
  displayName: z.string(),
  capabilities: AICapabilityProfileSchema,
  contextWindow: z.number().int().nonnegative(),
  maxOutputTokens: z.number().int().nonnegative(),
});

// --- content blocks (discriminated union) ---------------------------------

// Note: explicit `z.ZodType<AIContentBlock>` annotation removed because
// `z.unknown()` infers a value as optional in TS but the canonical type
// declares `input` / `output` as required. The runtime behavior is correct
// — `unknown` can carry any payload including `undefined` — and consumers
// should rely on `z.infer<typeof AIContentBlockSchema>` or the canonical
// type alias rather than a structural-equality check between them.
export const AIContentBlockSchema =
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('text'), text: z.string() }),
    z.object({
      kind: z.literal('image'),
      mediaType: z.string(),
      data: DataRefSchema,
    }),
    z.object({
      kind: z.literal('audio'),
      mediaType: z.string(),
      data: DataRefSchema,
    }),
    z.object({
      kind: z.literal('file'),
      mediaType: z.string(),
      name: z.string(),
      data: DataRefSchema,
    }),
    z.object({
      kind: z.literal('tool_use'),
      id: z.string(),
      name: z.string(),
      input: z.unknown(),
    }),
    z.object({
      kind: z.literal('tool_result'),
      toolUseId: z.string(),
      output: z.unknown(),
      isError: z.boolean().optional(),
    }),
    z.object({ kind: z.literal('reasoning'), text: z.string() }),
  ]);

export const AIMessageSchema = z.object({
  id: z.string().min(1),
  role: AIRoleSchema,
  blocks: z.array(AIContentBlockSchema),
  createdAt: z.string(),
});

// --- tools ----------------------------------------------------------------

export const AIToolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  inputSchema: z.unknown(),
  capabilityRequirements: z.array(z.string()).optional(),
});

export const AIToolInvocationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  input: z.unknown(),
  createdAt: z.string(),
});

export const AIToolResultSchema = z.object({
  toolUseId: z.string().min(1),
  output: z.unknown(),
  isError: z.boolean(),
  createdAt: z.string(),
});

// --- usage / error --------------------------------------------------------

export const AIUsageSchema: z.ZodType<AIUsage> = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative().optional(),
  reasoningTokens: z.number().int().nonnegative().optional(),
});

export const AIErrorSchema: z.ZodType<AIError> = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
});

// --- stream events --------------------------------------------------------

export const AIStreamEventSchema =
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('response.started'),
      responseId: z.string(),
    }),
    z.object({
      kind: z.literal('content.delta'),
      blockIndex: z.number().int().nonnegative(),
      delta: z.record(z.unknown()),
    }),
    z.object({
      kind: z.literal('content.completed'),
      blockIndex: z.number().int().nonnegative(),
      block: AIContentBlockSchema,
    }),
    z.object({
      kind: z.literal('tool_call.started'),
      invocation: AIToolInvocationSchema,
    }),
    z.object({
      kind: z.literal('tool_call.delta'),
      invocationId: z.string(),
      inputDelta: z.unknown(),
    }),
    z.object({
      kind: z.literal('tool_call.completed'),
      invocation: AIToolInvocationSchema,
    }),
    z.object({
      kind: z.literal('usage.updated'),
      usage: AIUsageSchema,
    }),
    z.object({
      kind: z.literal('response.completed'),
      responseId: z.string(),
    }),
    z.object({
      kind: z.literal('response.error'),
      error: AIErrorSchema,
    }),
  ]);

// --- request / response / session -----------------------------------------

export const AIReasoningParametersSchema = z.object({
  enabled: z.boolean(),
  effort: AIReasoningEffortSchema.optional(),
});

export const AIResponseFormatSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text') }),
  z.object({ kind: z.literal('json'), schema: z.unknown().optional() }),
]);

export const AIRequestParametersSchema = z.object({
  temperature: z.number().optional(),
  maxOutputTokens: z.number().int().nonnegative().optional(),
  stopSequences: z.array(z.string()).optional(),
  reasoning: AIReasoningParametersSchema.optional(),
  responseFormat: AIResponseFormatSchema.optional(),
});

export const AIModelRefSchema = z.object({
  providerId: AIProviderIdSchema,
  modelId: z.string().min(1),
});

export const AIRequestSchema = z.object({
  sessionId: z.string().min(1),
  model: AIModelRefSchema,
  messages: z.array(AIMessageSchema),
  tools: z.array(AIToolDefinitionSchema).optional(),
  parameters: AIRequestParametersSchema.optional(),
  metadata: z.record(z.string()).optional(),
});

export const AIResponseSchema = z.object({
  responseId: z.string().min(1),
  sessionId: z.string().min(1),
  message: AIMessageSchema,
  usage: AIUsageSchema,
  finishReason: AIFinishReasonSchema,
  raw: z.unknown().optional(),
});

export const AISessionSchema = z.object({
  id: z.string().min(1),
  providerId: AIProviderIdSchema,
  modelId: z.string().min(1),
  messages: z.array(AIMessageSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  workspaceId: z.string().optional(),
  metadata: z.record(z.string()).optional(),
});
