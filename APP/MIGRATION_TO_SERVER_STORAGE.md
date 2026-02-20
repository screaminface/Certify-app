# Migration Path: Offline-First → Server-Side Storage

## Current Architecture Limitation

**Current State:**
- ✅ App data (participants, groups) stored in **Dexie (IndexedDB)** - client-side
- ✅ Supabase used **only** for:
  - Authentication (JWT)
  - Billing/subscriptions
  - Entitlement checks

**Security Implication:**
- ⚠️ Paywall enforcement is **client-side only** (Dexie hooks)
- ⚠️ Advanced users can bypass read-only mode via DevTools
- ⚠️ No server-side validation of write operations

**This is acceptable for:**
- ✅ Small teams (trusted users)
- ✅ Offline-first use cases
- ✅ Desktop apps (Tauri)

**This is NOT acceptable for:**
- ❌ Enterprise SaaS (untrusted users)
- ❌ Compliance requirements (SOC2, HIPAA, GDPR data isolation)
- ❌ Multi-user collaboration with real-time sync

---

## Migration Path (If Needed)

### Option 1: Hybrid Storage (Recommended)

**Keep Dexie for offline UX, sync to Supabase for enforcement:**

1. **Add Supabase Tables:**
   ```sql
   CREATE TABLE app.participants (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tenant_id UUID NOT NULL REFERENCES app.tenants(id),
     company_name TEXT NOT NULL,
     person_name TEXT NOT NULL,
     egn TEXT NOT NULL,
     -- ... existing fields
     created_at TIMESTAMPTZ DEFAULT now(),
     updated_at TIMESTAMPTZ DEFAULT now()
   );
   
   ALTER TABLE app.participants ENABLE ROW LEVEL SECURITY;
   
   -- RLS Policy with subscription enforcement
   CREATE POLICY "Users can insert participants if subscription active"
   ON app.participants FOR INSERT
   WITH CHECK (
     tenant_id IN (
       SELECT m.tenant_id 
       FROM app.memberships m
       JOIN app.entitlements e ON e.tenant_id = m.tenant_id
       WHERE m.user_id = auth.uid()
         AND m.is_active = true
         AND e.status = 'active' -- ← KEY: Blocks expired subscriptions
         AND e.current_period_end > now()
     )
   );
   ```

2. **Sync Strategy:**
   - **Write:** Dexie → Supabase (optimistic UI, background sync)
   - **Read:** Supabase → Dexie (initial load, refresh on resume)
   - **Conflict Resolution:** Last-write-wins or version vectors

3. **Implementation:**
   ```typescript
   // services/db/sync.ts
   export async function syncParticipantToServer(participant: Participant) {
     const supabase = getSupabaseClient();
     if (!supabase) return; // Offline mode
   
     const { error } = await supabase
       .from('participants')
       .upsert({
         id: participant.id,
         tenant_id: getCurrentTenantId(),
         company_name: participant.companyName,
         // ... map fields
       });
   
     if (error) {
       // Handle subscription expired error
       if (error.code === '42501') { // RLS violation
         setAppReadOnlyMode(true);
         throw new Error('Subscription expired');
       }
     }
   }
   ```

**Pros:**
- ✅ Server-side paywall enforcement
- ✅ Keeps offline-first UX
- ✅ Multi-device sync
- ✅ Audit trail in Supabase

**Cons:**
- ⚠️ Sync complexity (conflicts, offline queue)
- ⚠️ Increased Supabase costs (storage + bandwidth)

---

### Option 2: Full Server-Side Storage

**Move all data to Supabase, use Dexie only for cache:**

1. **All writes go to Supabase directly**
2. **Dexie becomes read-only cache**
3. **RLS policies enforce entitlement on every operation**

**Pros:**
- ✅ Strongest security
- ✅ Real-time collaboration (Supabase Realtime)
- ✅ Centralized backup

**Cons:**
- ❌ Requires internet connection
- ❌ UX degradation (no offline mode)
- ❌ Higher latency

---

### Option 3: Keep Current + Document Limitation

**Accept client-side enforcement as design trade-off:**

1. **Document in SECURITY.md** (already done)
2. **Add disclaimer in UI:** "This app stores data locally. Bypassing paywall affects only your device."
3. **Consider for desktop-only distribution** (Tauri) where users "own" the app

**Pros:**
- ✅ No code changes
- ✅ Simple architecture
- ✅ True offline capability

**Cons:**
- ⚠️ Not suitable for SaaS business model
- ⚠️ Users can bypass paywall locally

---

## Recommendation

**For current use case (small teams, offline-first):** ✅ **Option 3** - Keep current architecture

**If scaling to public SaaS:** → **Option 1** - Hybrid storage with background sync

**If compliance required (SOC2, HIPAA):** → **Option 2** - Full server-side storage

---

## Testing Server-Side Enforcement (If Migrating)

```sql
-- Test: Insert participant with expired subscription
-- Login as user with expired subscription
INSERT INTO app.participants (tenant_id, company_name, person_name, egn)
VALUES ('my-tenant-id', 'Test', 'Test Person', '1234567890');

-- Expected: ERROR: new row violates row-level security policy
-- If passes → RLS policy missing entitlement check!
```

---

**Last Updated:** 2026-02-16  
**Related:** SECURITY.md Section "Known Risks & Mitigations"
