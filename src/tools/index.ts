import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Catalog, ListOptions } from "../catalog.js";

/**
 * Register all you-design-mcp tools on the given Server instance.
 *
 * Tool description format (used by the calling LLM to decide when to invoke):
 *   - **what**    : what data the tool returns
 *   - **USE**     : when the agent should call this tool
 *   - **NOT FOR** : when a different tool is more appropriate
 *   - **NOTABLE** : specific entries worth knowing (e.g. thai-modern)
 *   - **cost**    : approximate token cost of the response
 *   - **tip**     : filter/limit options to reduce context cost
 *
 * Token costs assume you-design @ v0.22.1 (~154 design systems, ~160 skills,
 * ~300 plugins). Recompute after catalog size changes significantly.
 */

const HELP_TEXT = `you-design-mcp — MCP server for you-design

Tools (v0.2 — filter/limit enabled)
-----
  list_design_systems   Browse the design system catalog (~154 entries).
                        USE: discover available visual identities.
                        NOT FOR: full details of one system (use get_design_system).
                        NOTABLE: 'thai-modern' (Starter, cream + terracotta, Noto Sans Thai).
                        TIP: pass { category: "Starter" } to filter, or { limit: 20 } for top-20.
                        Cost: ~5-8K tokens (full); ~500-1K with category filter.

  get_design_system     Fetch the full manifest.json for ONE design system by id.
                        USE: after list_design_systems, to inspect a specific system.
                        NOT FOR: casual browsing.
                        Cost: ~1-2K tokens.

  list_skills           Browse the skills catalog (~160 entries).
                        USE: discover available agent capabilities.
                        NOT FOR: full skill content (read skills/<id>/SKILL.md directly).
                        TIP: pass { limit: 10 } to get top-10.
                        Cost: ~2-3K tokens (full); ~200-500 with limit.

  list_plugins          Browse the plugin catalog (~300+ across 3 scopes).
                        USE: when user specifically asks about plugins.
                        NOT FOR: casual browsing — this is the LARGEST response.
                        TIP: pass { scope: "official" } to get only official plugins (~13 entries).
                        Cost: ~8-10K tokens (full); ~500-1K with scope filter.

  help                  Show this help text.
                        Cost: ~500 tokens.

Configuration (antigravity / Claude Desktop / Cursor / etc.)
-------------------------------------------------------------
{
  "mcpServers": {
    "you-design": {
      "command": "npx",
      "args": ["-y", "you-design-mcp"],
      "env": { "YOU_DESIGN_ROOT": "/path/to/you-design" }
    }
  }
}

For local development:
  cd /path/to/you-design-mcp
  pnpm install
  YOU_DESIGN_ROOT=../you-design pnpm dev

Build:
  pnpm build
  node dist/index.js

Upstream: github.com/nexu-io/open-design (Apache-2.0)
This fork: github.com/YOUR_USERNAME/you-design-mcp (Apache-2.0)
See README.md and NOTICE for full attribution.
`;

const TOOL_DEFINITIONS = [
  {
    name: "list_design_systems",
    description:
      "Browse you-design's catalog of design system packages (~154 entries). " +
      "Returns array of {id, name, category, description} sorted alphabetically. " +
      "USE: discover available visual identities before drilling into one with get_design_system. " +
      "NOT FOR: full details of a specific system — use get_design_system(id) for that. " +
      "NOTABLE: 'thai-modern' (category='Starter', cream + terracotta, Noto Sans Thai) is the only Thai-localized option. " +
      "TIP: pass { category: \"Starter\" } to filter, { limit: 20 } for top-20, or { category: \"Starter\", limit: 5 } for paginated top-N. " +
      "Token cost: ~5-8K tokens (full); ~500-1K tokens with category filter.",
    inputSchema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          description:
            "Optional. Filter to one category (e.g., 'Starter', 'Modern & Minimal', 'Creative & Artistic'). Reduces response size significantly.",
        },
        limit: {
          type: "number",
          description:
            "Optional. Max results to return. Default: all. Use ~20 for a paginated top-N view.",
        },
        offset: {
          type: "number",
          description:
            "Optional. Skip first N results for pagination. Default: 0. Combine with limit.",
        },
      },
    },
  },
  {
    name: "get_design_system",
    description:
      "Fetch the full manifest.json for ONE design system by id (folder slug). " +
      "Returns schemaVersion, file map (design/tokens/preview), craft bindings, preview pages, and source files reference. " +
      "USE: after list_design_systems, when the user wants to inspect or use a specific system. " +
      "NOT FOR: browsing — call list_design_systems first to get the id. " +
      "Token cost: ~1-2K tokens (one manifest).",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description:
            "Design system id (folder slug, e.g., 'thai-modern', 'airtable', 'linear-app'). Must match /^[a-z0-9]+(?:-[a-z0-9]+)*$/.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "list_skills",
    description:
      "Browse you-design's catalog of available skills (~160 entries). " +
      "Skills are specialized agent capabilities (design, code, content, etc.). " +
      "Returns [{id, description}] where description is the first non-heading line from each SKILL.md. " +
      "USE: discover what agent capabilities are available before invoking one. " +
      "NOT FOR: full skill content — read skills/<id>/SKILL.md directly. " +
      "TIP: pass { limit: 10 } to get top-10 skills. " +
      "Token cost: ~2-3K tokens (full); ~200-500 tokens with limit.",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description:
            "Optional. Max results to return. Default: all. Use ~10 for a quick overview.",
        },
        offset: {
          type: "number",
          description:
            "Optional. Skip first N results for pagination. Default: 0.",
        },
      },
    },
  },
  {
    name: "list_plugins",
    description:
      "Browse you-design's plugin catalog (~300+ across three scopes: '_official', 'community', 'registry'). " +
      "Returns [{id, name, scope}] where scope is one of 'official' | 'community' | 'registry'. " +
      "USE: when the user specifically asks about plugins or extensions. " +
      "NOT FOR: casual browsing — this is the LARGEST response (~8-10K tokens). " +
      "TIP: pass { scope: \"official\" } to get only the 13 official plugins (~500 tokens). " +
      "Prefer list_design_systems / list_skills unless the user asks about plugins. " +
      "Token cost: ~8-10K tokens (full); ~500-1K with scope filter.",
    inputSchema: {
      type: "object" as const,
      properties: {
        scope: {
          type: "string",
          enum: ["official", "community", "registry"],
          description:
            "Optional. Filter by plugin scope. 'official' = ~13 entries, 'community' + 'registry' = the rest.",
        },
        limit: {
          type: "number",
          description:
            "Optional. Max results to return. Default: all.",
        },
        offset: {
          type: "number",
          description:
            "Optional. Skip first N results for pagination. Default: 0.",
        },
      },
    },
  },
  {
    name: "help",
    description:
      "Show usage help and configuration for you-design-mcp. " +
      "Returns text describing available tools, how to configure the MCP client (antigravity / Claude Desktop / Cursor), and how to set the YOU_DESIGN_ROOT env var. " +
      "USE: when the user asks how to use this server, or when the agent needs to surface MCP documentation. " +
      "Token cost: ~500 tokens.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
];

export function registerTools(server: Server, catalog: Catalog): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  // Permissive schema: SDK does NOT validate, we do it ourselves.
  // This ensures proper MCP error codes (-32602 InvalidParams) instead of
  // the SDK's default -32603 InternalError for schema validation failures.
  // Proper zod schema that accepts any params without validation.
  // Bypasses SDK's strict schema validation so our handler can do its own
  // validation and throw McpError with proper error codes (-32602 InvalidParams).
  // The SDK requires a real zod object (with method literal) - a plain
  // identity function fails the schema type check at registration time.
  // Schema for tools/call requests.
  // SDK requires `method` to be a literal (e.g. 'tools/call'), not a free string.
  // `z.string()` would not provide a literal value, causing
  // "Schema method literal must be a string" error.
  // z.unknown() lets us handle arbitrary params ourselves with proper MCP errors.
  const PermissiveCallToolSchema = z
    .object({
      method: z.literal("tools/call"),
      params: z.unknown().optional(),
    })
    .passthrough();

  server.setRequestHandler(PermissiveCallToolSchema, async (request) => {
    const params = request.params as { name?: string; arguments?: Record<string, unknown> } | undefined;

    // Validate params is an object (MCP requires object)
    if (params === null || typeof params !== "object") {
      throw new McpError(ErrorCode.InvalidParams, "params must be an object");
    }

    // Validate name is a string
    const name = params.name;
    if (typeof name !== "string") {
      throw new McpError(
        ErrorCode.InvalidParams,
        `params.name must be a string (got ${typeof name})`
      );
    }

    const args = params.arguments;

    // Validate scope enum explicitly — SDK may not strictly enforce the enum
    if (
      args?.scope !== undefined &&
      args.scope !== "official" &&
      args.scope !== "community" &&
      args.scope !== "registry"
    ) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid scope: "${args.scope}" (must be 'official' | 'community' | 'registry')`
      );
    }

    const opts: ListOptions = {
      category: typeof args?.category === "string" ? args.category : undefined,
      scope:
        args?.scope === "official" ||
        args?.scope === "community" ||
        args?.scope === "registry"
          ? args.scope
          : undefined,
      limit: typeof args?.limit === "number" ? args.limit : undefined,
      offset: typeof args?.offset === "number" ? args.offset : undefined,
    };

    switch (name) {
      case "list_design_systems":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(await catalog.listDesignSystems(opts), null, 2),
            },
          ],
        };

      case "get_design_system": {
        const id = String(args?.id ?? "");
        if (!id) {
          throw new McpError(
            ErrorCode.InvalidParams,
            "get_design_system: 'id' parameter is required"
          );
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(await catalog.getDesignSystem(id), null, 2),
            },
          ],
        };
      }

      case "list_skills":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(await catalog.listSkills(opts), null, 2),
            },
          ],
        };

      case "list_plugins":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(await catalog.listPlugins(opts), null, 2),
            },
          ],
        };

      case "help":
        return {
          content: [
            {
              type: "text",
              text: HELP_TEXT,
            },
          ],
        };

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  });
}
