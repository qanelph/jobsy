'use client'

import { useMemo } from 'react'
import { RefreshCw } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { delta, formatBig, formatCompact } from '@/lib/usage'
import type { UsagePeriod, UsageSnapshot, UsageSummaryBucket } from '@/types/usage'

const PERIODS: UsagePeriod[] = ['24h', '7d', '30d']

const AGENT_COLORS = [
  '#bcb6e6', // sonnet-violet
  '#a3d9c0', // opus-green
  '#e8dab2', // haiku-beige
  '#e8b8c4', // opus-pink
  '#b8c8e8',
  '#d4906a',
  '#aa6ad4',
  '#6ad4d0',
]

// Per-token-type colors (single agent view)
const TYPE_COLORS = {
  input: '#bcb6e6',
  output: '#a3d9c0',
  cache_creation: '#e8dab2',
  cache_read: '#e8b8c4',
}

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

function dayKey(iso: string): string {
  return iso.slice(0, 10) // YYYY-MM-DD
}

function formatDayTick(day: string, period: UsagePeriod): string {
  const d = new Date(day)
  if (period === '24h') {
    return `${String(d.getHours()).padStart(2, '0')}:00`
  }
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

interface TypeDelta {
  ts: string
  input: number
  output: number
  cache_creation: number
  cache_read: number
}

function snapshotsToTypeDeltas(snaps: UsageSnapshot[]): TypeDelta[] {
  if (snaps.length < 2) return []
  const out: TypeDelta[] = []
  for (let i = 1; i < snaps.length; i++) {
    const prev = snaps[i - 1]
    const cur = snaps[i]
    out.push({
      ts: cur.taken_at,
      input: delta(cur.input_tokens, prev.input_tokens),
      output: delta(cur.output_tokens, prev.output_tokens),
      cache_creation: delta(cur.cache_creation_input_tokens, prev.cache_creation_input_tokens),
      cache_read: delta(cur.cache_read_input_tokens, prev.cache_read_input_tokens),
    })
  }
  return out
}

interface DayBucket {
  day: string
  input: number
  output: number
  cache_creation: number
  cache_read: number
}

function bucketByDay(deltas: TypeDelta[]): DayBucket[] {
  const map = new Map<string, DayBucket>()
  for (const d of deltas) {
    const key = dayKey(d.ts)
    const b = map.get(key) ?? {
      day: key,
      input: 0,
      output: 0,
      cache_creation: 0,
      cache_read: 0,
    }
    b.input += d.input
    b.output += d.output
    b.cache_creation += d.cache_creation
    b.cache_read += d.cache_read
    map.set(key, b)
  }
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day))
}

interface StatCardProps {
  label: string
  value: number
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="bg-panel border border-line-faint rounded px-4 py-3">
      <div className="text-text-dim text-xs">{label}</div>
      <div className="text-text-bright font-mono text-lg mt-1">{formatBig(value)}</div>
    </div>
  )
}

interface ChartHeaderProps {
  title: string
  period: UsagePeriod
  onPeriodChange: (p: UsagePeriod) => void
  onRefresh?: () => void
  loading: boolean
}

function ChartHeader({ title, period, onPeriodChange, onRefresh, loading }: ChartHeaderProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-line-faint">
      <span className="text-text-dim text-xs">{title}</span>
      <div className="flex items-center gap-2">
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            title="обновить"
            className="text-text-dim hover:text-text-main disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
        <PeriodSwitch period={period} onChange={onPeriodChange} />
      </div>
    </div>
  )
}

interface SingleProps {
  mode: 'single'
  period: UsagePeriod
  onPeriodChange: (p: UsagePeriod) => void
  onRefresh?: () => void
  snapshots: UsageSnapshot[]
  loading?: boolean
}

interface StackedProps {
  mode: 'stacked'
  period: UsagePeriod
  onPeriodChange: (p: UsagePeriod) => void
  onRefresh?: () => void
  agents: UsageSummaryBucket[]
  loading?: boolean
}

type UsageChartProps = SingleProps | StackedProps

export function UsageChart(props: UsageChartProps) {
  if (props.mode === 'single') return <SingleAgentChart {...props} />
  return <StackedSummaryChart {...props} />
}

const TOOLTIP_STYLE = {
  background: '#161616',
  border: '1px solid #2a2a2a',
  fontSize: 11,
}

function SingleAgentChart({ period, onPeriodChange, onRefresh, snapshots, loading }: SingleProps) {
  const { rows, totals } = useMemo(() => {
    const deltas = snapshotsToTypeDeltas(snapshots)
    const buckets = bucketByDay(deltas)
    const totals = deltas.reduce(
      (acc, d) => ({
        input: acc.input + d.input,
        output: acc.output + d.output,
        cache_creation: acc.cache_creation + d.cache_creation,
        cache_read: acc.cache_read + d.cache_read,
      }),
      { input: 0, output: 0, cache_creation: 0, cache_read: 0 },
    )
    return { rows: buckets, totals }
  }, [snapshots])

  const empty = rows.length === 0

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="total tokens in" value={totals.input} />
        <StatCard label="total tokens out" value={totals.output} />
        <StatCard label="cache write" value={totals.cache_creation} />
        <StatCard label="cache read" value={totals.cache_read} />
      </div>
      <div className="bg-panel border border-line-faint rounded">
        <ChartHeader
          title="token usage"
          period={period}
          onPeriodChange={onPeriodChange}
          onRefresh={onRefresh}
          loading={Boolean(loading)}
        />
        <div className="px-2 py-2 h-72">
          {loading ? (
            <div className="h-full flex items-center justify-center text-text-dim text-xs">загрузка...</div>
          ) : empty ? (
            <div className="h-full flex items-center justify-center text-text-dim text-xs">нет данных за период</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows}>
                <CartesianGrid stroke="#2a2a2a" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={(v) => formatDayTick(String(v), period)}
                  stroke="#666"
                  fontSize={10}
                  tick={{ fill: '#888' }}
                />
                <YAxis stroke="#666" fontSize={10} tick={{ fill: '#888' }} tickFormatter={formatCompact} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(v) => formatDayTick(String(v), period)}
                  formatter={(v) => formatBig(Number(v) || 0)}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#888' }} />
                <Bar dataKey="input" name="input" stackId="t" fill={TYPE_COLORS.input} />
                <Bar dataKey="output" name="output" stackId="t" fill={TYPE_COLORS.output} />
                <Bar dataKey="cache_creation" name="cache write" stackId="t" fill={TYPE_COLORS.cache_creation} />
                <Bar dataKey="cache_read" name="cache read" stackId="t" fill={TYPE_COLORS.cache_read} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}

interface AgentDayRow {
  day: string
  [agentName: string]: number | string
}

function StackedSummaryChart({ period, onPeriodChange, onRefresh, agents, loading }: StackedProps) {
  const { rows, names, colors, totals } = useMemo(() => {
    const namesList = agents.map((a) => a.name)
    const colorMap: Record<string, string> = {}
    namesList.forEach((n, i) => { colorMap[n] = AGENT_COLORS[i % AGENT_COLORS.length] })

    let totalInput = 0
    let totalOutput = 0
    let totalCacheCreation = 0
    let totalCacheRead = 0
    const allDays = new Set<string>()
    const byAgent: Record<string, Record<string, number>> = {}

    for (const a of agents) {
      const deltas = snapshotsToTypeDeltas(a.snapshots)
      for (const d of deltas) {
        totalInput += d.input
        totalOutput += d.output
        totalCacheCreation += d.cache_creation
        totalCacheRead += d.cache_read
      }
      const buckets = bucketByDay(deltas)
      const map: Record<string, number> = {}
      for (const b of buckets) {
        map[b.day] = b.input + b.output + b.cache_creation + b.cache_read
        allDays.add(b.day)
      }
      byAgent[a.name] = map
    }

    const sorted = [...allDays].sort()
    const rowsList: AgentDayRow[] = sorted.map((day) => {
      const row: AgentDayRow = { day }
      for (const name of namesList) {
        row[name] = byAgent[name]?.[day] ?? 0
      }
      return row
    })

    return {
      rows: rowsList,
      names: namesList,
      colors: colorMap,
      totals: {
        input: totalInput,
        output: totalOutput,
        cache_creation: totalCacheCreation,
        cache_read: totalCacheRead,
      },
    }
  }, [agents])

  const empty = rows.length === 0

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="total tokens in" value={totals.input} />
        <StatCard label="total tokens out" value={totals.output} />
        <StatCard label="cache write" value={totals.cache_creation} />
        <StatCard label="cache read" value={totals.cache_read} />
      </div>
      <div className="bg-panel border border-line-faint rounded">
        <ChartHeader
          title="token usage по агентам"
          period={period}
          onPeriodChange={onPeriodChange}
          onRefresh={onRefresh}
          loading={Boolean(loading)}
        />
        <div className="px-2 py-2 h-96">
          {loading ? (
            <div className="h-full flex items-center justify-center text-text-dim text-xs">загрузка...</div>
          ) : empty ? (
            <div className="h-full flex items-center justify-center text-text-dim text-xs">нет данных за период</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows}>
                <CartesianGrid stroke="#2a2a2a" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={(v) => formatDayTick(String(v), period)}
                  stroke="#666"
                  fontSize={10}
                  tick={{ fill: '#888' }}
                />
                <YAxis stroke="#666" fontSize={10} tick={{ fill: '#888' }} tickFormatter={formatCompact} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(v) => formatDayTick(String(v), period)}
                  formatter={(v) => formatBig(Number(v) || 0)}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#888' }} />
                {names.map((name) => (
                  <Bar key={name} dataKey={name} stackId="agents" fill={colors[name]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}
