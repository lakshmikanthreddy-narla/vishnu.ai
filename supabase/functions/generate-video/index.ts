import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Declare EdgeRuntime global for Supabase Edge Functions
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate unique job ID from prompt + timestamp + nonce
function generateJobId(prompt: string): string {
  const timestamp = Date.now();
  const nonce = crypto.randomUUID();
  const hash = btoa(`${prompt.substring(0, 50)}-${timestamp}-${nonce}`).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
  return `${hash}-${nonce.substring(0, 8)}`;
}

// Generate random seed for video generation
function generateRandomSeed(): number {
  return Math.floor(Math.random() * 2147483647);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("Missing authorization header");
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      console.error("Auth error:", userError?.message);
      return new Response(
        JSON.stringify({ error: "Invalid or expired session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Authenticated user for video generation:", user.id);

    const requestBody = await req.json();
    const { prompt, duration = "5s", aspectRatio = "16:9", appId, action = "create", jobId: statusJobId } = requestBody;

    // Handle status check for existing job - poll by job_id only
    if (action === "status") {
      if (!statusJobId) {
        return new Response(
          JSON.stringify({ error: "jobId required for status check" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Status check for job:", statusJobId);

      const { data: job, error: jobError } = await supabaseClient
        .from("video_jobs")
        .select("*, media_assets(*)")
        .eq("id", statusJobId)
        .single();

      if (jobError || !job) {
        console.error("Job not found:", statusJobId, jobError);
        return new Response(
          JSON.stringify({ error: "Job not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate job ownership via media_asset
      if (job.media_assets?.user_id !== user.id) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          job: {
            id: job.id,
            status: job.status,
            progress: job.progress,
            errorMessage: job.error_message,
            videoUrl: job.media_assets?.file_url,
            prompt: job.media_assets?.prompt,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create new video job
    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userPrompt = prompt.trim();
    const uniqueJobId = generateJobId(userPrompt);
    const randomSeed = generateRandomSeed();
    const timestamp = new Date().toISOString();

    // Build provider request payload (for future real API integration)
    const providerPayload = {
      prompt: userPrompt,
      duration,
      aspectRatio,
      seed: randomSeed,
      timestamp,
      jobId: uniqueJobId,
      cache: false, // Explicitly disable caching
    };

    console.log("Video generation request:", {
      jobId: uniqueJobId,
      prompt: userPrompt.substring(0, 100),
      duration,
      aspectRatio,
      seed: randomSeed,
      appId,
    });

    // Create media asset first - store all relevant data
    const { data: mediaAsset, error: assetError } = await supabaseClient
      .from("media_assets")
      .insert({
        user_id: user.id,
        app_id: appId || null,
        type: "video",
        source: "generated",
        prompt: userPrompt, // Store original user prompt
        provider: "lovable-video",
        status: "pending",
        metadata: {
          duration,
          aspectRatio,
          seed: randomSeed,
          jobId: uniqueJobId,
          providerPayload, // Store full provider request payload
          finalPrompt: userPrompt, // Store final prompt sent to provider
          createdAt: timestamp,
        },
      })
      .select()
      .single();

    if (assetError) {
      console.error("Failed to create media asset:", assetError);
      return new Response(
        JSON.stringify({ error: "Failed to create video job" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create video job with unique ID
    const { data: videoJob, error: jobError } = await supabaseClient
      .from("video_jobs")
      .insert({
        media_asset_id: mediaAsset.id,
        status: "pending",
        progress: 0,
        provider_job_id: uniqueJobId, // Store unique job ID
      })
      .select()
      .single();

    if (jobError) {
      console.error("Failed to create video job:", jobError);
      return new Response(
        JSON.stringify({ error: "Failed to create video job" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Video job created:", {
      dbJobId: videoJob.id,
      providerJobId: uniqueJobId,
      mediaAssetId: mediaAsset.id,
    });

    // Process video in background
    EdgeRuntime.waitUntil(
      processVideoJob(
        supabaseClient,
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

    return new Response(
      JSON.stringify({
        success: true,
        jobId: videoJob.id,
        providerJobId: uniqueJobId,
        mediaAssetId: mediaAsset.id,
        status: "pending",
        prompt: userPrompt,
        seed: randomSeed,
        message: "Video generation job created. Poll for status updates.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Video generation error:", error instanceof Error ? error.message : error);
    console.error("Stack:", error instanceof Error ? error.stack : "N/A");

    return new Response(
      JSON.stringify({ error: "An error occurred processing your request" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processVideoJob(
  supabaseClient: any,
  jobId: string,
  mediaAssetId: string,
  prompt: string,
  duration: string,
  aspectRatio: string,
  seed: number,
  providerJobId: string,
  userId: string
) {
  try {
    console.log("Starting video processing:", {
      jobId,
      providerJobId,
      prompt: prompt.substring(0, 50),
      seed,
    });

    // Update to processing
    await supabaseClient
      .from("video_jobs")
      .update({
        status: "processing",
        progress: 10,
        started_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    await supabaseClient
      .from("media_assets")
      .update({ status: "processing" })
      .eq("id", mediaAssetId);

    // Simulate progress updates with unique timing based on seed
    const progressSteps = [20, 40, 60, 80];
    for (const progress of progressSteps) {
      // Add slight randomness to timing based on seed
      const delay = 2000 + (seed % 500);
      await new Promise((resolve) => setTimeout(resolve, delay));
      
      await supabaseClient
        .from("video_jobs")
        .update({ progress })
        .eq("id", jobId);

      console.log(`Job ${providerJobId} progress: ${progress}%`);
    }

    // Note: In production, integrate with a real video generation API like:
    // - Replicate (Runway ML, Stability Video)
    // - Stability AI
    // - Luma AI
    // The API call should include the seed and unique providerJobId to ensure unique outputs

    // For demo: Use different sample videos based on seed to simulate variety
    const sampleVideos = [
      "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
      "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
      "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
      "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
      "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
    ];
    
    // Select video based on seed for demo variety
    const videoIndex = seed % sampleVideos.length;
    const videoUrl = sampleVideos[videoIndex];

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

    console.log("Video job completed:", {
      jobId,
      providerJobId,
      videoUrl,
    });
  } catch (error) {
    console.error("Video processing error:", {
      jobId,
      providerJobId,
      error: error instanceof Error ? error.message : error,
    });

    await supabaseClient
      .from("video_jobs")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Unknown error",
      })
      .eq("id", jobId);

    await supabaseClient
      .from("media_assets")
      .update({ status: "failed" })
      .eq("id", mediaAssetId);
  }
}
