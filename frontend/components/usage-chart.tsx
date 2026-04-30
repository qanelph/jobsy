'use client'

import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { UsagePeriod, UsageSnapshot, UsageSummaryBucket } from '@/types/usage'

const PERIODS: UsagePeriod[] = ['24h', '7d', '30d']

const AGENT_COLORS = [
  '#d4906a', // copper
  '#6ad4a4',
  '#6a9ed4',
  '#d46aac',
  '#d4c66a',
  '#aa6ad4',
  '#6ad4d0',
  '#d46a6a',
]

interface PeriodSwitchProps {
  period: UsagePeriod
  onChange: (p: UsagePeriod) => void
}

function PeriodSwitch({ period, onChange }: PeriodSwitchProps) {
  return (
    <div className="flex items-center gap-1 text-xs font-mono">
      {PERIODS.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-2 py-0.5 rounded transition-colors ${
            p === period
              ? 'bg-active text-text-bright'
              : 'text-text-dim hover:text-text-main'
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  )
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatTickTime(iso: string, period: UsagePeriod): string {
  const d = new Date(iso)
  if (period === '24h') {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface DeltaRow {
  ts: string
  tokens: number
  cache: number
}

// При рестарте агента кумулятивный счётчик может упасть.
// Тогда cur — это уже "с нуля", и его сырое значение и есть дельта за интервал.
function delta(cur: number, prev: number): number {
  return cur >= prev ? cur - prev : Math.max(0, cur)
}

// Дельта существует только между парой snapshots. С одной точкой baseline
// неизвестен — рисуем пусто, иначе абсолюты смешаются с дельтами в stacked.
function snapshotsToDeltas(snaps: UsageSnapshot[]): DeltaRow[] {
  if (snaps.length < 2) return []
  const out: DeltaRow[] = []
  for (let i = 1; i < snaps.length; i++) {
    const prev = snaps[i - 1]
    const cur = snaps[i]
    const tokens = delta(cur.input_tokens, prev.input_tokens)
      + delta(cur.output_tokens, prev.output_tokens)
    const cache = delta(cur.cache_creation_input_tokens, prev.cache_creation_input_tokens)
      + delta(cur.cache_read_input_tokens, prev.cache_read_input_tokens)
    out.push({ ts: cur.taken_at, tokens, cache })
  }
  return out
}

interface SingleProps {
  mode: 'single'
  period: UsagePeriod
  onPeriodChange: (p: UsagePeriod) => void
  snapshots: UsageSnapshot[]
  loading?: boolean
}

interface StackedProps {
  mode: 'stacked'
  period: UsagePeriod
  onPeriodChange: (p: UsagePeriod) => void
  agents: UsageSummaryBucket[]
  loading?: boolean
}

type UsageChartProps = SingleProps | StackedProps

export function UsageChart(props: UsageChartProps) {
  const isSingle = props.mode === 'single'

  if (isSingle) {
    return <SingleAgentChart {...(props as SingleProps)} />
  }
  return <StackedSummaryChart {...(props as StackedProps)} />
}

function ChartShell({
  title,
  period,
  onPeriodChange,
  loading,
  empty,
  children,
}: {
  title: string
  period: UsagePeriod
  onPeriodChange: (p: UsagePeriod) => void
  loading: boolean
  empty: boolean
  children: React.ReactNode
}) {
  return (
    <div className="bg-panel border border-line-faint rounded">
      <div className="flex items-center justify-between px-3 py-2 border-b border-line-faint">
        <span className="text-text-dim text-xs">{title}</span>
        <PeriodSwitch period={period} onChange={onPeriodChange} />
      </div>
      <div className="px-2 py-2 h-48">
        {loading ? (
          <div className="h-full flex items-center justify-center text-text-dim text-xs">загрузка...</div>
        ) : empty ? (
          <div className="h-full flex items-center justify-center text-text-dim text-xs">нет данных за период</div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

function SingleAgentChart({ period, onPeriodChange, snapshots, loading }: SingleProps) {
  const data = useMemo(() => snapshotsToDeltas(snapshots), [snapshots])
  return (
    <ChartShell
      title="токены"
      period={period}
      onPeriodChange={onPeriodChange}
      loading={Boolean(loading)}
      empty={data.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid stroke="#2a2a2a" strokeDasharray="2 4" />
          <XAxis
            dataKey="ts"
            tickFormatter={(v) => formatTickTime(v, period)}
            stroke="#666"
            fontSize={10}
            tick={{ fill: '#888' }}
          />
          <YAxis stroke="#666" fontSize={10} tick={{ fill: '#888' }} tickFormatter={formatNumber} />
          <Tooltip
            contentStyle={{ background: '#161616', border: '1px solid #2a2a2a', fontSize: 11 }}
            labelFormatter={(v) => formatTickTime(String(v), period)}
            formatter={(v) => formatNumber(Number(v) || 0)}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: '#888' }} />
          <Area
            type="monotone"
            dataKey="tokens"
            name="tokens"
            stroke="#d4906a"
            fill="#d4906a"
            fillOpacity={0.25}
          />
          <Area
            type="monotone"
            dataKey="cache"
            name="cache"
            stroke="#6a9ed4"
            fill="#6a9ed4"
            fillOpacity={0.25}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartShell>
  )
}

interface StackedRow {
  ts: string
  [agentName: string]: number | string
}

function StackedSummaryChart({ period, onPeriodChange, agents, loading }: StackedProps) {
  const { rows, names, colors } = useMemo(() => {
    const namesList = agents.map((a) => a.name)
    const colorMap: Record<string, string> = {}
    namesList.forEach((n, i) => { colorMap[n] = AGENT_COLORS[i % AGENT_COLORS.length] })

    const allTimestamps = new Set<string>()
    const deltasByAgent: Record<string, Record<string, number>> = {}
    for (const a of agents) {
      const deltas = snapshotsToDeltas(a.snapshots)
      const map: Record<string, number> = {}
      for (const d of deltas) {
        map[d.ts] = d.tokens + d.cache
        allTimestamps.add(d.ts)
      }
      deltasByAgent[a.name] = map
    }

    const sorted = [...allTimestamps].sort()
    const rowsList: StackedRow[] = sorted.map((ts) => {
      const row: StackedRow = { ts }
      for (const name of namesList) {
        row[name] = deltasByAgent[name][ts] ?? 0
      }
      return row
    })
    return { rows: rowsList, names: namesList, colors: colorMap }
  }, [agents])

  return (
    <ChartShell
      title="суммарный usage по агентам"
      period={period}
      onPeriodChange={onPeriodChange}
      loading={Boolean(loading)}
      empty={rows.length === 0}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <CartesianGrid stroke="#2a2a2a" strokeDasharray="2 4" />
          <XAxis
            dataKey="ts"
            tickFormatter={(v) => formatTickTime(String(v), period)}
            stroke="#666"
            fontSize={10}
            tick={{ fill: '#888' }}
          />
          <YAxis stroke="#666" fontSize={10} tick={{ fill: '#888' }} tickFormatter={formatNumber} />
          <Tooltip
            contentStyle={{ background: '#161616', border: '1px solid #2a2a2a', fontSize: 11 }}
            labelFormatter={(v) => formatTickTime(String(v), period)}
            formatter={(v) => formatNumber(Number(v) || 0)}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: '#888' }} />
          {names.map((name) => (
            <Bar key={name} dataKey={name} stackId="agents" fill={colors[name]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  )
}
