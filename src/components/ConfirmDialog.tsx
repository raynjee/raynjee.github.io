// In-app confirm dialog — replaces browser window.confirm() with a styled
// modal that matches the app theme. Any component can call confirm() via the
// useConfirm() hook. The dialog is a promise: it resolves to true/false.
//
// Usage:
//   const confirm = useConfirm();
//   const ok = await confirm({ title: "Delete?", description: "This can't be undone." });

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmOptions {
  title: string;
  description: string;
  cancelLabel?: string;
  actionLabel?: string;
  /** If true, the action button is red/destructive. */
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn>(async () => false);

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmCtx);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [resolveRef] = useState<{ current: ((v: boolean) => void) | null }>(() => ({ current: null }));

  const confirm: ConfirmFn = useCallback(
    (options) =>
      new Promise<boolean>((resolve) => {
        setOpts(options);
        resolveRef.current = resolve;
        setOpen(true);
      }),
    [],
  );

  const handleAnswer = useCallback(
    (value: boolean) => {
      setOpen(false);
      resolveRef.current?.(value);
      resolveRef.current = null;
    },
    [],
  );

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(v) => { if (!v) handleAnswer(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
            {opts?.description && (
              <AlertDialogDescription>{opts.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleAnswer(false)}>
              {opts?.cancelLabel ?? "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleAnswer(true)}
              className={opts?.destructive ? "bg-red-600 hover:bg-red-700 text-white" : ""}
            >
              {opts?.actionLabel ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmCtx.Provider>
  );
}
