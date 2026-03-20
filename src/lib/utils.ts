import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function nanoid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Declare the window.jarvis API exposed by the Electron preload */
declare global {
  interface Window {
    jarvis: import('../../electron/preload').JarvisAPI
  }
}
