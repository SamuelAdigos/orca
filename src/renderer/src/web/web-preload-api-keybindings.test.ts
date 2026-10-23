import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getEffectiveKeybindingsForAction } from '../../../shared/keybindings'
import { installApi } from './web-preload-api-test-harness'

describe('web keybindings preload API', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('./web-runtime-client')
  })

  it('preserves old navigation aliases and restores the implicit toggle when freed', async () => {
    const { api, storage } = await installApi('MacIntel')
    storage.setItem(
      'orca.web.keybindings.v1',
      JSON.stringify({
        keybindings: { 'worktree.navigateDown': ['Mod+Shift+J', 'Mod+Alt+Y'] }
      })
    )
    const loaded = await api.keybindings.get()
    expect(loaded.overrides['worktree.navigateDown']).toEqual(['Mod+Shift+J', 'Mod+Alt+Y'])
    expect(loaded.overrides).not.toHaveProperty('terminal.toggleNativeChat')
    expect(
      getEffectiveKeybindingsForAction('terminal.toggleNativeChat', 'darwin', loaded.overrides)
    ).toEqual([])
    const freed = await api.keybindings.setAction({
      actionId: 'worktree.navigateDown',
      bindings: []
    })
    expect(
      getEffectiveKeybindingsForAction('terminal.toggleNativeChat', 'darwin', freed.overrides)
    ).toEqual(['Mod+Shift+J'])
  })

  it('validates fresh writes and reset/common provenance through browser consumers', async () => {
    const { api, storage } = await installApi('MacIntel')
    await expect(
      api.keybindings.setAction({ actionId: 'worktree.navigateDown', bindings: ['Mod+Shift+J'] })
    ).rejects.toThrow('conflicts')
    storage.setItem(
      'orca.web.keybindings.v1',
      JSON.stringify({ keybindings: { 'worktree.navigateDown': ['Mod+Shift+J', 'Mod+Alt+Y'] } })
    )
    await api.keybindings.setAction({ actionId: 'worktree.navigateDown', bindings: [] })
    const reset = await api.keybindings.setAction({
      actionId: 'worktree.navigateDown',
      bindings: null
    })
    expect(reset.overrides['worktree.navigateDown']).toEqual(['Mod+Shift+J', 'Mod+Alt+Y'])
    expect(
      getEffectiveKeybindingsForAction('terminal.toggleNativeChat', 'darwin', reset.overrides)
    ).toEqual([])
    await api.keybindings.setAction({
      actionId: 'terminal.toggleNativeChat',
      bindings: ['Mod+Alt+K']
    })
    await expect(
      api.keybindings.setAction({
        actionId: 'terminal.toggleNativeChat',
        bindings: ['Mod+Shift+J']
      })
    ).rejects.toThrow('conflicts')
    const implicit = await api.keybindings.setAction({
      actionId: 'terminal.toggleNativeChat',
      bindings: null
    })
    expect(implicit.overrides).not.toHaveProperty('terminal.toggleNativeChat')
    storage.setItem(
      'orca.web.keybindings.v1',
      JSON.stringify({
        keybindings: { 'terminal.paste': [], 'terminal.toggleNativeChat': ['Mod+V'] }
      })
    )
    expect((await api.keybindings.get()).overrides).toEqual({ 'terminal.paste': [] })
  })

  it.each(['Windows NT 10.0', 'Linux'])(
    'preserves %s palette aliases through write and reload',
    async (platform) => {
      const { api, storage } = await installApi(platform)
      const aliases = ['Mod+Shift+J', 'Mod+Alt+Y']
      storage.setItem(
        'orca.web.keybindings.v1',
        JSON.stringify({ keybindings: { 'worktree.palette': aliases } })
      )
      expect((await api.keybindings.get()).overrides['worktree.palette']).toEqual(aliases)
      await api.keybindings.setAction({ actionId: 'worktree.palette', bindings: aliases })
      const loaded = await api.keybindings.reload()
      expect(loaded.overrides['worktree.palette']).toEqual(aliases)
      expect(
        getEffectiveKeybindingsForAction(
          'terminal.toggleNativeChat',
          loaded.platform,
          loaded.overrides
        )
      ).toEqual(['Mod+Shift+J'])
    }
  )

  it('returns snapshots and persists customized bindings in browser storage', async () => {
    const { api, storage } = await installApi('Linux')

    const initial = await api.keybindings.get()
    expect(initial.platform).toBe('linux')
    expect(initial.overrides).toEqual({})

    const updated = await api.keybindings.setAction({
      actionId: 'worktree.palette',
      bindings: ['Ctrl+Alt+J']
    })

    expect(updated.overrides['worktree.palette']).toEqual(['Ctrl+Alt+J'])
    expect(storage.getItem('orca.web.keybindings.v1')).toContain('worktree.palette')

    const disabled = await api.keybindings.setAction({
      actionId: 'worktree.palette',
      bindings: []
    })
    expect(disabled.overrides['worktree.palette']).toEqual([])

    const reset = await api.keybindings.setAction({
      actionId: 'worktree.palette',
      bindings: null
    })
    expect(reset.overrides['worktree.palette']).toBeUndefined()
  }, 15_000)

  it('rejects conflicts before mutating browser storage', async () => {
    const { api } = await installApi('Linux')

    await api.keybindings.setAction({
      actionId: 'worktree.palette',
      bindings: ['Ctrl+Alt+J']
    })

    await expect(
      api.keybindings.setAction({
        actionId: 'worktree.quickOpen',
        bindings: ['Ctrl+Alt+J']
      })
    ).rejects.toThrow('conflicts')

    const snapshot = await api.keybindings.get()
    expect(snapshot.overrides['worktree.palette']).toEqual(['Ctrl+Alt+J'])
    expect(snapshot.overrides['worktree.quickOpen']).toBeUndefined()
  })

  it('notifies listeners when web keybindings change', async () => {
    const { api } = await installApi('Linux')
    const listener = vi.fn()
    const unsubscribe = api.keybindings.onChanged(listener)

    await api.keybindings.setAction({
      actionId: 'worktree.palette',
      bindings: ['Ctrl+Alt+J']
    })

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        overrides: expect.objectContaining({ 'worktree.palette': ['Ctrl+Alt+J'] })
      })
    )

    unsubscribe()
  })
})
