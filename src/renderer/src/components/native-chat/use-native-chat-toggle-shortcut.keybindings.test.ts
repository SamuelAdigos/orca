// @vitest-environment happy-dom

import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentType } from '../../../../shared/agent-status-types'
import type { ActivePluginCommand } from '@/store/plugin-panels'
import { findPluginCommandForKeybinding } from '@/lib/plugin-command-keybindings'
import type { ShortcutDispatchInput } from '@/app-shell/app-command-handlers'
import { executableNativeChatToggleBindings } from './native-chat-shortcut'
import type { KeybindingOverrides } from '../../../../shared/keybindings'

const toggleTabViewMode = vi.hoisted(() => vi.fn())
const store = vi.hoisted(
  (): {
    keybindings: KeybindingOverrides
    agent: AgentType
    readable: boolean
    platform: NodeJS.Platform
    commands: ActivePluginCommand[]
  } => ({ keybindings: {}, agent: 'claude', readable: true, commands: [], platform: 'darwin' })
)

vi.mock('../../store', () => ({
  useAppStore: {
    getState: () => ({
      activeWorktreeId: 'wt-main',
      activeGroupIdByWorktree: { 'wt-main': 'group-1' },
      groupsByWorktree: { 'wt-main': [{ id: 'group-1', activeTabId: 'tab-1' }] },
      unifiedTabsByWorktree: {
        'wt-main': [{ id: 'tab-1', entityId: 'terminal-1', contentType: 'terminal' }]
      },
      tabsByWorktree: { 'wt-main': [{ id: 'terminal-1', title: 'claude' }] },
      terminalLayoutsByTabId: {},
      agentStatusByPaneKey: { 'terminal-1:leaf-1': { agentType: store.agent } },
      keybindings: store.keybindings,
      toggleTabViewMode
    })
  }
}))
vi.mock('@/lib/native-chat-transcript-readability', () => ({
  isNativeChatTranscriptLocalReadable: () => store.readable
}))
vi.mock('@/lib/connection-context', () => ({ getConnectionIdFromState: () => null }))
vi.mock('@/store/plugin-panels', () => ({ usePluginCommands: () => store.commands }))
vi.mock('@/lib/shortcut-platform', () => ({ getShortcutPlatform: () => store.platform }))

import { addAppKeyListener, removeAppKeyListener } from '@/lib/app-keyboard-router'
import { useNativeChatToggleShortcut } from './use-native-chat-toggle-shortcut'

function press(key: string, modifiers: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    code: `Key${key.toUpperCase()}`,
    bubbles: true,
    cancelable: true,
    ...modifiers
  })
  document.body.dispatchEvent(event)
  return event
}

describe('native chat toggle follows the user keybindings', () => {
  beforeEach(() => {
    store.keybindings = {}
    store.agent = 'claude'
    store.readable = true
    store.commands = []
    store.platform = 'darwin'
    renderHook(() => useNativeChatToggleShortcut('wt-main', true))
  })

  afterEach(() => {
    cleanup()
    toggleTabViewMode.mockClear()
  })

  it('routes a real modifier gesture once and stops later app owners', () => {
    store.keybindings = { 'terminal.toggleNativeChat': ['DoubleTap+Alt'] }
    const laterOwner = vi.fn()
    addAppKeyListener('keydown', laterOwner)
    const modifier = (type: string, altKey: boolean): KeyboardEvent => {
      const event = new KeyboardEvent(type, {
        key: 'Alt',
        code: 'AltLeft',
        altKey,
        bubbles: true,
        cancelable: true
      })
      document.body.dispatchEvent(event)
      return event
    }
    try {
      store.agent = 'gemini'
      modifier('keydown', true)
      modifier('keyup', false)
      expect(modifier('keydown', true).defaultPrevented).toBe(false)
      expect(toggleTabViewMode).not.toHaveBeenCalled()
      window.dispatchEvent(new Event('blur'))
      store.agent = 'claude'
      modifier('keydown', true)
      modifier('keyup', false)
      laterOwner.mockClear()
      const second = modifier('keydown', true)
      expect(toggleTabViewMode.mock.calls).toEqual([['tab-1']])
      expect(second.defaultPrevented).toBe(true)
      expect(laterOwner).not.toHaveBeenCalled()
    } finally {
      removeAppKeyListener('keydown', laterOwner)
    }
  })

  it('moves to an overridden chord and leaves the old one alone', () => {
    store.keybindings = { 'terminal.toggleNativeChat': ['Mod+Alt+C'] }

    const oldChord = press('j', { metaKey: true, shiftKey: true })
    expect(toggleTabViewMode).not.toHaveBeenCalled()
    expect(oldChord.defaultPrevented).toBe(false)

    const laterOwner = vi.fn()
    addAppKeyListener('keydown', laterOwner)
    try {
      expect(press('c', { metaKey: true, altKey: true }).defaultPrevented).toBe(true)
      expect(toggleTabViewMode.mock.calls).toEqual([['tab-1']])
      expect(laterOwner).not.toHaveBeenCalled()
    } finally {
      removeAppKeyListener('keydown', laterOwner)
    }
  })

  it('preserves eligibility and ordinary chat-input reach without consuming refused input', () => {
    store.agent = 'gemini'
    expect(press('j', { metaKey: true, shiftKey: true }).defaultPrevented).toBe(false)
    store.agent = 'grok'
    store.readable = false
    expect(press('j', { metaKey: true, shiftKey: true }).defaultPrevented).toBe(false)
    expect(toggleTabViewMode).not.toHaveBeenCalled()
    store.agent = 'codex'
    const input = document.createElement('textarea')
    const event = new KeyboardEvent('keydown', {
      key: 'j',
      code: 'KeyJ',
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true
    })
    document.body.append(input)
    input.dispatchEvent(event)
    input.remove()
    expect(event.defaultPrevented).toBe(true)
    expect(toggleTabViewMode).toHaveBeenCalledTimes(1)
  })

  it('refuses consumed/repeated/recorder input and resets interrupted gestures', () => {
    expect(press('j', { metaKey: true, shiftKey: true, repeat: true }).defaultPrevented).toBe(false)
    const consumed = new KeyboardEvent('keydown', {
      key: 'j',
      code: 'KeyJ',
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true
    })
    consumed.preventDefault()
    document.body.dispatchEvent(consumed)
    const recorder = document.createElement('button')
    recorder.dataset.shortcutRecorderActive = ''
    document.body.append(recorder)
    recorder.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'j',
        code: 'KeyJ',
        metaKey: true,
        shiftKey: true,
        bubbles: true
      })
    )
    recorder.remove()
    store.keybindings = { 'terminal.toggleNativeChat': ['DoubleTap+Alt'] }
    const modifier = (type: string) =>
      document.body.dispatchEvent(
        new KeyboardEvent(type, {
          key: 'Alt',
          code: 'AltLeft',
          altKey: type === 'keydown',
          bubbles: true
        })
      )
    modifier('keydown')
    modifier('keyup')
    window.dispatchEvent(new Event('blur'))
    modifier('keydown')
    expect(toggleTabViewMode).not.toHaveBeenCalled()
  })

  it.each([true, false])(
    'lets the enabled plugin own File Search input, plugin-first=%s',
    (first) => {
      cleanup()
      store.platform = 'win32'
      const target = document.createElement('input')
      target.setAttribute('data-file-search-input', '')
      document.body.append(target)
      store.keybindings = { 'terminal.toggleNativeChat': ['Mod+Alt+Y', 'Mod+Alt+K'] }
      store.commands = [
        {
          pluginKey: 'test.plugin',
          pluginName: 'Test',
          id: 'open',
          title: 'Open',
          context: 'worktree',
          handler: { type: 'built-in', action: 'view.tasks' },
          keybindings: [{ key: 'Mod+Alt+Y', when: 'global' }]
        }
      ]
      const pluginAction = vi.fn()
      const owner = (event: KeyboardEvent) => {
        const input: ShortcutDispatchInput = {
          key: event.key,
          code: event.code,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          isComposing: event.isComposing,
          altGraph: event.getModifierState('AltGraph'),
          target: event.target,
          defaultPrevented: event.defaultPrevented,
          preventDefault: () => event.preventDefault()
        }
        if (
          !event.defaultPrevented &&
          findPluginCommandForKeybinding(
            store.commands,
            input,
            store.platform,
            store.keybindings,
            true,
            {
              context: 'app',
              target: event.target
            }
          )
        ) {
          pluginAction()
          event.preventDefault()
        }
      }
      if (first) {
        addAppKeyListener('keydown', owner)
      }
      renderHook(() => useNativeChatToggleShortcut('wt-main', true))
      if (!first) {
        addAppKeyListener('keydown', owner)
      }
      try {
        const event = new KeyboardEvent('keydown', {
          key: 'y',
          code: 'KeyY',
          ctrlKey: true,
          altKey: true,
          bubbles: true,
          cancelable: true
        })
        Object.defineProperty(event, 'getModifierState', { value: () => false })
        target.dispatchEvent(event)
        expect(pluginAction).toHaveBeenCalledTimes(1)
        expect(toggleTabViewMode).not.toHaveBeenCalled()
        expect(event.defaultPrevented).toBe(true)
        expect(
          executableNativeChatToggleBindings(store.platform, store.keybindings, {
            target,
            pluginCommands: store.commands,
            hasActiveWorktree: true
          })
        ).toEqual(['Mod+Alt+K'])
      } finally {
        removeAppKeyListener('keydown', owner)
        target.remove()
      }
    }
  )

  it('does nothing and keeps the chord when unbound', () => {
    store.keybindings = { 'terminal.toggleNativeChat': [] }

    const event = press('j', { metaKey: true, shiftKey: true })

    expect(toggleTabViewMode).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })
})
