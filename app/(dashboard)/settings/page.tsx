'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Loader2, UserPlus, UserX, UserCheck, Save, AlertCircle, CheckCircle } from 'lucide-react'
import type { Profile, RejectionTemplate } from '@/types'

export default function SettingsPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [users, setUsers]           = useState<Profile[]>([])
  const [templates, setTemplates]   = useState<RejectionTemplate[]>([])

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName]   = useState('')
  const [inviting, setInviting]       = useState(false)
  const [inviteMsg, setInviteMsg]     = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Template edit state
  const [editingTemplate, setEditingTemplate] = useState<RejectionTemplate | null>(null)
  const [savingTemplate, setSavingTemplate]   = useState(false)
  const [templateMsg, setTemplateMsg]         = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'super_admin') {
      router.push('/jobs')
      return
    }
    setIsSuperAdmin(true)

    const [{ data: u }, { data: t }] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at'),
      supabase.from('rejection_templates').select('*').order('template_type'),
    ])
    setUsers((u ?? []) as Profile[])
    setTemplates((t ?? []) as RejectionTemplate[])
    if (t?.length) setEditingTemplate(t[0] as RejectionTemplate)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function inviteUser(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true)
    setInviteMsg(null)
    const res = await fetch('/api/invite-user', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: inviteEmail, full_name: inviteName }),
    })
    const json = await res.json()
    if (res.ok) {
      setInviteMsg({ type: 'success', text: `Invitation sent to ${inviteEmail}` })
      setInviteEmail('')
      setInviteName('')
      fetchData()
    } else {
      setInviteMsg({ type: 'error', text: json.error ?? 'Failed to invite user' })
    }
    setInviting(false)
  }

  async function toggleUser(user: Profile) {
    const res = await fetch('/api/invite-user', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ user_id: user.id, is_active: !user.is_active }),
    })
    if (res.ok) fetchData()
  }

  async function saveTemplate() {
    if (!editingTemplate) return
    setSavingTemplate(true)
    setTemplateMsg(null)
    const { error } = await supabase
      .from('rejection_templates')
      .update({
        name:    editingTemplate.name,
        subject: editingTemplate.subject,
        body:    editingTemplate.body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingTemplate.id)

    if (error) {
      setTemplateMsg({ type: 'error', text: error.message })
    } else {
      setTemplateMsg({ type: 'success', text: 'Template saved.' })
      fetchData()
    }
    setSavingTemplate(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    )
  }

  if (!isSuperAdmin) return null

  return (
    <div className="space-y-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* ── User Management ── */}
      <div className="card p-6 space-y-5">
        <h2 className="text-base font-semibold text-gray-800">User Management</h2>

        {/* Invite form */}
        <form onSubmit={inviteUser} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Full Name</label>
              <input
                className="input"
                placeholder="Jane Doe"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Email *</label>
              <input
                className="input"
                type="email"
                required
                placeholder="jane@agency.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
          </div>

          {inviteMsg && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              inviteMsg.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}>
              {inviteMsg.type === 'success'
                ? <CheckCircle className="h-4 w-4 flex-shrink-0" />
                : <AlertCircle className="h-4 w-4 flex-shrink-0" />
              }
              {inviteMsg.text}
            </div>
          )}

          <button type="submit" disabled={inviting} className="btn-primary">
            {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {inviting ? 'Sending invite…' : 'Send Invite'}
          </button>
        </form>

        {/* User table */}
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-2.5 text-left font-medium text-gray-500">User</th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-500">Role</th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{u.full_name || '—'}</p>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-600">
                    {u.role.replace('_', ' ')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${u.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.role !== 'super_admin' && (
                      <button
                        onClick={() => toggleUser(u)}
                        className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border font-medium transition-colors ${
                          u.is_active
                            ? 'border-red-200 text-red-600 hover:bg-red-50'
                            : 'border-green-200 text-green-700 hover:bg-green-50'
                        }`}
                      >
                        {u.is_active
                          ? <><UserX className="h-3 w-3" /> Deactivate</>
                          : <><UserCheck className="h-3 w-3" /> Activate</>
                        }
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Rejection Templates ── */}
      <div className="card p-6 space-y-5">
        <h2 className="text-base font-semibold text-gray-800">Rejection Email Templates</h2>

        {/* Template selector */}
        <div className="flex gap-2">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => setEditingTemplate(t)}
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                editingTemplate?.id === t.id
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>

        {editingTemplate && (
          <div className="space-y-4">
            <div>
              <label className="label">Template Name</label>
              <input
                className="input"
                value={editingTemplate.name}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Email Subject</label>
              <input
                className="input"
                value={editingTemplate.subject}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
              />
            </div>
            <div>
              <label className="label">
                Email Body
                <span className="ml-2 font-normal text-gray-400">
                  Variables: {'{{candidate_name}}'} {'{{job_title}}'} {'{{client_name}}'} {'{{agency_name}}'}
                </span>
              </label>
              <textarea
                className="input resize-none"
                rows={10}
                value={editingTemplate.body}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
              />
            </div>

            {templateMsg && (
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                templateMsg.type === 'success'
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}>
                {templateMsg.type === 'success'
                  ? <CheckCircle className="h-4 w-4 flex-shrink-0" />
                  : <AlertCircle className="h-4 w-4 flex-shrink-0" />
                }
                {templateMsg.text}
              </div>
            )}

            <button onClick={saveTemplate} disabled={savingTemplate} className="btn-primary">
              {savingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {savingTemplate ? 'Saving…' : 'Save Template'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
