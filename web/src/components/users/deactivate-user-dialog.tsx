"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { deactivateUser } from "@/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { ActionAlert } from "./action-alert";
import { describeUserActionError, NETWORK_ACTION_ERROR, type UserActionError } from "./user-errors";
import type { UserProfile } from "./use-users";

/**
 * Confirmation before deactivating an account. The dialog opens with focus on Cancel, closes with
 * Esc, and can't be dismissed while the request is in flight. When the API refuses (yourself, or
 * the last active admin) the reason is shown inside the dialog and it stays open, so the message
 * can't be missed.
 */
export function DeactivateUserDialog({
  user,
  currentUserId,
  open,
  onOpenChange,
  onDeactivated,
}: {
  user: UserProfile | null;
  currentUserId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeactivated: (user: UserProfile) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState<UserActionError | null>(null);
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  // A previous refusal must not greet the next person to be deactivated.
  const [seenId, setSeenId] = React.useState<string | undefined>(user?.id);
  if (user?.id !== seenId) {
    setSeenId(user?.id);
    setFailure(null);
  }

  const confirm = async () => {
    if (!user) return;
    setBusy(true);
    setFailure(null);
    try {
      const { data, error, response } = await deactivateUser(user.id);
      if (!data) {
        setFailure(describeUserActionError("deactivate", error, response.status));
        return;
      }
      onOpenChange(false);
      toast.success(
        `${data.full_name} was deactivated and can no longer sign in.`,
        "User deactivated"
      );
      onDeactivated(data);
    } catch {
      setFailure(NETWORK_ACTION_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const isSelf = user !== null && user.id === currentUserId;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Don't let Esc or a backdrop click interrupt a request in flight.
        if (!next && busy) return;
        if (!next) setFailure(null);
        onOpenChange(next);
      }}
    >
      <DialogContent initialFocus={cancelRef} hideClose>
        <DialogHeader>
          <DialogTitle>
            {isSelf ? "Deactivate your own account?" : "Deactivate this user?"}
          </DialogTitle>
          <DialogDescription>
            <span className="text-foreground font-medium">{user?.full_name}</span>
            {user && <span> ({user.email})</span>}
            {" — "}
            they lose access straight away and their active sessions end. Their data is kept and you
            can find them under the Inactive filter.
          </DialogDescription>
        </DialogHeader>
        {failure && <ActionAlert error={failure} />}
        <DialogFooter>
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {failure ? "Close" : "Cancel"}
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={confirm}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {busy ? "Deactivating…" : "Deactivate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
