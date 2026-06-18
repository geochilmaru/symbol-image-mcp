# Symbol Image Generation MCP Server

A Model Context Protocol (MCP) server that exposes a tool for generating beautiful, stylized 3D claymorphic/glassmorphic symbol images (such as rockets, padlocks, badges) and automatically removing their background via the `remove.bg` API.

## Features

- Exposes the `generate_symbol_image` tool to MCP clients (like Claude Desktop).
- Auto-constructs a custom 3D isometric claymorphic/glassmorphic prompt matching your corporate UI aesthetics.
- Dynamically generates images using either **Stability AI (SD3/Ultra Core)** or **OpenAI (DALL-E 3)** based on configured API keys.
- Transparently removes background using the `remove.bg` API.
- Saves the final high-fidelity transparent PNG.

## Prerequisites

- Node.js v18 or newer.

## Installation

1. Navigate to the server folder:
   ```bash
   cd c:/Users/Tateo/my-project/symbol-image-mcp
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

## Configuration

The server reads API keys from environment variables. Set at least one image generation API key:

| Variable | Description | Required |
| --- | --- | --- |
| `STABILITY_API_KEY` | Stability AI API key | Yes (if using Stability AI) |
| `OPENAI_API_KEY` | OpenAI API key | Yes (if using OpenAI DALL-E) |
| `REMOVE_BG_API_KEY` | remove.bg API key | Optional (defaults to `DBz2y4TCNeSiX6eHNuHH2eQP`) |

## Integrating with Claude Desktop

To add this server to your Claude Desktop client, edit your configuration file located at:
`%APPDATA%\Claude\claude_desktop_config.json`

Add the server to the `mcpServers` object:

```json
{
  "mcpServers": {
    "symbol-image-mcp": {
      "command": "node",
      "args": ["c:/Users/Tateo/my-project/symbol-image-mcp/index.js"],
      "env": {
        "STABILITY_API_KEY": "YOUR_STABILITY_API_KEY_HERE",
        "OPENAI_API_KEY": "YOUR_OPENAI_API_KEY_HERE"
      }
    }
  }
}
```

Restart Claude Desktop after updating the configuration.

## Development and Testing

You can start the server locally in stdio transport mode:
```bash
node index.js
```
The server will start listening for JSON-RPC messages on standard input/output.
