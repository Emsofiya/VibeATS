import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAction } from '@/lib/audit'
import { PROBATION_SCHEDULE, addDays } from '@/lib/utils'

// POST — create probation checkins for a newly hired candidate
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { candidate_id, start_date } = await request.json()
  if (!candidate_id || !start_date) {
    return NextResponse.json({ error: 'candidate_id and start_date are required' }, { status: 400 })
  }

  // Delete any existing checkins (idempotent re-creation if start date changes)
  await supabase.from('probation_checkins').delete().eq('candidate_id', candidate_id)

  const checkins = PROBATION_SCHEDULE.map(({ day, label }) => ({
    candidate_id,
    day_number: day,
    label,
    due_date:   addDays(start_date, day),
    status:     'Upcoming',
  }))

  const { error } = await supabase.from('probation_checkins').insert(checkins)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAction({
    action:      'probation_created',
    entity_type: 'candidate',
    entity_id:   candidate_id,
    candidate_id,
    metadata:    { start_date },
  })

  return NextResponse.json({ success: true })
}

// PATCH — complete a probation checkin
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { checkin_id, notes } = await request.json()
  if (!checkin_id) return NextResponse.json({ error: 'checkin_id is required' }, { status: 400 })

  const { data: checkin } = await supabase
    .from('probation_checkins')
    .update({
      status:       'Completed',
      notes:        notes ?? null,
      completed_at: new Date().toISOString(),
      completed_by: user.id,
    })
    .eq('id', checkin_id)
    .select()
    .single()

  if (checkin) {
    await logAction({
      action:       'probation_checkin_completed',
      entity_type:  'candidate',
      entity_id:    checkin.candidate_id,
      candidate_id: checkin.candidate_id,
      metadata:     { checkin_label: checkin.label, notes },
    })
  }

  return NextResponse.json({ success: true })
}
