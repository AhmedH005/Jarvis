import { useMemo, useEffect, useState } from 'react'
import { Activity, ShieldCheck, Wrench, Radio } from 'lucide-react'
import { useActionRuntimeStore } from '@/store/action-runtime'
import { useRuntimeStore } from '@/store/runtime'
import { Card, EmptyPanel, FieldRow, ItemList, PanelHeader } from './shared'
import { getGovernanceSummary } from '@/integrations/governance/skill-governance'
import { evaluateSystemReadiness, loadActivationState } from '@/integrations/runtime/readiness-engine'
import type { SystemReadinessReport } from '@/shared/readiness-types'
import type { ActivationState } from '@/shared/activation-types'

interface GovernanceSummary {
  totalSkills:      number
  byTrustLevel:     Record<string, number>
  blockedSkills:    string[]
  restrictedSkills: string[]
  unvettedSkills:   string[]
}

function readinessColor(level: string): string {
  if (level === 'write_ready' || level === 'read_only_ready') return '#00ff88'
  if (level === 'runtime_verified') return '#a3e635'
  if (level === 'wired') return '#ffc84a'
  if (level === 'blocked') return '#ff6b35'
  if (level === 'error') return '#ff4444'
  return '#888'
}

function promotionColor(stage: string): string {
  if (stage === 'fully_live_candidate') return '#00ff88'
  if (stage === 'write_live_candidate') return '#a3e635'
  if (stage === 'read_only_live_candidate') return '#ffc84a'
  return '#888'
}

export function SystemOpsTab() {
  const snapshot = useRuntimeStore((state) => state.snapshot)
  const approvals = useActionRuntimeStore((state) => state.approvals.slice(0, 8))
  const receipts = useActionRuntimeStore((state) => state.receipts.slice(0, 8))
  const actions = useActionRuntimeStore((state) => state.actions.slice(0, 12))
  const [govSummary, setGovSummary] = useState<GovernanceSummary | null>(null)
  const [readiness, setReadiness] = useState<SystemReadinessReport | null>(null)
  const [activationState, setActivationState] = useState<ActivationState | null>(null)

  useEffect(() => {
    void getGovernanceSummary().then(setGovSummary)
    void evaluateSystemReadiness().then(setReadiness)
    void loadActivationState().then(setActivationState)
  }, [])

  const pendingApprovals = useMemo(
    () => approvals.filter((approval) => approval.status === 'pending'),
    [approvals],
  )

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PanelHeader
        Icon={Activity}
        title="SYSTEM"
        sublabel="Runtime safety, approvals, receipts, and connector truth"
        iconColor="#00ff88"
        iconBg="rgba(0,255,136,0.10)"
        iconBorder="rgba(0,255,136,0.22)"
      />

      <div className="px-4 py-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Card title="SAFETY" accent="rgba(0,255,136,0.22)">
            <FieldRow label="Dry run" value={snapshot?.diagnostics?.safety.dryRun ? 'enabled' : 'disabled'} valueColor="#00ff88" mono />
            <FieldRow label="No secrets" value={snapshot?.diagnostics?.safety.noSecretsMode ? 'enabled' : 'disabled'} valueColor="#00ff88" mono />
            <FieldRow label="SAFE_ROOT" value={snapshot?.diagnostics?.safety.safeRoot ?? 'jarvis-runtime'} mono />
          </Card>

          <Card title="CAPABILITY GATE" accent="rgba(255,200,74,0.22)">
            <ItemList
              items={[
                `execute: ${snapshot?.diagnostics?.safety.capabilities.execute ? 'enabled' : 'disabled'}`,
                `write: ${snapshot?.diagnostics?.safety.capabilities.write ? 'enabled' : 'disabled'}`,
                `network: ${snapshot?.diagnostics?.safety.capabilities.network ? 'enabled' : 'disabled'}`,
              ]}
              color="#ffc84a"
            />
          </Card>

          <Card title="CONNECTORS" accent="rgba(0,212,255,0.18)">
            <FieldRow label="OpenClaw" value={snapshot?.diagnostics?.openclaw.online ? 'available' : 'unavailable'} valueColor={snapshot?.diagnostics?.openclaw.online ? '#00ff88' : '#ff6b35'} mono />
            <FieldRow label="Mail" value={snapshot?.diagnostics?.gmail.configured ? 'configured' : 'disabled'} valueColor={snapshot?.diagnostics?.gmail.configured ? '#00ff88' : '#ff6b35'} mono />
            <FieldRow label="Media" value={snapshot?.diagnostics?.media.configured ? 'configured' : 'disabled'} valueColor={snapshot?.diagnostics?.media.configured ? '#00ff88' : '#ff6b35'} mono />
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Card title="PENDING APPROVALS" accent="rgba(255,200,74,0.18)">
            {pendingApprovals.length > 0 ? (
              <ItemList items={pendingApprovals.map((approval) => `${approval.title} · ${approval.riskLevel}`)} color="#ffc84a" />
            ) : (
              <EmptyPanel icon={ShieldCheck} title="No pending approvals" note="Actions currently stage but do not advance into approval or execution while dry run is enabled." />
            )}
          </Card>

          <Card title="RECEIPTS" accent="rgba(0,212,255,0.18)">
            {receipts.length > 0 ? (
              <ItemList items={receipts.map((receipt) => `${receipt.status.toUpperCase()} · ${receipt.summary}`)} color="#00d4ff" />
            ) : (
              <EmptyPanel icon={Wrench} title="No receipts yet" note="Jarvis records receipts only when actions genuinely complete, fail, or are marked unavailable." />
            )}
          </Card>
        </div>

        <Card title="SKILL GOVERNANCE" accent="rgba(255,100,100,0.18)">
          <FieldRow label="Skills tracked" value={`${govSummary?.totalSkills ?? 0}`} valueColor="#ffc84a" mono />
          <FieldRow label="Unvetted" value={`${govSummary?.unvettedSkills.length ?? 0}`} valueColor={govSummary && govSummary.unvettedSkills.length > 0 ? '#ffc84a' : '#00ff88'} mono />
          <FieldRow label="Restricted" value={`${govSummary?.restrictedSkills.length ?? 0}`} valueColor={govSummary && govSummary.restrictedSkills.length > 0 ? '#ff9944' : '#00ff88'} mono />
          <FieldRow label="Blocked" value={`${govSummary?.blockedSkills.length ?? 0}`} valueColor={govSummary && govSummary.blockedSkills.length > 0 ? '#ff6b35' : '#00ff88'} mono />
          {govSummary && govSummary.blockedSkills.length > 0 && (
            <ItemList items={govSummary.blockedSkills.map((s) => `BLOCKED: ${s}`)} color="#ff6b35" />
          )}
          {govSummary && govSummary.restrictedSkills.length > 0 && (
            <ItemList items={govSummary.restrictedSkills.map((s) => `RESTRICTED: ${s}`)} color="#ff9944" />
          )}
          {(!govSummary || govSummary.totalSkills === 0) && (
            <EmptyPanel title="Governance store empty" note="Run skill inventory to populate trust records. All skills default to 'unknown' until vetted." />
          )}
        </Card>

        <Card title="PROVIDER READINESS" accent="rgba(163,230,53,0.18)">
          {readiness ? (
            <>
              <div className="flex items-center gap-1.5 mb-2">
                <Radio className="w-3 h-3" style={{ color: '#a3e635' }} />
                <span className="text-[10px] font-mono" style={{ color: 'rgba(163,230,53,0.7)' }}>
                  {readiness.totalProviders} providers · {readiness.stagedOnlyProviders.length} staged · {readiness.readReadyProviders.length} read-ready · {readiness.writeReadyProviders.length} write-ready
                  {activationState ? ` · ${activationState.machine}` : ''}
                </span>
              </div>
              {readiness.providers.map((p) => {
                const actProvider = activationState?.providers.find((ap) => ap.provider === p.providerKey)
                const activatedCount = actProvider?.actions.filter((a) => a.currentStage === 'activated').length ?? 0
                const totalActions = actProvider?.actions.length ?? 0
                const lastTest = actProvider?.actions
                  .filter((a) => a.lastSmokeTestResult)
                  .sort((x, y) => (y.lastSmokeTestAt ?? '').localeCompare(x.lastSmokeTestAt ?? ''))[0]

                return (
                  <div key={p.providerKey} className="mb-1">
                    <FieldRow
                      label={p.providerLabel}
                      value={[
                        p.overallReadiness.replace(/_/g, ' '),
                        activatedCount > 0 ? `${activatedCount}/${totalActions} activated` : p.overallPromotion.replace(/_/g, ' '),
                      ].join(' · ')}
                      valueColor={activatedCount > 0 ? '#00ff88' : readinessColor(p.overallReadiness)}
                      mono
                    />
                    {lastTest && (
                      <div className="pl-2">
                        <ItemList
                          items={[`↳ last smoke test: ${lastTest.lastSmokeTestResult} · ${lastTest.lastSmokeTestAt?.slice(0, 10) ?? '—'}`]}
                          color={lastTest.lastSmokeTestResult === 'passed' ? '#00ff88' : '#ff6b35'}
                        />
                      </div>
                    )}
                    {activatedCount === 0 && p.allBlockers.length > 0 && (
                      <div className="pl-2">
                        <ItemList
                          items={p.allBlockers.slice(0, 1).map((b) => `↳ ${b.type.replace(/_/g, ' ')}: ${b.resolution}`)}
                          color={promotionColor(p.overallPromotion)}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          ) : (
            <EmptyPanel title="Evaluating readiness…" note="Checking provider wiring, credentials, governance, and capability gates." />
          )}
        </Card>

        <Card title="ACTION LOG" accent="rgba(0,255,136,0.16)">
          {actions.length > 0 ? (
            <ItemList items={actions.map((action) => `${action.state.toUpperCase()} · ${action.title} · ${action.summary}`)} color="#00ff88" />
          ) : (
            <EmptyPanel title="No actions recorded yet" note="Use Command or the module stage controls to populate the runtime log." />
          )}
        </Card>

        <Card title="SYSTEM LINES" accent="rgba(0,212,255,0.16)">
          <ItemList items={snapshot?.systemStateLines ?? ['Runtime snapshot not loaded yet.']} color="#00d4ff" />
        </Card>
      </div>
    </div>
  )
}
