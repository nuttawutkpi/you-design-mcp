#!/usr/bin/env node
/**
 * you-design-mcp — Model Context Protocol server for the you-design catalog.
 *
 * Reads design systems, skills, and plugin metadata from a you-design checkout
 * (default: ../you-design relative to this file, override via YOU_DESIGN_ROOT).
 *
 * Communicates over stdio. Configure in your MCP client (antigravity, Claude
 * Desktop, Cursor, etc.) with:
 *
 *   {
 *     "mcpServers": {
 *       "you-design": {
 *         "command": "npx",
 *         "args": ["-y", "you-design-mcp"],
 *         "env": { "YOU_DESIGN_ROOT": "/path/to/you-design" }
 *       }
 *     }
 *   }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Catalog } from "./catalog.js";
import { registerTools } from "./tools/index.js";
import { registerResources } from "./resources/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default: assume you-design is a sibling of you-design-mcp.
// In production (npm install), ../.. resolves to wherever the consumer installed it.
// Override via YOU_DESIGN_ROOT env var.
const YOU_DESIGN_ROOT =
  process.env.YOU_DESIGN_ROOT ||
  resolve(__dirname, "..", "..", "you-design");

const server = new Server(
  {
    name: "you-design-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

const catalog = new Catalog(YOU_DESIGN_ROOT);
registerTools(server, catalog);
registerResources(server, catalog);

const transport = new StdioServerTransport();

// Override default onerror to send proper JSON-RPC error responses
// for malformed input (instead of silently swallowing errors).
// The SDK's default transport.onerror is a no-op, so the server would
// appear hung when a client sends invalid JSON.
transport.onerror = (error: Error) => {
  const msg = error?.message ?? String(error);
  const isParseError = /json|parse/i.test(msg);

  // JSON-RPC 2.0 allows id=null for parse errors (when request ID unknown),
  // but SDK's JSONRPCMessage type requires id?: string | number | undefined.
  // Cast through 'unknown' to bypass strict type overlap check.
  const response = {
    jsonrpc: "2.0" as const,
    id: null,
    error: {
      code: isParseError ? -32700 : -32603, // ParseError : InternalError
      message: isParseError ? `Parse error: ${msg}` : msg,
    },
  };

  try {
    void transport.send(response as unknown as Parameters<typeof transport.send>[0]);
  } catch {
    // best-effort — don't throw if transport is closed
  }
};

await server.connect(transport);
// Log to stderr so it doesn't pollute the JSON-RPC stream on stdout
console.error(`you-design-mcp started (reading from ${YOU_DESIGN_ROOT})`);
