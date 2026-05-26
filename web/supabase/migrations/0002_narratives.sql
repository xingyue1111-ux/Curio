-- ============================================================
-- Curio · 叙事表（产品方向调整：去主题化、改叙事主页）
-- 2026-05-25
--
-- 用户反馈：「主题集合主页 = Notion 坟场雏形」
-- 决策：主页改为「最近 7 天 / 本月」AI 叙事
-- 主题降级为内部分类（不在主页展示）
-- ============================================================

-- 每个用户 × 每个 scope 只保留最新一条
create table public.narratives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scope text not null check (scope in ('recent_7d', 'month')),
  -- jsonb 字段：{ paragraphs: string[], highlight_item_ids?: uuid[], etc }
  content jsonb not null,
  -- 生成时点的 item 总数，用来判断是否需要重生（"item 没增加就不重生"也是个选项）
  item_count_at_gen integer not null default 0,
  -- 生成耗时（debug + 看 AI 慢不慢）
  generation_ms integer,
  generated_at timestamptz not null default now(),
  unique (user_id, scope)
);

create index narratives_user_scope_idx on public.narratives (user_id, scope);

alter table public.narratives enable row level security;

create policy "narratives_self_all"
  on public.narratives for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
