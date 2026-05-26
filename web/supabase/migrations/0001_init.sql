-- ============================================================
-- Curio · 初始 schema (V0)
-- 创建于 2026-05-24
--
-- 设计参考：SPEC.md § 6 数据模型
-- 关键原则：每张表都启用 RLS，按 user_id 隔离（为 V2 多用户预留）
-- ============================================================

-- ---- 扩展 ----
create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ============================================================
-- 1. profiles ：扩展 auth.users，存用户偏好
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  -- 反思偏好（V0 默认 22:00 推送，V0.5 用户可调）
  reflection_hour smallint not null default 22 check (reflection_hour between 0 and 23),
  -- V2 商业化预留
  subscription_tier text not null default 'free' check (subscription_tier in ('free', 'pro')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_self_read"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_self_update"
  on public.profiles for update
  using (auth.uid() = id);

-- 注册时自动创建 profile
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 2. topics ：主题集合（AI 命名）
-- ============================================================
create table public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  color text,  -- 可选：未来如果允许用户自定义主题颜色（V0 全用 lime）
  ai_evolution_summary text,  -- AI 写的"认知演变"
  -- 物化字段（trigger 更新）
  item_count integer not null default 0,
  last_item_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create index topics_user_idx on public.topics (user_id, last_item_at desc nulls last);

alter table public.topics enable row level security;

create policy "topics_self_all"
  on public.topics for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 3. items ：每条捕获
-- ============================================================
create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  topic_id uuid references public.topics (id) on delete set null,

  -- 来源
  source_type text not null check (source_type in ('image', 'screenshot', 'text', 'voice', 'link')),
  raw_content text,        -- 文字内容 / 链接 URL
  storage_path text,       -- Supabase Storage 路径（图/音频）

  -- AI 处理结果
  ocr_text text,           -- 图片识别出的文字
  transcript_text text,    -- 语音转写
  user_note text,          -- 用户的 1 句话批注（最关键的意图信号）
  ai_summary text,         -- AI 一句简介
  ai_intent text,          -- AI 推测的"为什么记"

  -- 语义搜索向量（DashScope text-embedding-v3 是 1024 维）
  embedding vector(1024),

  -- AI 调用的元数据（debug + 模型升级回填）
  ai_meta jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index items_user_time_idx on public.items (user_id, created_at desc);
create index items_topic_idx on public.items (topic_id, created_at desc);
-- 向量检索索引（HNSW 比 IVFFlat 快、支持增量）
create index items_embedding_idx on public.items
  using hnsw (embedding vector_cosine_ops);

alter table public.items enable row level security;

create policy "items_self_all"
  on public.items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---- topic 物化字段同步 trigger ----
create or replace function public.refresh_topic_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_topic uuid;
begin
  target_topic := coalesce(new.topic_id, old.topic_id);
  if target_topic is not null then
    update public.topics
    set
      item_count = (select count(*) from public.items where topic_id = target_topic),
      last_item_at = (select max(created_at) from public.items where topic_id = target_topic),
      updated_at = now()
    where id = target_topic;
  end if;
  -- 如果是 topic_id 切换，旧 topic 也要刷新
  if tg_op = 'UPDATE' and old.topic_id is distinct from new.topic_id and old.topic_id is not null then
    update public.topics
    set
      item_count = (select count(*) from public.items where topic_id = old.topic_id),
      last_item_at = (select max(created_at) from public.items where topic_id = old.topic_id),
      updated_at = now()
    where id = old.topic_id;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger refresh_topic_on_item_change
  after insert or update or delete on public.items
  for each row execute function public.refresh_topic_stats();

-- ============================================================
-- 4. reflections ：每日反思
-- ============================================================
create table public.reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reflection_date date not null,
  mode text not null check (mode in ('journal', 'learning_card', 'coach')),
  ai_choice_reason text,           -- AI 为什么选这个模式
  content jsonb not null,          -- 结构化报告 sections
  lookback_item_ids uuid[],        -- 引用的"上周的你"item
  user_response text,              -- 用户读后回应
  created_at timestamptz not null default now(),
  unique (user_id, reflection_date)
);

create index reflections_user_date_idx on public.reflections (user_id, reflection_date desc);

alter table public.reflections enable row level security;

create policy "reflections_self_all"
  on public.reflections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 5. topic_maintenance_logs ：主题合并/拆分/改名记录
-- ============================================================
create table public.topic_maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (action in ('merge', 'split', 'rename')),
  before_state jsonb not null,
  after_state jsonb not null,
  ai_reason text,
  user_undid boolean not null default false,
  created_at timestamptz not null default now()
);

create index topic_maint_user_idx on public.topic_maintenance_logs (user_id, created_at desc);

alter table public.topic_maintenance_logs enable row level security;

create policy "topic_maint_self_all"
  on public.topic_maintenance_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 6. updated_at 自动维护
-- ============================================================
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger topics_touch_updated before update on public.topics
  for each row execute function public.touch_updated_at();

create trigger items_touch_updated before update on public.items
  for each row execute function public.touch_updated_at();

-- ============================================================
-- 7. 语义搜索 RPC（V0 给 API 调用）
-- ============================================================
create or replace function public.search_items(
  query_embedding vector(1024),
  match_count int default 20,
  similarity_threshold float default 0.4
)
returns table (
  id uuid,
  topic_id uuid,
  source_type text,
  ai_summary text,
  user_note text,
  raw_content text,
  ocr_text text,
  transcript_text text,
  similarity float,
  created_at timestamptz
)
language sql
stable
security definer
-- 关键：search_path 必须包含 extensions，否则向量操作符 <=> 找不到
set search_path = public, extensions
as $$
  select
    i.id,
    i.topic_id,
    i.source_type,
    i.ai_summary,
    i.user_note,
    i.raw_content,
    i.ocr_text,
    i.transcript_text,
    1 - (i.embedding <=> query_embedding) as similarity,
    i.created_at
  from public.items i
  where
    i.user_id = auth.uid()
    and i.embedding is not null
    and 1 - (i.embedding <=> query_embedding) > similarity_threshold
  order by i.embedding <=> query_embedding
  limit match_count;
$$;
