import Link from "next/link";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";

type PageHeaderProps = {
  title: string;
  description?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
};

export function PageHeader({
  title,
  description,
  backHref,
  backLabel,
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3">
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50"
        >
          <ArrowLeftIcon className="size-3.5" />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-heading text-lg font-semibold tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="text-xs/relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions}
      </div>
    </div>
  );
}
