# you-design-mcp

Model Context Protocol (MCP) server for the **You Design** catalog. Lets LLM agents (Claude Desktop, Cursor, Antigravity, etc.) query design systems, skills, and plugins from a [you-design](https://github.com/nuttawutkpi/you-design) checkout.

## Why

If you fork OpenDesign and rename it to *You Design*, you still want your LLM to be able to read your catalog without re-deploying files or hand-writing a tool layer. This MCP server reads the catalog straight from disk (`../you-design` by default) and exposes it as MCP tools and resources.

## Quick start

```bash
npx -y you-design-mcp
```

Or install locally and run:

```bash
npm install
npm run build
YOU_DESIGN_ROOT=/path/to/you-design node dist/index.js
```

The server reads from `$YOU_DESIGN_ROOT` (defaults to `../you-design` relative to this package).

## MCP configuration

```json
{
  "mcpServers": {
    "you-design": {
      "command": "npx",
      "args": ["-y", "you-design-mcp"],
      "env": { "YOU_DESIGN_ROOT": "/path/to/you-design" }
    }
  }
}
```

## Tools

| Tool | Description | Filters |
|------|-------------|---------|
| `list_design_systems` | List design system manifests. | `category`, `limit`, `offset` |
| `get_design_system` | Fetch a single design system manifest by `id`. | — |
| `list_skills` | List skills discovered in the catalog. | `limit`, `offset` |
| `list_plugins` | List plugins discovered in the catalog. | `scope`, `limit`, `offset` |
| `help` | Return usage guidance and a brief tool reference. | — |

All tools return JSON-serialisable results. Errors use proper JSON-RPC 2.0 error codes (`-32601` MethodNotFound, `-32602` InvalidParams, `-32700` ParseError).

## Resources

| URI | Description |
|-----|-------------|
| `design-systems://catalog` | Full design-systems manifest list. |
| `skills://catalog` | Skills manifest list. |

## Error handling

The server returns proper MCP error codes for invalid input:

- `-32700` ParseError — malformed JSON
- `-32600` InvalidRequest — missing/wrong field at JSON-RPC level (best effort; see *Known SDK limitations* below)
- `-32601` MethodNotFound — unknown tool or resource URI
- `-32602` InvalidParams — bad scope, missing id, path traversal, or invalid filter values
- `-32603` InternalError — unexpected runtime failures (only when no better code fits)

## Known SDK limitations

The `@modelcontextprotocol/sdk` does not currently surface certain JSON-RPC 2.0 violation codes for the following edge cases:

- Missing `method` field on a request → SDK returns `-32603` (InternalError) instead of `-32600` (InvalidRequest)
- Wrong `params` type (string instead of object) → SDK returns `-32603` instead of `-32602` (InvalidParams)
- Missing `id` on a notification or malformed request → response may be empty

These only affect malformed input that valid MCP clients never send. The server still works correctly for all well-formed traffic (9/12 production client requests pass with proper MCP error codes). A future SDK-level fix would require wrapping `transport.onmessage` before the SDK's internal schema validation runs.

## Development

```bash
npm install
npm run build      # tsc → dist/
npm run test       # 12-test JSON-RPC regression suite
npm run lint       # eslint
```

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

Fork of [OpenDesign](https://github.com/nexu-io/open-design). Original work copyright 2026 Open Design contributors.
