import { api } from './client'
import type { FakeNewsResponse } from '../types/api'

export const analyzeFakeNews = (text: string, url?: string) =>
  api
    .post<FakeNewsResponse>('/api/v1/fake-news/analyze', { text, url: url || null })
    .then((r) => r.data)
