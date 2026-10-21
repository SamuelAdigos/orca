// @vitest-environment happy-dom

import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KeybindingOverrides } from '../../../../shared/keybindings'

const toggleTabViewMode = vi.hoisted(() => vi.fn())
const store = vi.hoisted((): { keybindings: KeybindingOverrides } => ({ keybindings: {} }))

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
      agentStatusByPaneKey: {},
      keybindings: store.keybindings,
      toggleTabViewMode
    })
  }
}))
vi.mock('./native-chat-availability', () => ({ canToggleNativeChat: () => true }))
vi.mock('@/lib/native-chat-transcript-readability', () => ({
  isNativeChatTranscriptLocalReadable: () => true
}))
vi.mock('@/lib/connection-context', () => ({ getConnectionIdFromState: () => null }))
vi.mock('@/lib/shortcut-platform', () => ({ getShortcutPlatform: () => 'darwin' }))

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
    renderHook(() => useNativeChatToggleShortcut('wt-main', true))
  })

  afterEach(() => {
    cleanup()
    toggleTabViewMode.mockClear()
  })

  it('toggles on the default chord', () => {
    const event = press('j', { metaKey: true, shiftKey: true })

    expect(toggleTabViewMode.mock.calls).toEqual([['tab-1']])
    expect(event.defaultPrevented).toBe(true)
  })

  it('moves to an overridden chord and leaves the old one alone', () => {
    store.keybindings = { 'terminal.toggleNativeChat': ['Mod+Alt+C'] }

    const oldChord = press('j', { metaKey: true, shiftKey: true })
    expect(toggleTabViewMode).not.toHaveBeenCalled()
    expect(oldChord.defaultPrevented).toBe(false)

    press('c', { metaKey: true, altKey: true })
    expect(toggleTabViewMode.mock.calls).toEqual([['tab-1']])
  })

  it('does nothing and keeps the chord when unbound', () => {
    store.keybindings = { 'terminal.toggleNativeChat': [] }

    const event = press('j', { metaKey: true, shiftKey: true })

    expect(toggleTabViewMode).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })
})
