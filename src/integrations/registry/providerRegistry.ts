import { BuilderBridgeProvider } from '@/integrations/providers/builder-provider'
import { ComposedCalendarProvider, LocalReminderProvider } from '@/integrations/providers/calendar-provider'
import { DefaultConciergeProvider } from '@/integrations/providers/concierge-provider'
import { GmailMailProvider } from '@/integrations/providers/mail-provider'
import { GroundedMemoryProvider } from '@/integrations/providers/memory-provider'
import { ElevenLabsMediaProvider } from '@/integrations/providers/media-provider'
import { HeuristicOrchestratorProvider } from '@/integrations/providers/orchestrator-provider'
import { DefaultRuntimeProvider } from '@/integrations/providers/runtime-provider'
import { DefaultSpeechProvider } from '@/integrations/providers/speech-provider'

const mail = new GmailMailProvider()
const builder = new BuilderBridgeProvider()
const calendar = new ComposedCalendarProvider()
const reminder = new LocalReminderProvider()
const memory = new GroundedMemoryProvider()
const speech = new DefaultSpeechProvider()
const media = new ElevenLabsMediaProvider()
const orchestrator = new HeuristicOrchestratorProvider()
const concierge = new DefaultConciergeProvider(mail)

const providersWithoutRuntime = {
  orchestrator,
  mail,
  concierge,
  builder,
  calendar,
  reminder,
  memory,
  speech,
  media,
}

const runtime = new DefaultRuntimeProvider(() => providersWithoutRuntime)

export const providerRegistry = {
  ...providersWithoutRuntime,
  runtime,
}

export function getOrchestratorProvider() {
  return providerRegistry.orchestrator
}

export function getMailProvider() {
  return providerRegistry.mail
}

export function getConciergeProvider() {
  return providerRegistry.concierge
}

export function getBuilderProvider() {
  return providerRegistry.builder
}

export function getCalendarProvider() {
  return providerRegistry.calendar
}

export function getReminderProvider() {
  return providerRegistry.reminder
}

export function getMemoryProvider() {
  return providerRegistry.memory
}

export function getSpeechProvider() {
  return providerRegistry.speech
}

export function getMediaProvider() {
  return providerRegistry.media
}

export function getRuntimeProvider() {
  return providerRegistry.runtime
}
