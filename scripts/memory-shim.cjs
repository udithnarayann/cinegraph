// Some restricted containers do not expose the OS RSS syscall. This preload is
// used only by local validation; Vercel and normal Node installations do not need it.
const originalMemoryUsage = process.memoryUsage.bind(process);
function safeMemoryUsage() {
  try {
    return originalMemoryUsage();
  } catch {
    const heap = require("node:v8").getHeapStatistics();
    return {
      rss: 0,
      heapTotal: heap.total_heap_size,
      heapUsed: heap.used_heap_size,
      external: heap.external_memory,
      arrayBuffers: 0,
    };
  }
}
safeMemoryUsage.rss = () => {
  try { return originalMemoryUsage.rss(); } catch { return 0; }
};
process.memoryUsage = safeMemoryUsage;

const os = require("node:os");
const originalNetworkInterfaces = os.networkInterfaces.bind(os);
os.networkInterfaces = () => {
  try {
    return originalNetworkInterfaces();
  } catch {
    return {
      lo: [{ address: "127.0.0.1", netmask: "255.0.0.0", family: "IPv4", mac: "00:00:00:00:00:00", internal: true, cidr: "127.0.0.1/8" }],
    };
  }
};
