import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  required,
  resetKey,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
  resetKey?: string | number;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(false);
  }, [resetKey]);
  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        className="pr-11"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-0.5 top-1/2 h-9 w-9 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        aria-pressed={visible}
        aria-label={visible ? "Hide password" : "Show password"}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </Button>
    </div>
  );
}
