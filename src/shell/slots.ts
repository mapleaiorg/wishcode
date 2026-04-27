/**
 * Slot reservation registry for the Wish Code shell (S-0).
 *
 * Cell-4 will provide the real Slot Host. For now the shell exposes a tiny
 * lookup map so unit tests + future surfaces can reason about slot identity
 * without depending on the SDK that doesn't exist yet.
 */

import { SHELL_SLOTS, type ShellSlotId } from './types'

export interface SlotDescriptor {
  id: ShellSlotId
  description: string
}

export const SHELL_SLOT_DESCRIPTORS: ReadonlyArray<SlotDescriptor> = [
  { id: 'shell.leftNav',        description: 'Persistent left navigation rail (sidebar).' },
  { id: 'shell.main',           description: 'Active view (home / chat / history / native code).' },
  { id: 'shell.rightContext',   description: 'Right-docked context panel host.' },
  { id: 'shell.bottomPanel',    description: 'Bottom panel host (logs, terminal — later prompts).' },
  { id: 'shell.commandPalette', description: 'Floating command palette (search) host.' },
]

export function isShellSlot(id: string): id is ShellSlotId {
  return (SHELL_SLOTS as readonly string[]).includes(id)
}
