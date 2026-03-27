interface PrepCardData {
  type: "ASSISTANT_PREP";
  topic: string;
  summary: string;
  entities?: string[];
  generated_at: string;
}

export function PrepCard({ data }: { data: PrepCardData }) {
  const lines = data.summary?.split("\n").filter(Boolean) || [];

  return (
    <div className="glass rounded-2xl overflow-hidden glow-amber animate-fade-in">
      <div className="px-5 py-3 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span className="text-amber-300 font-semibold text-xs uppercase tracking-widest">Meeting Prep</span>
        {data.entities && data.entities.length > 0 && (
          <div className="ml-auto flex gap-1">
            {data.entities.slice(0, 2).map((e, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs">
                {e.split("@")[0]}
              </span>
            ))}
          </div>
        )}
        <span className="text-gray-500 text-xs ml-2">
          {new Date(data.generated_at).toLocaleTimeString()}
        </span>
      </div>

      <div className="px-5 py-5">
        <h3 className="text-white font-semibold text-base mb-4">📅 {data.topic}</h3>
        <div className="space-y-2">
          {lines.map((line, i) => (
            <p key={i} className="text-gray-300 text-sm leading-relaxed">{line}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
