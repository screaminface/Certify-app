// ==========================================
// BROWSER CONSOLE COMMANDS - FORCE REFRESH
// ==========================================

// Отвори Browser Console (F12) в апп-а и изпълни:

// 1. Изчисти localStorage кеша
localStorage.removeItem('spi.entitlement.cache.v1');

// 2. Force reload
window.location.reload();

// ==========================================
// ИЛИ: Ръчно провери какво е закеширано
// ==========================================

// Виж текущия кеш:
JSON.parse(localStorage.getItem('spi.entitlement.cache.v1'));

// Ако readOnly е false, значи кешът е стар
// Изтрий го и reload:
localStorage.removeItem('spi.entitlement.cache.v1');
window.location.reload();
