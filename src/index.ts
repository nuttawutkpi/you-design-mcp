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
  },
);

const catalog = new Catalog(YOU_DESIGN_ROOT);
registerTools(server, catalog);
registerResources(server, catalog);

const transport = new StdioServerTransport();

transport.onerror = (error: Error) => {
  const msg = error?.message ?? String(error);
  const isParseError = /json|parse/i.test(msg);
  const response = {
    jsonrpc: "2.0" as const,
    id: null,
    error: {
      code: isParseError ? -32700 : -32603,
      message: isParseError ? `Parse error: ${msg}` : msg,
    },
  };
  try {
    void transport.send(
      response as unknown as Parameters<typeof transport.send>[0],
    );
  } catch {
    // best-effort
  }
};

await server.connect(transport);
console.error(`you-design-mcp started (reading from ${YOU_DESIGN_ROOT})`);
