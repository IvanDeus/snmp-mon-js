# snmp-mon-js
Simple 4 graph SNMP Monitoring. Will collect and store data into SQLite and show up to last 25 hours. 
## setup

git clone 

edit in monitor.js:
 --- SETTINGS ---
 
 --- original OIDs from your snmpwalk

npm install 

pm2 start monitor.js --name "smonitor" 

### Enjoy!
