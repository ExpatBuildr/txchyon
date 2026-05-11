import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const { request, locals } = context;
  
  try {
    const body = await request.text();
    if (!body) throw new Error("Empty request body");
    const { email, tags, utm_source, utm_medium, custom_fields, segment_id } = JSON.parse(body);
    
    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid email" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // ── Get Credentials (Try multiple sources for Cloudflare/Vercel/Local) ──
    // @ts-ignore
    const runtimeEnv = locals?.runtime?.env || {};
    // @ts-ignore
    const processEnv = typeof process !== 'undefined' ? process.env : {};
    
    const API_KEY = runtimeEnv.BEEHIIV_API_KEY || import.meta.env.BEEHIIV_API_KEY || processEnv.BEEHIIV_API_KEY;
    const PUB_ID = runtimeEnv.BEEHIIV_PUB_ID || import.meta.env.BEEHIIV_PUB_ID || processEnv.BEEHIIV_PUB_ID;

    if (!API_KEY || !PUB_ID) {
      console.error("[subscribe] Beehiiv credentials missing in environment");
      return new Response(JSON.stringify({ 
        ok: false, 
        error: "Server configuration error: credentials missing",
        debug: { 
          has_key: !!API_KEY, 
          has_pub: !!PUB_ID,
          env_source: runtimeEnv.BEEHIIV_API_KEY ? 'runtime' : (import.meta.env.BEEHIIV_API_KEY ? 'meta' : 'none')
        }
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // ── beehiiv v2 API Integration ─────────────────────────────
    const beehiivPayload: any = {
      email,
      send_welcome_email: true,
      utm_source: utm_source || "Txchyon",
      utm_medium: utm_medium || "optin",
      tags: tags || ["website_lead"],
      custom_fields: custom_fields 
        ? Object.entries(custom_fields).map(([name, value]) => ({ name, value }))
        : []
    };

    if (segment_id) beehiivPayload.segment_id = segment_id;

    const beehiivResponse = await fetch(`https://api.beehiiv.com/v2/publications/${PUB_ID}/subscriptions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY.trim()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(beehiivPayload)
    });

    const result = await beehiivResponse.json();

    if (!beehiivResponse.ok) {
      console.error("[subscribe] Beehiiv API reported error:", JSON.stringify(result, null, 2));
      const errorMessage = result.errors?.[0]?.message || result.message || "Beehiiv integration failed";
      
      // Check for already subscribed
      let errorCode = errorMessage;
      if (errorMessage.toLowerCase().includes("already") || errorMessage.toLowerCase().includes("exists")) {
        errorCode = "already_subscribed";
      }
      
      return new Response(JSON.stringify({ 
        ok: false, 
        error: errorCode 
      }), {
        status: beehiivResponse.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    // ── Apply Tags (Beehiiv requires a separate call for tags) ──
    const subscriptionId = result.data?.id;
    if (subscriptionId && tags && tags.length > 0) {
      try {
        const tagResponse = await fetch(`https://api.beehiiv.com/v2/publications/${PUB_ID}/subscriptions/${subscriptionId}/tags`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${API_KEY.trim()}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ tags })
        });
        
        if (!tagResponse.ok) {
          console.warn(`[subscribe] Failed to apply tags to ${email}:`, await tagResponse.text());
        } else {
          console.log(`[subscribe] Successfully applied tags to ${email}:`, tags);
        }
      } catch (tagErr) {
        console.error(`[subscribe] Error applying tags for ${email}:`, tagErr);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("[subscribe] Internal error:", err);
    return new Response(JSON.stringify({ ok: false, error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
