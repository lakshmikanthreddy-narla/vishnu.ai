import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Declare EdgeRuntime global for Supabase Edge Functions
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { prompt, duration = "5s", aspectRatio = "16:9", appId, action = "create" } = await req.json();

    // Handle status check for existing job
    if (action === "status") {
      const { jobId } = await req.json();
      
      const { data: job, error: jobError } = await supabaseClient
        .from("video_jobs")
        .select("*, media_assets(*)")
        .eq("id", jobId)
        .single();

      if (jobError || !job) {
        return new Response(
          JSON.stringify({ error: "Job not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    console.log("Video generation request:", { prompt: prompt.substring(0, 100), duration, aspectRatio, appId });

    // Create media asset first
    const { data: mediaAsset, error: assetError } = await supabaseClient
      .from("media_assets")
      .insert({
        user_id: user.id,
        app_id: appId || null,
        type: "video",
        source: "generated",
        prompt: prompt,
        provider: "placeholder-provider",
        status: "pending",
        metadata: { duration, aspectRatio },
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

    // Create video job
    const { data: videoJob, error: jobError } = await supabaseClient
      .from("video_jobs")
      .insert({
        media_asset_id: mediaAsset.id,
        status: "pending",
        progress: 0,
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

    console.log("Video job created:", videoJob.id);

    // Note: In a production system, you would integrate with a video generation API
    // like Replicate (with Runway ML), Stability AI, or similar services.
    // For now, we create the job and simulate processing.

    // Simulate async processing with background task
    EdgeRuntime.waitUntil(processVideoJob(supabaseClient, videoJob.id, mediaAsset.id, prompt, duration, aspectRatio, user.id));

    return new Response(
      JSON.stringify({
        success: true,
        jobId: videoJob.id,
        mediaAssetId: mediaAsset.id,
        status: "pending",
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
  userId: string
) {
  try {
    console.log("Starting video processing for job:", jobId);

    // Update to processing
    await supabaseClient
      .from("video_jobs")
      .update({ status: "processing", progress: 10, started_at: new Date().toISOString() })
      .eq("id", jobId);

    await supabaseClient
      .from("media_assets")
      .update({ status: "processing" })
      .eq("id", mediaAssetId);

    // Simulate progress updates
    for (let progress = 20; progress <= 80; progress += 20) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await supabaseClient
        .from("video_jobs")
        .update({ progress })
        .eq("id", jobId);
    }

    // Note: This is a placeholder. In production, you would:
    // 1. Call a video generation API (Replicate, Stability, etc.)
    // 2. Wait for the video to be generated
    // 3. Download and store the video in Supabase Storage
    // 4. Update the media_asset with the file_url

    // For demo purposes, mark as completed with a placeholder
    const placeholderUrl = `https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4`;

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
        file_url: placeholderUrl,
        metadata: { duration, aspectRatio, note: "Demo video - integrate real API for production" },
      })
      .eq("id", mediaAssetId);

    console.log("Video job completed:", jobId);
  } catch (error) {
    console.error("Video processing error:", error);

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
