/**
 * Common primitive schemas shared across domains.
 *
 * Kept tiny and dependency-free. Domain schemas import from here rather than
 * redefining `id`, `iso`, etc. — keeps the wire shapes consistent.
 */

import { z } from 'zod'

export const IdSchema = z.string().min(1)
export const IsoTimestampSchema = z.string().min(1)
export const NonEmptyStringSchema = z.string().min(1)
export const VoidSchema = z.void().or(z.undefined()).or(z.null()).optional()
export const EmptyInputSchema = z.union([z.undefined(), z.null(), z.tuple([]), z.object({}).strict()])
