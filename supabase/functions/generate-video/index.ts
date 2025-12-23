import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Declare EdgeRuntime global for Supabase Edge Functions
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Helper to return JSON responses with CORS headers
function jsonResponse(data: object, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Helper to return error responses
function errorResponse(message: string, status = 500): Response {
  console.error(`Error response (${status}):`, message);
  return jsonResponse({ error: message }, status);
}

// Generate unique job ID from prompt + timestamp + nonce
function generateJobId(prompt: string): string {
  const timestamp = Date.now();
  const nonce = crypto.randomUUID();
  const hash = btoa(`${prompt.substring(0, 50)}-${timestamp}-${nonce}`)
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 16);
  return `${hash}-${nonce.substring(0, 8)}`;
}

// Generate random seed for video generation
function generateRandomSeed(): number {
  return Math.floor(Math.random() * 2147483647);
}

serve(async (req) => {
  // Handle CORS preflight requests - MUST be first
  if (req.method === "OPTIONS") {
    console.log("Handling OPTIONS preflight request");
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    console.log("Generate video request received");

    // Validate environment
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Missing Supabase environment variables");
      return errorResponse("Server configuration error", 500);
    }

    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("Missing authorization header");
      return errorResponse("Authentication required", 401);
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData?.user) {
      console.error("Auth error:", userError?.message || "No user found");
      return errorResponse("Invalid or expired session", 401);
    }

    const user = userData.user;
    console.log("Authenticated user:", user.id);

    // Parse request body
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error("Failed to parse request body:", parseError);
      return errorResponse("Invalid request body", 400);
    }

    const {
      prompt,
      duration = "5s",
      aspectRatio = "16:9",
      appId,
      action = "create",
      jobId: statusJobId,
    } = requestBody;

    console.log("Request params:", { action, prompt: prompt?.substring(0, 50), duration, aspectRatio, appId });

    // Handle status check for existing job
    if (action === "status") {
      if (!statusJobId) {
        return errorResponse("jobId required for status check", 400);
      }

      console.log("Status check for job:", statusJobId);

      const { data: job, error: jobError } = await supabaseClient
        .from("video_jobs")
        .select("*, media_assets(*)")
        .eq("id", statusJobId)
        .maybeSingle();

      if (jobError) {
        console.error("Database error fetching job:", jobError);
        return errorResponse("Failed to fetch job status", 500);
      }

      if (!job) {
        return errorResponse("Job not found", 404);
      }

      // Validate job ownership
      if (job.media_assets?.user_id !== user.id) {
        return errorResponse("Unauthorized", 403);
      }

      return jsonResponse({
        success: true,
        job: {
          id: job.id,
          status: job.status,
          progress: job.progress,
          errorMessage: job.error_message,
          videoUrl: job.media_assets?.file_url,
          prompt: job.media_assets?.prompt,
        },
      });
    }

    // Create new video job
    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return errorResponse("Prompt is required", 400);
    }

    const userPrompt = prompt.trim();
    const uniqueJobId = generateJobId(userPrompt);
    const randomSeed = generateRandomSeed();
    const timestamp = new Date().toISOString();

    // Build provider request payload
    const providerPayload = {
      prompt: userPrompt,
      duration,
      aspectRatio,
      seed: randomSeed,
      timestamp,
      jobId: uniqueJobId,
      cache: false,
    };

    console.log("Creating video job:", {
      jobId: uniqueJobId,
      prompt: userPrompt.substring(0, 100),
      duration,
      aspectRatio,
      seed: randomSeed,
    });

    // Create media asset first
    const { data: mediaAsset, error: assetError } = await supabaseClient
      .from("media_assets")
      .insert({
        user_id: user.id,
        app_id: appId || null,
        type: "video",
        source: "generated",
        prompt: userPrompt,
        provider: "lovable-video",
        status: "pending",
        metadata: {
          duration,
          aspectRatio,
          seed: randomSeed,
          jobId: uniqueJobId,
          providerPayload,
          finalPrompt: userPrompt,
          createdAt: timestamp,
        },
      })
      .select()
      .single();

    if (assetError) {
      console.error("Failed to create media asset:", assetError);
      return errorResponse("Failed to create video job: " + assetError.message, 500);
    }

    console.log("Media asset created:", mediaAsset.id);

    // Create video job
    const { data: videoJob, error: jobError } = await supabaseClient
      .from("video_jobs")
      .insert({
        media_asset_id: mediaAsset.id,
        status: "pending",
        progress: 0,
        provider_job_id: uniqueJobId,
      })
      .select()
      .single();

    if (jobError) {
      console.error("Failed to create video job:", jobError);
      // Clean up media asset
      await supabaseClient.from("media_assets").delete().eq("id", mediaAsset.id);
      return errorResponse("Failed to create video job: " + jobError.message, 500);
    }

    console.log("Video job created:", {
      dbJobId: videoJob.id,
      providerJobId: uniqueJobId,
      mediaAssetId: mediaAsset.id,
    });

    // Process video in background - DO NOT await
    EdgeRuntime.waitUntil(
      processVideoJob(
        supabaseUrl,
        supabaseAnonKey,
        authHeader,
        videoJob.id,
        mediaAsset.id,
        userPrompt,
        duration,
        aspectRatio,
        randomSeed,
        uniqueJobId,
        user.id
      )
    );

    // Return immediately with job info
    return jsonResponse({
      success: true,
      jobId: videoJob.id,
      providerJobId: uniqueJobId,
      mediaAssetId: mediaAsset.id,
      status: "pending",
      prompt: userPrompt,
      seed: randomSeed,
      message: "Video generation job created. Poll for status updates.",
    });
  } catch (error) {
    console.error("Unhandled error in generate-video:", error);
    console.error("Stack:", error instanceof Error ? error.stack : "N/A");
    return errorResponse(
      error instanceof Error ? error.message : "An unexpected error occurred",
      500
    );
  }
});

async function processVideoJob(
  supabaseUrl: string,
  supabaseAnonKey: string,
  authHeader: string,
  jobId: string,
  mediaAssetId: string,
  prompt: string,
  duration: string,
  aspectRatio: string,
  seed: number,
  providerJobId: string,
  userId: string
) {
  // Create a new client for background processing
  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  try {
    console.log("Starting video processing:", {
      jobId,
      providerJobId,
      prompt: prompt.substring(0, 50),
      seed,
    });

    // Update to processing
    const { error: updateError1 } = await supabaseClient
      .from("video_jobs")
      .update({
        status: "processing",
        progress: 10,
        started_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (updateError1) {
      console.error("Failed to update job to processing:", updateError1);
    }

    await supabaseClient
      .from("media_assets")
      .update({ status: "processing" })
      .eq("id", mediaAssetId);

    // Simulate progress updates with unique timing based on seed
    const progressSteps = [20, 40, 60, 80];
    for (const progress of progressSteps) {
      const delay = 2000 + (seed % 500);
      await new Promise((resolve) => setTimeout(resolve, delay));

      await supabaseClient
        .from("video_jobs")
        .update({ progress })
        .eq("id", jobId);

      console.log(`Job ${providerJobId} progress: ${progress}%`);
    }

    // Demo: Select different sample videos based on seed for variety
    const sampleVideos = [
      "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
      "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
      "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
      "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
      "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
    ];

    const videoIndex = seed % sampleVideos.length;
    const videoUrl = sampleVideos[videoIndex];

    // Mark as completed
    await supabaseClient
      .from("video_jobs")
      .update({
        status: "completed",
        progress: 100,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    await supabaseClient
      .from("media_assets")
      .update({
        status: "completed",
        file_url: videoUrl,
        metadata: {
          duration,
          aspectRatio,
          seed,
          jobId: providerJobId,
          prompt,
          completedAt: new Date().toISOString(),
          note: "Demo video - integrate real API for production",
        },
      })
      .eq("id", mediaAssetId);

    console.log("Video job completed:", { jobId, providerJobId, videoUrl });
  } catch (error) {
    console.error("Video processing error:", {
      jobId,
      providerJobId,
      error: error instanceof Error ? error.message : error,
    });

    try {
      await supabaseClient
        .from("video_jobs")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : "Processing failed",
        })
        .eq("id", jobId);

      await supabaseClient
        .from("media_assets")
        .update({ status: "failed" })
        .eq("id", mediaAssetId);
    } catch (updateError) {
      console.error("Failed to update job status to failed:", updateError);
    }
  }
}
