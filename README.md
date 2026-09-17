# you-design-mcp

Model Context Protocol (MCP) server for [you-design](https://github.com/your-username/you-design) — a Thai-localized fork of [OpenDesign](https://github.com/nexu-io/open-design).

Exposes the you-design catalog (design systems, skills, plugins) as MCP tools + resources over stdio, so MCP-aware clients (antigravity, Claude Desktop, Cursor, etc.) can query and use them at runtime.

## Quick start

### Install

```bash
npm install -g you-design-mcp
```

Or run directly:

```bash
npx -y you-design-mcp
```

### Configure in your MCP client

Add to your MCP config (e.g., antigravity, Claude Desktop, Cursor):

```json
{
  "mcpServers": {
    "you-design": {
      "command": "npx",
      "args": ["-y", "you-design-mcp"],
      "env": {
        "YOU_DESIGN_ROOT": "/path/to/your/you-design"
      }
    }
  }
}
```

`YOU_DESIGN_ROOT` should point to your you-design checkout. If unset, defaults to `../you-design` relative to the MCP server.

### Tools

| Tool | Description |
|---|---|
| `list_design_systems` | List all design systems in the you-design catalog |
| `get_design_system` | Get full manifest for a design system by id |
| `list_skills` | List all skills in the you-design catalog |
| `list_plugins` | List all plugins (official + community + registry) |
| `help` | Show usage help |

### Resources

| URI | Description |
|---|---|
| `you-design://catalog/design-systems` | Full design system catalog (JSON) |
| `you-design://catalog/skills` | Full skills catalog (JSON) |

### Example conversation

```
User (via MCP client): "Show me design systems that work well for Thai-language content"

→ MCP client calls list_design_systems

AI: "Found 1 design system optimized for Thai:
- thai-modern: Thai Modern (Starter) — cream + terracotta, Noto Sans Thai
  Description: Thai-localized modern design system..."
```

## Architecture

```
you-design-mcp/
├── src/
│   ├── index.ts              # MCP server entry, stdio transport
│   ├── catalog.ts            # Filesystem scanner (reads design-systems/, skills/, plugins/)
│   ├── tools/
│   │   └── index.ts          # Tool registration (list_design_systems, get_design_system, ...)
│   └── resources/
│       └── index.ts          # Resource registration (browsable catalog)
├── package.json
├── tsconfig.json
├── README.md
├── LICENSE                   # Apache-2.0
└── NOTICE                    # Fork attribution
```

The MCP server reads from a you-design checkout via filesystem (no API, no network). It always reflects the latest catalog state — no sync step needed.

## Development

```bash
git clone https://github.com/your-username/you-design-mcp.git
cd you-design-mcp
pnpm install
pnpm dev  # tsx watch mode
```

Build:

```bash
pnpm build
node dist/index.js
```

## Transport

stdio (JSON-RPC over stdin/stdout). Configure in your MCP client.

## Compatibility

Compatible with any MCP-aware client, including:
- **antigravity** (Google agent IDE)
- **Claude Desktop**
- **Cursor**
- **Cline**
- **Continue**
- Any other MCP client that supports stdio servers

## License

Apache-2.0. See [LICENSE](LICENSE).

This is a companion project to [you-design](https://github.com/your-username/you-design), which is itself a fork of [OpenDesign](https://github.com/nexu-io/open-design). See [NOTICE](NOTICE) for full attribution.

## Related repos

- [OpenDesign](https://github.com/nexu-io/open-design) — the original project (Apache-2.0)
- [you-design](https://github.com/your-username/you-design) — your fork with Thai localization + Linux build + cleanup
- [you-design-mcp](https://github.com/your-username/you-design-mcp) — this MCP wrapper (you are here)
