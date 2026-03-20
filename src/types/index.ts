export interface StreamChunk {
  type: 'text' | 'tool_start' | 'tool_end' | 'error'
  content: string
  toolName?: string
  toolInput?: unknown
  toolOutput?: unknown
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  toolCalls?: ToolCall[]
  streaming?: boolean
}

export interface ToolCall {
  id: string
  name: string
  input?: unknown
  output?: unknown
  status: 'running' | 'done' | 'error'
  startedAt: Date
  completedAt?: Date
}

export interface OpenClawStatus {
  online: boolean
  model?: string
  version?: string
  error?: string
}

export interface JarvisConfig {
  theme: {
    primaryColor: string
    glowIntensity: number   // 0-100
    animationSpeed: number  // 0.5 to 2.0
    opacity: number         // 0.7 to 1.0
  }
  layout: {
    leftPanelWidth: number
    rightPanelWidth: number
    showLeftPanel: boolean
    showRightPanel: boolean
  }
  widgets: {
    memory: boolean
    tasks: boolean
    logs: boolean
    systemStatus: boolean
    skills: boolean
  }
}

export const DEFAULT_CONFIG: JarvisConfig = {
  theme: {
    primaryColor: '#00d4ff',
    glowIntensity: 60,
    animationSpeed: 1.0,
    opacity: 0.95,
  },
  layout: {
    leftPanelWidth: 260,
    rightPanelWidth: 280,
    showLeftPanel: true,
    showRightPanel: true,
  },
  widgets: {
    memory: true,
    tasks: true,
    logs: true,
    systemStatus: true,
    skills: true,
  },
}
