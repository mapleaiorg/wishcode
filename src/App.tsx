/**
 * Renderer entry — re-exports the Wish Code shell (S-0).
 *
 * The 545-line monolithic shell that lived here has been decomposed into
 * `src/shell/` (layout / chrome / navigation / state / settings / login /
 * branding / util) per S-0. Behavior is preserved exactly. See
 * `docs/arch/S-0.md` for the rationale + decomposition map.
 */

export { AppShell as App, AppShell } from './shell'
export default function App() { return null } // overridden by named export above
