import { cn } from "@/lib/utils";

type VaultToastProps = {
  message: string;
  mobileOffset?: boolean;
};

export function VaultToast({ message, mobileOffset = true }: VaultToastProps) {
  return (
    <div
      className={cn(
        "fixed left-1/2 z-[100] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-border/80 bg-card px-4 py-2.5 text-sm shadow-lg backdrop-blur-sm",
        mobileOffset ? "bottom-24 md:bottom-4" : "bottom-4",
      )}
      role="status"
    >
      {message}
    </div>
  );
}
