---
description: Manage auto-commit plugin settings
---

Use the auto-commit plugin tools:

- `/getAutoCommitSettings` to view current settings
- `/setAutoCommitSettings` to update settings  
- `/resetAutoCommitSettings` to reset to defaults

Available settings:

- **mode**: `disabled`, `worktree`, or `enabled`
  - `disabled`: Plugin is completely disabled
  - `worktree`: Plugin is enabled only on worktrees (default)
  - `enabled`: Plugin is enabled on both worktrees and main worktree

- **commitModel**: Model name for generating commit messages (optional)
  - If not set, uses the current session's model
  - Example: `anthropic/claude-3-5-sonnet-20241022`

- **maxCommitLength**: Maximum commit message length in characters
  - Minimum: `100`
  - Default: `10000`
  - If exceeded, LLM Response section is truncated with `...` suffix

Example usage:
- `/setAutoCommitSettings mode=enabled`
- `/setAutoCommitSettings maxCommitLength=5000`
- `/getAutoCommitSettings`
- `/resetAutoCommitSettings`
