// Apaga tudo sob um prefixo de um bucket (objetos de Storage não têm FK, então
// não somem junto com a organização). Recursivo porque os caminhos têm
// subpastas (ex.: quote-pdfs/{org}/{quote}/{versão}.pdf). Devolve quantos
// objetos removeu.
type StorageAdmin = {
  storage: {
    from: (bucket: string) => {
      list: (
        prefix: string,
        options: { limit: number },
      ) => Promise<{ data: { id: string | null; name: string }[] | null; error: unknown }>;
      remove: (paths: string[]) => Promise<{ error: unknown }>;
    };
  };
};

export async function removePrefix(admin: StorageAdmin, bucket: string, prefix: string): Promise<number> {
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw error;

  let removed = 0;
  const files: string[] = [];
  for (const entry of data ?? []) {
    // Pasta: `id` vem null na listagem do Storage.
    if (entry.id === null) removed += await removePrefix(admin, bucket, `${prefix}/${entry.name}`);
    else files.push(`${prefix}/${entry.name}`);
  }
  if (files.length > 0) {
    const { error: removeError } = await admin.storage.from(bucket).remove(files);
    if (removeError) throw removeError;
    removed += files.length;
  }
  return removed;
}
