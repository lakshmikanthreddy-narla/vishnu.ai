import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Prompt validation constants
const MAX_PROMPT_LENGTH = 2000;
const VALID_SIZES = ["256x256", "512x512", "1024x1024", "1792x1024", "1024x1792"];
const VALID_STYLES = ["vivid", "natural", "photorealistic", "artistic", "anime", "3d-render"];

// Validate and sanitize image generation prompt
function validateImagePrompt(prompt: unknown): { valid: boolean; error?: string; sanitized?: string } {
  if (prompt === undefined || prompt === null) {
    return { valid: false, error: "Prompt is required" };
  }

  if (typeof prompt !== "string") {
    return { valid: false, error: "Prompt must be a string" };
  }

  const trimmed = prompt.trim();
  
  if (trimmed.length === 0) {
    return { valid: false, error: "Prompt cannot be empty" };
  }

  if (trimmed.length > MAX_PROMPT_LENGTH) {
    return { valid: false, error: `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters` };
  }

  // Remove null bytes and control characters
  const sanitized = trimmed
    .replace(/\x00/g, "")
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  return { valid: true, sanitized };
}

// Validate size parameter
function validateSize(size: unknown): string {
  if (!size || typeof size !== "string") {
    return "1024x1024";
  }
  return VALID_SIZES.includes(size) ? size : "1024x1024";
}

// Validate style parameter
function validateStyle(style: unknown): string | undefined {
  if (!style || typeof style !== "string") {
    return undefined;
  }
  return VALID_STYLES.includes(style.toLowerCase()) ? style : undefined;
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

    console.log("Authenticated user for image generation:", user.id);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Service configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { prompt, size, style, appId } = await req.json();

    // Validate and sanitize prompt
    const promptValidation = validateImagePrompt(prompt);
    if (!promptValidation.valid) {
      console.warn("Prompt validation failed:", promptValidation.error);
      return new Response(
        JSON.stringify({ error: promptValidation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sanitizedPrompt = promptValidation.sanitized!;
    
    // Validate size and style parameters
    const validatedSize = validateSize(size);
    const validatedStyle = validateStyle(style);

    // Validate appId if provided
    const validatedAppId = appId && typeof appId === "string" && appId.length <= 100 ? appId : null;

    console.log("Image generation request:", { 
      promptLength: sanitizedPrompt.length, 
      size: validatedSize, 
      style: validatedStyle, 
      appId: validatedAppId 
    });

    // Build enhanced prompt with validated style
    const enhancedPrompt = validatedStyle ? `${sanitizedPrompt}. Style: ${validatedStyle}` : sanitizedPrompt;

    // Use Lovable AI Gateway with image generation model
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        messages: [
          {
            role: "user",
            content: enhancedPrompt,
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Lovable AI error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Failed to generate image" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("Image generation response received");

    // Extract image from response
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    const textContent = data.choices?.[0]?.message?.content || "";

    if (!imageUrl) {
      console.error("No image in response:", JSON.stringify(data).substring(0, 500));
      return new Response(
        JSON.stringify({ error: "No image generated" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create admin client for storage operations
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Store the image in Supabase Storage
    const fileName = `${user.id}/${crypto.randomUUID()}.png`;
    
    // Convert base64 to blob if needed
    let imageBlob: Blob;
    if (imageUrl.startsWith("data:")) {
      const base64Data = imageUrl.split(",")[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      imageBlob = new Blob([bytes], { type: "image/png" });
    } else {
      // Fetch from URL
      const imageResponse = await fetch(imageUrl);
      imageBlob = await imageResponse.blob();
    }

    const { error: uploadError } = await adminClient.storage
      .from("generated-images")
      .upload(fileName, imageBlob, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      // Continue anyway, return the base64 image
    }

    // Get public URL
    const { data: urlData } = adminClient.storage
      .from("generated-images")
      .getPublicUrl(fileName);

    const storedUrl = uploadError ? imageUrl : urlData.publicUrl;

    // Save to media_assets (use validated/sanitized values)
    const { data: mediaAsset, error: insertError } = await supabaseClient
      .from("media_assets")
      .insert({
        user_id: user.id,
        app_id: validatedAppId,
        type: "image",
        source: "generated",
        prompt: sanitizedPrompt,
        file_url: storedUrl,
        file_path: uploadError ? null : fileName,
        provider: "lovable-ai",
        status: "completed",
        metadata: { size: validatedSize, style: validatedStyle, textContent },
      })
      .select()
      .single();

    if (insertError) {
      console.error("Database insert error:", insertError);
    }

    console.log("Image generated successfully:", mediaAsset?.id);

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl: storedUrl,
        base64: imageUrl.startsWith("data:") ? imageUrl : null,
        mediaAssetId: mediaAsset?.id,
        textContent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Image generation error:", error instanceof Error ? error.message : error);
    console.error("Stack:", error instanceof Error ? error.stack : "N/A");

    return new Response(
      JSON.stringify({ error: "An error occurred processing your request" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
