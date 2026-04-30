import type { ModelTotals, UsageSnapshot, UsageSummaryBucket } from '@/types/usage'

export function formatBig(n: number): string {
  return n.toLocaleString('ru-RU')
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

// Diff between two cumulative counters with restart guard:
// если cur < prev (рестарт агента или новая БД) — берём cur как абсолютное значение интервала.
export function delta(cur: number, prev: number): number {
  return cur >= prev ? cur - prev : Math.max(0, cur)
}

const EMPTY_TOTALS: ModelTotals = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
  total_cost_usd: 0,
}

function deltaModelTotals(cur: ModelTotals, prev: ModelTotals): ModelTotals {
  const dCost = (cur.total_cost_usd ?? 0) - (prev.total_cost_usd ?? 0)
  return {
    input_tokens: delta(cur.input_tokens, prev.input_tokens),
    output_tokens: delta(cur.output_tokens, prev.output_tokens),
    cache_creation_input_tokens: delta(cur.cache_creation_input_tokens, prev.cache_creation_input_tokens),
    cache_read_input_tokens: delta(cur.cache_read_input_tokens, prev.cache_read_input_tokens),
    total_cost_usd: dCost > 0 ? dCost : (cur.total_cost_usd ?? 0),
  }
}

function addModelTotals(a: ModelTotals, b: ModelTotals): ModelTotals {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_creation_input_tokens: a.cache_creation_input_tokens + b.cache_creation_input_tokens,
    cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
    total_cost_usd: (a.total_cost_usd ?? 0) + (b.total_cost_usd ?? 0),
  }
}

// Сумма за период по моделям. Считается как суммa дельт между парами snapshot'ов.
export function aggregateByModel(snapshots: UsageSnapshot[]): Record<string, ModelTotals> {
  if (snapshots.length < 2) return {}
  const acc: Record<string, ModelTotals> = {}
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1].breakdown_by_model ?? {}
    const cur = snapshots[i].breakdown_by_model ?? {}
    const models = new Set([...Object.keys(prev), ...Object.keys(cur)])
    for (const m of models) {
      const p = prev[m] ?? EMPTY_TOTALS
      const c = cur[m] ?? EMPTY_TOTALS
      const d = m in cur && !(m in prev)
        // модель появилась впервые в этом интервале — берём её целиком как дельту
        ? c
        : deltaModelTotals(c, p)
      acc[m] = m in acc ? addModelTotals(acc[m], d) : d
    }
  }
  return acc
}

export function totalTokens(t: ModelTotals): number {
  return (
    t.input_tokens +
    t.output_tokens +
    t.cache_creation_input_tokens +
    t.cache_read_input_tokens
  )
}

export function bucketTotalTokens(bucket: UsageSummaryBucket): number {
  const byModel = aggregateByModel(bucket.snapshots)
  let sum = 0
  for (const t of Object.values(byModel)) sum += totalTokens(t)
  return sum
}

const MODEL_PALETTE = [
  '#bcb6e6',
  '#a3d9c0',
  '#e8dab2',
  '#e8b8c4',
  '#b8c8e8',
  '#d4906a',
  '#aa6ad4',
  '#6ad4d0',
]

export function modelColor(name: string | null | undefined): string {
  if (!name) return '#666'
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) | 0
  }
  return MODEL_PALETTE[Math.abs(h) % MODEL_PALETTE.length]
}

export function modelDisplayName(name: string | null | undefined): string {
  if (!name) return 'без модели'
  // claude-sonnet-4-6-20250929 → sonnet-4-6
  const m = name.match(/^claude-([a-z]+(?:-[0-9]+)*)/)
  return m ? m[1] : name
}
