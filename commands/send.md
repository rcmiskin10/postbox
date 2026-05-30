---
description: Send a postbox handoff envelope to another agent session
argument-hint: --type brief --target product:foo --source orchestrator [--body "..." | --body-file PATH]
allowed-tools: Bash(node:*)
---
The operator is sending a postbox handoff. Run the CLI with exactly their arguments:

```
node "${CLAUDE_PLUGIN_ROOT}/bin/postbox.mjs" send $ARGUMENTS
```

Then report the returned envelope `id` and `path`. If `--type` or `--target` is missing, ask the operator rather than inventing values. Sending is an operator action — only do it for an explicit `/postbox:send`.
