import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Prompt validation constants
const MAX_PROMPT_LENGTH = 10000;
const MAX_MESSAGE_COUNT = 50;

// Suspicious patterns that may indicate prompt injection attempts
const SUSPICIOUS_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /forget\s+(everything|all|your)\s+(instructions?|rules?|training)/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /new\s+instructions?:\s*/i,
  /system\s*:\s*/i,
  /\[SYSTEM\]/i,
  /\{\{.*\}\}/,
  /<\s*script\s*>/i,
];

// Validate and sanitize a single message
function validateMessage(message: { role: string; content: string }): { valid: boolean; error?: string; sanitized?: { role: string; content: string } } {
  if (!message || typeof message !== "object") {
    return { valid: false, error: "Invalid message format" };
  }

  const { role, content } = message;

  // Validate role
  if (!["user", "assistant", "system"].includes(role)) {
    return { valid: false, error: `Invalid message role: ${role}` };
  }

  // Validate content type
  if (typeof content !== "string") {
    return { valid: false, error: "Message content must be a string" };
  }

  // Validate content length
  if (content.length > MAX_PROMPT_LENGTH) {
    return { valid: false, error: `Message exceeds maximum length of ${MAX_PROMPT_LENGTH} characters` };
  }

  // Check for suspicious patterns in user messages
  if (role === "user") {
    for (const pattern of SUSPICIOUS_PATTERNS) {
      if (pattern.test(content)) {
        console.warn("Suspicious prompt pattern detected:", pattern.toString());
        // Log but don't block - monitor for abuse patterns
      }
    }
  }

  // Sanitize content - remove null bytes and control characters (except newlines/tabs)
  const sanitizedContent = content
    .replace(/\x00/g, "")
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

  return {
    valid: true,
    sanitized: { role, content: sanitizedContent },
  };
}

// Validate messages array
function validateMessages(messages: unknown[]): { valid: boolean; error?: string; sanitized?: { role: string; content: string }[] } {
  if (!Array.isArray(messages)) {
    return { valid: false, error: "Messages must be an array" };
  }

  if (messages.length === 0) {
    return { valid: false, error: "Messages array cannot be empty" };
  }

  if (messages.length > MAX_MESSAGE_COUNT) {
    return { valid: false, error: `Too many messages. Maximum is ${MAX_MESSAGE_COUNT}` };
  }

  const sanitizedMessages: { role: string; content: string }[] = [];

  for (let i = 0; i < messages.length; i++) {
    const result = validateMessage(messages[i] as { role: string; content: string });
    if (!result.valid) {
      return { valid: false, error: `Message ${i + 1}: ${result.error}` };
    }
    sanitizedMessages.push(result.sanitized!);
  }

  return { valid: true, sanitized: sanitizedMessages };
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

    console.log("Authenticated user:", user.id);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Service configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { messages, model, systemPrompt, temperature, maxTokens } = await req.json();

    // Validate and sanitize messages
    const messagesValidation = validateMessages(messages);
    if (!messagesValidation.valid) {
      console.warn("Message validation failed:", messagesValidation.error);
      return new Response(
        JSON.stringify({ error: messagesValidation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sanitizedMessages = messagesValidation.sanitized!;

    // Validate system prompt if provided
    if (systemPrompt !== undefined && systemPrompt !== null) {
      if (typeof systemPrompt !== "string") {
        return new Response(
          JSON.stringify({ error: "System prompt must be a string" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (systemPrompt.length > MAX_PROMPT_LENGTH) {
        return new Response(
          JSON.stringify({ error: `System prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Map OpenAI models to Lovable AI equivalents
    const modelMap: Record<string, string> = {
      "gpt-4o": "openai/gpt-5",
      "gpt-4o-mini": "google/gemini-2.5-flash",
      "gpt-4-turbo": "openai/gpt-5",
      "gpt-3.5-turbo": "google/gemini-2.5-flash-lite",
    };

    const lovableModel = modelMap[model] || "google/gemini-2.5-flash";
    console.log("Chat request:", { originalModel: model, lovableModel, messageCount: messages.length });

    // Build messages array with system prompt (use sanitized messages)
    const chatMessages = [
      { role: "system", content: systemPrompt || "You are a helpful AI assistant." },
      ...sanitizedMessages,
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: lovableModel,
        messages: chatMessages,
        stream: true,
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
        JSON.stringify({ error: "Failed to get response from AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return streaming response
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    // Log detailed error server-side only
    console.error("Chat function error:", error instanceof Error ? error.message : error);
    console.error("Stack:", error instanceof Error ? error.stack : "N/A");
    
    // Return generic error to client
    return new Response(
      JSON.stringify({ error: "An error occurred processing your request" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
