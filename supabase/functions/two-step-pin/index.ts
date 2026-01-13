import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Simple hash function for PIN (SHA-256)
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token to get their identity
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify the user's token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, pin, newPin } = await req.json();

    // Get user's profile
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (profileError) {
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle different actions
    switch (action) {
      case 'enable': {
        // Validate PIN format
        if (!pin || !/^\d{6}$/.test(pin)) {
          return new Response(
            JSON.stringify({ error: 'PIN must be exactly 6 digits' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Hash and store the PIN
        const pinHash = await hashPin(pin);
        
        const { error: updateError } = await supabaseClient
          .from('profiles')
          .update({
            two_step_enabled: true,
            two_step_pin_hash: pinHash,
            pin_attempts: 0,
            pin_locked_until: null,
          })
          .eq('user_id', user.id);

        if (updateError) {
          console.error('Update error:', updateError);
          return new Response(
            JSON.stringify({ error: 'Failed to enable two-step verification' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: 'Two-step verification enabled' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'verify': {
        if (!pin || !/^\d{6}$/.test(pin)) {
          return new Response(
            JSON.stringify({ error: 'PIN must be exactly 6 digits' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if account is locked
        if (profile.pin_locked_until) {
          const lockTime = new Date(profile.pin_locked_until);
          if (lockTime > new Date()) {
            const remainingMinutes = Math.ceil((lockTime.getTime() - Date.now()) / 60000);
            return new Response(
              JSON.stringify({ 
                error: `Account locked. Try again in ${remainingMinutes} minutes.`,
                locked: true 
              }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        // Verify the PIN
        const pinHash = await hashPin(pin);
        const isValid = profile.two_step_pin_hash === pinHash;

        if (!isValid) {
          const newAttempts = (profile.pin_attempts || 0) + 1;
          const updateData: Record<string, unknown> = { pin_attempts: newAttempts };
          
          // Lock after 5 failed attempts for 15 minutes
          if (newAttempts >= 5) {
            const lockUntil = new Date(Date.now() + 15 * 60 * 1000);
            updateData.pin_locked_until = lockUntil.toISOString();
          }

          await supabaseClient
            .from('profiles')
            .update(updateData)
            .eq('user_id', user.id);

          const remainingAttempts = Math.max(0, 5 - newAttempts);
          
          return new Response(
            JSON.stringify({ 
              error: remainingAttempts > 0 
                ? `Incorrect PIN. ${remainingAttempts} attempts remaining.`
                : 'Too many failed attempts. Account locked for 15 minutes.',
              valid: false,
              remainingAttempts,
              locked: newAttempts >= 5
            }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Reset attempts on success
        await supabaseClient
          .from('profiles')
          .update({ pin_attempts: 0, pin_locked_until: null })
          .eq('user_id', user.id);

        return new Response(
          JSON.stringify({ success: true, valid: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'change': {
        // Validate both PINs
        if (!pin || !/^\d{6}$/.test(pin) || !newPin || !/^\d{6}$/.test(newPin)) {
          return new Response(
            JSON.stringify({ error: 'Both current and new PIN must be exactly 6 digits' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify current PIN
        const currentPinHash = await hashPin(pin);
        if (profile.two_step_pin_hash !== currentPinHash) {
          return new Response(
            JSON.stringify({ error: 'Current PIN is incorrect' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Set new PIN
        const newPinHash = await hashPin(newPin);
        const { error: updateError } = await supabaseClient
          .from('profiles')
          .update({ two_step_pin_hash: newPinHash })
          .eq('user_id', user.id);

        if (updateError) {
          return new Response(
            JSON.stringify({ error: 'Failed to change PIN' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: 'PIN changed successfully' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'disable': {
        if (!pin || !/^\d{6}$/.test(pin)) {
          return new Response(
            JSON.stringify({ error: 'PIN must be exactly 6 digits' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Verify PIN before disabling
        const pinHash = await hashPin(pin);
        if (profile.two_step_pin_hash !== pinHash) {
          return new Response(
            JSON.stringify({ error: 'Incorrect PIN' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error: updateError } = await supabaseClient
          .from('profiles')
          .update({
            two_step_enabled: false,
            two_step_pin_hash: null,
            pin_attempts: 0,
            pin_locked_until: null,
          })
          .eq('user_id', user.id);

        if (updateError) {
          return new Response(
            JSON.stringify({ error: 'Failed to disable two-step verification' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: 'Two-step verification disabled' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'status': {
        return new Response(
          JSON.stringify({ 
            enabled: profile.two_step_enabled || false,
            locked: profile.pin_locked_until ? new Date(profile.pin_locked_until) > new Date() : false
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});