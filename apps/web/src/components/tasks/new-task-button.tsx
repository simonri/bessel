import { Plus } from "lucide-react";
import { useState } from "react";
import { TaskFormDialog } from "@/components/create-task-dialog";
import { PrimaryButton } from "@/components/ui-kit";

/** Opens the full new-task form, starting in `defaultProject` when there is one. */
export function NewTaskButton({
  defaultProject,
}: {
  defaultProject?: string | null;
}) {
  const [open, setOpen] = useState(false);
  // A fresh form each time it opens.
  const [epoch, setEpoch] = useState(0);
  return (
    <>
      <PrimaryButton
        size="sm"
        onClick={() => {
          setEpoch((n) => n + 1);
          setOpen(true);
        }}
      >
        <Plus />
        New task
      </PrimaryButton>
      <TaskFormDialog
        key={epoch}
        open={open}
        onOpenChange={setOpen}
        defaultProject={defaultProject}
      />
    </>
  );
}
