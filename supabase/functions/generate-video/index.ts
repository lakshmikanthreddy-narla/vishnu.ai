import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Replicate from "https://esm.sh/replicate@0.25.2";

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

// Generate unique job ID
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
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    console.log("Handling OPTIONS preflight request");
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    console.log("Generate video request received");

    // Validate environment
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const replicateApiKey = Deno.env.get("REPLICATE_API_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Missing Supabase environment variables");
      return errorResponse("Server configuration error", 500);
    }

    if (!replicateApiKey) {
      console.error("Missing REPLICATE_API_KEY");
      return errorResponse("Video generation service not configured", 500);
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

      // If job is processing, check Replicate status
      if (job.status === "processing" && job.provider_job_id) {
        try {
          const replicate = new Replicate({ auth: replicateApiKey });
          const prediction = await replicate.predictions.get(job.provider_job_id);
          
          if (prediction.status === "succeeded" && prediction.output) {
            // Update database with completed video
            const videoUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
            
            await supabaseClient
              .from("video_jobs")
              .update({
                status: "completed",
                progress: 100,
                completed_at: new Date().toISOString(),
              })
              .eq("id", statusJobId);

            await supabaseClient
              .from("media_assets")
              .update({
                status: "completed",
                file_url: videoUrl,
              })
              .eq("id", job.media_asset_id);

            return jsonResponse({
              success: true,
              job: {
                id: job.id,
                status: "completed",
                progress: 100,
                videoUrl: videoUrl,
                prompt: job.media_assets?.prompt,
              },
            });
          } else if (prediction.status === "failed") {
            await supabaseClient
              .from("video_jobs")
              .update({
                status: "failed",
                error_message: prediction.error || "Video generation failed",
              })
              .eq("id", statusJobId);

            await supabaseClient
              .from("media_assets")
              .update({ status: "failed" })
              .eq("id", job.media_asset_id);

            return jsonResponse({
              success: true,
              job: {
                id: job.id,
                status: "failed",
                errorMessage: prediction.error || "Video generation failed",
              },
            });
          } else {
            // Still processing - estimate progress
            const progressMap: Record<string, number> = {
              starting: 10,
              processing: 50,
            };
            const progress = progressMap[prediction.status] || job.progress || 30;

            return jsonResponse({
              success: true,
              job: {
                id: job.id,
                status: "processing",
                progress,
                prompt: job.media_assets?.prompt,
              },
            });
          }
        } catch (replicateError) {
          console.error("Replicate status check error:", replicateError);
          // Return cached status on error
        }
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

    // Map aspect ratio to Replicate format
    const aspectRatioMap: Record<string, string> = {
      "16:9": "16:9",
      "9:16": "9:16",
      "1:1": "1:1",
    };
    const replicateAspectRatio = aspectRatioMap[aspectRatio] || "16:9";

    console.log("Creating video job:", {
      jobId: uniqueJobId,
      prompt: userPrompt.substring(0, 100),
      duration,
      aspectRatio: replicateAspectRatio,
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
        provider: "replicate",
        status: "pending",
        metadata: {
          duration,
          aspectRatio: replicateAspectRatio,
          seed: randomSeed,
          jobId: uniqueJobId,
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

    // Start Replicate prediction
    const replicate = new Replicate({ auth: replicateApiKey });

    let prediction;
    try {
      // Use MiniMax video-01 model for video generation
      prediction = await replicate.predictions.create({
        model: "minimax/video-01",
        input: {
          prompt: userPrompt,
          prompt_optimizer: true,
        },
      });

      console.log("Replicate prediction created:", prediction.id);
    } catch (replicateError) {
      console.error("Replicate API error:", replicateError);
      // Clean up media asset
      await supabaseClient.from("media_assets").delete().eq("id", mediaAsset.id);
      return errorResponse(
        "Failed to start video generation: " + (replicateError instanceof Error ? replicateError.message : "API error"),
        500
      );
    }

    // Create video job with Replicate prediction ID
    const { data: videoJob, error: jobError } = await supabaseClient
      .from("video_jobs")
      .insert({
        media_asset_id: mediaAsset.id,
        status: "processing",
        progress: 10,
        provider_job_id: prediction.id,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (jobError) {
      console.error("Failed to create video job:", jobError);
      // Clean up media asset
      await supabaseClient.from("media_assets").delete().eq("id", mediaAsset.id);
      return errorResponse("Failed to create video job: " + jobError.message, 500);
    }

    // Update media asset status
    await supabaseClient
      .from("media_assets")
      .update({ status: "processing" })
      .eq("id", mediaAsset.id);

    console.log("Video job created:", {
      dbJobId: videoJob.id,
      replicatePredictionId: prediction.id,
      mediaAssetId: mediaAsset.id,
    });

    // Return immediately - frontend will poll for status
    return jsonResponse({
      success: true,
      jobId: videoJob.id,
      providerJobId: prediction.id,
      mediaAssetId: mediaAsset.id,
      status: "processing",
      prompt: userPrompt,
      seed: randomSeed,
      message: "Video generation started. Poll for status updates.",
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
