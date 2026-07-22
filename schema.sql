import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("tickets_gerados")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tickets: data });
}

// Marca um ticket como já copiado/usado, pra sumir da lista de pendentes.
export async function PATCH(req: NextRequest) {
  const { id, copiado } = await req.json();
  const supabase = getSupabaseServerClient();

  const { error } = await supabase
    .from("tickets_gerados")
    .update({ copiado })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
