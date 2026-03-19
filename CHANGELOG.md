# Changelog

## [1.0.0] - 2026-03-19

### Added
- 10 MCP tools: seq_search, seq_get_event, seq_recent, seq_stream, seq_signals, seq_query, seq_expression_indexes, seq_fields, seq_prefs, seq_prefs_update
- Formatter with 4 output modes: compact, table, detail, raw
- MessageTemplateTokens rendering with property resolution
- SQL query support via /api/data endpoint
- Expression indexes via /api/expressionindexes
- Field discovery by sampling events
- Preferences system (~/.seq-mcp-prefs.json)
- In-memory caching: signals (10 min), expression indexes (10 min), field values (10 min)
- Multiple signal combination with comma separation

### Fixed
- Properties handled in both array [{Name, Value}] and object {Key: Value} formats
- 400 responses from /api/data parsed as structured errors instead of throwing
- Signal + level filter conflict documented (signal-m33301 already includes Fatal)
