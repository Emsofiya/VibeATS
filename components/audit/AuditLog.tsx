'use client'

import { formatDateTime } from '@/lib/utils'
import { exportAuditToCSV } from '@/lib/utils'
import { Download } from 'lucide-react'
import type { AuditLog as AuditLogType } from '@/types'

interface Props {
  logs: AuditLogType[]
  showExport?: boolean
  emptyMessage?: string
}

const ACTION_LABELS: Record<string, string> = {
  cv_screened:       'CV Screened',
  cv_uploaded:       'CV Uploaded',
  status_changed:    'Status Changed',
  rejection_email:   'Rejection Email Triggered',
  job_created:       'Job Created',
  job_updated:       'Job Updated',
  job_deleted:       'Job Deleted',
  candidate_deleted: 'Candidate Deleted',
  candidate_viewed:  'Candidate Viewed',
  user_invited:      'User Invited',
  user_activated:    'User Activated',
  user_deactivated:  'User Deactivated',
  template_updated:  'Template Updated',
  notes_updated:     'Notes Updated',
}

export default function AuditLog({ logs, showExport = false, emptyMessage }: Props) {
  function handleExport() {
    const rows = logs.map((l) => ({
      timestamp:   l.created_at,
      action:      l.action,
      entity_type: l.entity_type,
      entity_id:   l.entity_id ?? '',
      performed_by: l.profiles?.email ?? l.performed_by ?? '',
      metadata:    JSON.stringify(l.metadata ?? {}),
    }))
    exportAuditToCSV(rows, 'audit-log.csv')
  }

  return (
    <div>
      {showExport && logs.length > 0 && (
        <div className="flex justify-end mb-3">
          <button onClick={handleExport} className="btn-secondary text-xs gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      )}

      {logs.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">
          {emptyMessage ?? 'No activity recorded yet.'}
        </p>
      ) : (
        <div className="divide-y divide-gray-100">
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-3 py-3 px-1">
              <div className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-brand-500 mt-2" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800">
                  <span className="font-medium">
                    {ACTION_LABELS[log.action] ?? log.action.replace(/_/g, ' ')}
                  </span>
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <span className="text-gray-500">
                      {' — '}
                      {Object.entries(log.metadata)
                        .filter(([k]) => !['job_id', 'candidate_id'].includes(k))
                        .map(([k, v]) => `${k}: ${String(v)}`)
                        .join(', ')}
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {log.profiles?.email ?? 'System'} · {formatDateTime(log.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
