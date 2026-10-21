import { describe, it, expect } from 'vitest'
import {
  findKeybindingConflicts,
  formatKeybindingList,
  getEffectiveKeybindingsForAction,
  type KeybindingInput
} from '../../../../shared/keybindings'
import { matchesNativeChatToggleShortcut } from './native-chat-shortcut'

function chord(key: string, modifiers: Partial<KeybindingInput>): KeybindingInput {
  return {
    key,
    code: `Key${key.toUpperCase()}`,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...modifiers
  }
}

const cmdShiftJ = chord('j', { metaKey: true, shiftKey: true })
const ctrlShiftJ = chord('j', { ctrlKey: true, shiftKey: true })

describe('native chat toggle default binding', () => {
  it('renders the macOS default from the registry', () => {
    const [binding] = getEffectiveKeybindingsForAction('terminal.toggleNativeChat', 'darwin')
    expect(formatKeybindingList([binding], 'darwin')).toBe('⌘⇧J')
  })

  it.each(['linux', 'win32'] as const)(
    'leaves %s unbound so Switch worktree keeps Ctrl+Shift+J',
    (platform) => {
      expect(getEffectiveKeybindingsForAction('terminal.toggleNativeChat', platform)).toEqual([])
    }
  )
})

describe('matchesNativeChatToggleShortcut', () => {
  it('matches Cmd+Shift+J on Mac by default', () => {
    expect(matchesNativeChatToggleShortcut(cmdShiftJ, 'darwin')).toBe(true)
  })

  it('does not match Ctrl+Shift+J on Mac (wrong primary modifier)', () => {
    expect(matchesNativeChatToggleShortcut(ctrlShiftJ, 'darwin')).toBe(false)
  })

  it.each(['linux', 'win32'] as const)('matches nothing on %s by default', (platform) => {
    expect(matchesNativeChatToggleShortcut(ctrlShiftJ, platform)).toBe(false)
    expect(matchesNativeChatToggleShortcut(cmdShiftJ, platform)).toBe(false)
  })

  it.each(['linux', 'win32'] as const)('matches a chord the user assigns on %s', (platform) => {
    const keybindings = { 'terminal.toggleNativeChat': ['Mod+Alt+C'] }
    expect(
      matchesNativeChatToggleShortcut(
        chord('c', { ctrlKey: true, altKey: true }),
        platform,
        keybindings
      )
    ).toBe(true)
  })

  it('requires the shift modifier', () => {
    expect(matchesNativeChatToggleShortcut(chord('j', { metaKey: true }), 'darwin')).toBe(false)
  })

  it('rejects when alt is held', () => {
    expect(
      matchesNativeChatToggleShortcut(
        chord('j', { metaKey: true, shiftKey: true, altKey: true }),
        'darwin'
      )
    ).toBe(false)
  })

  it('rejects a different key', () => {
    expect(
      matchesNativeChatToggleShortcut(chord('k', { metaKey: true, shiftKey: true }), 'darwin')
    ).toBe(false)
  })

  it('follows a user override to a new chord', () => {
    const keybindings = { 'terminal.toggleNativeChat': ['Mod+Alt+C'] }
    expect(matchesNativeChatToggleShortcut(cmdShiftJ, 'darwin', keybindings)).toBe(false)
    expect(
      matchesNativeChatToggleShortcut(
        chord('c', { metaKey: true, altKey: true }),
        'darwin',
        keybindings
      )
    ).toBe(true)
  })

  it('is disabled by an empty binding', () => {
    const keybindings = { 'terminal.toggleNativeChat': [] }
    expect(matchesNativeChatToggleShortcut(cmdShiftJ, 'darwin', keybindings)).toBe(false)
    expect(matchesNativeChatToggleShortcut(ctrlShiftJ, 'linux', keybindings)).toBe(false)
  })
})

describe('native chat toggle conflict detection', () => {
  it('flags a global binding that takes the toggle chord', () => {
    expect(
      findKeybindingConflicts('darwin', { 'worktree.navigateDown': ['Mod+Shift+J'] })
    ).toContainEqual({
      binding: 'Mod+Shift+J',
      actionIds: expect.arrayContaining(['worktree.navigateDown', 'terminal.toggleNativeChat'])
    })
  })
})
