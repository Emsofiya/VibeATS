import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { logAction } from '@/lib/audit'

export async function POST(request: Request) {
  // Verify the caller is an authenticated super_admin
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'super_admin' || !profile?.is_active) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, full_name } = await request.json()
  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const admin = await createAdminClient()

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: full_name ?? '' },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/login`,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  await logAction({
    action:      'user_invited',
    entity_type: 'user',
    metadata:    { invited_email: email, invited_by: user.email },
  })

  return NextResponse.json({ success: true })
}

// Deactivate a user (super admin only)
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single()

  if (callerProfile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { user_id, is_active } = await request.json()
  if (!user_id) {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
  }

  const admin = await createAdminClient()

  // Update auth.users (ban/unban)
  await admin.auth.admin.updateUserById(user_id, {
    ban_duration: is_active ? 'none' : '876600h', // 100 years = effectively banned
  })

  // Update profiles table
  await supabase
    .from('profiles')
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq('id', user_id)

  await logAction({
    action:      is_active ? 'user_activated' : 'user_deactivated',
    entity_type: 'user',
    entity_id:   user_id,
    metadata:    { changed_by: user.email },
  })

  return NextResponse.json({ success: true })
}
