import {
  type DeviceSchema,
  deleteDeviceMutation,
  listDevicesOptions,
  listDevicesQueryKey,
  updateDeviceMutation,
} from "@bessel/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { SettingsRow, SettingsSection } from "@/components/settings-ui";
import { IconButton, TextInput } from "@/components/ui-kit";
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

  const { data: devices = [] } = useQuery(listDevicesOptions({ client }));

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: listDevicesQueryKey({ client }),
    });

  const renameMutation = useMutation({
    ...updateDeviceMutation(),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    ...deleteDeviceMutation(),
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
      {
        client,
        path: { device_id: editingId },
        body: { name: editName.trim() },
      },
      { onSuccess: () => setEditingId(null) },
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <SettingsSection
          title="Devices"
          description="Each device keeps its own project paths and SSH hosts. Remove a device to forget its saved locations."
        >
          {devices.length === 0 && <SettingsRow label="No devices yet" />}
          {devices.map((d) => (
            <div
              key={d.id}
              className="flex min-h-14 items-center justify-between gap-3 py-3"
            >
              {editingId === d.id ? (
                <TextInput
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                  onBlur={saveEdit}
                  className="h-7 flex-1"
                />
              ) : (
                <div className="min-w-0">
                  <p className="truncate text-13 text-white/85">{d.name}</p>
                  <p className="mt-0.5 text-12 text-white/45">
                    Last active {formatLastSeen(d.last_seen_at)}
                  </p>
                </div>
              )}
              <div className="flex shrink-0 items-center gap-1">
                <IconButton onClick={() => startEdit(d)} title="Rename">
                  <Pencil />
                </IconButton>
                <IconButton
                  destructive
                  title="Remove device"
                  onClick={() =>
                    deleteMutation.mutate({
                      client,
                      path: { device_id: d.id },
                    })
                  }
                >
                  <Trash2 />
                </IconButton>
              </div>
            </div>
          ))}
        </SettingsSection>
      </div>
    </div>
  );
}
