import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useJarvisStore } from '@/store/jarvis'
import { useUIState } from '@/store/uiState'
import { Background } from '@/components/hud/Background'
import { BootOverlay } from '@/components/hud/BootOverlay'
import { TitleBar } from '@/components/hud/TitleBar'
import { TabShell } from '@/components/tabs/TabShell'
import { IdleScreen } from '@/screens/IdleScreen'
import { getReactorDisplayStatus } from '@/lib/reactor-display'
import { useJarvisGreeting } from '@/hooks/useJarvisGreeting'

export default function App() {
  const setOcStatus = useJarvisStore((s) => s.setOcStatus)
  const setReactorVisualLive = useJarvisStore((s) => s.setReactorVisualLive)
  const pushLog = useJarvisStore((s) => s.pushLog)
  const ocStatus = useJarvisStore((s) => s.ocStatus)
  const statusChecked = useJarvisStore((s) => s.statusChecked)
  const reactorVisualLive = useJarvisStore((s) => s.reactorVisualLive)

  const mode = useUIState((s) => s.mode)
  const setMode = useUIState((s) => s.setMode)

  // Greeting fires once when mode becomes 'active'
  useJarvisGreeting()

  // Boot complete → idle
  const handleBootComplete = () => setMode('idle')

  // Activating: sustained 4s animation sequence, then transition to active
  useEffect(() => {
    if (mode === 'activating') {
      // Start the color transition midway through the activation
      const colorTimer = setTimeout(() => setReactorVisualLive(true), 2800)
      // Settle into active after the full activation sequence completes
      const activeTimer = setTimeout(() => setMode('active'), 4200)
      return () => {
        clearTimeout(colorTimer)
        clearTimeout(activeTimer)
      }
    }
  }, [mode, setMode, setReactorVisualLive])

  // Gateway status polling
  useEffect(() => {
    if (mode !== 'activating' && mode !== 'active') return

    const check = async () => {
      if (!window.jarvis) {
        setOcStatus({ online: false, error: 'No bridge' })
        return
      }
      const status = await window.jarvis.openclaw.status()
      setOcStatus(status)
      if (status.online) pushLog(`Gateway online · ${status.model ?? 'connected'}`, 'success')
      else pushLog(`Gateway unreachable: ${status.error}`, 'error')
    }

    check()
    const id = setInterval(check, 20_000)
    return () => clearInterval(id)
  }, [mode, pushLog, setOcStatus])

  // Derive the screen key for AnimatePresence
  // Keep IdleScreen mounted during 'activating' so the full activation animation plays there
  const screenKey =
    mode === 'boot' ? 'boot' :
    (mode === 'idle' || mode === 'activating') ? 'idle' :
    'main'

  return (
    <div className="relative flex h-screen flex-col overflow-hidden" style={{ background: '#0a0a0f' }}>
      <Background />

      <AnimatePresence mode="wait">
        {/* Boot sequence */}
        {screenKey === 'boot' && (
          <motion.div key="boot" className="absolute inset-0 z-30">
            <BootOverlay onComplete={handleBootComplete} />
          </motion.div>
        )}

        {/* Idle — centered orb */}
        {screenKey === 'idle' && (
          <IdleScreen key="idle" />
        )}

        {/* Main UI — enters after idle dissolves out */}
        {screenKey === 'main' && (
          <motion.div
            key="main"
            className="relative z-10 flex h-full flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1] }}
          >
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22, mass: 0.8, delay: 0.15 }}
            >
              <TitleBar />
            </motion.div>

            <TabShell />

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20, mass: 0.9, delay: 0.4 }}
            >
              <StatusBar
                reactorVisualLive={reactorVisualLive}
                statusChecked={statusChecked}
                online={ocStatus.online}
                model={ocStatus.model}
                error={ocStatus.error}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function StatusBar({
  reactorVisualLive,
  statusChecked,
  online,
  model,
  error,
}: {
  reactorVisualLive: boolean
  statusChecked: boolean
  online: boolean
  model?: string
  error?: string
}) {
  const displayStatus = getReactorDisplayStatus({
    reactorVisualLive,
    statusChecked,
    ocStatus: { online, model, error },
  })
  const color = reactorVisualLive ? 'rgba(0,255,136,0.58)' : 'rgba(255,154,84,0.68)'
  const text = displayStatus.footerText

  return (
    <div
      className="flex h-6 items-center gap-4 px-4 flex-shrink-0"
      style={{
        borderTop: '1px solid rgba(0,212,255,0.08)',
        background: 'rgba(2,8,14,0.56)',
      }}
    >
      <span className="text-[9px] font-mono tracking-[0.14em]" style={{ color: 'rgba(74,122,138,0.62)' }}>
        JARVIS LOCAL SHELL
      </span>
      <span className="text-[9px] font-mono" style={{ color: 'rgba(74,122,138,0.46)' }}>
        bounded local controls
      </span>
      <span className="ml-auto text-[9px] font-mono" style={{ color }}>
        {text}
      </span>
    </div>
  )
}
