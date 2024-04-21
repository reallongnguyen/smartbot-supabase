// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.5';
import { Client } from 'https://deno.land/x/mqtt@0.1.2/deno/mod.ts'; // Deno (ESM)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    console.log(body);

    if (
      !body ||
      (!body.record && !body.old_record) ||
      (body.record && typeof body.record.device_id !== 'string') ||
      (body.old_record && typeof body.old_record.device_id !== 'string')
    ) {
      throw new Error('invalid body');
    }

    const deviceId = body.record
      ? body.record.device_id
      : body.old_record.device_id;

    // Create a Supabase client with the Auth context of the logged in user.
    const supabaseClient = createClient(
      // Supabase API URL - env var exported by default.
      Deno.env.get('SUPABASE_URL') ?? '',
      // Supabase API ANON KEY - env var exported by default.
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      // Create client with Auth context of the user that called the function.
      // This way your row-level-security (RLS) policies are applied.
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data, error } = await supabaseClient
      .from('schedules')
      .select('schedule, action, is_repeat')
      .eq('device_id', deviceId)
      .or('is_repeat.eq.true, and(is_repeat.eq.false, last_ran_at.is.null)');

    if (error) {
      throw error;
    }

    const schedules = data.map((d) => ({
      schedule: d.schedule,
      action: d.action,
      isRepeat: d.is_repeat,
    }));

    console.log('body', body);

    const client = new Client({ url: 'mqtt://mqtt.dev.isling.me' });

    await client.connect();

    const topic = `system/schedule/${deviceId}`;

    await client.publish(
      topic,
      JSON.stringify({
        schedules,
      }),
      { qos: 2 }
    );

    await client.disconnect();

    // if (['switch', 'bot_switch'].includes(iotDeviceType)) {
    //   const { error } = await supabaseClient
    //     .from('switch_bots')
    //     .update({
    //       state,
    //     })
    //     .eq('id', iotDeviceId);

    //   if (error) {
    //     console.error('update switch bot:', error);

    //     throw error;
    //   }
    // }

    return new Response('ok', {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error(error);

    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/send-schedules-to-device' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
