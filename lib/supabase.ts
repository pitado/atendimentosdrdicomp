import { createClient } from "@supabase/supabase-js";

// Usa a Service Role Key — este projeto roda só no servidor (API routes /
// cron da Vercel), nunca no browser, então é seguro usar a chave completa
// aqui. NUNCA importe este arquivo em um componente client ("use client").
export function getSupabaseServerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados nas variáveis de ambiente."
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
