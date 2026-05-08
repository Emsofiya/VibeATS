'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  stageColor, outcomeColor, scoreColor,
  isTerminalOutcome, formatDate, exportCandidatesToCSV,
} from '@/lib/utils'
import { Download, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import type { Candidate } from '@/types'

interface Props {
  candidates: Candidate[]
  jobId: string
}

type FilterTab = 'All' | 'Second Review' | 'Potential Fit' | 'Active' | 'Dropped' | 'Hired'
type SortKey  = 'name' | 'ai_score' | 'created_at'
type SortDir  = 'asc' | 'desc'

const FILTER_TABS: FilterTab[] = ['All', 'Second Review', 'Potential Fit', 'Active', 'Dropped', 'Hired']

export default function CandidateTable({ candidates, jobId }: Props) {
  const [filter, setFilter]     = useState<FilterTab>('All')
  const [sortKey, setSortKey]   = useState<SortKey>('created_at')
  const [sortDir, setSortDir]   = useState<SortDir>('desc')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const filtered = candidates.filter((c) => {
    switch (filter) {
      case 'All':           return true
      case 'Active':        return !isTerminalOutcome(c.outcome)
      case 'Second Review': return c.outcome === 'Second Review'
      case 'Potential Fit': return c.outcome === 'Potential Fit'
      case 'Dropped':       return c.outcome === 'Dropped'
      case 'Hired':         return c.outcome === 'Hired'
      default:              return true
    }
  })

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'name')       cmp = a.name.localeCompare(b.name)
    if (sortKey === 'ai_score')   cmp = (a.ai_score ?? -1) - (b.ai_score ?? -1)
    if (sortKey === 'created_at') cmp = a.created_at.localeCompare(b.created_at)
    return sortDir === 'asc' ? cmp : -cmp
  })

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="h-3.5 w-3.5 text-gray-300" />
    return sortDir === 'asc'
      ? <ChevronUp className="h-3.5 w-3.5 text-brand-500" />
      : <ChevronDown className="h-3.5 w-3.5 text-brand-500" />
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === sorted.length ? new Set() : new Set(sorted.map((c) => c.id)),
    )
  }

  function handleExport() {
    const toExport = selected.size > 0
      ? candidates.filter((c) => selected.has(c.id))
      : filtered
    exportCandidatesToCSV(toExport, 'shortlist.csv')
  }

  // ── Summary stats ─────────────────────────────────────────────────────────────
  const all            = candidates
  const secondReview   = all.filter((c) => c.outcome === 'Second Review').length
  const potentialFit   = all.filter((c) => c.outcome === 'Potential Fit').length
  const active         = all.filter((c) => !isTerminalOutcome(c.outcome)).length
  const dropped        = all.filter((c) => c.outcome === 'Dropped').length
  const scored         = all.filter((c) => c.ai_score != null)
  const avgScore       = scored.length > 0
    ? Math.round(scored.reduce((s, c) => s + (c.ai_score ?? 0), 0) / scored.length)
    : null

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {[
          { label: 'Total',         value: all.length,    cls: 'bg-gray-50' },
          { label: 'Second Review', value: secondReview,  cls: 'bg-green-50' },
          { label: 'Potential Fit', value: potentialFit,  cls: 'bg-yellow-50' },
          { label: 'Active',        value: active,        cls: 'bg-brand-50' },
          { label: 'Dropped',       value: dropped,       cls: 'bg-red-50' },
          { label: 'Avg Score',     value: avgScore ?? '—', cls: 'bg-indigo-50' },
        ].map(({ label, value, cls }) => (
          <div
            key={label}
            className={`rounded-lg border border-gray-200 ${cls} px-3 py-3 text-center`}
          >
            <p className="text-xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === tab
                  ? 'bg-brand-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <button
          onClick={handleExport}
          className="btn-secondary text-xs gap-1.5"
          title={selected.size > 0 ? `Export ${selected.size} selected` : 'Export all filtered'}
        >
          <Download className="h-3.5 w-3.5" />
          {selected.size > 0 ? `Export (${selected.size})` : 'Export CSV'}
        </button>
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">
          No candidates match this filter.
        </p>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="w-10 py-3 pl-4 pr-2">
                    <input
                      type="checkbox"
                      checked={selected.size === sorted.length && sorted.length > 0}
                      onChange={toggleAll}
                      className="h-3.5 w-3.5 rounded border-gray-300"
                    />
                  </th>
                  <th
                    className="px-3 py-3 text-left font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700"
                    onClick={() => toggleSort('name')}
                  >
                    <div className="flex items-center gap-1">
                      Name <SortIcon col="name" />
                    </div>
                  </th>
                  <th
                    className="px-3 py-3 text-left font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700"
                    onClick={() => toggleSort('ai_score')}
                  >
                    <div className="flex items-center gap-1">
                      Score <SortIcon col="ai_score" />
                    </div>
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500">Stage</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500">Outcome</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-500">Uploaded by</th>
                  <th
                    className="px-3 py-3 text-left font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700"
                    onClick={() => toggleSort('created_at')}
                  >
                    <div className="flex items-center gap-1">
                      Date <SortIcon col="created_at" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 pl-4 pr-2">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        className="h-3.5 w-3.5 rounded border-gray-300"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/jobs/${jobId}/candidates/${c.id}`}
                        className="font-medium text-gray-900 hover:text-brand-600"
                      >
                        {c.name}
                      </Link>
                      {c.email && <p className="text-xs text-gray-400">{c.email}</p>}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`tabular-nums text-base ${scoreColor(c.ai_score)}`}>
                        {c.ai_score ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`badge ${stageColor(c.stage)}`}>{c.stage}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`badge ${outcomeColor(c.outcome)}`}>{c.outcome}</span>
                    </td>
                    <td className="px-3 py-3 text-gray-500 text-xs">
                      {c.profiles?.email ?? '—'}
                    </td>
                    <td className="px-3 py-3 text-gray-400 text-xs">
                      {formatDate(c.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
