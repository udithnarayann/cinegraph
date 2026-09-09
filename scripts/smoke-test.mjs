import { spawn } from "node:child_process";

const port = 3199;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/status`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Server did not become ready");
}

try {
  await waitForServer();
  const statusResponse = await fetch(`http://127.0.0.1:${port}/api/status`);
  const status = await statusResponse.json();
  if (!status.ok || status.mode !== "demo") throw new Error("Status route failed");

  const snapshotResponse = await fetch(`http://127.0.0.1:${port}/api/snapshot`);
  const snapshot = await snapshotResponse.json();
  if (snapshot.movie?.title !== "The Odyssey" || snapshot.feedback?.length < 10 || snapshot.graph?.nodes?.length < 5) {
    throw new Error("Snapshot route returned incomplete demo data");
  }

  const ragResponse = await fetch(`http://127.0.0.1:${port}/api/rag`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      question: "Why is pacing trending?",
      movieId: snapshot.movie.id,
      movieTitle: snapshot.movie.title,
      feedback: snapshot.feedback,
    }),
  });
  const rag = await ragResponse.json();
  if (!ragResponse.ok || !rag.answer || !rag.citations?.length || !rag.path?.length) throw new Error("Graph RAG route failed");

  const feedbackResponse = await fetch(`http://127.0.0.1:${port}/api/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ movieId: snapshot.movie.id, author: "Smoke test", body: "The visuals are stunning but the pacing is slow." }),
  });
  const feedback = await feedbackResponse.json();
  if (!feedbackResponse.ok || !feedback.feedback?.categories?.length) throw new Error("Feedback classification route failed");

  process.stdout.write("Smoke test passed: status, snapshot, graph RAG, and feedback classification.\n");
} finally {
  server.kill("SIGTERM");
}
