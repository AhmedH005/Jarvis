import { useEffect, useState } from 'react'
import { Inbox, MailPlus, MapPin, ShieldCheck, Sparkles } from 'lucide-react'
import { getConciergeProvider } from '@/integrations/registry/providerRegistry'
import { loadConciergeRuntimeSnapshot, type ConciergeRuntimeSnapshot } from '@/features/modules/runtimeViews'
import { useActionRuntimeStore } from '@/store/action-runtime'
import { Card, EmptyPanel, FieldRow, ItemList, PanelHeader } from './shared'

const EMPTY_CONCIERGE: ConciergeRuntimeSnapshot = {
  inbox: [],
  bookings: [],
}

export function ConciergeOpsTab() {
  const [data, setData] = useState<ConciergeRuntimeSnapshot>(EMPTY_CONCIERGE)
  const [providerNote, setProviderNote] = useState('Loading…')
  const actions = useActionRuntimeStore((state) => state.actions.filter((action) => action.domain === 'concierge').slice(0, 6))

  useEffect(() => {
    const load = async () => {
      const [provider, runtimeData] = await Promise.all([
        getConciergeProvider().describe(),
        loadConciergeRuntimeSnapshot(),
      ])
      setProviderNote(provider.health.detail)
      setData(runtimeData)
    }

    void load()
  }, [])

  const stageInboxSync = async () => {
    await getConciergeProvider().syncInboxFromGmail()
  }

  const stageDraft = async () => {
    await getConciergeProvider().generateDraftReplyForEmail('dry-run-email')
  }

  const stageBooking = async () => {
    await getConciergeProvider().dispatchOutboundCall('Booking desk', 'Request a reservation handoff', 'serious')
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PanelHeader
        Icon={Sparkles}
        title="CONCIERGE"
        sublabel="Email, bookings, and personal admin routed through staged skill workflows"
        iconColor="#00d4ff"
        iconBg="rgba(0,212,255,0.10)"
        iconBorder="rgba(0,212,255,0.22)"
      />

      <div className="px-4 py-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Card title="CONCIERGE STACK" accent="rgba(0,212,255,0.22)">
            <FieldRow label="Mail" value="agent-mail-cli" valueColor="#00d4ff" mono />
            <FieldRow label="Bookings" value="bookameeting" valueColor="#00d4ff" mono />
            <FieldRow label="Phone" value="disabled for now" valueColor="#ffc84a" />
            <p className="text-[10px] leading-snug" style={{ color: 'rgba(192,232,240,0.55)' }}>{providerNote}</p>
          </Card>

          <Card title="SAFE ACTIONS" accent="rgba(255,200,74,0.22)">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void stageInboxSync()} className="rounded px-3 py-1.5 text-[10px] font-mono" style={{ color: '#ffc84a', border: '1px solid rgba(255,200,74,0.24)', background: 'rgba(255,200,74,0.08)' }}>
                <span className="inline-flex items-center gap-1"><Inbox className="w-3 h-3" /> Stage Inbox Sync</span>
              </button>
              <button onClick={() => void stageDraft()} className="rounded px-3 py-1.5 text-[10px] font-mono" style={{ color: '#ffc84a', border: '1px solid rgba(255,200,74,0.24)', background: 'rgba(255,200,74,0.08)' }}>
                <span className="inline-flex items-center gap-1"><MailPlus className="w-3 h-3" /> Stage Draft</span>
              </button>
              <button onClick={() => void stageBooking()} className="rounded px-3 py-1.5 text-[10px] font-mono" style={{ color: '#ffc84a', border: '1px solid rgba(255,200,74,0.24)', background: 'rgba(255,200,74,0.08)' }}>
                <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> Stage Booking</span>
              </button>
            </div>
            <ItemList
              items={[
                'No fake inbox authority',
                'No live sends while dry run is enabled',
                'Bookings stay staged and approval-aware',
              ]}
              color="#ffc84a"
            />
          </Card>

          <Card title="APPROVAL MODEL" accent="rgba(255,107,53,0.18)">
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-3.5 h-3.5" style={{ color: '#ff6b35' }} />
              <span className="text-[10px] font-mono" style={{ color: 'rgba(255,107,53,0.72)' }}>
                sensitive actions never auto-send
              </span>
            </div>
            <ItemList
              items={[
                'outbound send → staged',
                'booking handoff → staged',
                'execution stays blocked until safety flags change',
              ]}
              color="#ff6b35"
            />
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Card title="INBOX" accent="rgba(0,212,255,0.16)">
            {data.inbox.length > 0 ? (
              <ItemList items={data.inbox.map((message) => `${message.subject} · ${message.sender}`)} color="#00d4ff" />
            ) : (
              <EmptyPanel
                icon={Inbox}
                title="No safe-root inbox items yet"
                note="agent-mail-cli has replaced the old Gmail-specific direction, but live mail stays disabled until credentials and dry-run settings are changed."
              />
            )}
          </Card>

          <Card title="BOOKINGS" accent="rgba(255,200,74,0.18)">
            {data.bookings.length > 0 ? (
              <ItemList items={data.bookings.map((booking) => `${booking.title} · ${booking.status}`)} color="#ffc84a" />
            ) : (
              <EmptyPanel
                icon={MapPin}
                title="No staged bookings yet"
                note="bookameeting is selected, but Jarvis will not claim booking power until the real connector is wired."
              />
            )}
          </Card>
        </div>

        <Card title="CONCIERGE ACTION LOG" accent="rgba(0,212,255,0.18)">
          {actions.length > 0 ? (
            <ItemList items={actions.map((action) => `${action.state.toUpperCase()} · ${action.title} · ${action.summary}`)} color="#00d4ff" />
          ) : (
            <EmptyPanel title="No staged concierge actions yet" note="Use the stage controls above to create approval-aware concierge work." />
          )}
        </Card>
      </div>
    </div>
  )
}
