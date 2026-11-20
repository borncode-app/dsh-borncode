# Plugin supervisor

One bundle that keeps the plugin kits current and says whether they work. It is
the only bundle that touches more than one repository, and it does so without
merging anything: the BornCode kit and the MiniMax kit stay separate
repositories, separate `Plugins` entries, and separate rows.

## What it does that a kit cannot

The kits are installed into the profile as `link:` specifiers pointing at real
working trees. An installer that swaps files would rewrite a tree underneath
`git pull` and turn every later pull into a conflict, so the correct update
mechanism for this install shape is git itself:

1. `git fetch <remote>` — read what is published, change nothing;
2. `git rev-list --left-right --count <remote>/<branch>...HEAD` — say how many
   commits are waiting;
3. `git pull --ff-only` — move the branch, refusing anything that is not a fast
   forward;
4. `pnpm install --ignore-scripts` — only when the pull changed a `package.json`,
   the lockfile, or the workspace file, because a kit resolves its sub-packages
   through its own `node_modules`;
5. `hmr.reconcileProfile()` — let the Host recompose so the replaced modules are
   loaded, and report `restartReason` and `pending` instead of claiming a reload
   that did not happen.

A checkout with uncommitted changes is refused before anything is touched: those
files are yours, and `git pull` cannot resolve them without guessing.

## Health check

Two readings, because they fail differently:

- **Loader phase per row** (`active`, `failed`, `pending`, `loading`,
  `unloading`, or `null` for a row that is off). A row the user turned off is a
  decision and is not reported as a problem; a row that is enabled and not
  `active` is.
- **The health route each bundle publishes**, probed over HTTP. A plugin that
  crashed keeps an honest phase but cannot answer its own route, and a plugin
  whose route answers is reachable even when one of its features is broken.

Neither reading proves a feature is correct. The check proves a row is loaded
and its own status route answers; it cannot know that a tool returns the right
answer.

## Cost

The startup check fetches once and reports. `autoApply` ships off, so a check
can never move a checkout on its own; updating takes the button in
**Settings → Plugin supervisor**.
