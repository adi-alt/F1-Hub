import { PublicHomeSkeleton } from "@/components/home/PublicHome";

// The route-level fallback while page.tsx's own server data is still resolving — shown before
// we know the visitor's auth state at all, so it uses the public shape (the safer, leaner
// default) rather than guessing personalized geometry. HomeShell takes over with the correct
// state-specific skeleton (or real content) the moment the server response arrives.
export default function HomeLoading() {
  return <PublicHomeSkeleton />;
}
