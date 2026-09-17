import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ErrorCode,
  ListResourcesRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Catalog } from "../catalog.js";

/**
 * Register MCP resources for browsable catalog browsing.
 *
 * Resources (vs tools):
 *   - resources are read-only URIs the model can pull on-demand
 *   - tools are actions the model can invoke
 *
 * Same descriptions as the tool counterparts so the LLM has consistent
 * language across resources and tools.
 */

const DESIGN_SYSTEMS_URI = "you-design://catalog/design-systems";
const SKILLS_URI = "you-design://catalog/skills";

export function registerResources(server: Server, catalog: Catalog): void {
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const [systems, skills] = await Promise.all([
      catalog.listDesignSystems(),
      catalog.listSkills(),
    ]);
    return {
      resources: [
        {
          uri: DESIGN_SYSTEMS_URI,
          name: "Design Systems Catalog",
          description:
            "Full JSON catalog of all design systems in you-design (~154 entries). " +
            "Same data as list_design_systems tool but as a browsable resource URI. " +
            "USE: load the full catalog into context without invoking a tool. " +
            "NOTABLE: 'thai-modern' (Starter, cream + terracotta, Noto Sans Thai). " +
            "Token cost: ~5-8K tokens.",
          mimeType: "application/json",
        },
        {
          uri: SKILLS_URI,
          name: "Skills Catalog",
          description:
            "Full JSON catalog of all skills in you-design (~160 entries). " +
            "Same data as list_skills tool but as a browsable resource URI. " +
            "USE: load the full skills list into context without invoking a tool. " +
            "Token cost: ~2-3K tokens.",
          mimeType: "application/json",
        },
      ],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    if (uri === DESIGN_SYSTEMS_URI) {
      const systems = await catalog.listDesignSystems();
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(systems, null, 2),
          },
        ],
      };
    }
    if (uri === SKILLS_URI) {
      const skills = await catalog.listSkills();
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(skills, null, 2),
          },
        ],
      };
    }
    throw new McpError(ErrorCode.MethodNotFound, `Unknown resource: ${uri}`);
  });
}
