# OpenCode Logging - client.app.log

**Date:** 2026-02-15
**Topic:** Where `client.app.log` writes logs in OpenCode

## Summary

`client.app.log()` logs from OpenCode plugins are written to a centralized log directory managed by the OpenCode application. These are structured logs that include the service name, log level, and message.

## Log Location

**macOS:**
```
~/.local/share/opencode/log/
```

**Typical log file naming:**
- Format: `YYYY-MM-DDTHHMMSS.log` (ISO 8601 timestamp)
- Examples:
  - `2026-02-15T182242.log`
  - `2026-02-15T185435.log`
  - `dev.log` (for development builds)

**Other platforms:**
Logs likely follow XDG Base Directory Specification:
- Linux: `~/.local/share/opencode/log/` or `~/.local/state/opencode/log/`
- Windows: `%LOCALAPPDATA%\opencode\log\`

## Log Format

Logs are structured and include:
- **Timestamp**: ISO 8601 format with milliseconds
- **Log Level**: `INFO`, `DEBUG`, `WARN`, `ERROR`
- **Service Name**: Plugin-defined service identifier
- **Message**: Log message text
- **Extra fields**: Optional structured data

**Example log entries:**

```
INFO  2026-02-15T18:22:45 +0ms service=opencode-autocommit chat.message hook called with sessionID: ses_39d759104ffeobduEeBKGfFYBn, mode: immediate
INFO  2026-02-15T18:22:45 +0ms service=opencode-autocommit performCommit called with sessionID: ses_39d759104ffeobduEeBKGfFYBn, mode: immediate
```

## Usage in Plugins

**Basic usage:**

```typescript
await client.app.log({
  body: {
    service: "my-plugin",
    level: "info",
    message: "Plugin initialized",
  },
});
```

**With extra data:**

```typescript
await client.app.log({
  body: {
    service: "opencode-autocommit",
    level: "error",
    message: "Failed to commit changes",
    extra: { error: error instanceof Error ? error.message : String(error) },
  },
});
```

**Available log levels:**
- `debug` - Detailed debugging information
- `info` - General informational messages
- `warn` - Warning messages
- `error` - Error messages

## Log Management

**Log rotation:**
- New log files are created periodically
- Timestamp-based file naming prevents conflicts
- Old log files are retained (no automatic deletion observed)

**Accessing logs:**
- Direct file access: `cat ~/.local/share/opencode/log/YYYY-MM-DDTHHMMSS.log`
- Filter by service: `grep "service=your-plugin-name" ~/.local/share/opencode/log/*.log`
- Follow logs in real-time: `tail -f ~/.local/share/opencode/log/$(ls -t ~/.local/share/opencode/log/*.log | head -1)`

## Example from opencode-autocommit

The autocommit plugin uses `client.app.log()` to log:

1. **Debug messages** - When there are no changes to commit
2. **Info messages** - When commits succeed
3. **Error messages** - When git operations fail

```typescript
// Example from autocommit.ts
await client.app.log({
  body: {
    service: "opencode-autocommit",
    level: "debug",
    message: "No changes to commit",
  },
});
```

## References

- OpenCode Plugin Documentation: https://github.com/anomalyco/opencode
- OpenCode Repository: https://github.com/anomalyco/opencode
- Plugin logging examples found across multiple OpenCode plugin repositories

## Notes

- Logs are structured and machine-parseable
- Service names help filter logs from specific plugins
- Use `client.app.log()` instead of `console.log` for plugin logging
- Logs persist across OpenCode restarts
- No built-in log level filtering observed - all log entries are written
