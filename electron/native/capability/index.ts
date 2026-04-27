/**
 * Public barrel for the D-6 capability gate.
 *
 * The main-process domain services (D-2) wrap every privileged call
 * site with `broker.require(...)`. Cells receive a scoped broker
 * through the SDK so they can only `check` — never `grant`.
 */

export type {
  CapabilityBrokerOptions,
  CapabilityConstraints,
  CapabilityGrant,
  CapabilityKind,
  CapabilitySubject,
  CheckRequest,
  CheckResult,
  DenialReason,
  NewGrantInput,
} from './types.js'
export { CAPABILITY_KINDS, CapabilityDenied } from './types.js'

export { CapabilityBroker } from './broker.js'
