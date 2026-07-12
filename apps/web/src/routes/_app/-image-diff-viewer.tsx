function ImagePane({ label, src }: { label: string; src: string }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center gap-2">
      <span className="shrink-0 text-10 uppercase tracking-wide text-white/50">
        {label}
      </span>
      {/* Checkerboard so transparency in the image itself stays visible. */}
      <div className="flex min-h-0 w-full flex-1 items-center justify-center overflow-auto rounded-md border border-white/[0.06] bg-[image:repeating-conic-gradient(#ffffff0d_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-2">
        <img src={src} alt={label} className="max-h-full max-w-full object-contain" />
      </div>
    </div>
  );
}

export function ImageDiffViewer({
  oldImage,
  newImage,
}: {
  oldImage: string | null;
  newImage: string | null;
}) {
  if (!oldImage && !newImage) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-white/50">
        Image not available
      </div>
    );
  }

  if (oldImage && newImage) {
    return (
      <div className="flex h-full min-h-0 flex-1 gap-3 overflow-hidden p-3">
        <ImagePane label="Before" src={oldImage} />
        <ImagePane label="After" src={newImage} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden p-3">
      <ImagePane label={newImage ? "Added" : "Deleted"} src={(newImage ?? oldImage) as string} />
    </div>
  );
}
