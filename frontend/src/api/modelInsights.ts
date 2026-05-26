import { api } from './client'

export interface FeatureImportance {
  feature: string
  importance: number
}

export interface PerClassMetrics {
  precision: number
  recall: number
  f1: number
  support: number
}

export interface ModelInsightsResponse {
  experiment_id: string
  best_model_name: string
  feature_set: string
  n_features: number
  split_method: string
  n_train: number
  n_val: number
  n_test: number
  class_distribution: Record<string, number>
  test_accuracy: number
  test_macro_f1: number
  test_weighted_f1: number
  test_high_risk_recall: number
  test_confusion_matrix: number[][]
  test_per_class: Record<string, PerClassMetrics>
  feature_names: string[]
  feature_importances: FeatureImportance[]
  leakage_warning: string | null
  trained_at: string
  active_model: string
}

export interface CandidateResult {
  name: string
  val_accuracy: number
  val_macro_f1: number
  val_weighted_f1: number
  val_high_risk_recall: number
  cv_best_score: number
  best_params: Record<string, unknown>
}

export interface ModelComparisonResponse {
  experiment_id: string
  feature_set: string
  split_method: string
  best_model_name: string
  selection_metric: string
  trained_at: string
  candidates: CandidateResult[]
}

export interface ExperimentSummaryItem {
  experiment_id: string
  feature_set: string
  n_features: number
  best_model_name: string
  test_accuracy: number
  test_macro_f1: number
  test_weighted_f1: number
  test_high_risk_recall: number
  trained_at: string
  note: string
}

export const getModelInsights = () =>
  api.get<ModelInsightsResponse>('/api/v1/model-insights/').then((r) => r.data)

export const getModelComparison = () =>
  api.get<ModelComparisonResponse>('/api/v1/model-insights/comparison').then((r) => r.data)

export const getExperimentsSummary = () =>
  api.get<ExperimentSummaryItem[]>('/api/v1/model-insights/experiments-summary').then((r) => r.data)
