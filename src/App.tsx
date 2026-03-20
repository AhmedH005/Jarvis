import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useJarvisStore } from '@/store/jarvis'
import { TitleBar }   from '@/components/hud/TitleBar'
import { Background } from '@/components/hud/Background'
import { CentralRing } from '@/components/hud/CentralRing'
import { LeftPanel }  from '@/components/panels/LeftPanel'
import { RightPanel } from '@/components/panels/RightPanel'
import { MessageList } from '@/components/chat/MessageList'
import { InputBar }    from '@/components/chat/InputBar'

export default function App() {
  const setOcStatus = useJarvisStore((s) => s.setOcStatus)
  const pushLog     = useJarvisStore((s) => s.pushLog)
  const config      = useJarvisStore((s) => s.config)

  // Poll OpenClaw gateway status
  useEffect(() => {
    const check = async () => {
      if (!window.jarvis) {
        // Running in browser (dev without Electron) — show as offline
        setOcStatus({ online: false, error: 'Electron not available' })
        return
      }
      const status = await window.jarvis.openclaw.status()
      setOcStatus(status)
      if (!status.online) pushLog(`OpenClaw unreachable: ${status.error ?? 'timeout'}`)
    }
    check()
    const interval = setInterval(check, 15_000)
    return () => clearInterval(interval)
  }, [setOcStatus, pushLog])

  return (
    <div
      className="relative flex flex-col h-screen overflow-hidden scanline"
      style={{ background: `rgba(5,12,20,${config.theme.opacity})` }}
    >
      {/* Animated background canvas */}
      <Background />

      {/* Main layout */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Titlebar */}
        <TitleBar />

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          {/* Left panel */}
          <LeftPanel />

          {/* Center: chat */}
          <motion.div
            className="flex flex-col flex-1 min-w-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            {/* HUD ring (top of center) */}
            <CentralRing />

            {/* Message stream */}
            <MessageList />

            {/* Input */}
            <InputBar />
          </motion.div>

          {/* Right panel */}
          <RightPanel />
        </div>

        {/* Bottom status bar */}
        <StatusBar />
      </div>
    </div>
  )
}

function StatusBar() {
  const msgs     = useJarvisStore((s) => s.messages)
  const ocStatus = useJarvisStore((s) => s.ocStatus)

  return (
    <div className="h-5 flex items-center px-3 border-t border-jarvis-border gap-4">
      <span className="text-[9px] font-mono text-jarvis-muted">
        {msgs.length} message{msgs.length !== 1 ? 's' : ''}
      </span>
      <span className="text-[9px] font-mono text-jarvis-muted ml-auto">
        {ocStatus.online ? `model: ${ocStatus.model ?? 'connected'}` : 'gateway offline'}
      </span>
    </div>
  )
}
