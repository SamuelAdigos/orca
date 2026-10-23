import type {
  KeybindingActionId,
  KeybindingDefinition,
  KeybindingMatchOptions,
  KeybindingOverrides,
  TerminalShortcutPolicy
} from './types'
import {
  DEFINITIONS_BY_ID,
  KEYBINDING_DEFINITIONS,
  getKeybindingPlatform,
  isDigitIndexActionId
} from './definitions'
import { keybindingConflictIdentities } from './matching'
import {
  normalizeKeybindingWithOptions,
  normalizeOptionsForAction,
  canonicalizeDigitIndexBinding
} from './normalization'

export function getDefaultBindings(
  definition: KeybindingDefinition,
  platform: NodeJS.Platform
): string[] {
  return definition.defaultBindings[getKeybindingPlatform(platform)].map((binding) => {
    const normalized = normalizeKeybindingWithOptions(binding, {
      allowBareKeybindings: definition.allowBareKeybindings === true,
      allowShiftOnlyKeybindings: definition.allowShiftOnlyKeybindings === true
    })
    return normalized.ok ? normalized.value : binding
  })
}

function getConfiguredBindings(
  actionId: KeybindingActionId,
  platform: NodeJS.Platform,
  overrides?: KeybindingOverrides,
  definition = DEFINITIONS_BY_ID.get(actionId)
): string[] {
  const override = overrides?.[actionId]
  if (Array.isArray(override)) {
    // Why: canonicalize digit-index overrides to <mods>+1 so display/conflict stay consistent even if a hand-edited file stored a different digit.
    if (isDigitIndexActionId(actionId)) {
      const canonical: string[] = []
      for (const binding of override) {
        const normalized = canonicalizeDigitIndexBinding(binding)
        if (normalized.ok && !canonical.includes(normalized.value)) {
          canonical.push(normalized.value)
        }
      }
      return canonical
    }
    return override.flatMap((binding) => {
      const normalized = normalizeKeybindingWithOptions(
        binding,
        normalizeOptionsForAction(actionId)
      )
      return normalized.ok ? [normalized.value] : []
    })
  }
  return definition ? getDefaultBindings(definition, platform) : []
}

export function keybindingConflictGroups(definition: KeybindingDefinition): readonly string[] {
  return (
    definition.conflictGroups ?? [definition.conflictGroup ?? definition.scope, definition.scope]
  )
}

export function bindingsOverlap(
  left: KeybindingDefinition,
  a: string,
  right: KeybindingDefinition,
  b: string,
  platform: NodeJS.Platform
): boolean {
  return (
    keybindingConflictGroups(left).some((group) =>
      keybindingConflictGroups(right).includes(group)
    ) &&
    keybindingConflictIdentities(left.id, a, platform).some((identity) =>
      keybindingConflictIdentities(right.id, b, platform).includes(identity)
    )
  )
}

export function getEffectiveKeybindingsForAction(
  actionId: KeybindingActionId,
  platform: NodeJS.Platform,
  overrides?: KeybindingOverrides
): string[] {
  const definition = DEFINITIONS_BY_ID.get(actionId)
  return definition
    ? getEffectiveKeybindingsForDefinition(definition, platform, overrides)
    : getConfiguredBindings(actionId, platform, overrides)
}

const implicitBindings = new WeakMap<KeybindingOverrides, Map<NodeJS.Platform, string[]>>()
const emptyOverrides: KeybindingOverrides = {}

export function getEffectiveKeybindingsForDefinition(
  definition: KeybindingDefinition,
  platform: NodeJS.Platform,
  overrides: KeybindingOverrides = emptyOverrides,
  savedOverrides: KeybindingOverrides = overrides,
  definitions: readonly KeybindingDefinition[] = KEYBINDING_DEFINITIONS
): string[] {
  const configured = getConfiguredBindings(definition.id, platform, overrides, definition)
  if (!definition.implicitDefaultYields || Object.hasOwn(overrides, definition.id)) {
    return configured
  }
  const cacheable = savedOverrides === overrides && definitions === KEYBINDING_DEFINITIONS
  const cached = cacheable ? implicitBindings.get(overrides)?.get(platform) : undefined
  if (cached) {
    return cached
  }
  const effective = configured.filter(
    (binding) =>
      !definitions.some(
        (other) =>
          other.id !== definition.id &&
          Object.hasOwn(savedOverrides, other.id) &&
          getConfiguredBindings(other.id, platform, overrides, other).some(
            (claim) =>
              bindingsOverlap(definition, binding, other, claim, platform) &&
              getConfiguredBindings(other.id, platform, savedOverrides, other).some((saved) =>
                bindingsOverlap(other, claim, other, saved, platform)
              ) &&
              !getDefaultBindings(other, platform).some((ownDefault) =>
                bindingsOverlap(other, claim, other, ownDefault, platform)
              )
          )
      )
  )
  if (cacheable) {
    const byPlatform = implicitBindings.get(overrides) ?? new Map()
    byPlatform.set(platform, effective)
    implicitBindings.set(overrides, byPlatform)
  }
  return effective
}

export function normalizeTerminalShortcutPolicy(
  policy: TerminalShortcutPolicy | null | undefined
): TerminalShortcutPolicy {
  return policy === 'terminal-first' ? 'terminal-first' : 'orca-first'
}

const TUI_CONFLICT_ACTIONS = new Set<KeybindingActionId>([
  'terminal.search',
  'terminal.clear',
  'terminal.selectAll',
  'terminal.splitRight',
  'terminal.splitDown',
  'terminal.closePane',
  'worktree.history.back',
  'worktree.history.forward'
])

export function isKeybindingAllowedInTerminal(definition: KeybindingDefinition): boolean {
  // Keep clipboard, input-source and pane navigation controls available.
  return (
    !TUI_CONFLICT_ACTIONS.has(definition.id) &&
    (definition.scope === 'terminal' || definition.allowInTerminal === true)
  )
}

export function isKeybindingPotentialTerminalConflict(definition: KeybindingDefinition): boolean {
  return !isKeybindingAllowedInTerminal(definition)
}

export function keybindingIsActiveInContext(
  definition: KeybindingDefinition,
  options: KeybindingMatchOptions = {}
): boolean {
  if (options.context !== 'terminal') {
    return true
  }
  // Why: Orca-first keeps app shortcuts inside terminals; terminal-first is the escape hatch for shells and TUIs.
  if (normalizeTerminalShortcutPolicy(options.terminalShortcutPolicy) === 'orca-first') {
    return true
  }
  return isKeybindingAllowedInTerminal(definition)
}
