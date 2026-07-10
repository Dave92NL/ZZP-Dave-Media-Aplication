# đź›ˇď¸Ź SECURITY.md - Inter-Process Communication Guardrails

## đź”’ 1. Electron IPC Sandbox Regulations
- All operational communication sequences between the Renderer and the Node Main process must pass through a strict \preload.js\ wrapper.
- **Validation Check:** Every IPC hook or listener added must match an entry inside the \VALID_CHANNELS\ array definitions. Immediately discard any unlisted string payloads.
- Never expose un-sandboxed access layers to the window runtime object.

## đź—„ď¸Ź 2. Cloud DB Layering
- Row Level Security (RLS) configurations must be accounted for in every database mutation or migration script.
- Supabase Edge Functions must explicitly validate JWT authentication signatures before processing state payloads.