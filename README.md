# dsh-borncode

The BornCode plugins for DeepSeek Harness, in **one repository** and **one
Plugins entry**. Installing this bundle is enough — it carries its own packages.

Each part keeps its own code, its own Config schema, and its own switch. Only
the repository is shared.

| what stays separate | why |
|---|---|
| each plugin's row | one crashing row does not take the others down |
| one Config schema per row | the Plugins settings form stays short, and a bad field blocks only its own row |
| one package per row | `git pull` and a code review stay scoped to the part you touched |

## Layout

```
dsh-borncode/            the bundle: cordis.patch.yml, locale, docs, icon
packages/
  dsh-agent-customizer/    the deployment default model (per-agent instructions live in session-instructions)
  dsh-agent-desktop/       native computer use through the agent-desktop CLI
  dsh-auto-continue/       resumes a conversation after a spent usage limit
  dsh-auto-shutdown/       powers the computer down after a session finishes
  dsh-browser-use/         native browser control through browser-use
  dsh-session-instructions/ standing instructions read before any work starts
  dsh-session-sync/        imports Claude Code and MiniMax Code sessions
  dsh-side-chat/           a right-sidebar chat about the current session
  dsh-minimax-auth/        the shared MiniMax Code grant reader and refresher
  dsh-minimax-credit/      MiniMax credit proxy, failover and status
  dsh-minimax-checkin/     the MiniMax daily check-in chip and tool
  dsh-minimax-model-sync/  keeps an llm-pi-ai route's model list current
  dsh-minimax-web-search/  web search through MiniMax's native server tool
  dsh-minimax-bridge/      MiniMax Code's skills and agents
  dsh-model-quota/         the selected model's remaining quota
  dsh-mini/                keeps this checkout current and reports what actually runs
```

The MiniMax packages moved here from the former `dsh-minimax-kit` repository, so
one bundle installs every kit. They keep their own rows, their own Config
schemas and their own switches; only the repository is shared.

## What it inserts

| row | package | what it does |
|---|---|---|
| `agent-customizer` | `packages/dsh-agent-customizer` | keeps the deployment default model in **Settings → Agent customization** (the standing instructions live in **Settings → General → Instructions**) |
| `agent-desktop` | `packages/dsh-agent-desktop` | native computer use through the `agent-desktop` CLI, with its own Settings page |
| `auto-continue` | `packages/dsh-auto-continue` | books a scheduled continuation when a model usage limit runs out, so the conversation resumes by itself |
| `auto-shutdown` | `packages/dsh-auto-shutdown` | powers the computer down through the operating system's own visible countdown — **ships off** |
| `browser-use` | `packages/dsh-browser-use` | native browser control through `browser-use`, with its own Settings page |
| `session-instructions` | `packages/dsh-session-instructions` | reads the standing instructions in **Settings → General → Instructions** before any work starts |
| `session-sync` | `packages/dsh-session-sync` | imports Claude Code and MiniMax Code conversations as Sessions, flagged with their origin |
| `side-chat` | `packages/dsh-side-chat` | a right-sidebar chat that answers questions about the current session |
| `minimax-credit` | `packages/dsh-minimax-credit` | local Anthropic-Messages proxy at `127.0.0.1:45677` with credit failover |
| `minimax-checkin` | `packages/dsh-minimax-checkin` | claims the MiniMax daily check-in reward and exposes the `minimax_daily_checkin` tool |
| `minimax-model-sync` | `packages/dsh-minimax-model-sync` | keeps an `llm-pi-ai` route's model list in sync with the provider |
| `minimax-web-search` | `packages/dsh-minimax-web-search` | web search through MiniMax's native `web_search` server tool |
| `minimax-bridge` | `packages/dsh-minimax-bridge` | serves the MiniMax Code home's skills in place |
| `minimax-agent-bridge` | `packages/dsh-minimax-bridge/agents` | publishes agents as Harness presets |
| `minimax-mcp-*` | `@deepseek-ai/dsh-mcp-client` | the MiniMax Code MCP servers — **ship disabled**, because rea alone adds 229 tools to every request |
| `dsh-mini` | `packages/dsh-mini` | keeps this checkout current (git fast-forward) and reports each row's Loader phase plus its published health route |

## Install

1. Install this bundle.
2. Nothing else. The bundle carries its packages as dependencies, so each
   row resolves by the package's own name and keeps its title, icon, and
   Config schema.

If the standalone packages are also installed, turn them off in **Plugins** —
otherwise their rows appear twice.

## Turn one part off

Open the bundle's detail page and switch the row you do not want off. The
others keep running.

## Develop

```bash
pnpm install          # links the workspace packages
pnpm -r test          # each package keeps its own suite
```

## Limitations

- `auto-continue` and `auto-shutdown` ship off. Both act on the machine, so
  the user turns them on deliberately.
- `auto-continue` reads the reset time from `/plugins/model-quota`, so it needs
  a quota plugin to answer for the model in use. It passes the failing model
  along with the provider, so a gateway route such as **Our Free Model**
  (provider `our-free-model`, models `claude/...` or `minimax/...`) resolves to
  the right channel's reset time. With `model-quota` (now in this bundle) that reading comes from Our Free
  Model's gateway; without it the wait falls back to a growing backoff.

## License

MIT — see [LICENSE](LICENSE).
