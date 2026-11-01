"use client";

import { useState, type ReactNode } from "react";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";

export interface ReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  reasonRequired?: boolean;
  pending?: boolean;
  onConfirm: (reason: string) => void;
}

/** Confirmation dialog collecting a free-text reason for a reviewed decision. */
export function ReasonDialog({ open, onOpenChange, title, description, confirmLabel, destructive, reasonRequired = true, pending, onConfirm }: ReasonDialogProps) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const close = (next: boolean) => {
    if (!next) setReason("");
    onOpenChange(next);
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (reasonRequired && !trimmed) return;
            onConfirm(trimmed);
            setReason("");
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="decision-reason" className="text-xs">
              Reason{reasonRequired ? "" : " (optional)"}
            </Label>
            <Textarea id="decision-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={2000} className="text-xs" autoFocus />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" variant={destructive ? "destructive" : "default"} disabled={pending || (reasonRequired && !trimmed)}>
              {pending ? "Submitting…" : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
