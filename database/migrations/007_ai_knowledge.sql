-- AI configs, knowledge base (optional pgvector), usage & traces

DO $$
BEGIN
  CREATE EXTENSION vector;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pgvector extension unavailable — semantic search disabled (%).', SQLERRM;
END $$;

CREATE TABLE IF NOT EXISTS public.ai_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL UNIQUE REFERENCES public.accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  connection_id UUID,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic')),
  model TEXT NOT NULL,
  api_key TEXT NOT NULL,
  embeddings_api_key TEXT,
  system_prompt TEXT,
  studio_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  auto_reply_enabled BOOLEAN NOT NULL DEFAULT false,
  auto_reply_max_per_conversation INTEGER NOT NULL DEFAULT 3
    CHECK (auto_reply_max_per_conversation BETWEEN 1 AND 20),
  handoff_agent_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual', 'faq', 'pdf', 'website')),
  source_url TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced'
    CHECK (sync_status IN ('idle', 'syncing', 'synced', 'error')),
  last_synced_at TIMESTAMPTZ,
  sync_error TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_knowledge_documents_account_id_idx
  ON public.ai_knowledge_documents (account_id);

-- Base table without embedding; add vector column when extension is present.
CREATE TABLE IF NOT EXISTS public.ai_knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.ai_knowledge_documents(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  fts TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_account_id_idx
  ON public.ai_knowledge_chunks (account_id);
CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_document_id_idx
  ON public.ai_knowledge_chunks (document_id);
CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_fts_idx
  ON public.ai_knowledge_chunks USING gin (fts);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ai_knowledge_chunks'
        AND column_name = 'embedding'
    ) THEN
      ALTER TABLE public.ai_knowledge_chunks
        ADD COLUMN embedding vector(1536);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = 'ai_knowledge_chunks_embedding_idx'
        AND n.nspname = 'public'
    ) THEN
      CREATE INDEX ai_knowledge_chunks_embedding_idx
        ON public.ai_knowledge_chunks USING hnsw (embedding vector_cosine_ops);
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  mode TEXT NOT NULL CHECK (mode IN ('auto_reply', 'draft')),
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic')),
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_account_created
  ON public.ai_usage_log (account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_execution_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('sandbox', 'playground', 'draft', 'auto_reply')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_execution_traces_account
  ON public.ai_execution_traces (account_id, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.ai_configs;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.ai_configs
  FOR EACH ROW
  EXECUTE PROCEDURE public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at ON public.ai_knowledge_documents;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.ai_knowledge_documents
  FOR EACH ROW
  EXECUTE PROCEDURE public.update_updated_at_column();

-- Lexical retrieval (always available).
CREATE OR REPLACE FUNCTION public.match_ai_knowledge_fts(
  p_account_id UUID,
  p_query TEXT,
  p_match_count INTEGER
)
RETURNS TABLE (id UUID, content TEXT, rank REAL)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id,
         c.content,
         ts_rank(c.fts, plainto_tsquery('simple', p_query)) AS rank
  FROM ai_knowledge_chunks c
  WHERE c.account_id = p_account_id
    AND c.fts @@ plainto_tsquery('simple', p_query)
  ORDER BY rank DESC
  LIMIT GREATEST(p_match_count, 0);
$$;

-- Semantic retrieval when pgvector is installed; otherwise no-op empty set.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.match_ai_knowledge_semantic(
        p_account_id UUID,
        p_query_embedding TEXT,
        p_match_count INTEGER
      )
      RETURNS TABLE (id UUID, content TEXT, distance REAL)
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $body$
        SELECT c.id,
               c.content,
               (c.embedding <=> p_query_embedding::vector(1536)) AS distance
        FROM ai_knowledge_chunks c
        WHERE c.account_id = p_account_id
          AND c.embedding IS NOT NULL
        ORDER BY c.embedding <=> p_query_embedding::vector(1536)
        LIMIT GREATEST(p_match_count, 0);
      $body$;
    $fn$;
  ELSE
    CREATE OR REPLACE FUNCTION public.match_ai_knowledge_semantic(
      p_account_id UUID,
      p_query_embedding TEXT,
      p_match_count INTEGER
    )
    RETURNS TABLE (id UUID, content TEXT, distance REAL)
    LANGUAGE plpgsql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $stub$
    BEGIN
      RETURN;
    END;
    $stub$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.claim_ai_reply_slot(
  conversation_id UUID,
  max_replies INTEGER
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH claimed AS (
    UPDATE conversations
    SET ai_reply_count = ai_reply_count + 1
    WHERE id = conversation_id
      AND ai_reply_count < max_replies
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM claimed);
$$;
