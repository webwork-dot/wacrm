# AI

Convexa AI uses bring-your-own provider keys stored encrypted per account.

## Providers

| Provider | Chat | Embeddings |
|----------|------|------------|
| OpenAI | Yes | Yes (default for vectors) |
| Anthropic | Yes | No — set a separate OpenAI embeddings key if needed |
| Gemini | Yes | Via configured embeddings path when present |

Provider selection lives in `ai_configs`. Generation: `src/lib/ai/generate.ts`.

## Knowledge

1. Upload documents → `ai_knowledge_documents`
2. Chunk + optional embed → `ai_knowledge_chunks`
3. Retrieve via `match_ai_knowledge_semantic` (pgvector) and/or `match_ai_knowledge_fts`
4. If embeddings fail, lexical rows still index (graceful degradation)
5. Without `vector` extension, semantic search returns empty; FTS continues

## Auto-reply

- Cap via `claim_ai_reply_slot` (atomic)
- Failures are logged; webhook path never throws into Meta processing
- Handoff fields on conversations / ai_configs

## Ops

- Reindex from Agents → Knowledge
- Check `/api/ai/schema/apply` for missing columns on upgraded DBs
- Ensure `ENCRYPTION_KEY` is set before storing provider secrets
