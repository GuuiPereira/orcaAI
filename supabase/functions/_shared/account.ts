// Task 7 (exclusão de conta): enquanto o pedido de exclusão está em vigor
// (janela de 7 dias), a conta não deve gastar IA nem emitir orçamento - mesmo
// que o app de algum aparelho ainda esteja aberto. O usuário só enxerga o
// próprio pedido (RLS), então esta consulta com o cliente do usuário basta.
type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
  };
};

export async function rejectIfPendingDeletion(supabase: SupabaseLike): Promise<Response | null> {
  const { data } = await supabase.from("account_deletion_requests").select("user_id").maybeSingle();
  if (data) {
    return Response.json({ message: "account scheduled for deletion" }, { status: 403 });
  }
  return null;
}
