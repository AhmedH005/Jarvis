import { Mic2, Music, Radio, Sparkles, Waves } from 'lucide-react'
import { getMediaProvider, getSpeechProvider } from '@/integrations/registry/providerRegistry'
import { useActionRuntimeStore } from '@/store/action-runtime'
import { Card, EmptyPanel, FieldRow, ItemList, PanelHeader } from './shared'

export function CreationTab() {
  const actions = useActionRuntimeStore((state) =>
    state.actions.filter((action) => action.domain === 'media' || action.domain === 'speech').slice(0, 8),
  )

  const stageVoice = async () => {
    await getSpeechProvider().speak('Stage a Jarvis voice reply')
  }

  const stageMusic = async () => {
    await getMediaProvider().generateTrack('Stage a cinematic Jarvis soundtrack')
  }

  const stageTranscript = async () => {
    await getSpeechProvider().speak('Stage a transcription request')
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PanelHeader
        Icon={Music}
        title="CREATION"
        sublabel="Voice, audio, and media generation powered by selected Creation skills"
        iconColor="#9d4edd"
        iconBg="rgba(157,78,221,0.10)"
        iconBorder="rgba(157,78,221,0.22)"
      />

      <div className="px-4 py-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Card title="CREATION STACK" accent="rgba(157,78,221,0.24)">
            <FieldRow label="TTS" value="elevenlabs-tts" valueColor="#9d4edd" mono />
            <FieldRow label="STT" value="elevenlabs-transcribe" valueColor="#9d4edd" mono />
            <FieldRow label="Music" value="eachlabs-music" valueColor="#9d4edd" mono />
            <ItemList
              items={[
                'voice replies',
                'transcription requests',
                'music generation requests',
              ]}
              color="#9d4edd"
            />
          </Card>

          <Card title="SAFE ACTIONS" accent="rgba(0,212,255,0.18)">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void stageVoice()} className="rounded px-3 py-1.5 text-[10px] font-mono" style={{ color: '#00d4ff', border: '1px solid rgba(0,212,255,0.24)', background: 'rgba(0,212,255,0.08)' }}>
                <span className="inline-flex items-center gap-1"><Radio className="w-3 h-3" /> Stage Voice</span>
              </button>
              <button onClick={() => void stageTranscript()} className="rounded px-3 py-1.5 text-[10px] font-mono" style={{ color: '#00d4ff', border: '1px solid rgba(0,212,255,0.24)', background: 'rgba(0,212,255,0.08)' }}>
                <span className="inline-flex items-center gap-1"><Mic2 className="w-3 h-3" /> Stage Transcript</span>
              </button>
              <button onClick={() => void stageMusic()} className="rounded px-3 py-1.5 text-[10px] font-mono" style={{ color: '#00d4ff', border: '1px solid rgba(0,212,255,0.24)', background: 'rgba(0,212,255,0.08)' }}>
                <span className="inline-flex items-center gap-1"><Waves className="w-3 h-3" /> Stage Music</span>
              </button>
            </div>
            <ItemList
              items={[
                'No fake generated clips',
                'No local secret usage',
                'All creation jobs stay staged',
              ]}
              color="#00d4ff"
            />
          </Card>

          <Card title="CURRENT STATE" accent="rgba(255,200,74,0.18)">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-3.5 h-3.5" style={{ color: '#ffc84a' }} />
              <span className="text-[10px] font-mono" style={{ color: 'rgba(255,200,74,0.72)' }}>
                provider-selected, execution-disabled
              </span>
            </div>
            <ItemList
              items={[
                'dry run blocks media execution',
                'network capability is disabled',
                'no assets are fabricated for presentation',
              ]}
              color="#ffc84a"
            />
          </Card>
        </div>

        <Card title="CREATION ACTION LOG" accent="rgba(157,78,221,0.20)">
          {actions.length > 0 ? (
            <ItemList items={actions.map((action) => `${action.state.toUpperCase()} · ${action.title} · ${action.summary}`)} color="#9d4edd" />
          ) : (
            <EmptyPanel
              icon={Music}
              title="No staged creation actions yet"
              note="The pseudo-band layer has been demoted; this room now tracks real provider-targeted voice and media requests."
            />
          )}
        </Card>
      </div>
    </div>
  )
}
