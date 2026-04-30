'use client'

import { useMemo } from 'react'
import {
  aggregateByModel,
  formatCompact,
  modelColor,
  modelDisplayName,
  sumModelTotals,
  totalTokens,
} from '@/lib/usage'
import type { UsageSummaryBucket } from '@/types/usage'

interface AgentUsageRowProps {
  bucket: UsageSummaryBucket
  onClick: () => void
}

interface Slice {
  model: string
  total: number
  share: number
  color: string
  label: string
}

export function AgentUsageRow({ bucket, onClick }: AgentUsageRowProps) {
  const { total, slices } = useMemo(() => {
    const byModel = aggregateByModel(bucket.snapshots)
    const total = sumModelTotals(byModel)
    if (total === 0) {
      return { total: 0, slices: [] as Slice[] }
    }
    const entries = Object.entries(byModel)
      .map(([model, t]) => ({ model, total: totalTokens(t) }))
      .filter((e) => e.total > 0)
      .sort((a, b) => b.total - a.total)
    const slices: Slice[] = entries.map((e) => ({
      model: e.model,
      total: e.total,
      share: e.total / total,
      color: modelColor(e.model),
      label: modelDisplayName(e.model),
    }))
    return { total, slices }
  }, [bucket])

  const empty = total === 0

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-3 py-2.5 bg-panel border border-line-faint rounded hover:border-line-subtle text-left transition-colors"
    >
      <span className="font-mono text-xs text-text-bright truncate w-36 shrink-0">
        {bucket.name}
      </span>
      <span className="font-mono text-xs text-text-main w-20 shrink-0 tabular-nums">
        {empty ? '—' : formatCompact(total)}
      </span>
      <div className="flex-1 min-w-0">
        {empty ? (
          <span className="text-text-dim text-xs">нет активности</span>
        ) : (
          <div className="space-y-1">
            <div className="flex h-2 rounded overflow-hidden bg-hover">
              {slices.map((s) => (
                <div
                  key={s.model}
                  style={{ width: `${s.share * 100}%`, background: s.color }}
                  title={`${s.label} — ${(s.share * 100).toFixed(0)}%`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono text-text-dim">
              {slices.map((s) => (
                <span key={s.model} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: s.color }} />
                  {s.label} {(s.share * 100).toFixed(0)}%
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </button>
  )
}
