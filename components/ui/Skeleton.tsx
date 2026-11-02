import { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export default function Skeleton({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton rounded-lg", className)} {...props} />;
}
