interface GuideCardData {
  type: "GUIDE_QUERY";
  question: string;
  analysis?: string;
  red_flags?: string[];
  output?: string;
  generated_at: string;
}

interface GuideCardProps {
  data: GuideCardData;
}

export function GuideCard({ data }: GuideCardProps) {
  const outputLines = data.output?.split("\n").filter(Boolean) || [];

  return (
    <div className="border border-indigo-700/50 bg-indigo-950/20 rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-indigo-900/30 flex items-center gap-2">
        <span className="text-indigo-400 text-sm">🟣</span>
        <span className="text-indigo-300 font-semibold text-sm uppercase tracking-wide">
          Strategic Insight
        </span>
      </div>

      <div className="px-4 py-4">
        <h3 className="text-white font-semibold text-base mb-3">{data.question}</h3>

        {data.analysis && (
          <div className="mb-4">
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Situation</p>
            <p className="text-gray-300 text-sm leading-relaxed">{data.analysis}</p>
          </div>
        )}

        {data.red_flags && data.red_flags.length > 0 && (
          <div className="mb-4">
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Red Flags</p>
            <div className="space-y-1">
              {data.red_flags.map((flag, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-red-400 mt-0.5">🚩</span>
                  <p className="text-red-300 text-sm">{flag}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.output && (
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-2">Decision Framework</p>
            <div className="space-y-1">
              {outputLines.map((line, i) => (
                <p key={i} className="text-gray-300 text-sm leading-relaxed">
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}

        <p className="text-gray-600 text-xs mt-4">
          {new Date(data.generated_at).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
}
