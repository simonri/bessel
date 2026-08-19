import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@bessel/ui/components/context-menu";
import { Copy } from "lucide-react";
import type { ReactElement } from "react";
import { toast } from "sonner";

interface VaultImageLocation {
  root: string;
  rel: string;
}

export function vaultImageLocation(src: string): VaultImageLocation | null {
  try {
    const url = new URL(src);
    if (url.protocol !== "vault:") return null;
    const root = url.searchParams.get("root");
    const rel = url.searchParams.get("path");
    return root && rel !== null ? { root, rel } : null;
  } catch {
    return null;
  }
}

async function blobAsPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image conversion isn't available");
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (png) =>
          png ? resolve(png) : reject(new Error("Image conversion failed")),
        "image/png",
      ),
    );
  } finally {
    bitmap.close();
  }
}

/** Copies a local vault image through Electron. HTTP images use the browser
 * clipboard as a best-effort fallback when their server permits fetching. */
export async function copyImageSource(src: string): Promise<void> {
  const location = vaultImageLocation(src);
  if (location) {
    const api = window.electron?.vault;
    if (!api) throw new Error("Image copying requires the desktop app");
    await api.copyImage(location.root, location.rel);
    return;
  }

  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
    throw new Error("Image copying isn't supported here");
  const response = await fetch(src);
  if (!response.ok) throw new Error("The image couldn't be downloaded");
  const png = await blobAsPng(await response.blob());
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

export async function copyImageWithFeedback(src: string): Promise<void> {
  try {
    await copyImageSource(src);
    toast.success("Image copied");
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "The image couldn't be copied",
    );
  }
}

export function CopyImageContextMenu({
  src,
  children,
}: {
  src: string;
  children: ReactElement;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => void copyImageWithFeedback(src)}>
          <Copy />
          Copy image
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
