// app.cjs — thin crash-logging wrapper around server.js. Passenger's "Setup Node.js
// App" startup-file setting determines whether this or server.js is actually loaded
// directly; this file exists so that either way, uncaught boot-time errors land
// somewhere readable instead of vanishing into Passenger's own logs.
const fs   = require('fs');
const path = require('path');
// __dirname-relative, not a hardcoded absolute path — this previously pointed at a
// hardcoded '/home/<cpanel-user>/<app-dir>/boot-error.log', which would silently stop
// logging (the appendFileSync is wrapped in try/catch) if the app were ever moved to a
// different cPanel account or directory.
const LOG = path.join(__dirname, 'boot-error.log');
// Cap the log at ~5MB — this file previously grew unbounded (observed ~1.2MB from
// ordinary Passenger idle-respawns alone) since nothing ever rotated or truncated it.
const MAX_LOG_BYTES = 5 * 1024 * 1024;
function dump(t,e){
  try{
    const stat = fs.existsSync(LOG) ? fs.statSync(LOG) : null;
    if (stat && stat.size > MAX_LOG_BYTES) fs.writeFileSync(LOG, `[${new Date().toISOString()}] LOG_TRUNCATED (exceeded ${MAX_LOG_BYTES} bytes)\n`);
    fs.appendFileSync(LOG,'['+new Date().toISOString()+'] '+t+': '+(e&&e.stack?e.stack:String(e))+'\n');
  }catch(_){}
}
  dump('STEP','app.cjs loaded; PORT='+JSON.stringify(process.env.PORT));
  process.on('uncaughtException', e => dump('uncaughtException', e));
  process.on('unhandledRejection', e => dump('unhandledRejection', e));
  process.on('exit', c => dump('EXIT','code='+c));
  import('./server.js').then(()=>dump('STEP','server.js imported OK')).catch(e=>dump('import-failed', e));