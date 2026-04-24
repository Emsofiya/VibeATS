# VibeATS — Deployment Guide

Follow these steps in order. No prior coding experience needed — every step has exact instructions.

---

## Step 1 — Install Node.js (if not already installed)

Download Node.js 20 LTS from https://nodejs.org  
After installing, open a terminal and confirm: `node -v` (should show v20.x)

---

## Step 2 — Set up your Supabase project

1. Go to https://supabase.com → **New project**
2. Give it a name (e.g. "vibeats"), choose a region, set a database password → **Create project**
3. Wait ~1 min for the project to initialise
4. Go to **SQL Editor** (left sidebar) → **New query**
5. Copy the entire contents of `supabase/schema.sql` and paste it → **Run**
   - You should see "Success. No rows returned"

### Create Storage Buckets

6. Go to **Storage** (left sidebar) → **New bucket**
   - Name: `jd-files` | Public: OFF → Create
   - Name: `cv-files` | Public: OFF → Create

7. For **each bucket**, go to its **Policies** tab and add:
   - **INSERT policy**: Name it `allow_auth_insert` | Allowed operation: INSERT | Policy: `(auth.role() = 'authenticated')`
   - **SELECT policy**: Name it `allow_auth_select` | Allowed operation: SELECT | Policy: `(auth.role() = 'authenticated')`

### Get your API keys

8. Go to **Settings → API** and copy:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **anon / public key**
   - **service_role key** (click "Reveal" — keep this secret)

### Create your super admin account

9. Go to **Authentication → Users** → **Invite user**
10. Enter your email address and send the invite
11. Check your email and set your password via the link
12. Now promote yourself to super_admin:
    - In **SQL Editor**, run:
      ```sql
      UPDATE profiles SET role = 'super_admin' WHERE email = 'your@email.com';
      ```

---

## Step 3 — Configure your Anthropic API key

1. Go to https://console.anthropic.com → **API Keys** → **Create Key**
2. Copy the key (starts with `sk-ant-`)
3. Keep it safe — you'll add it as an environment variable in Vercel

---

## Step 4 — Prepare the project locally

1. Open a terminal in the `VibeATS` folder
2. Copy the example environment file:
   ```
   cp .env.local.example .env.local
   ```
3. Open `.env.local` in any text editor and fill in your values:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ANTHROPIC_API_KEY=sk-ant-...
   SUPER_ADMIN_EMAIL=your@email.com
   NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app   ← update after Vercel deployment
   ```
4. Install dependencies:
   ```
   npm install
   ```
5. Test locally:
   ```
   npm run dev
   ```
   Open http://localhost:3000 — you should see the login page.

---

## Step 5 — Deploy to Vercel

### Option A — Via GitHub (recommended)

1. Push this project to a private GitHub repository
2. Go to https://vercel.com → **New Project** → Import your repo
3. Framework Preset will auto-detect **Next.js**
4. Click **Environment Variables** and add **each** variable from your `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ANTHROPIC_API_KEY`
   - `SUPER_ADMIN_EMAIL`
   - `NEXT_PUBLIC_SITE_URL` → set this to your Vercel URL (e.g. `https://vibeats.vercel.app`)
5. Click **Deploy**

### Option B — Via Vercel CLI

```bash
npm install -g vercel
vercel login
vercel --prod
```

Follow the prompts and add environment variables when asked.

---

## Step 6 — Update Supabase auth settings

1. In Supabase → **Authentication → URL Configuration**
2. Set **Site URL** to your Vercel URL
3. Add `https://your-app.vercel.app/**` to **Redirect URLs**

---

## Step 7 — Final test

1. Open your Vercel URL
2. Log in with the super admin email/password you set in Step 2
3. Go to **Settings** and invite a second user
4. Create a Job, upload a JD, check NDPA consent, then upload a CV
5. Watch the AI screening happen — results appear in the candidate table

---

## Updating the app in future

Any time you push to GitHub, Vercel automatically redeploys. No manual steps needed.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Invalid login credentials" | Check the user exists in Supabase → Authentication → Users |
| CV parsing returns empty text | The PDF is likely a scanned image. Use a text-based PDF or Word file |
| "Screening API failed" | Check `ANTHROPIC_API_KEY` is set correctly in Vercel env vars |
| Storage upload fails | Confirm both buckets exist and policies are set (Step 2) |
| Super admin can't see Settings | Run the `UPDATE profiles SET role = 'super_admin'...` SQL from Step 2 |
