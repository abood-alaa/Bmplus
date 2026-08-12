# Agent team

This project uses a coordinated subagent team defined in `.claude/agents/`. Follow this routing for every task — don't write or edit files directly in the main conversation.

## Rule: implementer writes, advisors advise

- **`implementer`** is the only agent allowed to create or modify files. For any task that requires writing or modifying code — features, fixes, refactors, config, content, tests — delegate to `implementer`. It consults the relevant read-only specialists itself before and after making changes, so a single request to it is usually enough.
- The ten read-only specialists (`frontend-advisor`, `backend-advisor`, `database-advisor`, `security-reviewer`, `seo-specialist`, `geo-specialist`, `accessibility-advisor`, `performance-advisor`, `devops-advisor`, `qa-advisor`) never write files. Call one of them directly only when the user wants analysis, a review, or a spec — not a code change.

## Default behavior

When the user asks for something that involves writing or changing code, delegate to `implementer` rather than implementing it yourself in the main conversation, even for changes that look small. Say which agent(s) you're using before you delegate.

When the user asks a question, wants a review, or wants an opinion without changing anything, you may call the relevant specialist directly (or answer yourself if no specialist fits) instead of going through `implementer`.
