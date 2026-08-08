-- CRM core: contacts, tags, custom fields, notes

CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  phone_normalized TEXT GENERATED ALWAYS AS (regexp_replace(phone, '\D', '', 'g')) STORED,
  name TEXT,
  email TEXT,
  company TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON public.contacts (user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON public.contacts (phone);
CREATE INDEX IF NOT EXISTS idx_contacts_account ON public.contacts (account_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_phone_normalized
  ON public.contacts (account_id, phone_normalized)
  WHERE phone_normalized <> '';

CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tags_account ON public.tags (account_id);

CREATE TABLE IF NOT EXISTS public.contact_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT contact_tags_contact_id_tag_id_key UNIQUE (contact_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_tags_contact ON public.contact_tags (contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON public.contact_tags (tag_id);

CREATE TABLE IF NOT EXISTS public.custom_fields (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text',
  field_options JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_fields_account ON public.custom_fields (account_id);

CREATE TABLE IF NOT EXISTS public.contact_custom_values (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  custom_field_id UUID NOT NULL REFERENCES public.custom_fields(id) ON DELETE CASCADE,
  value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT contact_custom_values_contact_id_custom_field_id_key UNIQUE (contact_id, custom_field_id)
);

CREATE TABLE IF NOT EXISTS public.contact_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_notes_account ON public.contact_notes (account_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.contacts;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE PROCEDURE public.update_updated_at_column();
