-- No per-request Lua callback: validation runs before load generation.
function done(summary, latency, requests)
  io.write(string.format(
    'BENCH_RESULT {"durationSeconds":%.6f,"requests":%d,"bytes":%d,"requestsPerSecond":%.6f,"latencyP50Ms":%.6f,"latencyP95Ms":%.6f,"latencyP99Ms":%.6f,"errors":{"connect":%d,"read":%d,"write":%d,"status":%d,"timeout":%d}}\n',
    summary.duration / 1000000, summary.requests, summary.bytes,
    summary.requests / (summary.duration / 1000000),
    latency:percentile(50) / 1000, latency:percentile(95) / 1000, latency:percentile(99) / 1000,
    summary.errors.connect, summary.errors.read, summary.errors.write,
    summary.errors.status, summary.errors.timeout
  ))
end
