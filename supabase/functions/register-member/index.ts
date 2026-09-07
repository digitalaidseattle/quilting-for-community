// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4'

interface RegisterMemberRequest {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  roles?: string[];
}

Deno.serve(async (req) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'You must be signed in as an admin to register members.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'You must be signed in as an admin to register members.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userRoles = Array.isArray(user.app_metadata?.roles)
      ? user.app_metadata.roles.map((role) => String(role).toLowerCase())
      : [];

    if (!userRoles.includes('admin')) {
      return new Response(
        JSON.stringify({ error: 'You must be signed in as an admin to register members.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { email, first_name, last_name, phone, roles } = await req.json() as RegisterMemberRequest;

    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email address' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check if email already exists
    const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      console.error('Error listing users:', listError);
      throw listError;
    }

    const emailExists = existingUsers?.users?.some((user) =>
      user.email?.toLowerCase() === email.toLowerCase()
    );

    if (emailExists) {
      return new Response(
        JSON.stringify({ error: 'Email already registered' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create the auth user
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      user_metadata: {
        first_name: first_name || '',
        last_name: last_name || '',
        email,
        roles: roles || [],
      },
      email_confirm: true,
    });

    if (error) {
      console.error('Error creating user:', error);
      return new Response(
        JSON.stringify({ error: `Failed to create user: ${error.message}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!data?.user?.id) {
      console.error('No user ID returned from createUser');
      return new Response(
        JSON.stringify({ error: 'Failed to create user' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Send password reset email
    const resetError = await supabase.auth.admin.sendRawEmail({
      to: email,
      html: `
        <p>Welcome! Click the link below to set your password:</p>
        <a href="${Deno.env.get('SITE_URL')}/auth/callback?token=${data.user.recovery_token}&type=recovery">
          Set Your Password
        </a>
      `,
    });

    if (resetError) {
      console.warn('Warning: could not send password reset email:', resetError);
    }

    // Update profile with additional information
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: data.user.id,
        email,
        name: [first_name, last_name].filter(Boolean).join(' ').trim() || email,
        first_name: first_name || null,
        last_name: last_name || null,
        phone: phone || null,
        roles: roles || [],
      });

    if (profileError) {
      console.error('Error updating profile:', profileError);
      // Don't fail if profile update fails, user was still created
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: data.user.id,
        email: data.user.email,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
