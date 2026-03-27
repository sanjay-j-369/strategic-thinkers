interface GuideCardData {
  type: "GUIDE_QUERY";
  question: string;
  analysis?: string;
  red_flags?: string[];
  output?: string;
  generated_at: string;
}

export function GuideCard({ data }: { data: GuideCardData }) {
  const outputLines = data.output?.split("\n").filter(Boolean) || [];

  return (
    <div className="glass rounded-2xl overflow-hidden glow-indigo animate-fade-in">
      <div className="px-5 py-3 bg-indigo-500/10 border-b border-indigo-500/20 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-indigo-400" />
        <span className="text-indigo-300 font-semibold text-xs uppercase tracking-widest">Strategic Insight</span>
        <span className="ml-auto text-gray-500 text-xs">
          {new Date(data.generated_at).toLocaleTimeString()}
        </span>
      </div>

      <div className="px-5 py-5">
        <h3 className="text-white font-semibold text-base mb-4">{data.question}</h3>

        {data.analysis && (
          <div className="mb-4 p-3 rounded-lg bg-white/5">
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-1.5">Situation Analysis</p>
            <p className="text-gray-300 text-sm leading-relaxed">{data.analysis}</p>
          </div>
        )}

        {data.red_flags && data.red_flags.length > 0 && (
          <div className="mb-4">
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Red Flags</p>
            <div className="space-y-1.5">
              {data.red_flags.map((flag, i) => (
                <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                  <span className="text-red-400 shrink-0">🚩</span>
                  <p className="text-red-300 text-sm">{flag}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {outputLines.length > 0 && (
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Decision Framework</p>
            <div className="space-y-1.5">
              {outputLines.map((line, i) => (
                <p key={i} className="text-gray-300 text-sm leading-relaxed">{line}</p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
