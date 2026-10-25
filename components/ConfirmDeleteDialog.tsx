'use client';

import { ConfirmDialog } from './ConfirmDialog';

interface ConfirmDeleteDialogProps {
  /** What is being deleted, as the reader knows it: the poem's title. */
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
  error?: string | null;
  busy?: boolean;
}

/** Asks before a saved poem is deleted for good. */
export function ConfirmDeleteDialog({ name, onConfirm, onCancel, error, busy }: ConfirmDeleteDialogProps) {
  return (
    <ConfirmDialog
      title={`Delete “${name}”?`}
      description="This poem will be removed from your collection. This can't be undone."
      confirmLabel="Delete poem"
      busyLabel="Deleting…"
      onConfirm={onConfirm}
      onCancel={onCancel}
      error={error}
      busy={busy}
    />
  );
}
