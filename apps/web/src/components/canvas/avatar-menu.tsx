import { useAuth0 } from "@auth0/auth0-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import { cn } from "@/lib/utils";
import { TOPBAR_ICON_BUTTON } from "./topbar-styles";
import { TopbarTooltip } from "./topbar-tooltip";

export function AvatarMenu() {
  const { user, logout } = useAuth0();

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : (user?.email?.[0]?.toUpperCase() ?? "?");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <TopbarTooltip label={user?.name ?? user?.email ?? "Account"}>
          <button
            type="button"
            aria-label={user?.name ?? user?.email ?? "Account"}
            className={cn(TOPBAR_ICON_BUTTON, "rounded-full")}
          >
            {user?.picture ? (
              <img
                src={user.picture}
                alt=""
                className="size-5 rounded-full ring-[1.5px] ring-primary-400/70 ring-offset-[1.5px] ring-offset-chrome"
              />
            ) : (
              <div className="flex size-5 items-center justify-center rounded-full bg-primary-500/20 text-9 font-semibold text-primary-300 ring-[1.5px] ring-primary-400/70 ring-offset-[1.5px] ring-offset-chrome">
                {initials}
              </div>
            )}
          </button>
        </TopbarTooltip>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-52 overflow-hidden rounded-xl border-white/10 bg-popover p-0 shadow-2xl"
      >
        {user && (
          <div className="border-b border-white/[0.08] px-4 py-3">
            <p className="truncate text-sm font-medium text-white/80">
              {user.name}
            </p>
            <p className="truncate text-xs text-white/50">{user.email}</p>
          </div>
        )}
        <button
          onClick={() =>
            logout({ logoutParams: { returnTo: window.location.origin } })
          }
          className="flex w-full items-center px-4 py-2.5 text-sm text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white/90"
        >
          Log out
        </button>
      </PopoverContent>
    </Popover>
  );
}
