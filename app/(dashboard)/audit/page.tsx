import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AuditLog from '@/components/audit/AuditLog'
import type { AuditLog as AuditLogType } from '@/types'

export const dynamic = 'force-dynamic'

export default async function AuditPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  // Super admins see all logs; regular users see only their own
  const query = supabase
    .from('audit_logs')
    .select('*, profiles(email, full_name), jobs(title), candidates(name)')
    .order('created_at', { ascending: false })
    .limit(500)

  const { data: logs } = profile?.role === 'super_admin'
    ? await query
    : await query.eq('performed_by', user.id)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Audit Trail</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {profile?.role === 'super_admin'
            ? 'All system activity (super admin view)'
            : 'Your activity log'}
        </p>
      </div>

      <div className="card p-5">
        <AuditLog
          logs={(logs ?? []) as AuditLogType[]}
          showExport={profile?.role === 'super_admin'}
          emptyMessage="No activity recorded yet."
        />
      </div>
    </div>
  )
}
