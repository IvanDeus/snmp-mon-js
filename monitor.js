// monitor.js - Enhanced with SQLite historical data (16 CPU version)
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

// 16 CPU OIDs (CPU 0-15)
const OID_CPU0 = "1.3.6.1.4.1.23668.8107.2.4.1.2.0";
const OID_CPU1 = "1.3.6.1.4.1.23668.8107.2.4.1.2.1";
const OID_CPU2 = "1.3.6.1.4.1.23668.8107.2.4.1.2.2";
const OID_CPU3 = "1.3.6.1.4.1.23668.8107.2.4.1.2.3";
const OID_CPU4 = "1.3.6.1.4.1.23668.8107.2.4.1.2.4";
const OID_CPU5 = "1.3.6.1.4.1.23668.8107.2.4.1.2.5";
const OID_CPU6 = "1.3.6.1.4.1.23668.8107.2.4.1.2.6";
const OID_CPU7 = "1.3.6.1.4.1.23668.8107.2.4.1.2.7";
const OID_CPU8 = "1.3.6.1.4.1.23668.8107.2.4.1.2.8";
const OID_CPU9 = "1.3.6.1.4.1.23668.8107.2.4.1.2.9";
const OID_CPU10 = "1.3.6.1.4.1.23668.8107.2.4.1.2.10";
const OID_CPU11 = "1.3.6.1.4.1.23668.8107.2.4.1.2.11";
const OID_CPU12 = "1.3.6.1.4.1.23668.8107.2.4.1.2.12";
const OID_CPU13 = "1.3.6.1.4.1.23668.8107.2.4.1.2.13";
const OID_CPU14 = "1.3.6.1.4.1.23668.8107.2.4.1.2.14";
const OID_CPU15 = "1.3.6.1.4.1.23668.8107.2.4.1.2.15";

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

// 16 CPU arrays (CPU 0-15)
let cpuUsage0 = [];
let cpuUsage1 = [];
let cpuUsage2 = [];
let cpuUsage3 = [];
let cpuUsage4 = [];
let cpuUsage5 = [];
let cpuUsage6 = [];
let cpuUsage7 = [];
let cpuUsage8 = [];
let cpuUsage9 = [];
let cpuUsage10 = [];
let cpuUsage11 = [];
let cpuUsage12 = [];
let cpuUsage13 = [];
let cpuUsage14 = [];
let cpuUsage15 = [];

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
            // Create table if it doesn't exist (now with 16 CPU columns named 0-15)
            db.run(`
                CREATE TABLE IF NOT EXISTS historical_data (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    in_traffic1 REAL,
                    out_traffic1 REAL,
                    in_traffic2 REAL,
                    out_traffic2 REAL,
                    cpu_usage0 REAL,
                    cpu_usage1 REAL,
                    cpu_usage2 REAL,
                    cpu_usage3 REAL,
                    cpu_usage4 REAL,
                    cpu_usage5 REAL,
                    cpu_usage6 REAL,
                    cpu_usage7 REAL,
                    cpu_usage8 REAL,
                    cpu_usage9 REAL,
                    cpu_usage10 REAL,
                    cpu_usage11 REAL,
                    cpu_usage12 REAL,
                    cpu_usage13 REAL,
                    cpu_usage14 REAL,
                    cpu_usage15 REAL,
                    mem_used REAL
                )
            `, (err) => {
                if (err) {
                    console.error('Error creating table:', err);
                    reject(err);
                    return;
                }
                console.log('Database initialized successfully with 16 CPU columns (0-15)');
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
    
    const avgCpuUsage0 = cpuUsage0.reduce((a, b) => a + b, 0) / cpuUsage0.length;
    const avgCpuUsage1 = cpuUsage1.reduce((a, b) => a + b, 0) / cpuUsage1.length;
    const avgCpuUsage2 = cpuUsage2.reduce((a, b) => a + b, 0) / cpuUsage2.length;
    const avgCpuUsage3 = cpuUsage3.reduce((a, b) => a + b, 0) / cpuUsage3.length;
    const avgCpuUsage4 = cpuUsage4.reduce((a, b) => a + b, 0) / cpuUsage4.length;
    const avgCpuUsage5 = cpuUsage5.reduce((a, b) => a + b, 0) / cpuUsage5.length;
    const avgCpuUsage6 = cpuUsage6.reduce((a, b) => a + b, 0) / cpuUsage6.length;
    const avgCpuUsage7 = cpuUsage7.reduce((a, b) => a + b, 0) / cpuUsage7.length;
    const avgCpuUsage8 = cpuUsage8.reduce((a, b) => a + b, 0) / cpuUsage8.length;
    const avgCpuUsage9 = cpuUsage9.reduce((a, b) => a + b, 0) / cpuUsage9.length;
    const avgCpuUsage10 = cpuUsage10.reduce((a, b) => a + b, 0) / cpuUsage10.length;
    const avgCpuUsage11 = cpuUsage11.reduce((a, b) => a + b, 0) / cpuUsage11.length;
    const avgCpuUsage12 = cpuUsage12.reduce((a, b) => a + b, 0) / cpuUsage12.length;
    const avgCpuUsage13 = cpuUsage13.reduce((a, b) => a + b, 0) / cpuUsage13.length;
    const avgCpuUsage14 = cpuUsage14.reduce((a, b) => a + b, 0) / cpuUsage14.length;
    const avgCpuUsage15 = cpuUsage15.reduce((a, b) => a + b, 0) / cpuUsage15.length;
    
    const avgMemUsed = memUsed.reduce((a, b) => a + b, 0) / memUsed.length;
    
    db.run(`
        INSERT INTO historical_data
        (in_traffic1, out_traffic1, in_traffic2, out_traffic2, 
         cpu_usage0, cpu_usage1, cpu_usage2, cpu_usage3,
         cpu_usage4, cpu_usage5, cpu_usage6, cpu_usage7,
         cpu_usage8, cpu_usage9, cpu_usage10, cpu_usage11,
         cpu_usage12, cpu_usage13, cpu_usage14, cpu_usage15,
         mem_used)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        avgInTraffic1, avgOutTraffic1, avgInTraffic2, avgOutTraffic2,
        avgCpuUsage0, avgCpuUsage1, avgCpuUsage2, avgCpuUsage3,
        avgCpuUsage4, avgCpuUsage5, avgCpuUsage6, avgCpuUsage7,
        avgCpuUsage8, avgCpuUsage9, avgCpuUsage10, avgCpuUsage11,
        avgCpuUsage12, avgCpuUsage13, avgCpuUsage14, avgCpuUsage15,
        avgMemUsed
    ],
    (err) => {
        if (err) {
            console.error('Error saving to database:', err);
        } else {
            console.log(`[${nowTime()}] [DB] Average data saved to database (CPUs 0-15)`);
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
                cpu_usage0,
                cpu_usage1,
                cpu_usage2,
                cpu_usage3,
                cpu_usage4,
                cpu_usage5,
                cpu_usage6,
                cpu_usage7,
                cpu_usage8,
                cpu_usage9,
                cpu_usage10,
                cpu_usage11,
                cpu_usage12,
                cpu_usage13,
                cpu_usage14,
                cpu_usage15,
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
    const [
        inVal1, outVal1, inVal2, outVal2,
        cpuVal0, cpuVal1, cpuVal2, cpuVal3,
        cpuVal4, cpuVal5, cpuVal6, cpuVal7,
        cpuVal8, cpuVal9, cpuVal10, cpuVal11,
        cpuVal12, cpuVal13, cpuVal14, cpuVal15,
        memVal
    ] = await Promise.all([
        getSnmpValue(OID_IN1),
        getSnmpValue(OID_OUT1),
        getSnmpValue(OID_IN2),
        getSnmpValue(OID_OUT2),
        getSnmpValue(OID_CPU0),
        getSnmpValue(OID_CPU1),
        getSnmpValue(OID_CPU2),
        getSnmpValue(OID_CPU3),
        getSnmpValue(OID_CPU4),
        getSnmpValue(OID_CPU5),
        getSnmpValue(OID_CPU6),
        getSnmpValue(OID_CPU7),
        getSnmpValue(OID_CPU8),
        getSnmpValue(OID_CPU9),
        getSnmpValue(OID_CPU10),
        getSnmpValue(OID_CPU11),
        getSnmpValue(OID_CPU12),
        getSnmpValue(OID_CPU13),
        getSnmpValue(OID_CPU14),
        getSnmpValue(OID_CPU15),
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
    
    // Store all 16 CPU values (0-15)
    cpuUsage0.push(cpuVal0 != null ? parseInt(cpuVal0) : 0);
    cpuUsage1.push(cpuVal1 != null ? parseInt(cpuVal1) : 0);
    cpuUsage2.push(cpuVal2 != null ? parseInt(cpuVal2) : 0);
    cpuUsage3.push(cpuVal3 != null ? parseInt(cpuVal3) : 0);
    cpuUsage4.push(cpuVal4 != null ? parseInt(cpuVal4) : 0);
    cpuUsage5.push(cpuVal5 != null ? parseInt(cpuVal5) : 0);
    cpuUsage6.push(cpuVal6 != null ? parseInt(cpuVal6) : 0);
    cpuUsage7.push(cpuVal7 != null ? parseInt(cpuVal7) : 0);
    cpuUsage8.push(cpuVal8 != null ? parseInt(cpuVal8) : 0);
    cpuUsage9.push(cpuVal9 != null ? parseInt(cpuVal9) : 0);
    cpuUsage10.push(cpuVal10 != null ? parseInt(cpuVal10) : 0);
    cpuUsage11.push(cpuVal11 != null ? parseInt(cpuVal11) : 0);
    cpuUsage12.push(cpuVal12 != null ? parseInt(cpuVal12) : 0);
    cpuUsage13.push(cpuVal13 != null ? parseInt(cpuVal13) : 0);
    cpuUsage14.push(cpuVal14 != null ? parseInt(cpuVal14) : 0);
    cpuUsage15.push(cpuVal15 != null ? parseInt(cpuVal15) : 0);
    
    memUsed.push(memVal != null ? parseInt(memVal) : 0);
    
    if (times.length > MAX_DATA_POINTS) {
        times.shift();
        inTraffic1.shift();
        outTraffic1.shift();
        inTraffic2.shift();
        outTraffic2.shift();
        
        cpuUsage0.shift();
        cpuUsage1.shift();
        cpuUsage2.shift();
        cpuUsage3.shift();
        cpuUsage4.shift();
        cpuUsage5.shift();
        cpuUsage6.shift();
        cpuUsage7.shift();
        cpuUsage8.shift();
        cpuUsage9.shift();
        cpuUsage10.shift();
        cpuUsage11.shift();
        cpuUsage12.shift();
        cpuUsage13.shift();
        cpuUsage14.shift();
        cpuUsage15.shift();
        
        memUsed.shift();
    }
    
    console.log(`[${now}] [POLL] Intf1: In=${inMbps1.toFixed(3)}Mb/s, Out=${outMbps1.toFixed(3)}Mb/s | Intf2: In=${inMbps2.toFixed(3)}Mb/s, Out=${outMbps2.toFixed(3)}Mb/s`);
    console.log(`[${now}] [POLL] CPU0-7: ${cpuVal0 || 'N/A'}%, ${cpuVal1 || 'N/A'}%, ${cpuVal2 || 'N/A'}%, ${cpuVal3 || 'N/A'}%, ${cpuVal4 || 'N/A'}%, ${cpuVal5 || 'N/A'}%, ${cpuVal6 || 'N/A'}%, ${cpuVal7 || 'N/A'}%`);
    console.log(`[${now}] [POLL] CPU8-15: ${cpuVal8 || 'N/A'}%, ${cpuVal9 || 'N/A'}%, ${cpuVal10 || 'N/A'}%, ${cpuVal11 || 'N/A'}%, ${cpuVal12 || 'N/A'}%, ${cpuVal13 || 'N/A'}%, ${cpuVal14 || 'N/A'}%, ${cpuVal15 || 'N/A'}%`);
    console.log(`[${now}] [POLL] MEM: ${memVal || 'N/A'}MB`);
}

// Initialize and start the application
async function startApplication() {
    try {
        await initDatabase();

        // Start polling
        setInterval(pollData, POLL_INTERVAL_SECONDS * 1000);

        // Start database saving
        setInterval(saveAverageToDatabase, DB_SAVE_INTERVAL);

        console.log("SNMP monitoring started with 16 CPU (0-15) tracking and database support...");
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
  <title>SNMP Monitor - 16 CPU (0-15) Real-time & Historical</title>
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
    /* REMOVE the .full-width class since we don't need it anymore */
  </style>
</head>
<body>
  <h1>SNMP Monitor - 16 CPU (0-15) Real-time & Historical Data</h1>

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
    
    <!-- CPU charts side by side -->
    <div>
      <h2>CPU Usage (%) - Cores 0-7</h2>
      <div class="chart-wrapper">
        <canvas id="cpuChart1"></canvas>
      </div>
    </div>
    
    <div>
      <h2>CPU Usage (%) - Cores 8-15</h2>
      <div class="chart-wrapper">
        <canvas id="cpuChart2"></canvas>
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
    
    <!-- Historical CPU charts side by side -->
    <div>
      <h2>Historical CPU (%) - Cores 0-7</h2>
      <div class="chart-wrapper">
        <canvas id="historicalCpuChart1"></canvas>
      </div>
    </div>
    
    <div>
      <h2>Historical CPU (%) - Cores 8-15</h2>
      <div class="chart-wrapper">
        <canvas id="historicalCpuChart2"></canvas>
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
    const cpuCtx1 = document.getElementById('cpuChart1').getContext('2d');
    const cpuCtx2 = document.getElementById('cpuChart2').getContext('2d');
    const memCtx = document.getElementById('memChart').getContext('2d');
    
    // Initialize historical charts
    const historicalTrafficCtx1 = document.getElementById('historicalTrafficChart1').getContext('2d');
    const historicalTrafficCtx2 = document.getElementById('historicalTrafficChart2').getContext('2d');
    const historicalCpuCtx1 = document.getElementById('historicalCpuChart1').getContext('2d');
    const historicalCpuCtx2 = document.getElementById('historicalCpuChart2').getContext('2d');
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
    
    // Color palette for 8 CPUs per chart
    const cpuColorsGroup1 = [
        'rgb(0, 100, 0)',    // CPU0: Dark Green
        'rgb(0, 150, 0)',    // CPU1: Green
        'rgb(0, 200, 0)',    // CPU2: Light Green
        'rgb(100, 200, 100)',// CPU3: Very Light Green
        'rgb(100, 0, 0)',    // CPU4: Dark Red
        'rgb(150, 0, 0)',    // CPU5: Red
        'rgb(200, 0, 0)',    // CPU6: Light Red
        'rgb(200, 100, 100)' // CPU7: Very Light Red
    ];
    
    const cpuColorsGroup2 = [
        'rgb(0, 0, 100)',    // CPU8: Dark Blue
        'rgb(0, 0, 150)',    // CPU9: Blue
        'rgb(0, 0, 200)',    // CPU10: Light Blue
        'rgb(100, 100, 200)',// CPU11: Very Light Blue
        'rgb(100, 0, 100)',  // CPU12: Dark Purple
        'rgb(150, 0, 150)',  // CPU13: Purple
        'rgb(200, 0, 200)',  // CPU14: Light Purple
        'rgb(200, 100, 200)' // CPU15: Very Light Purple
    ];
    
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
    
    const cpuChart1 = new Chart(cpuCtx1, {
        type: 'line',
        data: { labels: [], datasets: [
            { label: 'CPU 0 %', data: [], borderColor: cpuColorsGroup1[0], fill: false },
            { label: 'CPU 1 %', data: [], borderColor: cpuColorsGroup1[1], fill: false },
            { label: 'CPU 2 %', data: [], borderColor: cpuColorsGroup1[2], fill: false },
            { label: 'CPU 3 %', data: [], borderColor: cpuColorsGroup1[3], fill: false },
            { label: 'CPU 4 %', data: [], borderColor: cpuColorsGroup1[4], fill: false },
            { label: 'CPU 5 %', data: [], borderColor: cpuColorsGroup1[5], fill: false },
            { label: 'CPU 6 %', data: [], borderColor: cpuColorsGroup1[6], fill: false },
            { label: 'CPU 7 %', data: [], borderColor: cpuColorsGroup1[7], fill: false }
        ]},
        options: { 
            ...chartOptions, 
            scales: { 
                ...chartOptions.scales, 
                y: { beginAtZero: true, max: 100 } 
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        boxWidth: 12,
                        padding: 10
                    }
                }
            }
        }
    });
    
    const cpuChart2 = new Chart(cpuCtx2, {
        type: 'line',
        data: { labels: [], datasets: [
            { label: 'CPU 8 %', data: [], borderColor: cpuColorsGroup2[0], fill: false },
            { label: 'CPU 9 %', data: [], borderColor: cpuColorsGroup2[1], fill: false },
            { label: 'CPU 10 %', data: [], borderColor: cpuColorsGroup2[2], fill: false },
            { label: 'CPU 11 %', data: [], borderColor: cpuColorsGroup2[3], fill: false },
            { label: 'CPU 12 %', data: [], borderColor: cpuColorsGroup2[4], fill: false },
            { label: 'CPU 13 %', data: [], borderColor: cpuColorsGroup2[5], fill: false },
            { label: 'CPU 14 %', data: [], borderColor: cpuColorsGroup2[6], fill: false },
            { label: 'CPU 15 %', data: [], borderColor: cpuColorsGroup2[7], fill: false }
        ]},
        options: { 
            ...chartOptions, 
            scales: { 
                ...chartOptions.scales, 
                y: { beginAtZero: true, max: 100 } 
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        boxWidth: 12,
                        padding: 10
                    }
                }
            }
        }
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
    
    const historicalCpuChart1 = new Chart(historicalCpuCtx1, {
        type: 'line',
        data: { labels: [], datasets: [
            { label: 'CPU 0 %', data: [], borderColor: cpuColorsGroup1[0], fill: false },
            { label: 'CPU 1 %', data: [], borderColor: cpuColorsGroup1[1], fill: false },
            { label: 'CPU 2 %', data: [], borderColor: cpuColorsGroup1[2], fill: false },
            { label: 'CPU 3 %', data: [], borderColor: cpuColorsGroup1[3], fill: false },
            { label: 'CPU 4 %', data: [], borderColor: cpuColorsGroup1[4], fill: false },
            { label: 'CPU 5 %', data: [], borderColor: cpuColorsGroup1[5], fill: false },
            { label: 'CPU 6 %', data: [], borderColor: cpuColorsGroup1[6], fill: false },
            { label: 'CPU 7 %', data: [], borderColor: cpuColorsGroup1[7], fill: false }
        ]},
        options: { 
            ...chartOptions, 
            scales: { 
                ...chartOptions.scales, 
                y: { beginAtZero: true, max: 100 } 
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        boxWidth: 12,
                        padding: 10
                    }
                }
            }
        }
    });
    
    const historicalCpuChart2 = new Chart(historicalCpuCtx2, {
        type: 'line',
        data: { labels: [], datasets: [
            { label: 'CPU 8 %', data: [], borderColor: cpuColorsGroup2[0], fill: false },
            { label: 'CPU 9 %', data: [], borderColor: cpuColorsGroup2[1], fill: false },
            { label: 'CPU 10 %', data: [], borderColor: cpuColorsGroup2[2], fill: false },
            { label: 'CPU 11 %', data: [], borderColor: cpuColorsGroup2[3], fill: false },
            { label: 'CPU 12 %', data: [], borderColor: cpuColorsGroup2[4], fill: false },
            { label: 'CPU 13 %', data: [], borderColor: cpuColorsGroup2[5], fill: false },
            { label: 'CPU 14 %', data: [], borderColor: cpuColorsGroup2[6], fill: false },
            { label: 'CPU 15 %', data: [], borderColor: cpuColorsGroup2[7], fill: false }
        ]},
        options: { 
            ...chartOptions, 
            scales: { 
                ...chartOptions.scales, 
                y: { beginAtZero: true, max: 100 } 
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        boxWidth: 12,
                        padding: 10
                    }
                }
            }
        }
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
            
            cpuChart1.data.labels = realTimeData.times;
            cpuChart1.data.datasets[0].data = realTimeData.cpuUsage0;
            cpuChart1.data.datasets[1].data = realTimeData.cpuUsage1;
            cpuChart1.data.datasets[2].data = realTimeData.cpuUsage2;
            cpuChart1.data.datasets[3].data = realTimeData.cpuUsage3;
            cpuChart1.data.datasets[4].data = realTimeData.cpuUsage4;
            cpuChart1.data.datasets[5].data = realTimeData.cpuUsage5;
            cpuChart1.data.datasets[6].data = realTimeData.cpuUsage6;
            cpuChart1.data.datasets[7].data = realTimeData.cpuUsage7;
            cpuChart1.update();
            
            cpuChart2.data.labels = realTimeData.times;
            cpuChart2.data.datasets[0].data = realTimeData.cpuUsage8;
            cpuChart2.data.datasets[1].data = realTimeData.cpuUsage9;
            cpuChart2.data.datasets[2].data = realTimeData.cpuUsage10;
            cpuChart2.data.datasets[3].data = realTimeData.cpuUsage11;
            cpuChart2.data.datasets[4].data = realTimeData.cpuUsage12;
            cpuChart2.data.datasets[5].data = realTimeData.cpuUsage13;
            cpuChart2.data.datasets[6].data = realTimeData.cpuUsage14;
            cpuChart2.data.datasets[7].data = realTimeData.cpuUsage15;
            cpuChart2.update();
            
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
                
                historicalCpuChart1.data.labels = labels;
                historicalCpuChart1.data.datasets[0].data = historicalData.map(item => item.cpu_usage0);
                historicalCpuChart1.data.datasets[1].data = historicalData.map(item => item.cpu_usage1);
                historicalCpuChart1.data.datasets[2].data = historicalData.map(item => item.cpu_usage2);
                historicalCpuChart1.data.datasets[3].data = historicalData.map(item => item.cpu_usage3);
                historicalCpuChart1.data.datasets[4].data = historicalData.map(item => item.cpu_usage4);
                historicalCpuChart1.data.datasets[5].data = historicalData.map(item => item.cpu_usage5);
                historicalCpuChart1.data.datasets[6].data = historicalData.map(item => item.cpu_usage6);
                historicalCpuChart1.data.datasets[7].data = historicalData.map(item => item.cpu_usage7);
                historicalCpuChart1.update();
                
                historicalCpuChart2.data.labels = labels;
                historicalCpuChart2.data.datasets[0].data = historicalData.map(item => item.cpu_usage8);
                historicalCpuChart2.data.datasets[1].data = historicalData.map(item => item.cpu_usage9);
                historicalCpuChart2.data.datasets[2].data = historicalData.map(item => item.cpu_usage10);
                historicalCpuChart2.data.datasets[3].data = historicalData.map(item => item.cpu_usage11);
                historicalCpuChart2.data.datasets[4].data = historicalData.map(item => item.cpu_usage12);
                historicalCpuChart2.data.datasets[5].data = historicalData.map(item => item.cpu_usage13);
                historicalCpuChart2.data.datasets[6].data = historicalData.map(item => item.cpu_usage14);
                historicalCpuChart2.data.datasets[7].data = historicalData.map(item => item.cpu_usage15);
                historicalCpuChart2.update();
                
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
        cpuUsage0,
        cpuUsage1,
        cpuUsage2,
        cpuUsage3,
        cpuUsage4,
        cpuUsage5,
        cpuUsage6,
        cpuUsage7,
        cpuUsage8,
        cpuUsage9,
        cpuUsage10,
        cpuUsage11,
        cpuUsage12,
        cpuUsage13,
        cpuUsage14,
        cpuUsage15,
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
    const PORT = 4000;
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://*:${PORT}/`);
    });
});
