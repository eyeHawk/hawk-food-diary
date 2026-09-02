import { Link, useLocation } from "wouter";
import { Book, ScanLine, Search, Utensils, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser, useClerk } from "@clerk/react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();

  const navItems = [
    { href: "/", label: "Diary", icon: Book },
    { href: "/scan", label: "Scan", icon: ScanLine },
    { href: "/search", label: "Search", icon: Search },
    { href: "/meal-sets", label: "Presets", icon: Utensils },
  ];

  return (
    <div className="flex flex-col min-h-[100dvh] pb-[72px] bg-background">
      <main className="flex-1 w-full max-w-2xl mx-auto">
        {children}
      </main>

      <nav className="fixed bottom-0 w-full bg-card border-t-2 border-foreground pb-safe shadow-[0_-4px_0_0_hsl(var(--foreground))]">
        <div className="flex justify-around items-center max-w-2xl mx-auto h-[72px]">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={cn(
                "flex flex-col items-center justify-center w-full h-full space-y-1 text-xs font-bold transition-colors",
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}>
                <Icon className={cn("w-6 h-6", isActive && "fill-primary/20 stroke-[2.5px]")} />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {/* Account / sign-out */}
          <button
            onClick={() => signOut({ redirectUrl: `${import.meta.env.BASE_URL}sign-in` })}
            className="flex flex-col items-center justify-center w-full h-full space-y-1 text-xs font-bold transition-colors text-muted-foreground hover:text-foreground group"
            title={`Signed in as ${user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress ?? 'you'} — tap to sign out`}
          >
            {user?.imageUrl ? (
              <img
                src={user.imageUrl}
                alt="avatar"
                className="w-6 h-6 rounded-full object-cover group-hover:opacity-75 transition-opacity"
              />
            ) : (
              <UserCircle className="w-6 h-6" />
            )}
            <span>Sign out</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
