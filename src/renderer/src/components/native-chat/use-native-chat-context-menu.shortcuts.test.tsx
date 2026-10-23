// @vitest-environment happy-dom
import React, { useRef } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import type { ActivePluginCommand } from '@/store/plugin-panels'
import {
  emptyNativeChatContextMenuActions,
  useNativeChatContextMenu
} from './use-native-chat-context-menu'

const commands = vi.hoisted((): { current: ActivePluginCommand[] } => ({ current: [] }))
vi.mock('@/store/plugin-panels', () => ({ usePluginCommands: () => commands.current }))
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <>{children}</> : null,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuShortcut: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="shortcut">{children}</span>
  ),
  DropdownMenuTrigger: () => null,
  DropdownMenuSeparator: () => null
}))

function Menu({ floating = false }: { floating?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef(null)
  const menu = useNativeChatContextMenu({
    rootRef,
    composerRef,
    onSwitchToTerminal: () => {},
    actions: { ...emptyNativeChatContextMenuActions, onPaste: () => {} }
  })
  return (
    <div data-floating-terminal-panel={floating ? '' : undefined}>
      <div data-testid="chat" ref={rootRef} onContextMenu={menu.onContextMenuCapture}>
        Chat
      </div>
      {menu.menu}
    </div>
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  commands.current = []
})

it('does no closed-menu population work, refreshes executable aliases, and respects floating ownership', () => {
  vi.stubGlobal('navigator', { userAgent: 'Macintosh' })
  useAppStore.setState({ keybindings: {}, activeWorktreeId: 'main', settings: null })
  for (const count of [10, 100]) {
    let visits = 0
    commands.current = Array.from({ length: count }, (_, index) => ({
      pluginKey: 'test.plugin',
      pluginName: 'Test',
      id: String(index),
      title: 'Unbound',
      context: 'worktree',
      handler: { type: 'built-in', action: 'view.tasks' },
      get keybindings() {
        visits++
        return []
      }
    }))
    const closed = render(<Menu />)
    for (let frame = 0; frame < 10; frame++) {
      closed.rerender(<Menu />)
    }
    expect(visits).toBe(0)
    fireEvent.contextMenu(screen.getByTestId('chat'))
    expect(visits).toBeGreaterThanOrEqual(count)
    expect(screen.getByTestId('shortcut').textContent).toBe('⌘⇧J')
    commands.current = [
      { ...commands.current[0], keybindings: [{ key: 'Mod+Shift+J', when: 'global' }] }
    ]
    closed.rerender(<Menu />)
    expect(screen.queryByTestId('shortcut')).toBeNull()
    closed.unmount()
  }
  commands.current = []
  vi.stubGlobal('navigator', { userAgent: 'Windows NT 10.0' })
  const keybindings = { 'terminal.toggleNativeChat': ['Mod+Shift+J', 'Mod+Alt+Y'] }
  useAppStore.setState({ keybindings, activeWorktreeId: 'main', settings: null })
  const view = render(<Menu />)
  fireEvent.contextMenu(screen.getByTestId('chat'))
  expect(screen.getByTestId('shortcut').textContent).toBe('Ctrl+Alt+Y')
  commands.current = [
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
  view.rerender(<Menu />)
  expect(screen.queryByTestId('shortcut')).toBeNull()
  commands.current = []
  act(() => useAppStore.setState({ keybindings: { 'terminal.toggleNativeChat': ['Mod+Alt+K'] } }))
  expect(screen.getByTestId('shortcut').textContent).toBe('Ctrl+Alt+K')
  view.unmount()
  const mainInput = document.createElement('input')
  document.body.append(mainInput)
  mainInput.focus()
  render(<Menu floating />)
  fireEvent.contextMenu(screen.getByTestId('chat'))
  expect(screen.queryByTestId('shortcut')).toBeNull()
  mainInput.remove()
  expect(useAppStore.getState().keybindings).toEqual({ 'terminal.toggleNativeChat': ['Mod+Alt+K'] })
})
