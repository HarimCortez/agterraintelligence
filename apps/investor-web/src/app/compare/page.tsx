import { ComparisonWorkspace } from "@/components/comparison/ComparisonWorkspace";

/**
 * Comparison Workspace route — `/compare`. Thin server wrapper (route
 * wiring only, matching the `page.tsx` / `*Workspace.tsx` split used by
 * Discover and the Property Intelligence Page) around the client
 * `ComparisonWorkspace`, which owns all the actual logic. No server-side
 * data fetching here: the comparison tray's property IDs live in
 * `localStorage`, so there is nothing real to prefetch/dehydrate on the
 * server — see `ComparisonWorkspace` for why.
 */
export default function ComparePage() {
  return <ComparisonWorkspace />;
}
