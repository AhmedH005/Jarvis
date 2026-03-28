import { useEffect } from 'react'
import { useJarvisStore } from '@/store/jarvis'
import { forwardTelegramToJarvis } from '@/features/chat/jarvisMessagePipeline'
import { executePlannerBridgeCommand } from './plannerBridgeRenderer'

export function TelegramPlannerBridge() {
  const pushLog = useJarvisStore((state) => state.pushLog)

  // ── Planner bridge command handler ──────────────────────────────────────────
  // Executes store mutations requested by main-process code (e.g. OpenClaw tools)
  // and sends the result back so main can resolve its pending invoke.
  useEffect(() => {
    console.log('[planner-bridge][renderer] mounted')

    if (!window.jarvis?.planner?._onBridgeCommand) {
      console.error('[planner-bridge][renderer] window.jarvis.planner._onBridgeCommand is unavailable — preload not loaded?')
      return
    }

    console.log('[planner-bridge][renderer] registering _onBridgeCommand listener')
    const plannerBridge = window.jarvis.planner
    const unsubscribe = plannerBridge._onBridgeCommand((cmd) => {
      const { id, method, data } = cmd
      console.log(`[planner-bridge][renderer] ← command received method=${method} id=${id}`)

      try {
        const result = executePlannerBridgeCommand(method, data)
        plannerBridge._bridgeResult(id, result)
      } catch (err) {
        console.error(`[planner-bridge][renderer] ✗ error in method=${method} id=${id}`, err)
        plannerBridge._bridgeResult(id, { success: false, error: String(err) })
      }
    })

    console.log('[planner-bridge][renderer] listener registered ✓')
    return () => {
      console.log('[planner-bridge][renderer] unregistering listener')
      unsubscribe()
    }
  }, [])

  // ── Telegram message handler ─────────────────────────────────────────────────
  useEffect(() => {
    if (!window.jarvis?.telegram) return

    const unsubscribe = window.jarvis.telegram.onMessage((message) => {
      void (async () => {
        pushLog(`Telegram inbound · ${message.text.slice(0, 60)}${message.text.length > 60 ? '…' : ''}`)
        const reply = await forwardTelegramToJarvis(message.text)
        pushLog('Telegram forwarded through shared Jarvis pipeline', 'success')
        await window.jarvis?.telegram?.reply(message.chatId, reply)
      })().catch((error) => {
        pushLog(`Telegram handling failed: ${String(error)}`, 'error')
      })
    })

    return unsubscribe
  }, [pushLog])

  return null
}
