interface ArchiveItem {
  id: string;
  source: string;
  context_tags: string[];
  ingested_at: string;
}

interface PrivacyTableProps {
  items: ArchiveItem[];
  onView: (id: string) => void;
  onDelete: (id: string) => void;
}

export function PrivacyTable({ items, onView, onDelete }: PrivacyTableProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 border border-gray-800 rounded-xl">
        No archived items yet. Data will appear here as it is ingested.
      </div>
    );
  }

  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
            <th className="text-left px-4 py-3">Source</th>
            <th className="text-left px-4 py-3">Date</th>
            <th className="text-left px-4 py-3">Tags</th>
            <th className="text-right px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-gray-900/50 transition-colors">
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5">
                  <SourceIcon source={item.source} />
                  <span className="text-gray-300">{item.source}</span>
                </span>
              </td>
              <td className="px-4 py-3 text-gray-400">
                {new Date(item.ingested_at).toLocaleDateString()}{" "}
                {new Date(item.ingested_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {(item.context_tags || []).map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 bg-gray-800 text-gray-400 rounded text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => onView(item.id)}
                    className="text-blue-400 hover:text-blue-300 transition-colors"
                    title="View decrypted content"
                  >
                    👁 View
                  </button>
                  <button
                    onClick={() => onDelete(item.id)}
                    className="text-red-400 hover:text-red-300 transition-colors"
                    title="Delete from archive and Pinecone"
                  >
                    🗑 Forget
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SourceIcon({ source }: { source: string }) {
  const icons: Record<string, string> = {
    GMAIL: "📧",
    SLACK: "💬",
    CALENDAR: "📅",
    MEET_TRANSCRIPT: "🎙",
  };
  return <span>{icons[source] || "📄"}</span>;
}
