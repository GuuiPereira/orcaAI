export type FilePart = { uri: string; name: string; type: string };

// Na web o `uri` é um blob local: baixa e anexa como File de verdade.
export async function appendFilePart(form: FormData, fieldName: string, part: FilePart): Promise<void> {
  const blob = await (await fetch(part.uri)).blob();
  form.append(fieldName, new File([blob], part.name, { type: part.type }));
}
