import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";

export interface DesignSystemSummary {
  id: string;
  name: string;
  category?: string;
  preview?: string;
}

export interface DesignSystemManifest extends DesignSystemSummary {
  schemaVersion: string;
  files: string[];
  craft?: Record<string, unknown>;
}

export interface SkillSummary {
  id: string;
  name: string;
}

export interface PluginSummary {
  id: string;
  name: string;
  scope: "official" | "community" | "experimental";
  description?: string;
}

export interface CatalogData {
  designSystems: Map<string, DesignSystemManifest>;
  skills: Map<string, SkillSummary>;
  plugins: Map<string, PluginSummary>;
}

const VALID_ID = /^[a-z0-9][a-z0-9-_/]*$/;

export class Catalog {
  private readonly root: string;
  private cache: CatalogData | null = null;

  constructor(root: string) {
    this.root = resolve(root);
  }

  static resolveRoot(env: NodeJS.ProcessEnv = process.env): string {
    if (env.YOU_DESIGN_ROOT) return resolve(env.YOU_DESIGN_ROOT);
    return resolve(process.cwd(), "you-design");
  }

  async load(): Promise<CatalogData> {
    if (this.cache) return this.cache;
    const [ds, sk, pl] = await Promise.all([
      this.loadDesignSystems(),
      this.loadSkills(),
      this.loadPlugins(),
    ]);
    this.cache = { designSystems: ds, skills: sk, plugins: pl };
    return this.cache;
  }

  private async loadDesignSystems(): Promise<Map<string, DesignSystemManifest>> {
    const out = new Map<string, DesignSystemManifest>();
    const dir = join(this.root, "design-systems");
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return out;
    }
    for (const entry of entries) {
      const manifestPath = join(dir, entry, "manifest.json");
      try {
        const raw = await fs.readFile(manifestPath, "utf8");
        const parsed = JSON.parse(raw) as DesignSystemManifest;
        if (!parsed.id) {
          parsed.id = entry;
        }
        out.set(parsed.id, parsed);
      } catch {
        // skip malformed manifest
      }
    }
    return out;
  }

  private async loadSkills(): Promise<Map<string, SkillSummary>> {
    const out = new Map<string, SkillSummary>();
    const dir = join(this.root, "skills");
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return out;
    }
    for (const entry of entries) {
      const skillPath = join(dir, entry, "skill.json");
      try {
        const raw = await fs.readFile(skillPath, "utf8");
        const parsed = JSON.parse(raw) as SkillSummary;
        if (!parsed.id) parsed.id = entry;
        out.set(parsed.id, parsed);
      } catch {
        // skip malformed
      }
    }
    return out;
  }

  private async loadPlugins(): Promise<Map<string, PluginSummary>> {
    const out = new Map<string, PluginSummary>();
    const dir = join(this.root, "plugins");
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return out;
    }
    for (const entry of entries) {
      const pluginPath = join(dir, entry, "plugin.json");
      try {
        const raw = await fs.readFile(pluginPath, "utf8");
        const parsed = JSON.parse(raw) as PluginSummary;
        if (!parsed.id) parsed.id = entry;
        if (!["official", "community", "experimental"].includes(parsed.scope)) {
          parsed.scope = "community";
        }
        out.set(parsed.id, parsed);
      } catch {
        // skip malformed
      }
    }
    return out;
  }

  async listDesignSystems(opts: { category?: string; limit?: number; offset?: number } = {}): Promise<DesignSystemManifest[]> {
    const data = await this.load();
    let items = Array.from(data.designSystems.values());
    if (opts.category) {
      items = items.filter((d) => d.category === opts.category);
    }
    if (typeof opts.offset === "number") {
      items = items.slice(opts.offset);
    }
    if (typeof opts.limit === "number") {
      items = items.slice(0, opts.limit);
    }
    return items;
  }

  async getDesignSystem(id: string): Promise<DesignSystemManifest> {
    if (!VALID_ID.test(id)) {
      throw new Error(`Invalid id: ${id}`);
    }
    const data = await this.load();
    const manifest = data.designSystems.get(id);
    if (!manifest) {
      throw new Error(`Design system not found: ${id}`);
    }
    return manifest;
  }

  async listSkills(opts: { limit?: number; offset?: number } = {}): Promise<SkillSummary[]> {
    const data = await this.load();
    let items = Array.from(data.skills.values());
    if (typeof opts.offset === "number") items = items.slice(opts.offset);
    if (typeof opts.limit === "number") items = items.slice(0, opts.limit);
    return items;
  }

  async listPlugins(opts: { scope?: string; limit?: number; offset?: number } = {}): Promise<PluginSummary[]> {
    const data = await this.load();
    let items = Array.from(data.plugins.values());
    if (opts.scope) {
      items = items.filter((p) => p.scope === opts.scope);
    }
    if (typeof opts.offset === "number") items = items.slice(opts.offset);
    if (typeof opts.limit === "number") items = items.slice(0, opts.limit);
    return items;
  }
}
