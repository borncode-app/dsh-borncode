# Dev containers on kiri

Sends container work for development and testing to the [kiri](https://github.com/libracoder/kiri)
runtime, while builds and pushes that produce the production image keep the
normal Docker runtime.

## What it does

kiri speaks the Docker Engine API, so `docker`, Compose and buildx work
unchanged against it through a docker context named `kiri`. This plugin makes
that split explicit:

| Command | Runtime |
|---|---|
| `docker run`, `create`, `start`, `stop`, `rm`, `exec`, `logs`, `ps`, … | kiri |
| `docker compose up`, `compose run`, `compose exec` | kiri |
| `docker build`, `buildx build`, `push` | the default Docker runtime |
| `docker compose build`, `compose push` | the default Docker runtime |

A development call that names no context is denied with the corrected command
in the failure reason, and the rule is also written into the system prompt so
the model reaches for kiri before the first denial rather than after it.

A command that already names a context (`--context`, `--host`, `DOCKER_CONTEXT`)
is left alone: the explicit choice wins.

## Behavior when kiri is absent

The plugin reads `docker context ls`. When no `kiri` context is registered it
keeps denying development calls, and the reason says how to install kiri and
which command to run afterwards. Production builds are never blocked, so an
install-in-progress does not stop the rest of the work.

Install kiri from [runkiri.com/releases](https://runkiri.com/releases/); on
Windows the `.msi` serves the context through WSL 2, and opening the app once
registers it.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Turn the hook off without uninstalling it. |
| `context` | `kiri` | Docker context the development loop runs on. |
| `contextAliases` | `["kiri"]` | Other context names that also count as kiri. |
| `guideInPrompt` | `true` | Put the kiri rule in the system prompt. |
| `block` | `true` | Deny a development call that names no context. |

With `block: false` the system prompt is the only guidance, which suits a
workflow where a denial would interrupt more than it saves.

## Limits

- Only the `bash` and `pwsh` tools are inspected, through their `command`
  argument. A container started from inside a script the tool runs by other
  means is not seen.
- The guard reads the context list synchronously from its last probe, taken at
  load and refreshed at most once a minute in the background.
- Builds are classified by the docker subcommand, not by the image tag. A
  development image built with `docker build` deliberately stays on the
  default runtime, as the split you asked for.
