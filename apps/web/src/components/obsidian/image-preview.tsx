import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@bessel/ui/components/empty";
import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";
import { basenameOf, vaultAssetUrl } from "./lib/wikilinks";

export interface ImagePreviewProps {
  root: string;
  rel: string;
}

export function ImagePreview({ root, rel }: ImagePreviewProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [root, rel]);

  if (failed) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <ImageOff className="mx-auto size-8 text-white/20" />
          <EmptyTitle>Image unavailable</EmptyTitle>
          <EmptyDescription>
            {basenameOf(rel)} couldn&apos;t be previewed.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-5 pt-4 pb-3 text-lg font-semibold text-white/90">
        {basenameOf(rel)}
      </div>
      <div className="min-h-0 flex-1 p-5 pt-0">
        <div className="h-full min-h-0 w-full rounded-md border border-white/[0.06] bg-[image:repeating-conic-gradient(#ffffff0d_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-4">
          <img
            src={vaultAssetUrl(root, rel)}
            alt={basenameOf(rel)}
            draggable={false}
            onError={() => setFailed(true)}
            className="h-full w-full object-contain"
          />
        </div>
      </div>
    </div>
  );
}
