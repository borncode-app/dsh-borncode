# Dev containers on kiri

Tells the model that this machine's development containers run on the
[kiri](https://github.com/libracoder/kiri) engine, and states where a
production build goes.

**Nothing is blocked.** kiri speaks the Docker Engine API, so `docker compose up`,
`docker ps` and `docker run` reach it with no extra flag once its context is
active. There is no kiri-specific syntax to remember and no command rewriting.

## What it contributes

The system prompt gains a section built from a live probe of the machine:

- which docker context is currently active,
- whether that is the expected `kiri` context, and
- which buildx builder a plain `docker build` would select.

The section is rebuilt from that probe on every assembly and the probe refreshes
once a minute, so switching context is reflected without a restart.

## Why the builder matters

A build follows the **selected buildx builder**, not the active docker context.
That is the one place where the dev/prod split is not automatic:

```
docker context ls                     # what plain docker commands reach
docker buildx ls                      # what docker build reaches
```

A build or push that must produce the production artifact belongs on the
project's normal Docker runtime. Check the builder before a release build
instead of assuming the active context decides it.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Turn the guidance off without uninstalling the plugin. |
| `context` | `kiri` | The docker context the development loop is expected to use. |
| `guideInPrompt` | `true` | Write the runtime split into the system prompt. |
| `reportBuilder` | `true` | Also state which buildx builder a plain `docker build` resolves to. |

## Install kiri

Get it from [runkiri.com/releases](https://runkiri.com/releases/); on Windows the
`.msi` serves its context through WSL 2. kiri needs cgroup v2 in its guest — if
containers fail with `guest stopped before connecting`, set
`kernelCommandLine=cgroup_no_v1=all systemd.unified_cgroup_hierarchy=1` in
`%UserProfile%\.wslconfig` and run `wsl --shutdown`.

## Limits

- The plugin reports; it never denies or rewrites a command. A build that lands
  on the wrong engine is visible in the prompt and in `docker buildx ls`, not
  prevented.
- The probe reads `docker context ls` and `docker buildx ls`; with no docker CLI
  on `PATH` the section states that no context is readable.
