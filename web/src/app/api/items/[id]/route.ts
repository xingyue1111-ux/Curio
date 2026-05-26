/**
 * DELETE /api/items/[id]
 *
 * 删一条 item：
 * 1. 鉴权 + owner check（防越权删别人的）
 * 2. 读出 storage_path（如果有），先删 Storage 文件
 * 3. 删 items 表（topic stats trigger 会自动重算）
 * 4. 失效叙事缓存（叙事会基于新条数重生成）
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getUserSupabase } from "@/lib/auth/current-user";
import { deleteFile } from "@/lib/storage/upload";
import { invalidateNarratives } from "@/lib/narratives/queries";

export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  const supabase = await getUserSupabase(user);

  // owner check + 拿 storage_path
  const { data: item, error: fetchErr } = await supabase
    .from("items")
    .select("id, user_id, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json(
      { error: "db_error", detail: fetchErr.message },
      { status: 500 }
    );
  }

  if (!item) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (item.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 先删 storage 文件（删了也不影响 DB，反之 DB 删了 storage 就成孤儿）
  if (item.storage_path) {
    await deleteFile(item.storage_path).catch((err) => {
      console.warn("[items.delete] storage 删除失败（已忽略）:", err);
    });
  }

  // 删 item
  const { error: delErr } = await supabase.from("items").delete().eq("id", id);
  if (delErr) {
    return NextResponse.json(
      { error: "db_error", detail: delErr.message },
      { status: 500 }
    );
  }

  // 失效叙事缓存（fire-and-forget）
  invalidateNarratives(user).catch((err) =>
    console.warn("[items.delete] invalidate narratives 失败:", err)
  );

  return NextResponse.json({ ok: true, deleted_id: id });
}
