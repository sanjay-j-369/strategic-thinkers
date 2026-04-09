import {
  CalendarDays,
  Eye,
  FileText,
  Mail,
  MessageSquare,
  Mic,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ArchiveItem {
  id: string;
  source: string;
  context_tags: string[];
  ingested_at: string;
}

interface PrivacyTableProps {
  items: ArchiveItem[];
  onView: (item: ArchiveItem) => void;
  onDelete: (item: ArchiveItem) => void;
}

export function PrivacyTable({ items, onView, onDelete }: PrivacyTableProps) {
  if (items.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        No archived items yet. Data will appear here as it is ingested.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Source</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Tags</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-muted">
                  <SourceIcon source={item.source} />
                </div>
                <div>
                  <p className="font-medium text-foreground">{item.source}</p>
                  <p className="text-xs text-muted-foreground">Encrypted archive entry</p>
                </div>
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">
              <div className="space-y-1">
                {new Date(item.ingested_at).toLocaleDateString()}{" "}
                {new Date(item.ingested_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-2">
                {(item.context_tags || []).length > 0 ? (
                  item.context_tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="tracking-[0.16em]">
                      {tag}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">No tags</span>
                )}
              </div>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => onView(item)}>
                  <Eye className="h-4 w-4" />
                  View
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onDelete(item)}>
                  <Trash2 className="h-4 w-4" />
                  Forget
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SourceIcon({ source }: { source: string }) {
  const icons: Record<string, JSX.Element> = {
    GMAIL: <Mail className="h-4 w-4 text-foreground" />,
    SLACK: <MessageSquare className="h-4 w-4 text-foreground" />,
    CALENDAR: <CalendarDays className="h-4 w-4 text-foreground" />,
    MEET_TRANSCRIPT: <Mic className="h-4 w-4 text-foreground" />,
  };

  return icons[source] || <FileText className="h-4 w-4 text-foreground" />;
}
