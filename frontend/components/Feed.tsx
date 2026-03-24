"use client";
import { ReactNode } from "react";

interface FeedProps {
  children: ReactNode;
}

export function Feed({ children }: FeedProps) {
  return (
    <div className="space-y-4">
      {children}
    </div>
  );
}
