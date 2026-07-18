# Silicon Ledger — cPanel Deployment

## Prerequisites
- cPanel access at `https://site-dgwurg.hostnin.com:2083`
- Username: `sitedgwu`
- Domain `www.silicon98.com` pointed to HostNin nameservers:
  - `echo.balancedserver.com`
  - `pulse.balancedserver.com`
- PostgreSQL running with database `silicon_ledger`

## Files
Deployment package: `/tmp/silicon-ledger-deploy.tar.gz` (172 KB)

## Steps

### 1. Update Domain Nameservers
At your domain registrar, set nameservers to:
```
echo.balancedserver.com
pulse.balancedserver.com
```
DNS propagation takes 24–48 hours. Use the temporary domain `site-dgwurg.hostnin.com` in the meantime.

### 2. Log into cPanel
Open `https://site-dgwurg.hostnin.com:2083` in your browser.
Log in with username `sitedgwu` and your password.

### 3. Upload the deployment package
- Open **File Manager** in cPanel
- Navigate to `home/sitedgwu/` (or your home directory)
- Upload `silicon-ledger-deploy.tar.gz`
- Extract it → a `silicon-ledger` folder will appear

### 4. Create Node.js Application
- Find **Setup Node.js App** in cPanel (under "Software" section)
- Click **Create Application**
- Fill in:
  - **Node.js version:** 20.x or 22.x
  - **Application mode:** Production
  - **Application root:** `silicon-ledger`
  - **Application URL:** `https://www.silicon98.com/ota` (or the temporary domain)
  - **Application startup file:** `server/src/index.js`
  - **Passenger log file:** leave default
- Click **Create**

### 5. Set Environment Variables
In the Node.js app panel, add these environment variables:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `DATABASE_URL` | `postgresql://postgres:X3r0X3r0@1@localhost:5432/silicon_ledger` |
| `JWT_SECRET` | Run locally: `openssl rand -hex 64` |

### 6. Start the Application
- Click **Run npm install** (cPanel will install server dependencies)
- Click **Start** or **Restart**
- The app should start. Check the log if it fails.

### 7. Set up SSL
- Open **SSL/TLS** in cPanel
- Run **AutoSSL** for your domain
- Or install Let's Encrypt certificate

### 8. Verify
- `https://www.silicon98.com/ota` → should load the app
- `https://www.silicon98.com/api/health` → `{"status":"ok"}`
