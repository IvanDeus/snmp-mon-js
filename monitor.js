// monitor.js - Enhanced with SQLite historical data
const express = require("express");
const { exec } = require("child_process");
const util = require("util");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const execAsync = util.promisify(exec);

// --- SETTINGS ---
const SNMP_HOST = "10.1.108.43";
const SNMP_PORT = 161;
const SNMP_COMMUNITY = "comm1";

// Use the original OIDs from your snmpwalk
const OID_IN1 = "1.3.6.1.4.1.23668.8107.2.1.1.110.13";
const OID_OUT1 = "1.3.6.1.4.1.23668.8107.2.1.1.121.13";
const OID_IN2 = "1.3.6.1.4.1.23668.8107.2.1.1.110.14";
const OID_OUT2 = "1.3.6.1.4.1.23668.8107.2.1.1.121.14";
const OID_CPU = "1.3.6.1.4.1.23668.8107.1.6.1.0";
const OID_MEMUSED = "1.3.6.1.4.1.23668.8107.1.6.7.0"; // Counter64

const POLL_INTERVAL_SECONDS = 5;
const MAX_DATA_POINTS = 150;
const DB_SAVE_INTERVAL = MAX_DATA_POINTS * 5 * 1000; // Save every MAX_DATA_POINTS * 5 seconds

// --- DATA STORAGE ---
let times = [];
let inTraffic1 = [];
let outTraffic1 = [];
let inTraffic2 = [];
let outTraffic2 = [];
let cpuUsage = [];
let memUsed = [];

// --- SQLITE DATABASE ---
const DB_PATH = path.join(__dirname, 'monitor.db');
let db;

// Initialize database
function initDatabase() {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('Error opening database:', err);
                reject(err);
                return;
            }

            // Create table if it doesn't exist
            db.run(`
                CREATE TABLE IF NOT EXISTS historical_data (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    in_traffic1 REAL,
                    out_traffic1 REAL,
                    in_traffic2 REAL,
                    out_traffic2 REAL,
                    cpu_usage REAL,
                    mem_used REAL
                )
            `, (err) => {
                if (err) {
                    console.error('Error creating table:', err);
                    reject(err);
                    return;
                }
                console.log('Database initialized successfully');
                resolve();
            });
        });
    });
}

// Save average data to database
function saveAverageToDatabase() {
    if (times.length === 0) return;

    // Calculate averages
    const avgInTraffic1 = inTraffic1.reduce((a, b) => a + b, 0) / inTraffic1.length;
    const avgOutTraffic1 = outTraffic1.reduce((a, b) => a + b, 0) / outTraffic1.length;
    const avgInTraffic2 = inTraffic2.reduce((a, b) => a + b, 0) / inTraffic2.length;
    const avgOutTraffic2 = outTraffic2.reduce((a, b) => a + b, 0) / outTraffic2.length;
    const avgCpuUsage = cpuUsage.reduce((a, b) => a + b, 0) / cpuUsage.length;
    const avgMemUsed = memUsed.reduce((a, b) => a + b, 0) / memUsed.length;

    db.run(`
        INSERT INTO historical_data 
        (in_traffic1, out_traffic1, in_traffic2, out_traffic2, cpu_usage, mem_used)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [avgInTraffic1, avgOutTraffic1, avgInTraffic2, avgOutTraffic2, avgCpuUsage, avgMemUsed], 
    (err) => {
        if (err) {
            console.error('Error saving to database:', err);
        } else {
            console.log(`[${nowTime()}] [DB] Average data saved to database`);
        }
    });
}

// Get historical data from database
function getHistoricalData(limit = 100) {
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT 
                datetime(timestamp, 'localtime') as timestamp,
                in_traffic1,
                out_traffic1,
                in_traffic2,
                out_traffic2,
                cpu_usage,
                mem_used
            FROM historical_data 
            ORDER BY timestamp DESC 
            LIMIT ?
        `, [limit], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                // Reverse to show chronological order
                resolve(rows.reverse());
            }
        });
    });
}

// --- HELPER: format timestamp ---
function nowTime() {
    return new Date().toLocaleTimeString();
}

// Function to get SNMP value using command line
async function getSnmpValue(oid) {
    try {
        const command = `snmpget -v2c -c ${SNMP_COMMUNITY} ${SNMP_HOST}:${SNMP_PORT} ${oid}`;
        console.log(`[${nowTime()}] [CMD] Executing: ${command}`);

        const { stdout, stderr } = await execAsync(command, { timeout: 10000 });

        if (stderr) {
            console.error(`[${nowTime()}] [CMD] Error:`, stderr);
            return null;
        }

        // Parse the output: "OID = Counter64: value" or "OID = INTEGER: value"
        const output = stdout.trim();
        console.log(`[${nowTime()}] [CMD] Output: ${output}`);

        // Extract the value part
        const match = output.match(/=\s*(?:Counter64|INTEGER|Gauge32|Counter32):\s*(\d+)/i);
        if (match) {
            const value = parseInt(match[1]);
            console.log(`[${nowTime()}] [CMD] Parsed value: ${value}`);
            return value;
        } else {
            console.error(`[${nowTime()}] [CMD] Could not parse value from: ${output}`);
            return null;
        }
    } catch (error) {
        console.error(`[${nowTime()}] [CMD] Command failed for ${oid}:`, error.message);
        return null;
    }
}

async function pollData() {
    const [inVal1, outVal1, inVal2, outVal2, cpuVal, memVal] = await Promise.all([
        getSnmpValue(OID_IN1),
        getSnmpValue(OID_OUT1),
        getSnmpValue(OID_IN2),
        getSnmpValue(OID_OUT2),
        getSnmpValue(OID_CPU),
        getSnmpValue(OID_MEMUSED)
    ]);

    const now = new Date().toLocaleTimeString();

    // Convert rate counters to Mbps (divide by 1e6)
    const inMbps1 = inVal1 != null ? inVal1 / 1e6 : 0;
    const outMbps1 = outVal1 != null ? outVal1 / 1e6 : 0;
    const inMbps2 = inVal2 != null ? inVal2 / 1e6 : 0;
    const outMbps2 = outVal2 != null ? outVal2 / 1e6 : 0;

    times.push(now);
    inTraffic1.push(inMbps1);
    outTraffic1.push(outMbps1);
    inTraffic2.push(inMbps2);
    outTraffic2.push(outMbps2);
    cpuUsage.push(cpuVal != null ? parseInt(cpuVal) : 0);
    memUsed.push(memVal != null ? parseInt(memVal) : 0);

    if (times.length > MAX_DATA_POINTS) {
        times.shift();
        inTraffic1.shift();
        outTraffic1.shift();
        inTraffic2.shift();
        outTraffic2.shift();
        cpuUsage.shift();
        memUsed.shift();
    }

    console.log(`[${now}] [POLL] Intf1: In=${inMbps1.toFixed(3)}Mb/s, Out=${outMbps1.toFixed(3)}Mb/s | Intf2: In=${inMbps2.toFixed(3)}Mb/s, Out=${outMbps2.toFixed(3)}Mb/s | CPU: ${cpuVal || 'N/A'}% | MEM: ${memVal || 'N/A'}MB`);
}

// Initialize and start the application
async function startApplication() {
    try {
        await initDatabase();
        
        // Start polling
        setInterval(pollData, POLL_INTERVAL_SECONDS * 1000);
        
        // Start database saving
        setInterval(saveAverageToDatabase, DB_SAVE_INTERVAL);
        
        console.log("SNMP monitoring started with database support...");
    } catch (error) {
        console.error('Failed to start application:', error);
        process.exit(1);
    }
}

// --- WEB SERVER ---
const app = express();

app.get("/", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>SNMP Monitor - Real-time & Historical</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { font-family: sans-serif; margin: 20px; }
    .chart-container {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      max-width: 2000px;
      margin: 0 auto;
    }
    .chart-wrapper {
      width: 100%;
      height: 300px;
      position: relative;
    }
    canvas {
      width: 100% !important;
      height: 100% !important;
    }
    h2 {
      text-align: center;
      margin-top: 20px;
      margin-bottom: 5px;
    }
    .section-title {
      grid-column: 1 / -1;
      text-align: center;
      margin: 40px 0 20px 0;
      padding: 10px;
      background: #f0f0f0;
      border-radius: 5px;
    }
  </style>
</head>
<body>
  <h1>SNMP Monitor - Real-time & Historical Data</h1>
  
  <div class="section-title">Real-time Data (Last ${MAX_DATA_POINTS} points)</div>
  <div class="chart-container">
    <div>
      <h2>Interface A (Mb/s)</h2>
      <div class="chart-wrapper">
        <canvas id="trafficChart1"></canvas>
      </div>
    </div>
    <div>
      <h2>Interface B (Mb/s)</h2>
      <div class="chart-wrapper">
        <canvas id="trafficChart2"></canvas>
      </div>
    </div>
    <div>
      <h2>CPU Usage (%)</h2>
      <div class="chart-wrapper">
        <canvas id="cpuChart"></canvas>
      </div>
    </div>
    <div>
      <h2>Memory Used</h2>
      <div class="chart-wrapper">
        <canvas id="memChart"></canvas>
      </div>
    </div>
  </div>

  <div class="section-title">Historical Data (From Database)</div>
  <div class="chart-container">
    <div>
      <h2>Historical Interface A (Mb/s)</h2>
      <div class="chart-wrapper">
        <canvas id="historicalTrafficChart1"></canvas>
      </div>
    </div>
    <div>
      <h2>Historical Interface B (Mb/s)</h2>
      <div class="chart-wrapper">
        <canvas id="historicalTrafficChart2"></canvas>
      </div>
    </div>
    <div>
      <h2>Historical CPU Usage (%)</h2>
      <div class="chart-wrapper">
        <canvas id="historicalCpuChart"></canvas>
      </div>
    </div>
    <div>
      <h2>Historical Memory Used</h2>
      <div class="chart-wrapper">
        <canvas id="historicalMemChart"></canvas>
      </div>
    </div>
  </div>

  <script>
    async function fetchData() {
        const res = await fetch('/data');
        return await res.json();
    }

    async function fetchHistoricalData() {
        const res = await fetch('/historical-data');
        return await res.json();
    }

    // Initialize real-time charts
    const trafficCtx1 = document.getElementById('trafficChart1').getContext('2d');
    const trafficCtx2 = document.getElementById('trafficChart2').getContext('2d');
    const cpuCtx = document.getElementById('cpuChart').getContext('2d');
    const memCtx = document.getElementById('memChart').getContext('2d');

    // Initialize historical charts
    const historicalTrafficCtx1 = document.getElementById('historicalTrafficChart1').getContext('2d');
    const historicalTrafficCtx2 = document.getElementById('historicalTrafficChart2').getContext('2d');
    const historicalCpuCtx = document.getElementById('historicalCpuChart').getContext('2d');
    const historicalMemCtx = document.getElementById('historicalMemChart').getContext('2d');

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { display: true },
            y: { beginAtZero: true }
        }
    };

    const trafficChartOptions = {
        ...chartOptions,
        plugins: {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        return context.dataset.label + ': ' + context.parsed.y.toFixed(3) + ' Mb/s';
                    }
                }
            }
        }
    };

    // Real-time charts
    const trafficChart1 = new Chart(trafficCtx1, {
        type: 'line',
        data: { labels: [], datasets: [
            { label: 'In Mb/s', data: [], borderColor: 'blue', fill: false },
            { label: 'Out Mb/s', data: [], borderColor: 'red', fill: false }
        ]},
        options: trafficChartOptions
    });

    const trafficChart2 = new Chart(trafficCtx2, {
        type: 'line',
        data: { labels: [], datasets: [
            { label: 'In Mb/s', data: [], borderColor: 'blue', fill: false },
            { label: 'Out Mb/s', data: [], borderColor: 'red', fill: false }
        ]},
        options: trafficChartOptions
    });

    const cpuChart = new Chart(cpuCtx, {
        type: 'line',
        data: { labels: [], datasets: [
            { label: 'CPU %', data: [], borderColor: 'green', fill: false }
        ]},
        options: { ...chartOptions, scales: { ...chartOptions.scales, y: { beginAtZero: true, max: 100 } } }
    });

    const memChart = new Chart(memCtx, {
        type: 'line',
        data: { labels: [], datasets: [
            { label: 'Memory Used', data: [], borderColor: 'orange', fill: false }
        ]},
        options: chartOptions
    });

    // Historical charts
    const historicalTrafficChart1 = new Chart(historicalTrafficCtx1, {
        type: 'line',
        data: { labels: [], datasets: [
            { label: 'In Mb/s', data: [], borderColor: 'blue', fill: false },
            { label: 'Out Mb/s', data: [], borderColor: 'red', fill: false }
        ]},
        options: trafficChartOptions
    });

    const historicalTrafficChart2 = new Chart(historicalTrafficCtx2, {
        type: 'line',
        data: { labels: [], datasets: [
            { label: 'In Mb/s', data: [], borderColor: 'blue', fill: false },
            { label: 'Out Mb/s', data: [], borderColor: 'red', fill: false }
        ]},
        options: trafficChartOptions
    });

    const historicalCpuChart = new Chart(historicalCpuCtx, {
        type: 'line',
        data: { labels: [], datasets: [
            { label: 'CPU %', data: [], borderColor: 'green', fill: false }
        ]},
        options: { ...chartOptions, scales: { ...chartOptions.scales, y: { beginAtZero: true, max: 100 } } }
    });

    const historicalMemChart = new Chart(historicalMemCtx, {
        type: 'line',
        data: { labels: [], datasets: [
            { label: 'Memory Used', data: [], borderColor: 'orange', fill: false }
        ]},
        options: chartOptions
    });

    async function updateCharts() {
        try {
            const [realTimeData, historicalData] = await Promise.all([
                fetchData(),
                fetchHistoricalData()
            ]);

            // Update real-time charts
            trafficChart1.data.labels = realTimeData.times;
            trafficChart1.data.datasets[0].data = realTimeData.inTraffic1;
            trafficChart1.data.datasets[1].data = realTimeData.outTraffic1;
            trafficChart1.update();

            trafficChart2.data.labels = realTimeData.times;
            trafficChart2.data.datasets[0].data = realTimeData.inTraffic2;
            trafficChart2.data.datasets[1].data = realTimeData.outTraffic2;
            trafficChart2.update();

            cpuChart.data.labels = realTimeData.times;
            cpuChart.data.datasets[0].data = realTimeData.cpuUsage;
            cpuChart.update();

            memChart.data.labels = realTimeData.times;
            memChart.data.datasets[0].data = realTimeData.memUsed;
            memChart.update();

            // Update historical charts
            if (historicalData && historicalData.length > 0) {
                const labels = historicalData.map(item => item.timestamp);
                
                historicalTrafficChart1.data.labels = labels;
                historicalTrafficChart1.data.datasets[0].data = historicalData.map(item => item.in_traffic1);
                historicalTrafficChart1.data.datasets[1].data = historicalData.map(item => item.out_traffic1);
                historicalTrafficChart1.update();

                historicalTrafficChart2.data.labels = labels;
                historicalTrafficChart2.data.datasets[0].data = historicalData.map(item => item.in_traffic2);
                historicalTrafficChart2.data.datasets[1].data = historicalData.map(item => item.out_traffic2);
                historicalTrafficChart2.update();

                historicalCpuChart.data.labels = labels;
                historicalCpuChart.data.datasets[0].data = historicalData.map(item => item.cpu_usage);
                historicalCpuChart.update();

                historicalMemChart.data.labels = labels;
                historicalMemChart.data.datasets[0].data = historicalData.map(item => item.mem_used);
                historicalMemChart.update();
            }
        } catch (error) {
            console.error('Error updating charts:', error);
        }
    }

    setInterval(updateCharts, ${POLL_INTERVAL_SECONDS * 1000});
    updateCharts();
  </script>
</body>
</html>
    `);
});

app.get("/data", (req, res) => {
    res.json({
        times,
        inTraffic1,
        outTraffic1,
        inTraffic2,
        outTraffic2,
        cpuUsage,
        memUsed
    });
});

app.get("/historical-data", async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const historicalData = await getHistoricalData(limit);
        res.json(historicalData);
    } catch (error) {
        console.error('Error fetching historical data:', error);
        res.status(500).json({ error: 'Failed to fetch historical data' });
    }
});

// Start the application
startApplication().then(() => {
    const PORT = 8000;
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://*:${PORT}/`);
    });
});
