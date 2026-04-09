import { cn } from "@/lib/utils";

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse border-2 border-black bg-[#111]/10 shadow-[4px_4px_0_0_#000]",
        className
      )}
    />
  );
}

export { Skeleton };
