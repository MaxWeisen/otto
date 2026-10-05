"use client";

import { useTransition } from "react";
import { SignOutIcon, UserIcon } from "@phosphor-icons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/lib/auth-actions";

type AccountMenuProps = {
  name: string;
  email: string;
  avatarUrl: string;
};

export function AccountMenu({ name, email, avatarUrl }: AccountMenuProps) {
  const [isPending, startTransition] = useTransition();
  const displayName = name.trim();
  const initial = Array.from(displayName)[0]?.toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full duration-150 ease-out motion-safe:hover:-translate-y-0.5 hover:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-primary)_15%,transparent),0_0_18px_2px_color-mix(in_oklab,var(--color-primary)_45%,transparent)] motion-safe:focus-visible:-translate-y-0.5 focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-primary)_15%,transparent),0_0_18px_2px_color-mix(in_oklab,var(--color-primary)_45%,transparent)]"
          />
        }
        aria-label="Account menu"
      >
        <Avatar>
          {avatarUrl && (
            <AvatarImage
              src={avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
            />
          )}
          <AvatarFallback>{initial ?? <UserIcon aria-hidden />}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-auto max-w-80 min-w-56"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            {displayName && (
              <span className="truncate font-medium text-foreground">
                {displayName}
              </span>
            )}
            <span className="truncate">{email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={isPending}
          onClick={() => startTransition(() => logout())}
        >
          <SignOutIcon />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
