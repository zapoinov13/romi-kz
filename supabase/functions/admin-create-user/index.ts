import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // verify caller is admin
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { data: roles } = await userClient.from('user_roles').select('role').eq('user_id', user.id)
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === 'admin')
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { email, password, name, role, modules, cabinets, invite } = body
    if (!email || !name) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const allowedRoles = ['admin', 'marketer', 'director']
    if (role && !allowedRoles.includes(role)) {
      return new Response(JSON.stringify({ error: 'Invalid role' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(supabaseUrl, serviceKey)

    // Derive a redirect that lands the invitee on the app's auth screen so
    // they can set their own password before signing in.
    const origin = req.headers.get('origin') || req.headers.get('referer') || ''
    const redirectTo = origin ? `${origin.replace(/\/$/, '')}/reset-password` : undefined

    let newId: string | null = null

    if (invite || !password) {
      // Send invite email — invitee clicks the link, lands on /reset-password,
      // sets their own password, then signs in.
      const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { name },
        redirectTo,
      })
      if (inviteErr || !invited.user) {
        return new Response(JSON.stringify({ error: inviteErr?.message ?? 'Invite failed' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      newId = invited.user.id
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      })
      if (createErr || !created.user) {
        return new Response(JSON.stringify({ error: createErr?.message ?? 'Create failed' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      newId = created.user.id
    }

    // profile (handle_new_user already inserted base row via trigger)
    await admin.from('profiles').update({
      name,
      display_role: role ?? null,
    }).eq('id', newId)

    // role
    if (role) {
      await admin.from('user_roles').delete().eq('user_id', newId)
      await admin.from('user_roles').insert({ user_id: newId, role })
    }

    // modules
    if (Array.isArray(modules)) {
      await admin.from('team_member_modules').delete().eq('user_id', newId)
      if (modules.length) {
        await admin.from('team_member_modules').insert(
          modules.map((m: string) => ({ user_id: newId, module_key: m })),
        )
      }
    }

    // cabinets access
    if (Array.isArray(cabinets)) {
      await admin.from('team_member_cabinets').delete().eq('user_id', newId)
      if (cabinets.length) {
        await admin.from('team_member_cabinets').insert(
          cabinets.map((c: string) => ({ user_id: newId, cabinet_id: c })),
        )
      }
    }


    return new Response(JSON.stringify({ id: newId, invited: !!invite }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
