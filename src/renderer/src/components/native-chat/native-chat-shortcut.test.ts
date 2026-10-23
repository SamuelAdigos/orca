// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import {
  findKeybindingConflicts,
  getEffectiveKeybindingsForAction,
  type KeybindingOverrides
} from '../../../../shared/keybindings'
import {
  executableNativeChatToggleBindings,
  matchesNativeChatToggleShortcut
} from './native-chat-shortcut'
import type { ActivePluginCommand } from '@/store/plugin-panels'
import {
  findKeybindingConflictsForDefinitions,
  KEYBINDING_DEFINITIONS
} from '../../../../shared/keybindings'
import { pluginCommandKeybindingDefinition } from '@/lib/plugin-command-keybindings'

const toggle = 'terminal.toggleNativeChat'
const context = { target: document.body, pluginCommands: [], hasActiveWorktree: true }

describe('toggle admission and executable ownership', () => {
  it('preserves defaults on every platform, and native palette precedence follows the return surface', () => {
    const terminal = document.createElement('textarea')
    terminal.className = 'xterm-helper-textarea'
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      expect(getEffectiveKeybindingsForAction(toggle, platform)).toEqual(['Mod+Shift+J'])
      expect(executableNativeChatToggleBindings(platform, {}, context)).toEqual(
        platform === 'darwin' ? ['Mod+Shift+J'] : []
      )
      expect(
        executableNativeChatToggleBindings(
          platform,
          {},
          { ...context, target: terminal, terminalShortcutPolicy: 'terminal-first' }
        )
      ).toEqual(['Mod+Shift+J'])
      expect(
        executableNativeChatToggleBindings(platform, { 'worktree.palette': [] }, context)
      ).toEqual(['Mod+Shift+J'])
      expect(
        executableNativeChatToggleBindings(platform, { 'worktree.palette': ['Mod+Alt+Y'] }, context)
      ).toEqual(['Mod+Shift+J'])
    }
  })

  it('reserves real native/family input reach solely for the new toggle and preserves old scope pairs', () => {
    const conflicts = (bindings: string[], overrides: KeybindingOverrides = {}) =>
      findKeybindingConflicts('darwin', { ...overrides, [toggle]: bindings })
    expect(conflicts(['Mod+T']).some((c) => c.actionIds.includes(toggle))).toBe(true)
    expect(conflicts(['Mod+T'], { 'tab.newTerminal': [] })).toEqual([])
    expect(conflicts(['Cmd+V'], { 'terminal.paste': [] })).toContainEqual({
      binding: 'Cmd+V',
      actionIds: [toggle]
    })
    expect(conflicts(['Ctrl+Shift+Tab']).some((c) => c.actionIds.includes(toggle))).toBe(true)
    expect(conflicts(['Ctrl+Shift+Tab'], { 'tab.previousRecent': [] })).toEqual([])
    expect(conflicts(['Ctrl+Shift+Tab'], { 'tab.previousRecent': ['Mod+Alt+Y'] })).toEqual([])
    expect(findKeybindingConflicts('darwin', { 'worktree.navigateDown': ['Mod+T'] })).toEqual([])
  })

  it('uses dynamic plugin authority only in eligible app focus and chooses the first executable hint', () => {
    const plugin: ActivePluginCommand = {
      id: 'open',
      pluginKey: 'test.plugin',
      pluginName: 'Test',
      title: 'Open',
      context: 'worktree',
      handler: { type: 'built-in', action: 'view.tasks' },
      keybindings: [{ key: 'Mod+Alt+Y', when: 'global' }]
    }
    const bindings = { [toggle]: ['Mod+Alt+Y', 'Mod+Alt+K'] }
    const input = { key: 'y', code: 'KeyY', metaKey: true, altKey: true }
    expect(matchesNativeChatToggleShortcut(input, 'darwin', bindings, context)).toBe(true)
    const active = { ...context, pluginCommands: [plugin] }
    expect(matchesNativeChatToggleShortcut(input, 'darwin', bindings, active)).toBe(false)
    expect(executableNativeChatToggleBindings('darwin', bindings, active)).toEqual(['Mod+Alt+K'])
    for (const target of [
      document.createElement('textarea'),
      Object.assign(document.createElement('textarea'), { className: 'xterm-helper-textarea' })
    ]) {
      expect(
        matchesNativeChatToggleShortcut(input, 'darwin', bindings, { ...active, target })
      ).toBe(true)
    }
    expect(
      matchesNativeChatToggleShortcut(input, 'darwin', bindings, {
        ...active,
        hasActiveWorktree: false
      })
    ).toBe(true)
    expect(
      executableNativeChatToggleBindings('darwin', bindings, { ...active, ownsShortcut: false })
    ).toEqual([])
    const definition = pluginCommandKeybindingDefinition(plugin)
    const saved = { [definition.id]: ['Mod+Shift+J'] }
    const definitions = [...KEYBINDING_DEFINITIONS, definition]
    expect(findKeybindingConflictsForDefinitions(definitions, 'darwin', saved)).toEqual([])
    expect(
      findKeybindingConflictsForDefinitions(definitions, 'darwin', saved, {
        savedOverrides: {}
      }).some((conflict) => conflict.actionIds.includes(toggle))
    ).toBe(true)
  })

  it('does not rescan saved aliases on repeated input (N and 10N operation counts)', () => {
    const operations = (count: number): number => {
      let reads = 0
      const aliases = new Proxy(['Mod+Shift+J', ...Array<string>(count - 1).fill('Mod+Alt+Y')], {
        get(target, property, receiver) {
          if (typeof property === 'string' && /^\d+$/.test(property)) {
            reads++
          }
          return Reflect.get(target, property, receiver)
        }
      })
      const overrides = { 'worktree.navigateDown': aliases }
      expect(
        matchesNativeChatToggleShortcut(
          { key: 'j', metaKey: true, shiftKey: true },
          'darwin',
          overrides
        )
      ).toBe(false)
      const cold = reads
      for (let i = 0; i < 100; i++) {
        matchesNativeChatToggleShortcut(
          { key: 'j', metaKey: true, shiftKey: true },
          'darwin',
          overrides
        )
      }
      expect(reads).toBe(cold)
      return cold
    }
    expect(operations(100)).toBe(10 * operations(10))
  })
})
