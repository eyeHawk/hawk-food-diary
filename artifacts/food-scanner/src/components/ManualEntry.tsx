import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ManualEntry({ onSubmit }: { onSubmit: (barcode: string) => void }) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSubmit(value.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-sm mx-auto">
      <Input
        type="text"
        inputMode="numeric"
        placeholder="Enter barcode..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="flex-1"
        data-testid="input-manual-barcode"
      />
      <Button type="submit" disabled={!value.trim()} data-testid="button-submit-barcode">
        Lookup
      </Button>
    </form>
  );
}
