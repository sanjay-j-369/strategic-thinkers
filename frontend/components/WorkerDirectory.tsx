"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Lock, Sparkles } from "lucide-react";

import { WorkerConfigDrawer, type WorkerItem } from "@/components/WorkerConfigDrawer";
import { useAuth } from "@/components/providers/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

export function WorkerDirectory() {
  const { token, isAuthenticated, loading, user } = useAuth();
  const [workers, setWorkers] = useState<WorkerItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeWorker, setActiveWorker] = useState<WorkerItem | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !isAuthenticated) return;
    let active = true;

    async function loadWorkers() {
      try {
        const data = await apiFetch<{ items: WorkerItem[] }>("/api/workers", { token });
        if (!active) return;
        setWorkers(data.items || []);
        setError(null);
      } catch (fetchError) {
        if (!active) return;
        setWorkers([]);
        setError(fetchError instanceof Error ? fetchError.message : "Failed to load workers.");
      }
    }

    void loadWorkers();
    return () => {
      active = false;
    };
  }, [isAuthenticated, token]);

  const hiredWorkers = useMemo(
    () => workers.filter((worker) => worker.status === "hired"),
    [workers]
  );

  async function hireWorker(workerKey: string) {
    if (!token) return;
    setPendingKey(workerKey);
    try {
      const worker = await apiFetch<WorkerItem>(`/api/workers/${workerKey}/hire`, {
        method: "POST",
        token,
      });
      setWorkers((current) =>
        current.map((item) => (item.worker_key === workerKey ? worker : item))
      );
      setActiveWorker(worker);
      setError(null);
    } catch (hireError) {
      setError(hireError instanceof Error ? hireError.message : "Failed to hire worker.");
    } finally {
      setPendingKey(null);
    }
  }

  async function saveConfig(workerKey: string, config: WorkerItem["config"]) {
    if (!token) return;
    setPendingKey(workerKey);
    try {
      const updated = await apiFetch<WorkerItem>(`/api/workers/${workerKey}/config`, {
        method: "PUT",
        token,
        json: { config },
      });
      setWorkers((current) =>
        current.map((item) => (item.worker_key === workerKey ? updated : item))
      );
      setActiveWorker(updated);
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save worker configuration.");
      throw saveError;
    } finally {
      setPendingKey(null);
    }
  }

  if (loading) {
    return <div className="border border-neutral-300 px-8 py-20 text-center text-sm text-neutral-500">Loading worker directory...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="grid gap-4 border border-neutral-300 px-8 py-16 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Workers</p>
        <h1 className="font-sans text-5xl font-extrabold uppercase tracking-[-0.08em] text-black">
          Sign in to hire workers.
        </h1>
        <p className="mx-auto max-w-2xl text-sm leading-7 text-neutral-600">
          The worker marketplace is account-specific. Authenticate to provision and configure background operators.
        </p>
        <div>
          <Button asChild className="rounded-none border-black bg-black text-white hover:bg-black/90">
            <Link href="/sign-in">Sign In</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="grid gap-8">
        <header className="grid gap-6 border-b border-neutral-300 pb-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-neutral-500">Worker Marketplace</p>
            <h1 className="mt-4 font-sans text-6xl font-extrabold uppercase tracking-[-0.08em] text-black">
              Configure the GTM agent.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-8 text-neutral-600">
              Founder OS now runs a strategic GTM pillar instead of generic tools. Its behavior changes based on your selected security mode.
            </p>
          </div>
          <div className="grid gap-3 lg:col-span-4 lg:justify-self-end">
            <div className="border border-neutral-300 px-5 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">Hired now</p>
              <p className="mt-3 text-5xl font-extrabold tracking-[-0.08em] text-black">{hiredWorkers.length}</p>
            </div>
            <div className="border border-neutral-300 px-5 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">Security mode</p>
              <p className="mt-3 inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-black">
                {user?.security_mode === "vault" ? <Lock className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                {user?.security_mode === "vault" ? "Vault Mode" : "Magic Mode"}
              </p>
            </div>
          </div>
        </header>

        {error ? (
          <div className="border border-black bg-black px-5 py-4 text-sm text-white">{error}</div>
        ) : null}

        <div className="grid grid-cols-12 gap-x-5 gap-y-5">
          {workers.map((worker) => {
            const hired = worker.status === "hired";
            const busy = pendingKey === worker.worker_key;

            return (
              <article key={worker.worker_key} className="col-span-12 grid min-h-[340px] content-between border border-neutral-300 bg-white p-6 md:col-span-6 xl:col-span-4">
                <div className="grid gap-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid gap-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
                        {worker.live_status}
                      </p>
                      <h2 className="font-sans text-3xl font-extrabold uppercase tracking-[-0.06em] text-black">
                        {worker.name}
                      </h2>
                    </div>
                    {hired ? (
                      <Badge className="rounded-none border-black bg-black text-white">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="rounded-none border-neutral-300 text-black">
                        Available
                      </Badge>
                    )}
                  </div>

                  <p className="text-sm leading-7 text-neutral-600">{worker.description}</p>

                  <div className="grid gap-3 border-t border-neutral-300 pt-5">
                    <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                      <span>Monitor targets</span>
                      <span>{worker.status}</span>
                    </div>
                    <p className="text-sm text-black">{worker.config.monitor_targets || "Not set"}</p>
                    <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                      Digest emails: {worker.config.daily_digest_emails ? "On" : "Off"}
                    </p>
                  </div>
                </div>

                <div className="mt-8 flex items-center justify-between gap-3 border-t border-neutral-300 pt-5">
                  {hired ? (
                    <>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
                        Configured in your org
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setActiveWorker(worker)}
                        className="rounded-none border-black bg-white text-black hover:bg-black hover:text-white"
                      >
                        Configure
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
                        Provision default config
                      </span>
                      <Button
                        type="button"
                        onClick={() => void hireWorker(worker.worker_key)}
                        disabled={busy}
                        className="rounded-none border-black bg-black text-white hover:bg-black/90"
                      >
                        {busy ? "Hiring" : "Hire Worker"}
                      </Button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-neutral-300 pt-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-500">
            Control room reflects only hired workers.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-black"
          >
            Open founder control room
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <WorkerConfigDrawer
        open={Boolean(activeWorker)}
        worker={activeWorker}
        saving={pendingKey === activeWorker?.worker_key}
        onOpenChange={(open) => {
          if (!open) setActiveWorker(null);
        }}
        onSave={saveConfig}
      />
    </>
  );
}
