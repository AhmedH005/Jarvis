/** Returns the current user's home directory path. */
export function homedir(): string {
  // In Electron renderer, navigator.userAgent doesn't give us homedir,
  // but we know the target system. Use a reasonable default for macOS.
  // The IPC file-read handler in main.ts will resolve the actual path.
  return (window as unknown as { __homedir?: string }).__homedir
    ?? (navigator.platform.includes('Mac') ? '/Users/ahmedh005' : '/root')
}
