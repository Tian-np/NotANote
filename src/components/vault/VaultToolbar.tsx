import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { VaultEntry } from "@/types";

type FilterType = "all" | VaultEntry["type"];

type VaultToolbarProps = {
  query: string;
  maxQueryLength: number;
  filterType: FilterType;
  onQueryChange: (value: string) => void;
  onFilterChange: (value: FilterType) => void;
};

const FILTERS: { value: FilterType; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "note", label: "โน้ต" },
  { value: "login", label: "รหัสเว็บ" },
];

export function VaultToolbar({
  query,
  maxQueryLength,
  filterType,
  onQueryChange,
  onFilterChange,
}: VaultToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id="vault-search"
          placeholder="ค้นหาโน้ตหรือรหัสเว็บ…"
          value={query}
          onChange={(ev) => onQueryChange(ev.target.value)}
          aria-label="ค้นหา"
          className="min-h-11 pl-9"
          maxLength={maxQueryLength}
        />
      </div>
      <div
        className="flex shrink-0 gap-1 rounded-lg border border-border/70 bg-muted/30 p-1"
        role="group"
        aria-label="กรองประเภท"
      >
        {FILTERS.map(({ value, label }) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={filterType === value ? "secondary" : "ghost"}
            className={cn("h-9 px-3", filterType === value && "shadow-sm")}
            onClick={() => onFilterChange(value)}
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
