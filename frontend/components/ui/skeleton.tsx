import { cn } from "@/lib/utils";

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        " animate-pulse border border-border bg-foreground/10",
        className
      )}
    />
  );
}

export { Skeleton };
