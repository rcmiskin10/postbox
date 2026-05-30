---
description: Report the outcome of a claimed postbox handoff (closes the loop back to the sender)
argument-hint: <envelope-id> --session <name> --outcome "<PR url / commit / note>"
allowed-tools: Bash(node:*)
---
Report the outcome of a handoff this session claimed. Run:

```
node "${CLAUDE_PLUGIN_ROOT}/bin/postbox.mjs" report $ARGUMENTS
```

Exit `0` = done — the sender will see the outcome on their next session start. Exit `4` = you don't own this lease (it may have been swept after expiring); re-claim it first, then report.
