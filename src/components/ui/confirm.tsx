import { useState, type ReactNode } from "react";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { Input } from "./input";

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Delete",
  destructive = true,
  requireText,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  requireText?: string;
}) {
  const [typed, setTyped] = useState("");
  const ok = !requireText || typed.trim().toLowerCase() === requireText.toLowerCase();
  return (
    <Dialog
      open={open}
      onClose={() => {
        setTyped("");
        onClose();
      }}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={!ok}
            onClick={() => {
              setTyped("");
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-muted-foreground">
        <div>{description}</div>
        {requireText && (
          <div className="space-y-1.5">
            <label htmlFor="confirm-text" className="text-[13px] font-medium text-foreground">
              Type <span className="font-mono">{requireText}</span> to confirm
            </label>
            <Input id="confirm-text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-autofocus />
          </div>
        )}
      </div>
    </Dialog>
  );
}
