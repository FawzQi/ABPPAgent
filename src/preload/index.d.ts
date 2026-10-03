import type { AgentApi } from '../shared/types'

declare global {
  interface Window {
    agentApi: AgentApi
  }
}
