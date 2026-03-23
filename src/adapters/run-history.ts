import { homedir } from '@/lib/platform'
import fallbackRunHistoryRaw from '../../jarvis-local-demo/run-history.md?raw'

export type AgentRunStatus = 'started' | 'completed' | 'failed' | 'blocked' | 'approval-needed'

export interface AgentRunEntry {
  id: string
  agent: string
  taskSummary: string
  status: AgentRunStatus
  filesChanged: string[]
  commandsRun: string[]
  verificationResult: string
  timestamp: string
}

export interface RunHistorySnapshot {
  runs: AgentRunEntry[]
  source: 'workspace-log' | 'local-demo-fallback'
  sourceLabel: string
  sourcePath: string
  note?: string
}

export const RUN_HISTORY_PATHS = {
  workspace: () => `${homedir()}/.openclaw/workspace/jarvis-system/demo/agent-run-history.md`,
} as const

export const EMPTY_RUN_HISTORY: RunHistorySnapshot = {
  runs: [],
  source: 'local-demo-fallback',
  sourceLabel: 'local demo',
  sourcePath: 'jarvis-local-demo/run-history.md',
  note: 'No agent run history is available yet.',
}

function cleanValue(value: string): string {
  return value.replace(/^`|`$/g, '').replace(/^"(.*)"$/, '$1').trim()
}

function splitByHeading(raw: string, prefix: '### '): Array<{ title: string; body: string }> {
  const lines = raw.split(/\r?\n/)
  const sections: Array<{ title: string; body: string }> = []
  let currentTitle: string | null = null
  let currentBody: string[] = []

  for (const line of lines) {
    if (line.startsWith(prefix)) {
      if (currentTitle) {
        sections.push({ title: currentTitle, body: currentBody.join('\n').trim() })
      }
      currentTitle = line.slice(prefix.length).trim()
      currentBody = []
      continue
    }

    if (currentTitle) currentBody.push(line)
  }

  if (currentTitle) {
    sections.push({ title: currentTitle, body: currentBody.join('\n').trim() })
  }

  return sections
}

function parseFlatYamlBlock(block: string): Record<string, string | string[]> {
  const data: Record<string, string | string[]> = {}
  let currentArrayKey: string | null = null

  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trimEnd()
    if (!line.trim()) continue

    const arrayItemMatch = line.match(/^\s*-\s+(.*)$/)
    if (arrayItemMatch && currentArrayKey) {
      const existing = data[currentArrayKey]
      if (Array.isArray(existing)) existing.push(cleanValue(arrayItemMatch[1]))
      continue
    }

    const pairMatch = line.match(/^([a-z_]+):\s*(.*)$/)
    if (!pairMatch) continue

    const [, key, rawValue] = pairMatch
    const value = cleanValue(rawValue)

    if (!value) {
      data[key] = []
      currentArrayKey = key
      continue
    }

    currentArrayKey = null
    data[key] = value
  }

  return data
}

function normalizeStatus(value: string): AgentRunStatus {
  switch (value) {
    case 'started':
    case 'completed':
    case 'failed':
    case 'blocked':
    case 'approval-needed':
      return value
    default:
      return 'approval-needed'
  }
}

function parseRunHistory(raw: string): AgentRunEntry[] {
  return splitByHeading(raw, '### ')
    .map((section) => {
      const yaml = section.body.match(/```yaml\n([\s\S]*?)```/)
      if (!yaml) return null
      const data = parseFlatYamlBlock(yaml[1])

      return {
        id: String(data['id'] ?? section.title.toLowerCase().replace(/[^\w]+/g, '-')),
        agent: section.title,
        taskSummary: String(data['task_summary'] ?? ''),
        status: normalizeStatus(String(data['status'] ?? 'approval-needed')),
        filesChanged: Array.isArray(data['files_changed']) ? data['files_changed'] : [],
        commandsRun: Array.isArray(data['commands_run']) ? data['commands_run'] : [],
        verificationResult: String(data['verification_result'] ?? 'No verification result recorded.'),
        timestamp: String(data['timestamp'] ?? ''),
      }
    })
    .filter((entry): entry is AgentRunEntry => Boolean(entry))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

export async function loadRunHistory(): Promise<RunHistorySnapshot> {
  if (window.jarvis?.fs) {
    const result = await window.jarvis.fs.readFile(RUN_HISTORY_PATHS.workspace())
    if (result.ok) {
      const runs = parseRunHistory(result.content)
      if (runs.length > 0) {
        return {
          runs,
          source: 'workspace-log',
          sourceLabel: 'workspace log',
          sourcePath: RUN_HISTORY_PATHS.workspace(),
        }
      }
    }
  }

  return {
    runs: parseRunHistory(fallbackRunHistoryRaw),
    source: 'local-demo-fallback',
    sourceLabel: 'local demo',
    sourcePath: 'jarvis-local-demo/run-history.md',
    note: 'Run history is sourced from local demo data. No live workspace log found yet.',
  }
}
