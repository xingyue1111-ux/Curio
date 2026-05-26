-- ============================================================
-- Curio · 叙事归档支持（P2-4 周报/月报）
-- 2026-05-26
--
-- 之前：narratives 表 unique (user_id, scope)，只能存一份当期叙事
-- 现在：加 period_key（"2026-W21" / "2026-05"），允许保留历史归档
-- ============================================================

-- 1. 加列
alter table public.narratives
  add column period_key text;

-- 2. 回填已有数据的 period_key（拿 generated_at 推）
update public.narratives
  set period_key = case
    when scope = 'recent_7d' then to_char(generated_at, 'IYYY-"W"IW')
    when scope = 'month' then to_char(generated_at, 'YYYY-MM')
  end
  where period_key is null;

-- 3. period_key 现在必填
alter table public.narratives
  alter column period_key set not null;

-- 4. 切 unique 约束 · 旧的 (user_id, scope) 拆掉，加 (user_id, scope, period_key)
alter table public.narratives
  drop constraint narratives_user_id_scope_key;

alter table public.narratives
  add constraint narratives_user_scope_period_key
  unique (user_id, scope, period_key);

-- 5. 索引：按时间倒序查归档
create index narratives_user_scope_period_idx
  on public.narratives (user_id, scope, period_key desc);
