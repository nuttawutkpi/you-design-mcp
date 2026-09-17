import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

/**
 * Read-only filesystem scanner for the you-design catalog.
 *
 * Reads design-systems/, skills/, and plugins/ from the you-design checkout
 * pointed to by YOU_DESIGN_ROOT (default: ../you-design relative to this file).
 *
 * All list methods accept optional { category?, scope?, limit?, offset? }
 * (v0.2) so the calling agent can ask for less data and keep context small.
 * Missing directories or malformed manifests are skipped silently.
 */

export interface DesignSystemSummary {
  id: string;
  name: string;
  category: string;
  description?: string;
}

export interface SkillSummary {
  id: string;
  description?: string;
}

export interface PluginSummary {
  id: string;
  name: string;
  scope: "official" | "community" | "registry";
}

export interface ListOptions {
  /** Filter design-systems by category. */
  category?: string;
  /** Filter plugins by scope. */
  scope?: "official" | "community" | "registry";
  /** Max results to return. Default: all. Use ~20 for a paginated top-N view. */
  limit?: number;
  /** Skip first N results for pagination. Default: 0. */
  offset?: number;
}

export class Catalog {
  constructor(public readonly root: string) {}

  async listDesignSystems(
    options: ListOptions = {},
  ): Promise<DesignSystemSummary[]> {
    const dir = join(this.root, "design-systems");
    const entries = await readdir(dir, { withFileTypes: true });
    const result: DesignSystemSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
      try {
        const manifestPath = join(dir, entry.name, "manifest.json");
        const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
        if (options.category && manifest.category !== options.category) continue;
        result.push({
          id: manifest.id,
          name: manifest.name,
          category: manifest.category,
          description: manifest.description,
        });
      } catch {
        continue;
      }
    }
    result.sort((a, b) => a.id.localeCompare(b.id));
    return this.paginate(result, options);
  }

  async getDesignSystem(id: string): Promise<unknown> {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid design system id: ${JSON.stringify(id)} (must match /^[a-z0-9]+(?:-[a-z0-9]+)*$/.)`
      );
    }
    const manifestPath = join(this.root, "design-systems", id, "manifest.json");
    let content: string;
    try {
      content = await readFile(manifestPath, "utf-8");
    } catch {
      // ENOENT or other read error -> throw McpError(InvalidParams)
      // so the caller gets -32602 (not -32603 InternalError)
      throw new McpError(
        ErrorCode.InvalidParams,
        `Design system not found: ${JSON.stringify(id)}`
      );
    }
    return JSON.parse(content);
  }

  async listSkills(options: ListOptions = {}): Promise<SkillSummary[]> {
    const dir = join(this.root, "skills");
    const entries = await readdir(dir, { withFileTypes: true });
    const result: SkillSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const skillMd = await readFile(join(dir, entry.name, "SKILL.md"), "utf-8");
        // Take the first non-heading, non-empty line as the description
        const lines = skillMd.split("\n");
        const desc = lines
          .filter((l) => l.trim() && !l.startsWith("#"))
          .slice(0, 3)
          .join(" ")
          .trim();
        result.push({ id: entry.name, description: desc || undefined });
      } catch {
        result.push({ id: entry.name });
      }
    }
    result.sort((a, b) => a.id.localeCompare(b.id));
    return this.paginate(result, options);
  }

  async listPlugins(options: ListOptions = {}): Promise<PluginSummary[]> {
    const result: PluginSummary[] = [];
    const allScopes: Array<{ dir: string; scope: PluginSummary["scope"] }> = [
      { dir: join(this.root, "plugins", "_official"), scope: "official" },
      { dir: join(this.root, "plugins", "community"), scope: "community" },
      { dir: join(this.root, "plugins", "registry"), scope: "registry" },
    ];
    for (const { dir, scope } of allScopes) {
      if (options.scope && options.scope !== scope) continue;
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          try {
            const manifestPath = join(dir, entry.name, "manifest.json");
            const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
            result.push({
              id: manifest.id || entry.name,
              name: manifest.name || entry.name,
              scope,
            });
          } catch {
            result.push({ id: entry.name, name: entry.name, scope });
          }
        }
      } catch {
        // scope dir might not exist
      }
    }
    return this.paginate(result, options);
  }

  private paginate<T>(items: T[], options: ListOptions): T[] {
    const offset = options.offset ?? 0;
    const limit = options.limit ?? items.length;
    return items.slice(offset, offset + limit);
  }
}
