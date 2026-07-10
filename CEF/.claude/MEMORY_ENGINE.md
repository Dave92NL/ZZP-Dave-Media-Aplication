# đź’ľ MEMORY_ENGINE.md - Context Preservation & Chat Hygiene

## đź§Ľ 1. Context Bloat Cleanup
- To eliminate model degradation or context drift during long chats, track context health limits.
- Force session separation: Open an isolated workspace thread when moving between local accounting calculations and background media processing Python layers.
- Limit context calls explicitly to target files using precise system indexing.