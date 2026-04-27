/**
 * Compatibility re-export — Sidebar moved to `src/shell/chrome/Sidebar.tsx`
 * during S-0. New code should import from `@/shell/chrome/Sidebar` (or the
 * shell barrel). This shim is kept so any straggling import inside the
 * `components/` neighborhood keeps compiling. Remove in a follow-up sweep.
 */
export { Sidebar } from '../shell/chrome/Sidebar'
