import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    console.log("Authenticated user for image generation:", user.id);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Service configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { prompt, size = "1024x1024", style, appId } = await req.json();

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Image generation request:", { prompt: prompt.substring(0, 100), size, style, appId });

    // Build enhanced prompt with style if provided
    const enhancedPrompt = style ? `${prompt}. Style: ${style}` : prompt;

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

    // Save to media_assets
    const { data: mediaAsset, error: insertError } = await supabaseClient
      .from("media_assets")
      .insert({
        user_id: user.id,
        app_id: appId || null,
        type: "image",
        source: "generated",
        prompt: prompt,
        file_url: storedUrl,
        file_path: uploadError ? null : fileName,
        provider: "lovable-ai",
        status: "completed",
        metadata: { size, style, textContent },
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
