"use client";

import { Sparkles } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GEMINI_MODELS, type GeminiModelId } from "@/lib/gemini-models";

export function ModelSelector({
  value,
  onChange,
}: {
  value: GeminiModelId;
  onChange: (model: GeminiModelId) => void;
}) {
  const active = GEMINI_MODELS.find((m) => m.id === value);

  return (
    <div className="flex items-center gap-2">
      <Sparkles className="h-4 w-4 shrink-0 text-primary" />
      <Select value={value} onValueChange={(v) => onChange(v as GeminiModelId)}>
        <SelectTrigger className="w-[220px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {GEMINI_MODELS.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {active ? <span className="hidden text-xs text-muted-foreground sm:inline">{active.hint}</span> : null}
    </div>
  );
}
