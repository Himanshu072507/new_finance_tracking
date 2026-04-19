alter table public.statements
  add column source text not null default 'manual'
    check (source in ('manual', 'gmail_alert', 'gmail_statement')),
  add column gmail_message_id text;

create index idx_statements_gmail_message_id on public.statements(gmail_message_id)
  where gmail_message_id is not null;
