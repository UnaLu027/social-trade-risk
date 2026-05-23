import { api } from './client'
import type { ScenarioRequest, ScenarioResponse } from '../types/api'

export const simulateScenario = (body: ScenarioRequest) =>
  api.post<ScenarioResponse>('/api/v1/scenario/simulate', body).then((r) => r.data)
