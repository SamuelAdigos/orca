import { isNativeMacPasteInput } from '../../shared/keybindings'

export function isMacAppPasteInput(input: Electron.Input): boolean {
  return input.type === 'keyDown' && isNativeMacPasteInput(input, process.platform)
}
