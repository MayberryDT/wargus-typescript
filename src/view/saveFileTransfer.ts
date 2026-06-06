export function downloadJsonFile(json: string, filename: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function pickJsonFileText(): Promise<string | null> {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  const file = await new Promise<File | null>((resolve) => {
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
  return file ? file.text() : null;
}

export function saveFilenameForSlot(slot: number, mapPath: string): string {
  return `wargus-slot-${slot}-${mapPath.split("/").at(-1) ?? "save"}.json`;
}
