import Link from "next/link";
import { AccountMenu } from "@/components/account-menu";
import type { User } from "@/lib/auth";

export function AppBar({ user }: { user: User }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="flex h-14 items-center justify-between px-4">
        <Link
          href="/vehicles"
          className="text-sm font-semibold tracking-widest"
        >
          OTTO
        </Link>
        <AccountMenu
          name={user.name}
          email={user.email}
          avatarUrl={user.avatarUrl}
        />
      </div>
    </header>
  );
}
