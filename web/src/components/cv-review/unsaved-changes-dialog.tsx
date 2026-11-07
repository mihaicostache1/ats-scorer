"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Asks before leaving with unsaved corrections. "Keep editing" has the focus, so pressing Enter or
 * Space by mistake never discards work; Esc also keeps editing. Focus returns to where it was.
 */
export function UnsavedChangesDialog({
  open,
  onStay,
  onLeave,
}: {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
}) {
  const stayRef = React.useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onStay();
      }}
    >
      <DialogContent initialFocus={stayRef} hideClose>
        <DialogHeader>
          <DialogTitle>Discard unsaved changes?</DialogTitle>
          <DialogDescription>
            You have edited this profile but not saved it. If you leave now, those corrections are
            lost.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button ref={stayRef} type="button" variant="outline" onClick={onStay}>
            Keep editing
          </Button>
          <Button type="button" variant="destructive" onClick={onLeave}>
            Discard changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
