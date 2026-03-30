import { Landmark, ShieldAlert } from 'lucide-react'
import { Card, EmptyPanel, FieldRow, ItemList, PanelHeader } from './shared'

export function FinanceTab() {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PanelHeader
        Icon={Landmark}
        title="FINANCE"
        sublabel="Real finance provider or explicit unavailability only"
        iconColor="#00d4ff"
        iconBg="rgba(0,212,255,0.10)"
        iconBorder="rgba(0,212,255,0.22)"
      />

      <div className="px-4 py-4 space-y-3">
        <Card title="PROVIDER STATUS" accent="rgba(255,107,53,0.22)">
          <FieldRow label="Selected skill" value="actual-budget" valueColor="#00d4ff" mono />
          <FieldRow label="Current state" value="unavailable" valueColor="#ff6b35" mono />
          <FieldRow label="Reason" value="Not wired yet in the safe cross-platform runtime" />
          <ItemList
            items={[
              'No fake balance cards',
              'No fake market data',
              'No fake account sync',
            ]}
            color="#ff6b35"
          />
        </Card>

        <Card title="FINANCE POLICY" accent="rgba(255,200,74,0.18)">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-3.5 h-3.5" style={{ color: '#ffc84a' }} />
            <span className="text-[10px] font-mono" style={{ color: 'rgba(255,200,74,0.74)' }}>
              unavailable beats fake
            </span>
          </div>
          <ItemList
            items={[
              'The old placeholder finance surface is gone',
              'Finance will stay dark until a real Actual Budget connector exists',
            ]}
            color="#ffc84a"
          />
        </Card>

        <EmptyPanel
          icon={Landmark}
          title="Finance is intentionally unavailable"
          note="This room will only come alive once Actual Budget is genuinely connected. Until then, Jarvis tells the truth."
        />
      </div>
    </div>
  )
}
