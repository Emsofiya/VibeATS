'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

interface Props {
  data: { stage: string; count: number }[]
  color?: string
}

const DEFAULT_COLOR = '#6366f1'

const STAGE_COLORS: Record<string, string> = {
  'CV Review': '#38bdf8',
  'Interview': '#60a5fa',
  'Technical Assessment': '#818cf8',
  'Culture Assessment': '#a78bfa',
  'Background & Reference Check': '#c084fc',
  'Offer': '#e879f9',
  'Hired': '#34d399',
  'Onboarding': '#10b981',
}

export default function PipelineFunnelChart({ data, color }: Props) {
  if (data.every((d) => d.count === 0)) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-gray-400">
        No data to display
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={data.length * 44 + 20}>
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
        barCategoryGap="30%"
      >
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="stage"
          width={190}
          tick={{ fontSize: 12, fill: '#374151' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: '#f3f4f6' }}
          contentStyle={{
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            fontSize: 12,
            padding: '6px 12px',
          }}
          formatter={(value: number) => [value, 'Candidates']}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {data.map((entry) => (
            <Cell
              key={entry.stage}
              fill={color ?? STAGE_COLORS[entry.stage] ?? DEFAULT_COLOR}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
