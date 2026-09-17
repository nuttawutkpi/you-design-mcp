import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/dist/cjs/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { Catalog } from "../catalog.js";

const KNOWN_URIS = new Set(["design-systems://catalog", "skills://catalog"]);

export function registerResources(server: Server, catalog: Catalog): void {
  server.setRequestHandler(
    { method: "resources/list" } as unknown as Parameters<typeof server.setRequestHandler>[0],
    async () => ({
      resources: [
        {
          uri: "design-systems://catalog",
          name: "Design Systems Catalog",
          description: "Full list of design system manifests available in this you-design checkout.",
          mimeType: "application/json",
        },
        {
          uri: "skills://catalog",
          name: "Skills Catalog",
          description: "Full list of skills available in this you-design checkout.",
          mimeType: "application/json",
        },
      ],
    }),
  );

  server.setRequestHandler(
    { method: "resources/read" } as unknown as Parameters<typeof server.setRequestHandler>[0],
    async (request) => {
      const uri = (request?.params as { uri?: string } | undefined)?.uri;
      if (!uri || !KNOWN_URIS.has(uri)) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown resource URI: ${uri ?? "(none)"}`,
        );
      }
      if (uri === "design-systems://catalog") {
        const items = await catalog.listDesignSystems({});
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(items, null, 2),
            },
          ],
        };
      }
      const items = await catalog.listSkills({});
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(items, null, 2),
          },
        ],
      }
      void ErrorCode; // satisfy unused import in some toolchains
    },
  );
}
