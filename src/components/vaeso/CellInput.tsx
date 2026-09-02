import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type Props = {
  value: string | number | null | undefined;
  onCommit: (valor: string) => void;
  type?: "text" | "number";
  className?: string;
  placeholder?: string;
};

export function CellInput({ value, onCommit, type = "text", className, placeholder }: Props) {
  const [local, setLocal] = useState(value === null || value === undefined ? "" : String(value));

  useEffect(() => {
    setLocal(value === null || value === undefined ? "" : String(value));
  }, [value]);

  return (
    <input
      type={type}
      value={local}
      placeholder={placeholder}
      step="any"
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const original = value === null || value === undefined ? "" : String(value);
        if (local !== original) onCommit(local);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={cn(
        "w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm outline-none transition-colors hover:border-border focus:border-ring focus:bg-background",
        className,
      )}
    />
  );
}
