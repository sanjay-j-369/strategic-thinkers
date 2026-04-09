import { cn } from "@/lib/utils";

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "shadow-pixel animate-pulse border-2 border-border bg-foreground/10",
        className
      )}
    />
  );
}

export { Skeleton };
