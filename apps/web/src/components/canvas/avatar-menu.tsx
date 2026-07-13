import { useAuth0 } from "@auth0/auth0-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";

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
        <button
          title={user?.name ?? user?.email ?? "Account"}
          className="flex items-center justify-center rounded p-0.5 text-white/40 transition-colors hover:text-white/70"
        >
          {user?.picture ? (
            <img src={user.picture} alt="" className="size-5 rounded-full" />
          ) : (
            <div className="flex size-5 items-center justify-center rounded-full bg-white/10 text-10 font-medium text-white/60">
              {initials}
            </div>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-52 overflow-hidden rounded-xl border-white/10 bg-black/60 p-0 shadow-2xl backdrop-blur-xl"
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
