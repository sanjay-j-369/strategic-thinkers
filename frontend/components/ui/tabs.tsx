"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

interface TabsContextValue {
  value: string;
  setValue: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error("Tabs components must be used inside <Tabs />");
  }
  return context;
}

function Tabs({
  value,
  onValueChange,
  className,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <TabsContext.Provider value={{ value, setValue: onValueChange }}>
      <div className={cn("space-y-4", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

function TabsList({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex border-2 border-black bg-white p-1 shadow-[4px_4px_0_0_#000]",
        className
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  value,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const { value: activeValue, setValue } = useTabsContext();
  const active = activeValue === value;

  return (
    <button
      type="button"
      data-state={active ? "active" : "inactive"}
      className={cn(
        "inline-flex min-w-[120px] items-center justify-center gap-2 border-2 border-black px-4 py-2 text-xs font-black uppercase tracking-[0.14em] transition-all",
        active
          ? "bg-[#ffde59] text-black shadow-[4px_4px_0_0_#000]"
          : "bg-white text-black hover:bg-[#dff2ff]",
        className
      )}
      onClick={() => setValue(value)}
      {...props}
    >
      {children}
    </button>
  );
}

function TabsContent({
  value,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const { value: activeValue } = useTabsContext();
  if (activeValue !== value) return null;
  return (
    <div className={cn("outline-none", className)} {...props}>
      {children}
    </div>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
