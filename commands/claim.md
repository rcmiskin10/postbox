---
description: Claim a postbox handoff envelope (race-free) for this session
argument-hint: <envelope-id> --session <name>
allowed-tools: Bash(node:*)
---
Claim the handoff the operator named. Run:

```
node "${CLAUDE_PLUGIN_ROOT}/bin/postbox.mjs" claim $ARGUMENTS
```

Exit `0` = claimed (you now hold the lease). Exit `3` = already claimed by another session — report that honestly and do not retry blindly.
