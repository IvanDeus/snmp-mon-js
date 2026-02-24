# snmp-mon-js: SNMP Monitor with Historical Data

A simple SNMP monitoring solution that collects real-time metrics and stores historical data in SQLite. Features an intuitive web dashboard with both real-time and historical charts.

## Features

- **Real-time Monitoring**: Polls SNMP devices every 5 seconds. Real-time charts showing the last 150 data points (~12.5 minutes)
- **Historical Data Storage**: Automatically saves averaged metrics to SQLite database
- **Dual Interface Support**: Monitor two network interfaces simultaneously
- **CPU & Memory Tracking**: System performance monitoring
- **Web Dashboard**: Responsive interface with Chart.js visualizations
- **PM2 Support**: Production-ready process management

## Quick Start

### Prerequisites

- Node.js (v20 or higher)
- `snmpget` command-line tool
- PM2 (for production deployment)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/IvanDeus/snmp-mon-js.git
   cd snmp-mon-js
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure SNMP settings**
   
   Edit `monitor.js` and update the following variables in the SETTINGS section:
   ```javascript
   const SNMP_HOST = "10.1.108.43";        // Your SNMP device IP
   const SNMP_PORT = 161;                  // SNMP port (default: 161)
   const SNMP_COMMUNITY = "comm1";         // Your SNMP community string
   
   // Update OIDs to match your device's MIBs
   const OID_IN1 = "1.3.6.1.4.1.23668.8107.2.1.1.110.13";
   const OID_OUT1 = "1.3.6.1.4.1.23668.8107.2.1.1.121.13";
   // ... etc.
   ```

4. **Start the application**
   
   For development:
   ```bash
   node monitor.js
   ```
   
   For production (with PM2):
   ```bash
   pm2 start monitor.js --name "smonitor"
   pm2 save
   pm2 startup
   ```

5. **Access the dashboard**
   
   Open your browser to: `http://your-server-ip:4000`

## Configuration

### SNMP OIDs

The application monitors these metrics by default:
- **Interface 1**: Input/Output traffic (converted to Mbps)
- **Interface 2**: Input/Output traffic (converted to Mbps)  
- **CPU Usage**: Percentage utilization
- **Memory Used**: Current memory consumption

### Customization Options

In `monitor.js`, you can adjust:

```javascript
const POLL_INTERVAL_SECONDS = 5;           // Data collection frequency
const MAX_DATA_POINTS = 150;               // Real-time data points to keep in memory
const DB_SAVE_INTERVAL = 150 * 5 * 1000;   // How often to save averages to database
```

### Web Interface Port

Change the web server port by modifying the last lines of `monitor.js`:
```javascript
app.listen(4000, "0.0.0.0", () => {
    console.log("Server running on http://*:4000/");
});
```

## Database

The application uses SQLite for historical data storage:

- **Location**: `monitor.db` in the application directory
- **Table**: `historical_data` stores averaged metrics
- **Retention**: Data persists indefinitely (manual cleanup required)

### Database Schema

```sql
CREATE TABLE historical_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    in_traffic1 REAL,    -- Interface 1 input (Mbps)
    out_traffic1 REAL,   -- Interface 1 output (Mbps)
    in_traffic2 REAL,    -- Interface 2 input (Mbps)
    out_traffic2 REAL,   -- Interface 2 output (Mbps)
    cpu_usage REAL,      -- CPU usage percentage
    mem_used REAL        -- Memory used (MB)
);
```

## API Endpoints

- `GET /` - Main dashboard interface
- `GET /data` - JSON data for real-time charts
- `GET /historical-data?limit=100` - JSON data for historical charts

### Logs

The application logs to stdout with timestamps. Check PM2 logs with:
```bash
pm2 logs smonitor
```

## Development

### Project Structure

```
snmp-mon-js/
├── monitor.js          # Main application file
├── monitor.db          # SQLite database (created automatically)
├── package.json        # Node.js dependencies
└── README.md          # This file
```

### Adding New Metrics

1. Add new OID constants to SETTINGS section
2. Update the polling function to collect the new data
3. Modify the database schema and saving logic
4. Update the web interface charts

---

**Enjoy monitoring your network!**


2026 [ ivan deus ]
