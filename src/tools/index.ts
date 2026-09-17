import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/dist/cjs/types.js";
import { z } from "zod";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Catalog } from "../catalog.js";

const VALID_SCOPES = new Set(["official", "community", "experimental"]);

export const TOOL_DEFINITIONS = [
  {
    name: "list_design_systems",
    description:
      "List design system manifests from the you-design catalog. Returns up to 153 systems by default. Use this when the user asks 'what design systems do I have?' or wants to browse options before picking one.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Filter by category (e.g. 'Starter', 'Premium')." },
        limit: { type: "number", description: "Maximum number of items to return." },
        offset: { type: "number", description: "Skip this many items before returning." },
      },
    },
  },
  {
    name: "get_design_system",
    description:
      "Fetch a single design system manifest by id. Use after listing to drill into one design system.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "Design system identifier (kebab-case slug)." },
      },
    },
  },
  {
    name: "list_skills",
    description: "List skills discovered in the you-design catalog.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number" },
        offset: { type: "number" },
      },
    },
  },
  {
    name: "list_plugins",
    description: "List plugins discovered in the you-design catalog, optionally filtered by scope.",
    inputSchema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["official", "community", "experimental"],
          description: "Filter by plugin scope.",
        },
        limit: { type: "number" },
        offset: { type: "number" },
      },
    },
  },
  {
    name: "help",
    description: "Return usage guidance and a brief tool reference for the you-design MCP server.",
    inputSchema: { type: "object", properties: {} },
  },
];

export function registerTools(server: Server, catalog: Catalog): void {
  server.setRequestHandler(
    { method: "tools/list" } as unknown as Parameters<typeof server.setRequestHandler>[0],
    async () => ({ tools: TOOL_DEFINITIONS }),
  );

  // Permissive schema: SDK does NOT validate, we do it ourselves.
  // This ensures proper MCP error codes (-32602 InvalidParams) instead of
  // the SDK's default -32603 InternalError for schema validation failures.
  const PermissiveCallToolSchema = z
    .object({
      method: z.literal("tools/call"),
      params: z.unknown().optional(),
    })
    .passthrough();

  server.setRequestHandler(
    PermissiveCallToolSchema as unknown as Parameters<typeof server.setRequestHandler>[0],
    async (request) => {
      const params = (request?.params ?? {}) as {
        name?: string;
        arguments?: Record<string, unknown>;
      };
      const name = params.name;
      const args = params.arguments ?? {};

      switch (name) {
        case "list_design_systems": {
          const a = args as { category?: string; limit?: number; offset?: number };
          const items = await catalog.listDesignSystems({
            category: a.category,
            limit: a.limit,
            offset: a.offset,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
          };
        }
        case "get_design_system": {
          const id = (args as { id?: string }).id;
          if (!id || typeof id !== "string") {
            throw new McpError(ErrorCode.InvalidParams, "id parameter is required (string)");
          }
          const manifest = await catalog.getDesignSystem(id);
          return {
            content: [{ type: "text", text: JSON.stringify(manifest, null, 2) }],
          };
        }
        case "list_skills": {
          const a = args as { limit?: number; offset?: number };
          const items = await catalog.listSkills({ limit: a.limit, offset: a.offset });
          return {
            content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
          };
        }
        case "list_plugins": {
          const a = args as { scope?: string; limit?: number; offset?: number };
          if (a.scope !== undefined && !VALID_SCOPES.has(a.scope)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              `Invalid scope '${a.scope}'. Must be one of: ${Array.from(VALID_SCOPES).join(", ")}`,
            );
          }
          const items = await catalog.listPlugins({
            scope: a.scope,
            limit: a.limit,
            offset: a.offset,
          });
          return {
            content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
          };
        }
        case "help": {
          return {
            content: [
              {
                type: "text",
                text: [
                  "you-design-mcp v0.1.0 — MCP server for the you-design catalog.",
                  "",
                  "Tools:",
                  "  - list_design_systems(category?, limit?, offset?)",
                  "  - get_design_system(id)  -- id required",
                  "  - list_skills(limit?, offset?)",
                  "  - list_plugins(scope?, limit?, offset?)",
                  "  - help()",
                  "",
                  "Resources:",
                  "  - design-systems://catalog",
                  "  - skills://catalog",
                  "",
                  "Errors use proper JSON-RPC 2.0 codes (-32601, -32602, -32700).",
                  "See README 'Known SDK limitations' for the 3 SDK-internal edge cases.",
                ].join("\n"),
              },
            ],
          };
        }
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${name ?? "(none)"}`,
          );
      }
    },
  );
}
