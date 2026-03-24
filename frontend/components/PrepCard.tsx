interface PrepCardData {
  type: "ASSISTANT_PREP";
  topic: string;
  summary: string;
  entities?: string[];
  generated_at: string;
}

interface PrepCardProps {
  data: PrepCardData;
}

export function PrepCard({ data }: PrepCardProps) {
  const lines = data.summary?.split("\n").filter(Boolean) || [];

  return (
    <div className="border border-amber-700/50 bg-amber-950/20 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-amber-900/30 flex items-center gap-2">
        <span className="text-amber-400 text-sm">🟡</span>
        <span className="text-amber-300 font-semibold text-sm uppercase tracking-wide">
          Meeting Prep
        </span>
        {data.entities && data.entities.length > 0 && (
          <span className="text-amber-500 text-xs ml-auto">
            {data.entities.join(", ")}
          </span>
        )}
      </div>

      <div className="px-4 py-4">
        <h3 className="text-white font-semibold text-base mb-3">{data.topic}</h3>

        <div className="space-y-2">
          {lines.map((line, i) => (
            <p key={i} className="text-gray-300 text-sm leading-relaxed">
              {line}
            </p>
          ))}
        </div>

        <p className="text-gray-600 text-xs mt-4">
          {new Date(data.generated_at).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}
