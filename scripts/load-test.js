/**
 * Load test con autocannon (Enhanced for Detailed Analysis).
 *
 * Variables de entorno:
 *   BASE_URL  - base de la API (default: http://localhost:3000)
 *   CONNECTIONS - conexiones concurrentes (default: 30)
 *   DURATION - duración en segundos por prueba individual (default: 10)
 *   MIXED_DURATION - duración de la prueba mixta final (default: 30)
 */

const autocannon = require("autocannon");
const axios = require("axios");
const fs = require("fs");

const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const connections = parseInt(process.env.CONNECTIONS || "30", 10);
// Short duration for individual endpoint analysis
const stepDuration = parseInt(process.env.DURATION || "10", 10); 
// Longer duration for the final stability test
const mixedDuration = parseInt(process.env.MIXED_DURATION || "60", 10); 

const testUser = {
  personId: 999999999, 
  password: "testpassword",
  name: "Test User Loadtest",
  role: "ADMIN", 
};

let authToken = "";

const runAutocannon = (name, options) => {
  return new Promise((resolve, reject) => {
    console.log(`\n[TEST START] ${name} (${options.duration || 10}s)`);
    
    // Ensure URL is absolute
    const targetUrl = options.path ? `${baseUrl}${options.path}` : (options.url || baseUrl);
    
    const config = {
      ...options,
      url: targetUrl,
      connections: options.connections || connections,
      duration: options.duration || stepDuration,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${authToken}`,
        ...options.headers
      },
    };

    const instance = autocannon(config, (err, result) => {
        if (err) return reject(err);
        console.log(`[TEST END] ${name} - Avg Latency: ${result.latency.average.toFixed(2)}ms`);
        resolve({ name, result, config });
    });
    
    autocannon.track(instance, { renderProgressBar: true });
  });
};

const setupAndRunLoadTest = async () => {
  console.log("Setting up load test...");
  
  // 1. Setup User
  try {
    await axios.post(`${baseUrl}/user/sign-up`, testUser);
    console.log("Test user created (or already exists).");
  } catch (error) {
    if (error.response && error.response.status !== 409) {
      console.error("Setup Error (Sign Up):", error.message);
    }
  }

  // 2. Login
  try {
    const loginResponse = await axios.post(`${baseUrl}/user`, {
      personId: testUser.personId,
      password: testUser.password,
    });
    authToken = loginResponse.data.token;
    console.log("Logged in successfully.");
  } catch (error) {
    console.error("Setup Error (Login):", error.message);
    process.exit(1);
  }

  // 3. Fetch IDs
  let validTaxpayerId = "placeholder";
  let validUserId = "placeholder";
  try {
    const tpRes = await axios.get(`${baseUrl}/taxpayer/get-taxpayers`, { headers: { Authorization: `Bearer ${authToken}` } });
    const taxpayers = Array.isArray(tpRes.data) ? tpRes.data : tpRes.data.taxpayers || [];
    if (taxpayers.length) validTaxpayerId = taxpayers[0].id;

    const uRes = await axios.get(`${baseUrl}/user/all`, { headers: { Authorization: `Bearer ${authToken}` } });
    const users = Array.isArray(uRes.data) ? uRes.data : uRes.data.users || [];
    if (users.length) validUserId = users[0].id;
  } catch (e) {
    console.warn("Could not fetch IDs, write operations might fail:", e.message);
  }

  const results = [];

  try {
    // --- PHASE 1: INDIVIDUAL HEAVY ENDPOINT ANALYSIS ---
    // Running these sequentially ensures we get specific stats for each heavy endpoint
    
    console.log("\n=== PHASE 1: HEAVY ENDPOINT ANALYSIS ===");
    
    const heavyEndpoints = [
        { name: "Report: KPI", path: "/reports/kpi" },
        { name: "Report: Global Performance (2024)", path: "/reports/global-performance?date=2024-01-01" },
        { name: "Report: Fiscal Groups", path: "/reports/fiscal-groups" },
        { name: "Report: Top Fiscals", path: "/reports/get-top-fiscals?date=2024" },
        { name: "Report: Complete (Jan 24)", path: "/reports/get-complete-report?startDate=2024-01-01&endDate=2024-01-31" },
        { name: "Report: Monthly Growth", path: "/reports/get-monthly-growth" },
        { name: "Report: Expected Amount", path: "/reports/get-expected-amount" },
        { name: "Census: Get All", path: "/census/getCensus" },
    ];

    for (const ep of heavyEndpoints) {
        const res = await runAutocannon(ep.name, { path: ep.path });
        results.push(res);
    }

    // --- PHASE 2: MIXED LOAD (STABILITY) ---
    console.log("\n=== PHASE 2: MIXED LOAD STABILITY ===");
    
    // We use 'scenarios' here to simulate real concurrent usage
    const mixedRes = await runAutocannon("Mixed System Load", {
        url: baseUrl, // Base URL for scenarios
        duration: mixedDuration,
        scenarios: [
            {
                flow: [
                    { path: "/user/me", method: "GET" },
                    { path: "/reports/kpi", method: "GET" },
                    { path: "/taxpayer/get-taxpayers", method: "GET" },
                    { 
                        path: "/taxpayer/fine", 
                        method: "POST",
                        body: JSON.stringify({
                            date: new Date().toISOString(),
                            amount: 100.50,
                            taxpayerId: validTaxpayerId,
                            description: "Load test mixed fine"
                        })
                    }
                ]
            }
        ]
    });
    results.push(mixedRes);


    // --- GENERATE REPORT ---
    generateReport(results);

  } catch (err) {
      console.error("Test execution failed:", err);
  }
};

const generateReport = (results) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `load-test-report-${timestamp}.md`;

    // Sort by avg latency desc for the "Slowest Endpoints" section
    const sortedByLatency = [...results].sort((a, b) => b.result.latency.average - a.result.latency.average);

    // Filter results with errors
    const resultsWithErrors = results.filter(r => r.result.non2xx > 0 || r.result.errors > 0 || r.result.timeouts > 0);

    const markdownContent = `
# Load Test Analysis Report

**Date:** ${new Date().toLocaleString()}
**Target:** ${baseUrl}
**Total Duration:** ~${(results.length - 1) * stepDuration + mixedDuration}s

## 1. Executive Summary & Critical Issues

${resultsWithErrors.length === 0 
  ? "✅ **No errors detected.** All endpoints returned 2xx responses and no connection timeouts occurred." 
  : `⚠️ **Errors Detected in ${resultsWithErrors.length} Endpoint(s)**\n\nThe following endpoints experienced failures (non-2xx responses, timeouts, or connection errors). Check the "Error Breakdown" section below for details.`}

## 2. Slowest Endpoints Analysis (Top 5)

| Rank | Endpoint / Test Name | Avg Latency | p99 Latency | Max Latency | Req/Sec |
| :--- | :--- | :--- | :--- | :--- | :--- |
${sortedByLatency.slice(0, 5).map((r, i) => 
`| ${i + 1} | **${r.name}** | ${r.result.latency.average.toFixed(2)} ms | ${r.result.latency.p99} ms | ${r.result.latency.max} ms | ${r.result.requests.average.toFixed(1)} |`
).join('\n')}

## 3. Error Breakdown (Action Required)

${resultsWithErrors.length === 0 ? "*No actionable errors found.*" : 
  resultsWithErrors.map(r => {
      let errorDetails = "";
      if (r.result.errors > 0) errorDetails += `- **Connection Errors:** ${r.result.errors}\n`;
      if (r.result.timeouts > 0) errorDetails += `- **Timeouts:** ${r.result.timeouts}\n`;
      if (r.result.non2xx > 0 && r.result.statusCodeStats) {
          errorDetails += `- **Status Code Distribution:**\n`;
          Object.entries(r.result.statusCodeStats).forEach(([code, count]) => {
              const status = parseInt(code);
              if (status < 200 || status >= 300) {
                  errorDetails += `  - **${status}**: ${count} responses\n`;
              }
          });
      }
      return `### 🚨 ${r.name}\n* **Path:** \`${r.config.path || r.config.url}\`\n${errorDetails}`;
  }).join('\n')
}

## 4. Detailed Results by Endpoint

${results.map(r => `
### ${r.name}
* **URL/Path:** \`${r.config.path || "Mixed Scenarios"}\`
* **Requests:** ${r.result.requests.total} (Avg: ${r.result.requests.average.toFixed(1)} req/s)
* **Latency:** Avg: **${r.result.latency.average.toFixed(2)}ms** | p95: ${r.result.latency.p99}ms | Max: ${r.result.latency.max}ms
* **Errors:** ${r.result.non2xx} (Non-2xx) | ${r.result.errors} (Conn) | ${r.result.timeouts} (Timeout)
`).join('\n')}

## 5. Mixed Load Stability Test
*(Simulates concurrent users performing various actions)*

| Metric | Value |
| :--- | :--- |
| **Duration** | ${mixedDuration}s |
| **Total Requests** | ${results[results.length - 1].result.requests.total} |
| **Throughput** | ${results[results.length - 1].result.requests.average.toFixed(2)} req/sec |
| **Error Rate** | ${((results[results.length - 1].result.non2xx / results[results.length - 1].result.requests.total) * 100).toFixed(2)}% |

## Appendix: Raw Data
<details>
<summary>Click to see raw JSON results</summary>

\`\`\`json
${JSON.stringify(results.map(r => ({ name: r.name, latency: r.result.latency, requests: r.result.requests, statusCodeStats: r.result.statusCodeStats, errors: r.result.errors, timeouts: r.result.timeouts })), null, 2)}
\`\`\`
</details>
`;

    fs.writeFile(filename, markdownContent.trim(), (writeErr) => {
      if (writeErr) console.error("Error writing report:", writeErr);
      else console.log(`\nReport generated: ${filename}`);
    });
};

setupAndRunLoadTest();
