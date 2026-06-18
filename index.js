import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs";
import path from "node:path";

// Initialize server
const server = new Server(
  {
    name: "symbol-image-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools list
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "generate_symbol_image",
        description: "Generates a 3D claymorphic/glassmorphic symbol image, removes its background, and saves it.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "The description of the object(s) to generate (e.g., 'a secure padlock, a stylized money bag with a won sign, and transaction card models')",
            },
            outputPath: {
              type: "string",
              description: "Optional absolute path to save the final transparent PNG.",
            },
          },
          required: ["prompt"],
        },
      },
    ],
  };
});

// Image Generation via Google AI Studio Imagen 3 API
async function generateImageWithGoogle(prompt, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      instances: [
        { prompt: prompt }
      ],
      parameters: {
        sampleCount: 1,
        outputMimeType: "image/png",
        aspectRatio: "1:1"
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Imagen API Error (${response.status}): ${errorText}`);
  }

  const json = await response.json();
  if (!json.predictions || json.predictions.length === 0 || !json.predictions[0].bytesBase64Encoded) {
    throw new Error(`Invalid response structure from Google Imagen API: ${JSON.stringify(json)}`);
  }

  const b64Data = json.predictions[0].bytesBase64Encoded;
  return Buffer.from(b64Data, "base64");
}

// Image Generation via Stability AI Core API
async function generateImageWithStabilityAI(prompt, apiKey) {
  const formData = new FormData();
  formData.append("prompt", prompt);
  formData.append("output_format", "png");
  formData.append("aspect_ratio", "1:1");

  const response = await fetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "image/*"
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Stability AI Error (${response.status}): ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Image Generation via OpenAI DALL-E 3 API
async function generateImageWithOpenAI(prompt, apiKey) {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json"
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Error (${response.status}): ${errorText}`);
  }

  const json = await response.json();
  const b64Data = json.data[0].b64_json;
  return Buffer.from(b64Data, "base64");
}

// remove.bg background removal call
async function removeBg(imageBuffer, apiKey) {
  const blob = new Blob([imageBuffer], { type: "image/png" });
  const formData = new FormData();
  formData.append("size", "auto");
  formData.append("image_file", blob);

  const response = await fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: { "X-Api-Key": apiKey },
    body: formData,
  });

  if (response.ok) {
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } else {
    const errorText = await response.text();
    throw new Error(`remove.bg Error (${response.status}): ${errorText}`);
  }
}

// Tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "generate_symbol_image") {
    const inputPrompt = args.prompt;
    const slug = inputPrompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .substring(0, 30);
    const outputPath = args.outputPath || path.join(process.cwd(), "assets", `${slug || "generated"}_nobg.png`);

    // Ensure output directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Prompt built from the user's custom claymorphic/glassmorphic style guidelines
    const prompt = `3D isometric product showcase for a digital banking app, featuring several floating elements in a minimalist layout. Claymorphic forms mixed with frosted acrylic glassmorphism. Objects include ${inputPrompt}. Soft internal glow combined with direct external sunlight creating distinct geometric shadows. High fidelity render, octane shader, cinematic lighting.`;

    try {
      const googleKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      const stabilityKey = process.env.STABILITY_API_KEY;
      const openaiKey = process.env.OPENAI_API_KEY;
      const removeBgKey = process.env.REMOVE_BG_API_KEY || "DBz2y4TCNeSiX6eHNuHH2eQP";

      let rawImageBuffer;

      // Select generation service based on available keys
      if (googleKey) {
        rawImageBuffer = await generateImageWithGoogle(prompt, googleKey);
      } else if (stabilityKey) {
        rawImageBuffer = await generateImageWithStabilityAI(prompt, stabilityKey);
      } else if (openaiKey) {
        rawImageBuffer = await generateImageWithOpenAI(prompt, openaiKey);
      } else {
        throw new Error(
          "No Image Generation API key found. Please set GEMINI_API_KEY, STABILITY_API_KEY, or OPENAI_API_KEY in your environment."
        );
      }

      // Remove background
      const transparentImageBuffer = await removeBg(rawImageBuffer, removeBgKey);

      // Save file
      fs.writeFileSync(outputPath, transparentImageBuffer);

      return {
        content: [
          {
            type: "text",
            text: `Successfully generated image for prompt: '${inputPrompt}'.\nSaved transparent PNG to: ${outputPath}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error generating image: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Tool not found: ${name}`);
});

// Run server with Stdio Server Transport (standard in/out streams)
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Symbol Image Generation MCP Server running on stdio");
