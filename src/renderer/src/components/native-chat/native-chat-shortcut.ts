import {
  keybindingMatchesAction,
  keybindingInputForBinding,
  isNativeChatToggleInputReserved,
  getEffectiveKeybindingsForAction,
  keybindingMatchesInput,
  formatKeybindingList,
  type TerminalShortcutPolicy,
  type KeybindingInput,
  type KeybindingOverrides
} from '../../../../shared/keybindings'

import { resolveWindowShortcutAction } from '../../../../shared/window-shortcut-policy'
import { findPluginCommandForKeybinding } from '@/lib/plugin-command-keybindings'
import { usePluginCommands, type ActivePluginCommand } from '@/store/plugin-panels'
import { useAppStore } from '@/store'
import { getKeybindingContext } from '../terminal-workspace-model'
import { getShortcutPlatform } from '@/lib/shortcut-platform'
import { isEventTargetInsideFloatingWorkspacePanel } from '@/lib/floating-workspace-terminal-actions'

type ToggleShortcutContext = {
  target: EventTarget | null
  terminalShortcutPolicy?: TerminalShortcutPolicy
  pluginCommands: readonly ActivePluginCommand[]
  hasActiveWorktree: boolean
  ownsShortcut?: boolean
}

export function executableNativeChatToggleBindings(
  platform: NodeJS.Platform,
  keybindings: KeybindingOverrides | undefined,
  context: ToggleShortcutContext,
  input?: KeybindingInput
): string[] {
  if (context.ownsShortcut === false) {
    return []
  }
  const options = {
    context: getKeybindingContext(context.target),
    terminalShortcutPolicy: context.terminalShortcutPolicy
  }
  return getEffectiveKeybindingsForAction(
    'terminal.toggleNativeChat',
    platform,
    keybindings
  ).filter((binding) => {
    if (input && !keybindingMatchesInput(binding, input, platform)) {
      return false
    }
    const candidate = { ...keybindingInputForBinding(binding, platform), target: context.target }
    return (
      !isNativeChatToggleInputReserved(candidate, platform, keybindings) &&
      resolveWindowShortcutAction(candidate, platform, keybindings, options)?.type !==
        'toggleWorktreePalette' &&
      !findPluginCommandForKeybinding(
        context.pluginCommands,
        candidate,
        platform,
        keybindings,
        context.hasActiveWorktree,
        { ...options, target: context.target }
      )
    )
  })
}

export function useNativeChatToggleShortcutLabel(
  target: EventTarget | null,
  ownsShortcut = true
): string | null {
  const keybindings = useAppStore((s) => s.keybindings)
  const policy = useAppStore((s) => s.settings?.terminalShortcutPolicy)
  const hasActiveWorktree = useAppStore((s) => Boolean(s.activeWorktreeId))
  const pluginCommands = usePluginCommands()
  const platform = getShortcutPlatform()
  const [binding] = executableNativeChatToggleBindings(platform, keybindings, {
    target,
    terminalShortcutPolicy: policy,
    hasActiveWorktree,
    pluginCommands,
    ownsShortcut: ownsShortcut && !isEventTargetInsideFloatingWorkspacePanel(target)
  })
  return binding ? formatKeybindingList([binding], platform) : null
}

export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')
}

/** True when the event is the user's binding for the terminal ⇄ native-chat toggle. */
export function matchesNativeChatToggleShortcut(
  e: KeybindingInput,
  platform: NodeJS.Platform,
  keybindings?: KeybindingOverrides,
  context?: ToggleShortcutContext
): boolean {
  return context
    ? executableNativeChatToggleBindings(platform, keybindings, context, e).length > 0
    : keybindingMatchesAction('terminal.toggleNativeChat', e, platform, keybindings)
}
