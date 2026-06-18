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
            symbol: {
              type: "string",
              description: "The symbol to generate (e.g., rocket, padlock, money-bag, credit-card)",
            },
            outputPath: {
              type: "string",
              description: "Optional absolute path to save the final transparent PNG.",
            },
          },
          required: ["symbol"],
        },
      },
    ],
  };
});

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
    const symbol = args.symbol;
    const outputPath = args.outputPath || path.join(process.cwd(), "assets", `${symbol}_nobg.png`);

    // Ensure output directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Prompt built from the user's custom claymorphic/glassmorphic style guidelines
    const prompt = `A 3D isometric product showcase of a sleek ${symbol} model, perfectly centered in the middle of the frame with generous empty margins (padding) on all sides, especially at the top. The background is a solid, uniform pastel light blue. Clean minimalist layout, claymorphic forms, frosted acrylic glassmorphism, soft lighting, high fidelity render.`;

    try {
      const stabilityKey = process.env.STABILITY_API_KEY;
      const openaiKey = process.env.OPENAI_API_KEY;
      const removeBgKey = process.env.REMOVE_BG_API_KEY || "DBz2y4TCNeSiX6eHNuHH2eQP";

      let rawImageBuffer;

      // Select generation service based on available keys
      if (stabilityKey) {
        rawImageBuffer = await generateImageWithStabilityAI(prompt, stabilityKey);
      } else if (openaiKey) {
        rawImageBuffer = await generateImageWithOpenAI(prompt, openaiKey);
      } else {
        throw new Error(
          "No Image Generation API key found. Please set STABILITY_API_KEY or OPENAI_API_KEY in your environment."
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
            text: `Successfully generated symbol image for '${symbol}'.\nSaved transparent PNG to: ${outputPath}`,
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
