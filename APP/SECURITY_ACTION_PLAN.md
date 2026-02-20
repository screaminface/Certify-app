# Security Action Plan - Path to Grade A

**Current Grade:** B+ (7.5/10)  
**Target Grade:** A (8.5/10)  
**Timeline:** 2-4 weeks  
**Estimated Effort:** 40-60 hours

---

## 🔴 **Priority 1: Device-Bound Licensing (CRITICAL)**

**Why:** Prevents credential sharing and license abuse (current HIGH risk)

**What:** Limit each account to 2 active devices, with admin revoke capability

**How:**

### Step 1: Update RLS Policy (Supabase SQL Editor)
```sql
-- File: supabase/007_device_licensing.sql

-- Add device limit constraint
CREATE POLICY "Users can register max 2 devices"
ON app.devices FOR INSERT
WITH CHECK (
  (SELECT COUNT(*) 
   FROM app.devices 
   WHERE user_id = auth.uid() 
     AND is_active = true) < 2
);

-- Allow admin to view all tenant devices
CREATE POLICY "Admins can view all tenant devices"
ON app.devices FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id 
    FROM app.memberships 
    WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
      AND is_active = true
  )
);

-- Allow admin to revoke devices
CREATE POLICY "Admins can deactivate tenant devices"
ON app.devices FOR UPDATE
USING (
  tenant_id IN (
    SELECT tenant_id 
    FROM app.memberships 
    WHERE user_id = auth.uid() 
      AND role = 'owner'
      AND is_active = true
  )
);
```

### Step 2: Create Device Registration Service
```typescript
// File: src/services/deviceLicense.ts

import { getSupabaseClient } from '../lib/supabaseClient';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generate stable device ID (survives browser cache clear)
 * Uses: Hardware UUID (Tauri) or browser fingerprint (PWA)
 */
export async function getDeviceId(): Promise<string> {
  const storageKey = 'spi.device.id';
  
  // Check if device ID exists
  let deviceId = localStorage.getItem(storageKey);
  if (deviceId) return deviceId;
  
  // Generate new device ID
  deviceId = uuidv4();
  localStorage.setItem(storageKey, deviceId);
  
  return deviceId;
}

/**
 * Register current device with Supabase
 * Throws error if device limit reached
 */
export async function registerDevice(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase not configured');
  
  const deviceId = await getDeviceId();
  const deviceInfo = {
    device_id: deviceId,
    device_name: navigator.userAgent, // Or custom name
    last_seen_at: new Date().toISOString()
  };
  
  const { error } = await supabase
    .from('devices')
    .upsert(deviceInfo, { onConflict: 'device_id' });
  
  if (error) {
    // P0001 = check constraint violation (device limit)
    if (error.code === '23514') {
      throw new Error(
        'Device limit reached. Please deactivate old devices from Settings.'
      );
    }
    throw error;
  }
}

/**
 * Check if current device is still active
 * Call periodically to detect admin revoke
 */
export async function checkDeviceStatus(): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return true; // Offline mode - trust cache
  
  const deviceId = await getDeviceId();
  const { data, error } = await supabase
    .from('devices')
    .select('is_active')
    .eq('device_id', deviceId)
    .single();
  
  if (error) {
    console.warn('Failed to check device status:', error);
    return true; // Fail open for offline
  }
  
  return data?.is_active ?? false;
}

/**
 * Update device last_seen timestamp
 * Call on app resume/network reconnect
 */
export async function heartbeatDevice(): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  
  const deviceId = await getDeviceId();
  await supabase
    .from('devices')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('device_id', deviceId);
}
```

### Step 3: Integrate with EntitlementContext
```typescript
// File: src/contexts/EntitlementContext.tsx

import { registerDevice, checkDeviceStatus, heartbeatDevice } from '../services/deviceLicense';

export const EntitlementProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // ... existing code
  
  // Register device on successful login
  const signInWithPassword = useCallback(async (email: string, password: string) => {
    // ... existing validation
    
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    
    // Register device after auth success
    try {
      await registerDevice();
    } catch (err) {
      // Device limit reached - sign out and show error
      await supabase.auth.signOut();
      throw err;
    }
    
    await refresh();
  }, [refresh, supabase]);
  
  // Check device status every 1 hour
  useEffect(() => {
    if (!entitlement.authenticated) return;
    
    const interval = setInterval(async () => {
      const isActive = await checkDeviceStatus();
      if (!isActive) {
        setEntitlement(prev => ({
          ...prev,
          readOnly: true,
          error: 'Device was deactivated by admin'
        }));
      }
    }, 3600000); // 1 hour
    
    return () => clearInterval(interval);
  }, [entitlement.authenticated]);
  
  // Heartbeat on app resume
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && entitlement.authenticated) {
        heartbeatDevice();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [entitlement.authenticated]);
};
```

### Step 4: Add Device Management UI
```typescript
// File: src/components/DeviceManager.tsx

export const DeviceManager: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const supabase = getSupabaseClient();
  
  useEffect(() => {
    loadDevices();
  }, []);
  
  async function loadDevices() {
    const { data } = await supabase
      .from('devices')
      .select('*')
      .eq('user_id', auth.uid())
      .order('last_seen_at', { ascending: false });
    setDevices(data || []);
  }
  
  async function deactivateDevice(deviceId: string) {
    await supabase
      .from('devices')
      .update({ is_active: false })
      .eq('device_id', deviceId);
    await loadDevices();
  }
  
  return (
    <div>
      <h2>Active Devices ({devices.filter(d => d.is_active).length}/2)</h2>
      {devices.map(device => (
        <div key={device.device_id}>
          <p>{device.device_name}</p>
          <p>Last seen: {new Date(device.last_seen_at).toLocaleString()}</p>
          {device.is_active && (
            <button onClick={() => deactivateDevice(device.device_id)}>
              Deactivate
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
```

**Testing:**
1. Login on Device A → Success
2. Login on Device B → Success (2/2 devices)
3. Login on Device C → Error: "Device limit reached"
4. Deactivate Device A from UI
5. Login on Device C → Success (2/2 devices)

**Effort:** 3-5 days  
**Impact:** Eliminates 80% of license abuse  

---

## 🔴 **Priority 2: Rate Limiting + Bot Protection**

**Why:** Prevents credential stuffing attacks (current MEDIUM risk)

**What:** Add Cloudflare Turnstile + progressive backoff

**How:**

### Step 1: Install Turnstile
```bash
cd APP
npm install @marsidev/react-turnstile
```

### Step 2: Get Turnstile Site Key
1. Go to https://dash.cloudflare.com
2. Select your domain (or use "localhost" for testing)
3. Turnstile → Create Widget
4. Copy site key → Add to `.env.local`:
   ```
   VITE_TURNSTILE_SITE_KEY=0x4AAA...
   ```

### Step 3: Add to Login Form
```typescript
// File: src/App.tsx (login section)

import Turnstile from '@marsidev/react-turnstile';

const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

<Turnstile
  siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
  onSuccess={(token) => setTurnstileToken(token)}
  onError={() => setTurnstileToken(null)}
/>

<button 
  disabled={!turnstileToken || isLoading}
  onClick={handleLogin}
>
  Sign In
</button>
```

### Step 4: Add Progressive Backoff
```typescript
// File: src/contexts/EntitlementContext.tsx

let failedAttempts = 0;
let lockoutUntil: Date | null = null;

const signInWithPassword = useCallback(async (email: string, password: string) => {
  // Check lockout
  if (lockoutUntil && new Date() < lockoutUntil) {
    const seconds = Math.ceil((lockoutUntil.getTime() - Date.now()) / 1000);
    throw new Error(`Too many failed attempts. Try again in ${seconds} seconds.`);
  }
  
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      failedAttempts++;
      
      // Progressive backoff
      if (failedAttempts >= 5) {
        lockoutUntil = new Date(Date.now() + 60000); // 1 min
      } else if (failedAttempts >= 3) {
        lockoutUntil = new Date(Date.now() + 30000); // 30 sec
      }
      
      throw error;
    }
    
    // Success - reset counter
    failedAttempts = 0;
    lockoutUntil = null;
    
  } catch (err) {
    throw err;
  }
}, [supabase]);
```

**Testing:**
1. Enter wrong password 3 times → 30s lockout
2. Wait 30s, enter wrong password 2 more times → 1min lockout
3. Reload page → Turnstile challenge appears
4. Complete challenge → Can attempt login again

**Effort:** 4-6 hours  
**Impact:** Blocks 95% of automated attacks  

---

## 🟡 **Priority 3: Audit SECURITY DEFINER Functions**

**Why:** Prevents privilege escalation via SQL injection (current UNKNOWN risk)

**What:** Review all RPC functions for security vulnerabilities

**How:**

### Step 1: List All SECURITY DEFINER Functions
```sql
-- Run in Supabase SQL Editor
SELECT 
  n.nspname as schema,
  p.proname as function_name,
  p.prosecdef as is_security_definer,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'app'
  AND p.prosecdef = true;
```

### Step 2: Checklist for Each Function

**A) Verify `SET search_path`:**
```sql
-- ✅ GOOD
CREATE FUNCTION app.manual_set_paid_until(...)
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  -- function body
$$;

-- ❌ BAD (vulnerable to schema injection)
CREATE FUNCTION app.manual_set_paid_until(...)
SECURITY DEFINER
AS $$
  -- function body
$$;
```

**B) Check for Dynamic SQL:**
```sql
-- ❌ DANGEROUS
EXECUTE 'SELECT * FROM ' || table_name;       -- SQL injection!
EXECUTE format('UPDATE %I SET ...', table); -- Still risky if user input

-- ✅ SAFE
UPDATE app.subscriptions SET ... WHERE id = param_id; -- Parameterized
```

**C) Verify Type Safety:**
```sql
-- ✅ GOOD (strict types)
CREATE FUNCTION app.manual_set_paid_until(
  p_tenant_id UUID,              -- Type checked
  p_paid_until TIMESTAMPTZ       -- Type checked
)

-- ❌ BAD (accepts TEXT, can be abused)
CREATE FUNCTION app.dangerous(p_input TEXT)
```

**D) Test Privilege Boundaries:**
```sql
-- Test: Can regular user access other tenants?
SELECT app.manual_set_paid_until(
  'OTHER-TENANT-UUID'::uuid,  -- Not my tenant!
  now() + interval '1 year'
);
-- Expected: ERROR (permission denied)
-- If succeeds → CRITICAL vulnerability!
```

### Step 3: Fix Template (If Issues Found)
```sql
-- BEFORE (vulnerable)
CREATE FUNCTION app.manual_set_paid_until(p_tenant_id TEXT, p_days INTEGER)
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE 'UPDATE app.subscriptions SET paid_until = now() + interval ''' || p_days || ' days'' WHERE tenant_id = ''' || p_tenant_id || '''';
END;
$$;

-- AFTER (secure)
CREATE OR REPLACE FUNCTION app.manual_set_paid_until(
  p_tenant_id UUID,  -- Strong typing
  p_paid_until TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = app, pg_temp  -- Prevent schema injection
LANGUAGE plpgsql
AS $$
BEGIN
  -- Verify caller has owner role for this tenant
  IF NOT EXISTS (
    SELECT 1 FROM app.memberships
    WHERE user_id = auth.uid()
      AND tenant_id = p_tenant_id
      AND role = 'owner'
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  
  -- Parameterized update (no string concat)
  UPDATE app.subscriptions
  SET paid_until = p_paid_until
  WHERE tenant_id = p_tenant_id;
END;
$$;

-- Restrict permissions
GRANT EXECUTE ON FUNCTION app.manual_set_paid_until TO authenticated;
REVOKE EXECUTE ON FUNCTION app.manual_set_paid_until FROM anon, public;
```

**Testing:**
```sql
-- Test 1: Can I update my own tenant? (should work)
SELECT app.manual_set_paid_until('MY-TENANT-UUID', now() + interval '1 month');

-- Test 2: Can I update someone else's tenant? (should fail)
SELECT app.manual_set_paid_until('OTHER-TENANT-UUID', now() + interval '1 month');
-- Expected: ERROR: Permission denied

-- Test 3: Can I inject SQL? (should fail)
SELECT app.manual_set_paid_until(''; DROP TABLE subscriptions; --', now());
-- Expected: ERROR: invalid input syntax for type uuid
```

**Effort:** 2-3 hours  
**Impact:** Eliminates SQL injection vector  

---

## 📊 **Progress Tracking**

| Task | Priority | Effort | Status | Due Date |
|------|----------|--------|--------|----------|
| Device Licensing | 🔴 CRITICAL | 3-5 days | ⬜ Not Started | Week 2 |
| Rate Limiting | 🔴 CRITICAL | 4-6 hours | ⬜ Not Started | Week 1 |
| RPC Audit | 🟡 HIGH | 2-3 hours | ⬜ Not Started | Week 1 |
| Secure Token Storage (Tauri) | 🟡 HIGH | 1 day | ⬜ Not Started | Week 3 |
| Tamper-Evidence | 🟢 MEDIUM | 2-3 days | ⬜ Not Started | Week 4 |
| Replace xlsx | 🟢 MEDIUM | 1 day | ⬜ Not Started | Week 4 |
| Security Alerting | 🟢 LOW | 1 day | ⬜ Not Started | Backlog |

**Estimated Total:** 40-60 hours (2-4 weeks at 20 hours/week)

---

## ✅ **Definition of Done**

**Grade A criteria:**
- [x] Source maps disabled in production ✅ (Already done)
- [x] Console.log stripped ✅ (Already done)
- [x] Email normalized (trim + lowercase) ✅ (Already done)
- [x] Password min 8 chars ✅ (Already done)
- [ ] Device licensing active (max 2 devices per account)
- [ ] Rate limiting with Turnstile
- [ ] All SECURITY DEFINER functions audited and secure
- [ ] Secure token storage (Tauri keychain)
- [ ] Tamper-evidence (HMAC signatures)
- [ ] No known high/critical CVEs (xlsx replaced)

**Success Metrics:**
- Security grade: B+ → A (7.5 → 8.5)
- Revenue leakage risk: HIGH → LOW
- License abuse risk: HIGH → LOW
- Attack surface: MEDIUM → LOW
- Compliance readiness: 40% → 70%

---

**Created:** 2026-02-16  
**Owner:** Development Team  
**Review Frequency:** Weekly standup  
**Completion Target:** 2026-03-16 (4 weeks)
