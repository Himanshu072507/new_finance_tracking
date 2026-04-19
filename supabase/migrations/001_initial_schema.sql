-- Users profile (extends auth.users)
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz not null default now()
);

-- Cards
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  bank_name text not null,
  card_name text not null,
  last4 text,
  created_at timestamptz not null default now()
);

-- Statements
create table public.statements (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  month date not null,
  file_path text not null,
  parsed_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'parsed', 'failed')),
  created_at timestamptz not null default now()
);

-- Transactions
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.statements(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  merchant text not null,
  amount numeric(12,2) not null check (amount >= 0),
  type text not null check (type in ('debit', 'credit')),
  category text not null default 'Other',
  notes text,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.users enable row level security;
alter table public.cards enable row level security;
alter table public.statements enable row level security;
alter table public.transactions enable row level security;

create policy "users: own row" on public.users
  for all using (auth.uid() = id);

create policy "cards: own rows" on public.cards
  for all using (auth.uid() = user_id);

create policy "statements: own rows" on public.statements
  for all using (auth.uid() = user_id);

create policy "transactions: own rows" on public.transactions
  for all using (auth.uid() = user_id);

-- Auto-create user profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Supabase Storage bucket for PDFs
insert into storage.buckets (id, name, public)
values ('statements', 'statements', false)
on conflict (id) do nothing;

create policy "statements storage: own files" on storage.objects
  for all using (auth.uid()::text = (storage.foldername(name))[1]);

-- Indexes for query performance
create index idx_cards_user_id on public.cards(user_id);
create index idx_statements_user_id on public.statements(user_id);
create index idx_statements_card_id on public.statements(card_id);
create index idx_transactions_statement_id on public.transactions(statement_id);
create index idx_transactions_user_id on public.transactions(user_id);
create index idx_transactions_date on public.transactions(date);
