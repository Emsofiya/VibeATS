import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAction } from '@/lib/audit'
import { scoreToOutcome } from '@/lib/utils'
import type { AIReport, ScreenCVRequest } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are an expert talent acquisition specialist for a boutique agency.
Analyse CVs against job descriptions with precision, objectivity, and depth.
Always respond with a single valid JSON object and nothing else — no markdown fences, no explanation.`

const USER_PROMPT = (jd: string, cv: string) => `
Analyse the following CV against the Job Description. Return ONLY a JSON object matching this exact schema:

{
  "candidate_name": "string — extracted from CV, or 'Unknown'",
  "candidate_email": "string or null — extracted from CV",
  "scores": {
    "experience_fit": <integer 0–20>,
    "skills_competencies": <integer 0–25>,
    "jd_context_fit": <integer 0–20>,
    "achievements_impact": <integer 0–25>,
    "values_mindset": <integer 0–10>
  },
  "total_score": <integer 0–100, must equal sum of all five scores>,
  "rationale": {
    "experience_fit": "Specific reasoning for this dimension",
    "skills_competencies": "Specific reasoning for this dimension",
    "jd_context_fit": "Specific reasoning for this dimension",
    "achievements_impact": "Specific reasoning for this dimension",
    "values_mindset": "Specific reasoning for this dimension"
  },
  "red_flags": ["Array of specific concerns, or empty array if none"],
  "overall_recommendation": "One paragraph summarising suitability for this role",
  "candidate_facing_rationale": "Professional, neutral rationale suitable for an NDPA subject access request. No internal opinions, scoring, or speculative language.",
  "internal_notes": "Frank, direct assessment for the recruiting team only. Be specific about gaps and risks.",
  "skills_tags": ["Array of 3–8 short skill/competency tags extracted from the CV, e.g. 'B2B Sales', 'P&L Management', 'Team Leadership'"]
}

Scoring rubric:
- experience_fit (0–20): Years, seniority, industry relevance
- skills_competencies (0–25): Technical and functional skills match
- jd_context_fit (0–20): How well they match the specific role context, sector, and client type
- achievements_impact (0–25): Measurable results, promotions, clear impact
- values_mindset (0–10): Cultural signals, growth mindset, adaptability

AUTO OUTCOME (applied by system — do not include in JSON):
  total_score ≥ 75 → Second Review
  total_score 50–74 → Potential Fit
  total_score < 50 → Dropped

━━━━━━━━━━━━━━━━━━━━━━━
JOB DESCRIPTION:
${jd}

━━━━━━━━━━━━━━━━━━━━━━━
CANDIDATE CV:
${cv}
`

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body: ScreenCVRequest = await request.json()
  const { jd_text, cv_text, job_id, candidate_id } = body

  if (!jd_text?.trim() || !cv_text?.trim()) {
    return NextResponse.json({ error: 'Missing jd_text or cv_text' }, { status: 400 })
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: USER_PROMPT(jd_text, cv_text) }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const report: AIReport = JSON.parse(cleaned)

    // Recalculate total to guard against model arithmetic errors
    const total =
      report.scores.experience_fit +
      report.scores.skills_competencies +
      report.scores.jd_context_fit +
      report.scores.achievements_impact +
      report.scores.values_mindset
    report.total_score = total

    if (!Array.isArray(report.skills_tags)) report.skills_tags = []

    const outcome = scoreToOutcome(total)
    const stage   = 'CV Review'

    if (candidate_id) {
      await supabase
        .from('candidates')
        .update({
          ai_report:  report,
          ai_score:   total,
          stage,
          outcome,
          name:       report.candidate_name || undefined,
          email:      report.candidate_email || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', candidate_id)
    }

    await logAction({
      action:      'cv_screened',
      entity_type: 'candidate',
      entity_id:   candidate_id,
      job_id,
      candidate_id,
      metadata:    { score: total, outcome, candidate_name: report.candidate_name },
    })

    return NextResponse.json({ report, outcome, stage })
  } catch (err) {
    console.error('Screen CV error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Screening failed' },
      { status: 500 },
    )
  }
}
