import {
  deleteDeviceV1DevicesDeviceIdDeleteMutation,
  type DeviceSchema,
  listDevicesV1DevicesGetOptions,
  listDevicesV1DevicesGetQueryKey,
  updateDeviceV1DevicesDeviceIdPatchMutation,
} from "@bessel/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { SectionLabel } from "@/components/settings-section-label";
import { client } from "@/lib/client";

function formatLastSeen(value: string | Date): string {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function DevicesPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const { data: devices = [] } = useQuery(
    listDevicesV1DevicesGetOptions({ client }),
  );

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: listDevicesV1DevicesGetQueryKey({ client }),
    });

  const renameMutation = useMutation({
    ...updateDeviceV1DevicesDeviceIdPatchMutation(),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    ...deleteDeviceV1DevicesDeviceIdDeleteMutation(),
    onSuccess: invalidate,
  });

  const startEdit = (d: DeviceSchema) => {
    setEditingId(d.id);
    setEditName(d.name);
  };

  const saveEdit = () => {
    if (!editingId || !editName.trim()) {
      setEditingId(null);
      return;
    }
    renameMutation.mutate(
      { client, path: { device_id: editingId }, body: { name: editName.trim() } },
      { onSuccess: () => setEditingId(null) },
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Devices</SectionLabel>
        <p className="mb-3 text-12 text-white/50">
          Each device keeps its own project paths and SSH hosts. Remove a
          device to forget its saved locations.
        </p>
        <div className="space-y-2">
          {devices.length === 0 && (
            <p className="text-13 text-white/40">No devices yet</p>
          )}
          {devices.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3"
            >
              {editingId === d.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                  onBlur={saveEdit}
                  className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-13 text-white/80 outline-none focus:border-primary-500/40"
                />
              ) : (
                <div className="min-w-0">
                  <p className="truncate text-13 text-white/80">{d.name}</p>
                  <p className="text-11 text-white/40">
                    Last active {formatLastSeen(d.last_seen_at)}
                  </p>
                </div>
              )}
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => startEdit(d)}
                  className="rounded p-1.5 text-white/30 transition-colors hover:bg-white/5 hover:text-white/70"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={() =>
                    deleteMutation.mutate({ client, path: { device_id: d.id } })
                  }
                  className="rounded p-1.5 text-white/30 transition-colors hover:bg-white/5 hover:text-red-400"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
