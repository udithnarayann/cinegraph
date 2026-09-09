import { CineGraphDashboard } from "@/components/cinegraph-dashboard";
import { getDefaultMovieSnapshot } from "@/lib/server/default-movie";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Home() {
  try {
    return <CineGraphDashboard initialSnapshot={await getDefaultMovieSnapshot()} />;
  } catch (error) {
    return <main className="grid min-h-screen place-items-center p-6"><section className="max-w-xl rounded-2xl border bg-card p-6"><h1 className="text-xl font-semibold">CineGraph needs configuration</h1><p className="mt-2 text-sm text-muted-foreground">{error instanceof Error ? error.message : "Could not load the default movie"}</p></section></main>;
  }
}
