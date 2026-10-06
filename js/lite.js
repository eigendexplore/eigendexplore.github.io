// Slow connections and small devices: nothing is fetched or built ahead in the background (each section still starts as
// the reader comes near it, and every view still opens on demand). Fast machines warm everything in quiet moments.
const nc = navigator.connection;
export const LITE = !!(nc && (nc.saveData || /(^|-)(2g|3g)$/.test(nc.effectiveType || ''))) || (navigator.deviceMemory > 0 && navigator.deviceMemory <= 2);
