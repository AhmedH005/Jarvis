import { useRef, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Music,
  Mic2,
  Piano,
  Drum,
  Guitar,
  Wand2,
  Play,
  Square,
  RefreshCw,
  ChevronRight,
  Sparkles,
  PlusCircle,
  Lightbulb,
} from 'lucide-react'
import { useMusicStore } from '@/store/music'
import type { BandMember, TrackBlueprint, Suggestion, CreativeIdentity } from '@/store/music'
import { generateMusic } from '@/features/music/musicOrchestrator'

// ── Constants ──────────────────────────────────────────────────────────────────

const BAND_KEYS = ['stephen', 'peter', 'tchalla', 'wanda', 'scott'] as const
type BandKey = typeof BAND_KEYS[number]

const BAND_ICONS: Record<BandKey, typeof Music> = {
  stephen: Wand2,
  peter: Guitar,
  tchalla: Drum,
  wanda: Piano,
  scott: Mic2,
}

const BAND_COLORS: Record<BandKey, string> = {
  stephen: '#9d4edd',
  peter: '#00d4ff',
  tchalla: '#ff6b35',
  wanda: '#00ff88',
  scott: '#ffc84a',
}

const SPRING = { type: 'spring' as const, stiffness: 280, damping: 22, mass: 0.9 }

// ── Main component ─────────────────────────────────────────────────────────────

export function MusicStudioTab() {
  const [prompt, setPrompt] = useState('')

  const band = useMusicStore((s) => s.band)
  const logs = useMusicStore((s) => s.logs)
  const currentTrack = useMusicStore((s) => s.currentTrack)
  const currentBlueprint = useMusicStore((s) => s.currentBlueprint)
  const blueprintPersonalised = useMusicStore((s) => s.blueprintPersonalised)
  const generationStatus = useMusicStore((s) => s.generationStatus)
  const sessionMode = useMusicStore((s) => s.sessionMode)
  const previousTracks = useMusicStore((s) => s.previousTracks)
  const activeAgents = useMusicStore((s) => s.activeAgents)
  const reset = useMusicStore((s) => s.reset)

  const suggestions = useMusicStore((s) => s.suggestions)
  const creativeIdentity = useMusicStore((s) => s.creativeIdentity)

  const isProcessing = generationStatus === 'processing'
  const isComplete = generationStatus === 'complete'
  const isRefining = sessionMode === 'refining'
  // A track exists and could be refined (session is live but not mid-generation)
  const canRefine = currentBlueprint !== null && !isProcessing

  function handleGenerate() {
    if (!prompt.trim() || isProcessing) return
    void generateMusic(prompt.trim())
  }

  function handleSuggestion(suggestionPrompt: string) {
    if (isProcessing) return
    void generateMusic(suggestionPrompt)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate()
  }

  function handleReset() {
    reset()
    setPrompt('')
  }

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: 'linear-gradient(180deg, rgba(4,10,18,0.98), rgba(3,8,15,0.96))' }}
    >
      {/* Header */}
      <motion.div
        className="flex items-center gap-3 px-6 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(157,78,221,0.14)' }}
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0.05 }}
      >
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: 'rgba(157,78,221,0.14)', border: '1px solid rgba(157,78,221,0.28)' }}
        >
          <Music className="h-4 w-4" style={{ color: '#9d4edd' }} />
        </div>
        <div>
          <h1 className="text-[13px] font-mono tracking-[0.14em]" style={{ color: 'rgba(157,78,221,0.92)' }}>
            MUSIC STUDIO
          </h1>
          <p className="text-[9px] font-mono" style={{ color: 'rgba(192,232,240,0.3)' }}>
            AI band · coordinated generation
          </p>
        </div>

        {(isComplete || generationStatus === 'error') && (
          <motion.button
            className="ml-auto flex items-center gap-1.5 rounded px-3 py-1.5"
            style={{
              border: '1px solid rgba(192,232,240,0.12)',
              color: 'rgba(192,232,240,0.5)',
              fontSize: 10,
              fontFamily: 'monospace',
              letterSpacing: '0.1em',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            whileHover={{ borderColor: 'rgba(192,232,240,0.28)', color: 'rgba(192,232,240,0.85)' }}
            whileTap={{ scale: 0.95 }}
            onClick={handleReset}
          >
            <RefreshCw className="h-3 w-3" />
            NEW SESSION
          </motion.button>
        )}
      </motion.div>

      {/* Body: 3-column */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Column 1: Band panel */}
        <motion.div
          className="flex flex-col flex-shrink-0 overflow-y-auto"
          style={{
            width: 220,
            borderRight: '1px solid rgba(157,78,221,0.10)',
            padding: '16px 12px',
            gap: 8,
          }}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...SPRING, delay: 0.1 }}
        >
          <p
            className="text-[9px] font-mono tracking-[0.18em] px-1 mb-1 flex-shrink-0"
            style={{ color: 'rgba(157,78,221,0.55)' }}
          >
            THE BAND
          </p>
          {BAND_KEYS.map((key, i) => (
            <BandCard
              key={key}
              bandKey={key}
              member={band[key]}
              isActive={activeAgents.includes(key)}
              delay={0.12 + i * 0.06}
            />
          ))}

          {/* Blueprint panel — appears once Stephen publishes it */}
          <AnimatePresence>
            {currentBlueprint && (
              <BlueprintPanel blueprint={currentBlueprint} personalised={blueprintPersonalised} />
            )}
          </AnimatePresence>
        </motion.div>

        {/* Column 2: Center — prompt + log */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Prompt area */}
          <motion.div
            className="flex-shrink-0 px-5 py-4"
            style={{ borderBottom: '1px solid rgba(157,78,221,0.10)' }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 0.15 }}
          >
            <div
              className="flex items-end gap-3 rounded-xl px-4 py-3"
              style={{
                background: 'rgba(157,78,221,0.06)',
                border: `1px solid ${isProcessing ? 'rgba(157,78,221,0.35)' : 'rgba(157,78,221,0.16)'}`,
                transition: 'border-color 0.3s',
              }}
            >
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  canRefine
                    ? 'Refine the track… ("faster", "darker", "add piano", "remove vocals"…)'
                    : 'Describe your track… (⌘↵ to generate)'
                }
                disabled={isProcessing}
                rows={3}
                className="flex-1 resize-none bg-transparent font-mono text-[12px] leading-relaxed outline-none placeholder:opacity-40"
                style={{ color: 'rgba(192,232,240,0.88)', minHeight: 60 }}
              />
              <motion.button
                onClick={handleGenerate}
                disabled={!prompt.trim() || isProcessing}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg disabled:opacity-30"
                style={{
                  background: isProcessing
                    ? 'rgba(157,78,221,0.18)'
                    : 'rgba(157,78,221,0.22)',
                  border: '1px solid rgba(157,78,221,0.4)',
                }}
                whileHover={{ scale: 1.06, background: 'rgba(157,78,221,0.32)' }}
                whileTap={{ scale: 0.93 }}
              >
                {isProcessing ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                  >
                    <RefreshCw className="h-3.5 w-3.5" style={{ color: '#9d4edd' }} />
                  </motion.div>
                ) : (
                  <Play className="h-3.5 w-3.5 ml-0.5" style={{ color: '#9d4edd' }} />
                )}
              </motion.button>
            </div>

            {/* Refinement mode banner */}
            <AnimatePresence>
              {canRefine && (
                <motion.div
                  className="flex items-center justify-between mt-2"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                >
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 flex-shrink-0" style={{ color: '#9d4edd' }} />
                    <span className="text-[9px] font-mono tracking-[0.08em]" style={{ color: 'rgba(157,78,221,0.75)' }}>
                      {isRefining
                        ? `Iteration ${previousTracks.length + 1} · refining previous track`
                        : 'Session active · next input refines this track'}
                    </span>
                  </div>
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-1 text-[9px] font-mono tracking-[0.08em]"
                    style={{ color: 'rgba(192,232,240,0.35)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(192,232,240,0.7)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(192,232,240,0.35)')}
                  >
                    <PlusCircle className="h-2.5 w-2.5" />
                    New track
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Generation status line */}
            <AnimatePresence mode="wait">
              {generationStatus !== 'idle' && (
                <motion.p
                  key={`${generationStatus}-${sessionMode}`}
                  className="mt-1.5 text-[10px] font-mono tracking-[0.08em]"
                  style={{
                    color:
                      generationStatus === 'complete'
                        ? '#00ff88'
                        : generationStatus === 'error'
                        ? '#ff6b35'
                        : '#9d4edd',
                  }}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  {generationStatus === 'processing' && (isRefining ? '● Refining…' : '● Generating…')}
                  {generationStatus === 'complete' && (isRefining ? '✓ Refinement complete' : '✓ Track complete')}
                  {generationStatus === 'error' && '✗ Generation failed'}
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Activity log */}
          <motion.div
            className="flex-1 min-h-0 overflow-y-auto px-5 py-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.22 }}
          >
            <p
              className="text-[9px] font-mono tracking-[0.18em] mb-3"
              style={{ color: 'rgba(157,78,221,0.45)' }}
            >
              ACTIVITY LOG
            </p>

            {logs.length === 0 ? (
              <p
                className="text-[10px] font-mono"
                style={{ color: 'rgba(192,232,240,0.18)' }}
              >
                Waiting for input…
              </p>
            ) : (
              <div className="space-y-1.5">
                <AnimatePresence initial={false}>
                  {logs.map((log) => (
                    <motion.div
                      key={log.id}
                      className="flex items-start gap-2"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ type: 'spring', stiffness: 340, damping: 26 }}
                    >
                      <span
                        className="flex-shrink-0 text-[9px] font-mono pt-0.5"
                        style={{ color: agentColor(log.agent), minWidth: 52 }}
                      >
                        {log.agent.slice(0, 7).toUpperCase()}
                      </span>
                      <span
                        className="text-[10px] font-mono leading-snug"
                        style={{
                          color:
                            log.level === 'success'
                              ? 'rgba(0,255,136,0.75)'
                              : log.level === 'warn'
                              ? 'rgba(255,107,53,0.75)'
                              : 'rgba(192,232,240,0.52)',
                        }}
                      >
                        {log.message}
                      </span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </div>

        {/* Column 3: Output */}
        <motion.div
          className="flex flex-col flex-shrink-0 overflow-y-auto"
          style={{
            width: 280,
            borderLeft: '1px solid rgba(157,78,221,0.10)',
            padding: '16px 16px',
          }}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...SPRING, delay: 0.2 }}
        >
          <p
            className="text-[9px] font-mono tracking-[0.18em] mb-3 flex-shrink-0"
            style={{ color: 'rgba(157,78,221,0.55)' }}
          >
            OUTPUT
          </p>

          <AnimatePresence mode="wait">
            {!currentTrack ? (
              <motion.div
                key="empty"
                className="flex flex-col items-center justify-center flex-1 gap-3"
                style={{ color: 'rgba(192,232,240,0.15)' }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Music className="h-10 w-10" />
                <p className="text-[10px] font-mono text-center" style={{ maxWidth: 160 }}>
                  Generated track will appear here
                </p>
              </motion.div>
            ) : (
              <motion.div
                key={currentTrack.id}
                className="flex flex-col gap-4"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={SPRING}
              >
                {/* Track info */}
                <div
                  className="rounded-xl p-4"
                  style={{
                    background: 'rgba(157,78,221,0.07)',
                    border: '1px solid rgba(157,78,221,0.18)',
                  }}
                >
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span
                      className="text-[9px] font-mono tracking-[0.14em] px-2 py-0.5 rounded-full"
                      style={{
                        background: 'rgba(157,78,221,0.18)',
                        border: '1px solid rgba(157,78,221,0.3)',
                        color: '#9d4edd',
                      }}
                    >
                      {currentTrack.type.toUpperCase()}
                    </span>
                    {previousTracks.length > 0 && (
                      <span
                        className="text-[9px] font-mono tracking-[0.1em] px-2 py-0.5 rounded-full"
                        style={{
                          background: 'rgba(0,212,255,0.08)',
                          border: '1px solid rgba(0,212,255,0.18)',
                          color: 'rgba(0,212,255,0.6)',
                        }}
                      >
                        v{previousTracks.length + 1}
                      </span>
                    )}
                  </div>
                  <p
                    className="text-[11px] font-mono leading-snug"
                    style={{ color: 'rgba(192,232,240,0.82)' }}
                  >
                    {currentTrack.description}
                  </p>
                  <p
                    className="mt-2 text-[9px] font-mono"
                    style={{ color: 'rgba(192,232,240,0.28)' }}
                  >
                    {new Date(currentTrack.generatedAt).toLocaleTimeString()}
                  </p>
                </div>

                {/* Audio player */}
                {currentTrack.audioUrl && (
                  <AudioPlayer audioUrl={currentTrack.audioUrl} />
                )}

                {/* Component breakdown */}
                <div>
                  <p
                    className="text-[9px] font-mono tracking-[0.14em] mb-2"
                    style={{ color: 'rgba(157,78,221,0.45)' }}
                  >
                    COMPONENTS
                  </p>
                  <div className="space-y-2">
                    {(Object.entries(currentTrack.components) as [string, { description: string }][]).map(
                      ([key, output]) => {
                        const member = useMusicStore.getState().band[key]
                        return (
                          <div
                            key={key}
                            className="flex items-start gap-2 rounded-lg px-3 py-2"
                            style={{
                              background: 'rgba(255,255,255,0.025)',
                              border: '1px solid rgba(255,255,255,0.05)',
                            }}
                          >
                            <ChevronRight
                              className="h-3 w-3 mt-0.5 flex-shrink-0"
                              style={{ color: agentColor(member?.name ?? key) }}
                            />
                            <div className="min-w-0">
                              <p
                                className="text-[9px] font-mono tracking-[0.1em]"
                                style={{ color: agentColor(member?.name ?? key) }}
                              >
                                {member?.name ?? key} · {member?.role}
                              </p>
                              <p
                                className="text-[9px] font-mono leading-snug mt-0.5"
                                style={{ color: 'rgba(192,232,240,0.45)' }}
                              >
                                {output.description}
                              </p>
                            </div>
                          </div>
                        )
                      }
                    )}
                  </div>
                </div>

                {/* Your Sound identity */}
                <AnimatePresence>
                  {creativeIdentity && isComplete && (
                    <YourSoundPanel identity={creativeIdentity} />
                  )}
                </AnimatePresence>

                {/* Suggestions */}
                <AnimatePresence>
                  {suggestions.length > 0 && isComplete && (
                    <SuggestionsPanel
                      suggestions={suggestions}
                      onApply={handleSuggestion}
                      disabled={isProcessing}
                    />
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}

// ── Your Sound panel ───────────────────────────────────────────────────────────

function YourSoundPanel({ identity }: { identity: CreativeIdentity }) {
  return (
    <motion.div
      className="rounded-xl px-3 py-2.5"
      style={{
        background: 'rgba(0,212,255,0.03)',
        border: '1px solid rgba(0,212,255,0.10)',
      }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
    >
      <p
        className="text-[9px] font-mono tracking-[0.16em] mb-1.5"
        style={{ color: 'rgba(0,212,255,0.4)' }}
      >
        YOUR SOUND
      </p>
      <p
        className="text-[9px] font-mono leading-relaxed"
        style={{ color: 'rgba(192,232,240,0.52)' }}
      >
        {identity.summary}
      </p>
    </motion.div>
  )
}

// ── Suggestions panel ──────────────────────────────────────────────────────────

function SuggestionsPanel({
  suggestions,
  onApply,
  disabled,
}: {
  suggestions: Suggestion[]
  onApply: (prompt: string) => void
  disabled: boolean
}) {
  return (
    <motion.div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'rgba(157,78,221,0.04)',
        border: '1px solid rgba(157,78,221,0.14)',
      }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
    >
      <div
        className="px-3 py-2 flex items-center gap-1.5"
        style={{ borderBottom: '1px solid rgba(157,78,221,0.10)' }}
      >
        <Lightbulb className="h-3 w-3 flex-shrink-0" style={{ color: 'rgba(157,78,221,0.55)' }} />
        <span
          className="text-[9px] font-mono tracking-[0.16em]"
          style={{ color: 'rgba(157,78,221,0.55)' }}
        >
          STEPHEN'S SUGGESTIONS
        </span>
      </div>

      <div className="px-3 py-2.5 space-y-2">
        {suggestions.map((s, i) => (
          <motion.button
            key={i}
            className="w-full flex items-start gap-2 rounded-lg px-2.5 py-2 text-left"
            style={{
              background: 'rgba(157,78,221,0.05)',
              border: '1px solid rgba(157,78,221,0.10)',
              cursor: disabled ? 'default' : 'pointer',
            }}
            whileHover={disabled ? {} : {
              background: 'rgba(157,78,221,0.10)',
              borderColor: 'rgba(157,78,221,0.22)',
            }}
            whileTap={disabled ? {} : { scale: 0.98 }}
            onClick={() => !disabled && onApply(s.prompt)}
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06, type: 'spring', stiffness: 340, damping: 26 }}
          >
            <ChevronRight
              className="h-3 w-3 mt-0.5 flex-shrink-0"
              style={{ color: 'rgba(157,78,221,0.45)' }}
            />
            <span
              className="text-[9px] font-mono leading-snug"
              style={{ color: 'rgba(192,232,240,0.55)' }}
            >
              {s.message}
            </span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}

// ── Blueprint panel ────────────────────────────────────────────────────────────

function BlueprintPanel({ blueprint, personalised }: { blueprint: TrackBlueprint; personalised?: boolean }) {
  return (
    <motion.div
      className="rounded-xl flex-shrink-0"
      style={{
        marginTop: 8,
        background: 'rgba(157,78,221,0.07)',
        border: '1px solid rgba(157,78,221,0.22)',
        overflow: 'hidden',
      }}
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
    >
      {/* Header */}
      <div
        className="px-3 py-2 flex items-center gap-1.5"
        style={{ borderBottom: '1px solid rgba(157,78,221,0.16)' }}
      >
        <motion.div
          className="h-1.5 w-1.5 rounded-full flex-shrink-0"
          style={{ background: '#9d4edd' }}
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        />
        <span
          className="text-[9px] font-mono tracking-[0.18em]"
          style={{ color: 'rgba(157,78,221,0.75)' }}
        >
          TRACK BLUEPRINT
        </span>
      </div>

      {/* Fields */}
      <div className="px-3 py-2.5 space-y-1.5">
        <BlueprintRow label="STYLE" value={blueprint.style} />
        <BlueprintRow label="KEY" value={blueprint.key} />
        <BlueprintRow label="BPM" value={String(blueprint.bpm)} />
        <BlueprintRow label="MOOD" value={blueprint.mood} />

        {/* Structure */}
        <div className="pt-0.5">
          <p
            className="text-[8px] font-mono tracking-[0.14em] mb-1"
            style={{ color: 'rgba(157,78,221,0.45)' }}
          >
            STRUCTURE
          </p>
          <div className="flex flex-wrap gap-1">
            {blueprint.structure.map((section, i) => (
              <span
                key={i}
                className="text-[8px] font-mono px-1.5 py-0.5 rounded"
                style={{
                  background: 'rgba(157,78,221,0.14)',
                  border: '1px solid rgba(157,78,221,0.22)',
                  color: 'rgba(192,232,240,0.65)',
                }}
              >
                {section}
              </span>
            ))}
          </div>
        </div>

        {/* Personalisation signal */}
        <AnimatePresence>
          {personalised && (
            <motion.div
              className="flex items-center gap-1 pt-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <Sparkles className="h-2.5 w-2.5 flex-shrink-0" style={{ color: 'rgba(157,78,221,0.5)' }} />
              <span
                className="text-[8px] font-mono tracking-[0.08em]"
                style={{ color: 'rgba(157,78,221,0.5)' }}
              >
                Adjusted to your style
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function BlueprintRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span
        className="text-[8px] font-mono tracking-[0.12em]"
        style={{ color: 'rgba(157,78,221,0.45)' }}
      >
        {label}
      </span>
      <span
        className="text-[9px] font-mono"
        style={{ color: 'rgba(192,232,240,0.78)' }}
      >
        {value}
      </span>
    </div>
  )
}

// ── Band card ──────────────────────────────────────────────────────────────────

function BandCard({
  bandKey,
  member,
  isActive,
  delay,
}: {
  bandKey: BandKey
  member: BandMember
  isActive: boolean
  delay: number
}) {
  const Icon = BAND_ICONS[bandKey]
  const color = BAND_COLORS[bandKey]

  const statusLabel =
    member.status === 'generating' ? 'GENERATING'
    : member.status === 'done' ? 'DONE'
    : member.status === 'error' ? 'ERROR'
    : 'IDLE'

  const statusColor =
    member.status === 'generating' ? color
    : member.status === 'done' ? '#00ff88'
    : member.status === 'error' ? '#ff6b35'
    : 'rgba(192,232,240,0.2)'

  return (
    <motion.div
      className="rounded-xl p-3 flex-shrink-0"
      style={{
        background: isActive
          ? `rgba(${hexToRgb(color)}, 0.06)`
          : 'rgba(255,255,255,0.02)',
        border: `1px solid ${isActive ? `rgba(${hexToRgb(color)}, 0.22)` : 'rgba(255,255,255,0.05)'}`,
        transition: 'background 0.3s, border-color 0.3s',
      }}
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24, delay }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-md flex-shrink-0"
          style={{
            background: `rgba(${hexToRgb(color)}, 0.14)`,
            border: `1px solid rgba(${hexToRgb(color)}, 0.28)`,
          }}
        >
          <Icon className="h-3 w-3" style={{ color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-mono tracking-[0.06em]" style={{ color: 'rgba(192,232,240,0.85)' }}>
            {member.name}
          </p>
          <p className="text-[8px] font-mono" style={{ color: 'rgba(192,232,240,0.35)' }}>
            {member.role}
          </p>
        </div>
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-1.5">
        {member.status === 'generating' ? (
          <motion.div
            className="h-1.5 w-1.5 rounded-full flex-shrink-0"
            style={{ background: color }}
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 0.9, repeat: Infinity }}
          />
        ) : (
          <div
            className="h-1.5 w-1.5 rounded-full flex-shrink-0"
            style={{ background: statusColor }}
          />
        )}
        <span className="text-[8px] font-mono tracking-[0.12em]" style={{ color: statusColor }}>
          {statusLabel}
        </span>
      </div>

      {/* Output preview */}
      {member.output && (
        <motion.p
          className="mt-1.5 text-[8px] font-mono leading-snug"
          style={{ color: 'rgba(192,232,240,0.35)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {member.output.description.slice(0, 72)}
          {member.output.description.length > 72 ? '…' : ''}
        </motion.p>
      )}
    </motion.div>
  )
}

// ── Audio player ───────────────────────────────────────────────────────────────

function AudioPlayer({ audioUrl }: { audioUrl: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
    }
  }, [])

  function toggle() {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
      setPlaying(false)
    } else {
      void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    }
  }

  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{
        background: 'rgba(157,78,221,0.07)',
        border: '1px solid rgba(157,78,221,0.2)',
      }}
    >
      <audio
        ref={audioRef}
        src={audioUrl}
        onEnded={() => setPlaying(false)}
        preload="auto"
      />

      <motion.button
        onClick={toggle}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
        style={{ background: 'rgba(157,78,221,0.22)', border: '1px solid rgba(157,78,221,0.38)' }}
        whileHover={{ scale: 1.1, background: 'rgba(157,78,221,0.36)' }}
        whileTap={{ scale: 0.92 }}
      >
        {playing ? (
          <Square className="h-3 w-3" style={{ color: '#9d4edd' }} />
        ) : (
          <Play className="h-3.5 w-3.5 ml-0.5" style={{ color: '#9d4edd' }} />
        )}
      </motion.button>

      <div>
        <p className="text-[10px] font-mono" style={{ color: 'rgba(192,232,240,0.7)' }}>
          {playing ? 'Playing…' : 'Ready'}
        </p>
        <p className="text-[8px] font-mono" style={{ color: 'rgba(192,232,240,0.25)' }}>
          mock audio · connect API for real output
        </p>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function agentColor(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('stephen')) return '#9d4edd'
  if (n.includes('peter')) return '#00d4ff'
  if (n.includes('tchalla') || n.includes("t'challa")) return '#ff6b35'
  if (n.includes('wanda')) return '#00ff88'
  if (n.includes('scott')) return '#ffc84a'
  return 'rgba(192,232,240,0.45)'
}

/** Converts a hex colour like #9d4edd → "157,78,221" for use in rgba(). */
function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `${r},${g},${b}`
}
