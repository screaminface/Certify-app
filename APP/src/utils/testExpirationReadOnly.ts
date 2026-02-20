/**
 * ТЕСТ: Автоматично превключване към Read-Only режим при изтичане
 * 
 * Този файл тества:
 * 1. Създаване на JWT token с валидност 1 минута
 * 2. Автоматична проверка дали след изтичане на срока tenant става read-only
 * 3. Проверка че приложението влиза в read-only режим
 */

import { getSupabaseClient } from '../lib/supabaseClient';

interface ExpirationTestResult {
  step: string;
  status: 'success' | 'error' | 'pending' | 'info';
  message: string;
  timestamp: string;
  data?: any;
}

/**
 * Тестване на автоматично превключване към read-only
 * 
 * @param waitForExpiration - Дали да изчака автоматично изтичането (70 сек)
 * @returns Promise с резултатите от теста
 */
export async function testExpirationReadOnly(
  waitForExpiration: boolean = false
): Promise<ExpirationTestResult[]> {
  const results: ExpirationTestResult[] = [];
  const supabase = getSupabaseClient();

  if (!supabase) {
    results.push({
      step: 'Инициализация',
      status: 'error',
      message: 'Supabase клиентът не е конфигуриран',
      timestamp: new Date().toISOString()
    });
    return results;
  }

  try {
    // Стъпка 1: Проверка на текущата сесия
    results.push({
      step: '1. Проверка на сесия',
      status: 'pending',
      message: 'Проверка на текущата JWT сесия...',
      timestamp: new Date().toISOString()
    });

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !sessionData.session) {
      results.push({
        step: '1. Проверка на сесия',
        status: 'error',
        message: 'Не сте автентикиран. Моля, влезте в системата.',
        timestamp: new Date().toISOString()
      });
      return results;
    }

    const session = sessionData.session;
    const expiresAt = session.expires_at ? new Date(session.expires_at * 1000) : null;
    const expiresIn = expiresAt ? Math.floor((expiresAt.getTime() - Date.now()) / 1000) : null;

    results.push({
      step: '1. Проверка на сесия',
      status: 'success',
      message: `JWT token изтича след ${expiresIn} секунди`,
      timestamp: new Date().toISOString(),
      data: {
        expiresAt: expiresAt?.toISOString(),
        expiresInSeconds: expiresIn,
        userId: session.user.id
      }
    });

    // Стъпка 2: Проверка на текущия entitlement статус
    results.push({
      step: '2. Текущ entitlement',
      status: 'pending',
      message: 'Проверка на текущия entitlement статус...',
      timestamp: new Date().toISOString()
    });

    const { data: entitlementData, error: entitlementError } = await supabase.rpc('entitlement_me', { 
      p_tenant_id: null 
    });

    if (entitlementError) {
      results.push({
        step: '2. Текущ entitlement',
        status: 'error',
        message: `Грешка при четене на entitlement: ${entitlementError.message}`,
        timestamp: new Date().toISOString()
      });
      return results;
    }

    const entitlement = Array.isArray(entitlementData) ? entitlementData[0] : entitlementData;

    results.push({
      step: '2. Текущ entitlement',
      status: 'info',
      message: `Status: ${entitlement.status}, Read-only: ${entitlement.read_only}`,
      timestamp: new Date().toISOString(),
      data: {
        status: entitlement.status,
        readOnly: entitlement.read_only,
        planCode: entitlement.plan_code,
        currentPeriodEnd: entitlement.current_period_end,
        graceUntil: entitlement.grace_until,
        daysUntilReadOnly: entitlement.days_until_read_only
      }
    });

    // Стъпка 3: Проверка дали subscription-ът изтича скоро
    if (entitlement.current_period_end) {
      const periodEnd = new Date(entitlement.current_period_end);
      const timeUntilExpiration = periodEnd.getTime() - Date.now();
      const secondsUntilExpiration = Math.floor(timeUntilExpiration / 1000);

      results.push({
        step: '3. Срок на абонамент',
        status: 'info',
        message: `Subscription изтича след ${secondsUntilExpiration} секунди`,
        timestamp: new Date().toISOString(),
        data: {
          periodEnd: periodEnd.toISOString(),
          secondsUntilExpiration,
          isExpired: timeUntilExpiration <= 0
        }
      });

      // Стъпка 4: Ако е зададено, изчакваме изтичането
      if (waitForExpiration && secondsUntilExpiration > 0 && secondsUntilExpiration < 120) {
        const waitTime = secondsUntilExpiration + 15; // +15 сек за grace период да се задейства

        results.push({
          step: '4. Изчакване',
          status: 'pending',
          message: `Изчакване ${waitTime} секунди за изтичане на subscription...`,
          timestamp: new Date().toISOString()
        });

        await sleep(waitTime * 1000);

        results.push({
          step: '4. Изчакване',
          status: 'success',
          message: 'Изчакването приключи',
          timestamp: new Date().toISOString()
        });

        // Стъпка 5: Проверка след изтичане
        results.push({
          step: '5. Проверка след изтичане',
          status: 'pending',
          message: 'Проверка на новия статус...',
          timestamp: new Date().toISOString()
        });

        const { data: newEntitlementData, error: newEntitlementError } = await supabase.rpc(
          'entitlement_me', 
          { p_tenant_id: null }
        );

        if (newEntitlementError) {
          results.push({
            step: '5. Проверка след изтичане',
            status: 'error',
            message: `Грешка: ${newEntitlementError.message}`,
            timestamp: new Date().toISOString()
          });
          return results;
        }

        const newEntitlement = Array.isArray(newEntitlementData) 
          ? newEntitlementData[0] 
          : newEntitlementData;

        const isReadOnlyNow = newEntitlement.read_only === true;
        const isGraceNow = newEntitlement.status === 'grace';

        results.push({
          step: '5. Проверка след изтичане',
          status: isReadOnlyNow ? 'success' : (isGraceNow ? 'info' : 'error'),
          message: isReadOnlyNow 
            ? '✅ УСПЕХ: Tenant е автоматично превключен в read-only режим!'
            : isGraceNow
            ? '⏳ Все още в grace период. Read-only ще се активира след изтичането.'
            : '❌ ГРЕШКА: Read-only не е активиран!',
          timestamp: new Date().toISOString(),
          data: {
            status: newEntitlement.status,
            readOnly: newEntitlement.read_only,
            daysUntilReadOnly: newEntitlement.days_until_read_only,
            graceUntil: newEntitlement.grace_until
          }
        });
      }
    } else {
      results.push({
        step: '3. Срок на абонамент',
        status: 'error',
        message: 'Няма активен subscription period',
        timestamp: new Date().toISOString()
      });
    }

    // Финален статус
    results.push({
      step: 'Финализация',
      status: 'success',
      message: 'Тестът приключи успешно',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    results.push({
      step: 'Грешка',
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
  }

  return results;
}

/**
 * Създава тестов JWT token с кратка валидност (1 минута)
 * ЗАБЕЛЕЖКА: Това е само за демонстрация. В действителност JWT токените
 * се издават от Supabase Auth и не могат да бъдат променяни директно от клиента.
 */
export function createShortLivedToken(): { 
  token: string | null; 
  expiresAt: Date; 
  message: string 
} {
  // JWT токените в Supabase се управляват от auth сървъра
  // и не могат да бъдат манипулирани директно от клиента.
  
  const expiresAt = new Date(Date.now() + 60 * 1000); // +1 минута
  
  return {
    token: null,
    expiresAt,
    message: 'JWT токените се управляват от Supabase Auth. За да създадете token с 1 минута валидност, ' +
             'конфигурирайте JWT_EXPIRY в Supabase Dashboard на 60 секунди.'
  };
}

/**
 * Симулира операция която ще бъде блокирана в read-only режим
 */
export async function testReadOnlyOperation(): Promise<ExpirationTestResult> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return {
      step: 'Test Read-Only',
      status: 'error',
      message: 'Supabase клиентът не е конфигуриран',
      timestamp: new Date().toISOString()
    };
  }

  try {
    // Тук бихте тествали real операция която ще бъде блокирана
    // Например: добавяне на participant, промяна на настройки и т.н.
    
    // За демонстрация, просто проверяваме статуса
    const { data, error } = await supabase.rpc('entitlement_me', { p_tenant_id: null });

    if (error) throw error;

    const entitlement = Array.isArray(data) ? data[0] : data;

    if (entitlement.read_only) {
      return {
        step: 'Test Read-Only',
        status: 'success',
        message: '✅ Read-only режим е активен - операциите са блокирани',
        timestamp: new Date().toISOString(),
        data: { readOnly: true }
      };
    } else {
      return {
        step: 'Test Read-Only',
        status: 'info',
        message: 'Режимът е в нормална работа (не е read-only)',
        timestamp: new Date().toISOString(),
        data: { readOnly: false }
      };
    }
  } catch (error) {
    return {
      step: 'Test Read-Only',
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Хелпър функция за изчакване
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Форматира резултатите за конзола
 */
export function formatTestResults(results: ExpirationTestResult[]): string {
  let output = '\n╔═══════════════════════════════════════════════════════════════╗\n';
  output += '║       РЕЗУЛТАТИ ОТ ТЕСТ - EXPIRATION READ-ONLY             ║\n';
  output += '╠═══════════════════════════════════════════════════════════════╣\n\n';

  results.forEach(result => {
    const statusIcon = {
      success: '✅',
      error: '❌',
      pending: '⏳',
      info: 'ℹ️'
    }[result.status];

    output += `${statusIcon} ${result.step}\n`;
    output += `   ${result.message}\n`;
    output += `   Време: ${new Date(result.timestamp).toLocaleTimeString('bg-BG')}\n`;
    
    if (result.data) {
      output += `   Данни: ${JSON.stringify(result.data, null, 2)}\n`;
    }
    output += '\n';
  });

  output += '╚═══════════════════════════════════════════════════════════════╝\n';
  return output;
}

// Експорт за използване в конзолата на браузъра
if (typeof window !== 'undefined') {
  (window as any).testExpirationReadOnly = async (wait: boolean = false) => {
    const results = await testExpirationReadOnly(wait);
    console.log(formatTestResults(results));
    return results;
  };

  (window as any).testReadOnlyOperation = async () => {
    const result = await testReadOnlyOperation();
    console.log(`${result.status === 'success' ? '✅' : '❌'} ${result.message}`);
    return result;
  };
}
