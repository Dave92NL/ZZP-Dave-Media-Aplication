# đźŚż DECISION_TREE.md - Architectural Routing Logic

## đź—şď¸Ź 1. Core Selection Patterns
- **Data Persistence:** SQLite functions as the offline source of truth. Cloud synchronization passes through secure async batches to Supabase.
- **Media Manipulation:** FFmpeg executes stream operations, audio extraction, and metadata edits. DaVinci Resolve Scripting API handles timeline editing and final master outputs.