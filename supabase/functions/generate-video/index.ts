import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Replicate from "https://esm.sh/replicate@0.25.2";

// Declare EdgeRuntime global for Supabase Edge Functions
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 500, details?: unknown): Response {
  console.error("generate-video error:", { status, message, details });
  return jsonResponse({ error: message }, status);
}

function generateProviderJobId(prompt: string): string {
  // prompt + timestamp + random nonce
  const timestamp = Date.now();
  const nonce = crypto.randomUUID();
  const prefix = prompt.trim().slice(0, 24);
  const hash = btoa(`${prefix}-${timestamp}-${nonce}`)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 16);
  return `${hash}-${timestamp}-${nonce.slice(0, 8)}`;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2147483647);
}

serve(async (req) => {
  // 2) Handle OPTIONS preflight explicitly
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // 1) Wrap ALL logic in try/catch
  try {
    if (req.method !== "POST") {
      return errorResponse("Method not allowed", 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const replicateApiKey = Deno.env.get("REPLICATE_API_KEY") ?? "";

    // ENV validation
    if (!supabaseUrl || !supabaseAnonKey) {
      return errorResponse("Server misconfigured: missing backend keys", 500);
    }
    if (!replicateApiKey) {
      return errorResponse("Server misconfigured: missing REPLICATE_API_KEY", 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse("Authentication required", 401);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return errorResponse("Invalid or expired session", 401, userError?.message);
    }

    let body: any;
    try {
      body = await req.json();
    } catch (e) {
      return errorResponse("Invalid JSON body", 400, e);
    }

    const { action = "create" } = body;

    // Status polling is done by job_id only (db id)
    if (action === "status") {
      const jobId = body.jobId as string | undefined;
      if (!jobId) return errorResponse("jobId required for status", 400);

      const { data: job, error: jobErr } = await supabase
        .from("video_jobs")
        .select("*, media_assets(*)")
        .eq("id", jobId)
        .maybeSingle();

      if (jobErr) return errorResponse("Failed to load job", 500, jobErr);
      if (!job) return errorResponse("Job not found", 404);

      return jsonResponse({
        success: true,
        job: {
          id: job.id,
          status: job.status,
          progress: job.progress,
          errorMessage: job.error_message,
          videoUrl: job.media_assets?.file_url,
          prompt: job.media_assets?.prompt,
          providerJobId: job.provider_job_id,
        },
      });
    }

    // Create a new job
    const prompt = (body.prompt as string | undefined)?.trim();
    const duration = (body.duration as string | undefined) ?? "5s";
    const aspectRatio = (body.aspectRatio as string | undefined) ?? "16:9";
    const appId = (body.appId as string | undefined) ?? null;

    if (!prompt) return errorResponse("Prompt is required", 400);

    const providerJobId = generateProviderJobId(prompt);
    const seed = randomSeed();
    const createdAt = new Date().toISOString();

    // Store per-job: original prompt, final prompt, provider payload, job_id
    const providerRequestPayload = {
      prompt,
      // Model-specific inputs can be adjusted later; keep explicit and unique
      seed,
      aspect_ratio: aspectRatio,
      duration,
      cache: false,
      nonce: providerJobId,
      created_at: createdAt,
    };

    console.log("Queueing video job", {
      providerJobId,
      promptPreview: prompt.slice(0, 120),
      providerRequestPayload,
    });

    const { data: mediaAsset, error: assetError } = await supabase
      .from("media_assets")
      .insert({
        user_id: userData.user.id,
        app_id: appId,
        type: "video",
        source: "generated",
        status: "pending", // QUEUED
        provider: "replicate",
        prompt, // original user prompt
        metadata: {
          job_id: providerJobId,
          original_user_prompt: prompt,
          final_prompt_sent_to_provider: prompt,
          provider_request_payload: providerRequestPayload,
          seed,
          duration,
          aspectRatio,
          created_at: createdAt,
        },
      })
      .select()
      .single();

    if (assetError || !mediaAsset) {
      return errorResponse("Failed to create media asset", 500, assetError);
    }

    const { data: videoJob, error: jobError } = await supabase
      .from("video_jobs")
      .insert({
        media_asset_id: mediaAsset.id,
        status: "pending", // QUEUED
        progress: 0,
        provider_job_id: providerJobId,
      })
      .select()
      .single();

    if (jobError || !videoJob) {
      // Cleanup media asset to avoid orphan
      await supabase.from("media_assets").delete().eq("id", mediaAsset.id);
      return errorResponse("Failed to create video job", 500, jobError);
    }

    // 4) NEVER wait for video generation to complete
    // Trigger provider request asynchronously
    EdgeRuntime.waitUntil(
      startProviderGeneration({
        supabaseUrl,
        supabaseAnonKey,
        authHeader,
        replicateApiKey,
        dbJobId: videoJob.id,
        mediaAssetId: mediaAsset.id,
        providerJobId,
        prompt,
        providerRequestPayload,
      })
    );

    // 5) Immediately return JSON with job_id and status
    return jsonResponse({
      success: true,
      jobId: videoJob.id,
      status: "queued",
      providerJobId,
      mediaAssetId: mediaAsset.id,
    });
  } catch (e) {
    return errorResponse("Unhandled server error", 500, e);
  }
});

async function startProviderGeneration(args: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  authHeader: string;
  replicateApiKey: string;
  dbJobId: string;
  mediaAssetId: string;
  providerJobId: string;
  prompt: string;
  providerRequestPayload: any;
}) {
  const {
    supabaseUrl,
    supabaseAnonKey,
    authHeader,
    replicateApiKey,
    dbJobId,
    mediaAssetId,
    providerJobId,
    prompt,
    providerRequestPayload,
  } = args;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // Always catch errors in background flow
  try {
    console.log("Starting provider generation", { dbJobId, providerJobId });

    await supabase
      .from("video_jobs")
      .update({ status: "processing", progress: 5, started_at: new Date().toISOString() })
      .eq("id", dbJobId);

    await supabase.from("media_assets").update({ status: "processing" }).eq("id", mediaAssetId);

    // Provider call validation
    const endpoint = "https://api.replicate.com/v1/predictions";
    console.log("Provider endpoint:", endpoint);

    const replicate = new Replicate({ auth: replicateApiKey });

    // Log request payload (excluding secrets)
    console.log("Replicate request payload:", {
      model: "minimax/video-01",
      input: providerRequestPayload,
    });

    let prediction: any;
    try {
      prediction = await replicate.predictions.create({
        model: "minimax/video-01",
        input: {
          prompt,
          // Ensure request differs for every prompt/job
          seed: providerRequestPayload.seed,
          // Some models ignore these; keep them for uniqueness and future compatibility
          aspect_ratio: providerRequestPayload.aspect_ratio,
          cache: false,
        },
      });

      console.log("Replicate create response:", {
        id: prediction?.id,
        status: prediction?.status,
      });
    } catch (e) {
      console.error("Replicate create failed:", e);
      await supabase
        .from("video_jobs")
        .update({ status: "failed", error_message: e instanceof Error ? e.message : "Provider error" })
        .eq("id", dbJobId);
      await supabase.from("media_assets").update({ status: "failed" }).eq("id", mediaAssetId);
      return;
    }

    // Store provider response id
    await supabase
      .from("media_assets")
      .update({
        metadata: {
          ...(providerRequestPayload ? { provider_request_payload: providerRequestPayload } : {}),
          provider_prediction_id: prediction.id,
          provider_job_id: providerJobId,
        },
      })
      .eq("id", mediaAssetId);

    // Poll provider until completion in background (does not block HTTP response)
    const started = Date.now();
    const timeoutMs = 10 * 60 * 1000;

    while (Date.now() - started < timeoutMs) {
      const p = await replicate.predictions.get(prediction.id);
      console.log("Replicate status:", { id: prediction.id, status: p.status });

      if (p.status === "succeeded") {
        const videoUrl = Array.isArray(p.output) ? p.output[0] : p.output;

        await supabase
          .from("video_jobs")
          .update({ status: "completed", progress: 100, completed_at: new Date().toISOString() })
          .eq("id", dbJobId);

        await supabase
          .from("media_assets")
          .update({ status: "completed", file_url: videoUrl })
          .eq("id", mediaAssetId);

        console.log("Video job completed", { dbJobId, providerJobId, videoUrl });
        return;
      }

      if (p.status === "failed" || p.status === "canceled") {
        const msg = p.error || `Provider ${p.status}`;
        await supabase
          .from("video_jobs")
          .update({ status: "failed", error_message: msg })
          .eq("id", dbJobId);
        await supabase.from("media_assets").update({ status: "failed" }).eq("id", mediaAssetId);

        console.log("Video job failed", { dbJobId, providerJobId, msg });
        return;
      }

      // update rough progress
      await supabase
        .from("video_jobs")
        .update({ progress: 10 + Math.min(80, Math.floor((Date.now() - started) / 3000) * 5) })
        .eq("id", dbJobId);

      await new Promise((r) => setTimeout(r, 3000));
    }

    await supabase
      .from("video_jobs")
      .update({ status: "failed", error_message: "Provider timed out" })
      .eq("id", dbJobId);
    await supabase.from("media_assets").update({ status: "failed" }).eq("id", mediaAssetId);

    console.log("Video job timed out", { dbJobId, providerJobId });
  } catch (e) {
    console.error("Background processing crashed:", e);
    try {
      await supabase
        .from("video_jobs")
        .update({ status: "failed", error_message: e instanceof Error ? e.message : "Unknown error" })
        .eq("id", dbJobId);
      await supabase.from("media_assets").update({ status: "failed" }).eq("id", mediaAssetId);
    } catch (e2) {
      console.error("Failed to mark job failed:", e2);
    }
  }
}
