import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-xs px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider",
  {
    variants: {
      variant: {
        default: "bg-surface-2 text-muted",
        ok: "bg-ok/20 text-ok",
        warn: "bg-warn/20 text-warn",
        kind: "bg-accent/15 text-fg",
        gap: "bg-signal/20 text-signal",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
