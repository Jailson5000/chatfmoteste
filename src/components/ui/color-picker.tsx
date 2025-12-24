import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const presetColors = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#64748b", "#374151", "#1f2937",
];

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  className?: string;
}

export function ColorPicker({ value, onChange, className }: ColorPickerProps) {
  const [customColor, setCustomColor] = useState(value);

  const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value;
    setCustomColor(newColor);
    onChange(newColor);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-10 h-10 rounded-lg border-2 border-input cursor-pointer transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-ring",
            className
          )}
          style={{ backgroundColor: value }}
        />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-3">
          <div className="grid grid-cols-5 gap-2">
            {presetColors.map((color) => (
              <button
                key={color}
                type="button"
                className={cn(
                  "w-8 h-8 rounded-full border-2 transition-all hover:scale-110",
                  value === color ? "border-foreground ring-2 ring-ring" : "border-transparent"
                )}
                style={{ backgroundColor: color }}
                onClick={() => onChange(color)}
              />
            ))}
          </div>
          <div className="pt-2 border-t">
            <Label className="text-xs text-muted-foreground">Cor personalizada</Label>
            <div className="flex gap-2 mt-1.5">
              <input
                type="color"
                value={customColor}
                onChange={handleCustomColorChange}
                className="w-10 h-8 rounded cursor-pointer border-0 p-0"
              />
              <Input
                value={value}
                onChange={(e) => {
                  const newValue = e.target.value;
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(newValue) || newValue === "") {
                    setCustomColor(newValue);
                    if (/^#[0-9A-Fa-f]{6}$/.test(newValue)) {
                      onChange(newValue);
                    }
                  }
                }}
                placeholder="#000000"
                className="flex-1 h-8 text-sm font-mono"
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
