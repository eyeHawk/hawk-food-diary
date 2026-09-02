import { useEffect, useRef, type ReactNode } from 'react';
import {
  ClerkProvider,
  SignIn,
  SignUp,
  useUser,
  useClerk,
} from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import Home from '@/pages/Home';
import Scan from '@/pages/Scan';
import Search from '@/pages/Search';
import MealSets from '@/pages/MealSets';
import MealSetDetail from '@/pages/MealSetDetail';
import DaySummary from '@/pages/DaySummary';
import { Layout } from '@/components/Layout';
import { Loader2 } from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
  Redirect,
} from 'wouter';

// ── Clerk setup ────────────────────────────────────────────────────────────

// REQUIRED — resolves the key from window.location.hostname so the same build
// works across Clerk custom domains. Do not inline the env var directly.
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — empty in dev (Clerk hits FAPI directly), auto-set in prod.
// Do NOT gate on import.meta.env.PROD — the empty dev value is intentional.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

// Clerk passes full paths; wouter's setLocation prepends the base — strip it.
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: 'hsl(125, 45%, 42%)',
    colorForeground: 'hsl(20, 3%, 17%)',
    colorMutedForeground: 'hsl(20, 3%, 45%)',
    colorDanger: 'hsl(0, 84%, 60%)',
    colorBackground: 'hsl(42, 20%, 97%)',
    colorInput: 'hsl(34, 16%, 85%)',
    colorInputForeground: 'hsl(20, 3%, 17%)',
    colorNeutral: 'hsl(34, 16%, 85%)',
    fontFamily: "'DM Sans', sans-serif",
    borderRadius: '1rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox:
      'bg-white rounded-3xl w-[440px] max-w-full overflow-hidden border-2 border-[hsl(34,16%,85%)] shadow-[4px_4px_0_0_hsl(20,3%,17%)]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'font-black tracking-tight',
    headerSubtitle: 'text-[hsl(20,3%,45%)] font-medium',
    socialButtonsBlockButtonText: 'font-bold',
    formFieldLabel: 'font-bold text-[hsl(20,3%,17%)] text-sm',
    footerActionLink: 'text-[hsl(125,45%,42%)] font-bold hover:underline',
    footerActionText: 'text-[hsl(20,3%,45%)]',
    dividerText: 'text-[hsl(20,3%,45%)] text-sm',
    identityPreviewEditButton: 'text-[hsl(125,45%,42%)] font-bold',
    formFieldSuccessText: 'text-[hsl(125,45%,42%)]',
    alertText: 'font-medium text-sm',
    logoBox: 'mb-1',
    logoImage: 'rounded-xl',
    socialButtonsBlockButton:
      'border-2 border-[hsl(34,16%,85%)] font-bold hover:bg-[hsl(42,15%,92%)] transition-colors',
    formButtonPrimary:
      'bg-[hsl(125,45%,42%)] hover:bg-[hsl(125,45%,38%)] font-bold transition-colors shadow-[2px_2px_0_0_hsl(20,3%,17%)]',
    formFieldInput:
      'border-2 border-[hsl(34,16%,85%)] font-medium focus:border-[hsl(125,45%,42%)]',
    footerAction: 'border-t border-[hsl(34,16%,85%)]',
    dividerLine: 'bg-[hsl(34,16%,85%)]',
    alert: 'border border-[hsl(34,16%,85%)] rounded-xl',
    otpCodeFieldInput: 'border-2 border-[hsl(34,16%,85%)]',
    formFieldRow: 'gap-2',
    main: 'gap-4',
  },
};

// ── React Query ────────────────────────────────────────────────────────────

const queryClient = new QueryClient();

// Invalidate the React Query cache whenever the signed-in user changes so
// cached data from a previous session is never shown to the new user.
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

// ── One-time legacy data claim ─────────────────────────────────────────────

// After the user signs in for the first time, claim all diary/preset rows
// that were created before auth was added (userId = NULL in the database).
function ClaimLegacyData() {
  const hasRunRef = useRef(false);
  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;
    fetch('/api/user/claim-legacy-data', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {/* silent — non-critical */});
  }, []);
  return null;
}

// ── Auth pages ─────────────────────────────────────────────────────────────

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-black tracking-tight">Nutrition Diary</h1>
          <p className="text-muted-foreground font-medium text-sm">Track your food, your way.</p>
        </div>
        {/* path must be the FULL browser pathname — Clerk reads window.location.pathname directly */}
        <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
      </div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-black tracking-tight">Nutrition Diary</h1>
          <p className="text-muted-foreground font-medium text-sm">Track your food, your way.</p>
        </div>
        <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
      </div>
    </div>
  );
}

// ── Protected app shell ────────────────────────────────────────────────────

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ProtectedApp() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isSignedIn) {
    return <Redirect to="/sign-in" />;
  }

  return (
    <>
      <ClaimLegacyData />
      <RoutedErrorBoundary>
        <Layout>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/scan" component={Scan} />
            <Route path="/search" component={Search} />
            <Route path="/meal-sets" component={MealSets} />
            <Route path="/meal-sets/:id" component={MealSetDetail} />
            <Route path="/day-summary" component={DaySummary} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </RoutedErrorBoundary>
    </>
  );
}

// ── Root router ────────────────────────────────────────────────────────────

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          {/* REQUIRED — copy "/sign-in/*?" verbatim. /*? matches both the bare
              URL and Clerk's OAuth sub-paths (/sign-in/sso-callback, etc.) */}
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route component={ProtectedApp} />
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
