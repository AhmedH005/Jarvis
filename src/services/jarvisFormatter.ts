const FILLER_PATTERN = /\b(um|uh|hey|so basically|basically|you know|kind of|sort of|I mean|pretty much)\b\s*/gi
const TRAILING_FILLER = /\s*(please let me know|feel free to ask|I hope this helps|let me know if you need anything|is there anything else|hope that helps|let me know if that helps)[.!]?\s*$/gi

/**
 * Strip filler words and trailing pleasantries from AI responses.
 * Keeps output concise, formal, and Jarvis-appropriate.
 */
export function formatJarvisResponse(text: string): string {
  return text
    .replace(FILLER_PATTERN, '')
    .replace(TRAILING_FILLER, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s([.,!?])/g, '$1')
    .trim()
}

/** Time-appropriate greeting for Jarvis activation. */
export function getGreeting(name = 'Ahmed'): string {
  const hour = new Date().getHours()
  const salutation =
    hour < 12 ? 'Good morning' :
    hour < 18 ? 'Good afternoon' :
    'Good evening'
  return `${salutation}, ${name}. All systems are operational.`
}
