/**
 * Fórmulas de precio al huésped que muestra la pantalla Precios (solo para mostrar: no se guardan ni se envían a Beds24).
 * Cada fórmula se define UNA sola vez aquí: el resultado y el texto que lo describe salen de los mismos números,
 * así que no pueden decir cosas distintas.
 */

export const DIRECT_TAX = 1.19;
export const AIRBNB_MUL = 1.201;
export const AIRBNB_TAX = 1.21;
export const BOOKING_MUL = 1.4433;
export const BOOKING_TAX = 1.19;
export const GOOGLE_MUL = 1.5148;
export const EXPEDIA_MUL = 1.7175;
export const PROMO_PCT = 10; // promoción de Booking y Expedia
const PROMO_FACTOR = (100 - PROMO_PCT) / 100;

export const priceDirectoOf = (raw: number) => Math.round(raw * DIRECT_TAX);
export const priceAirbnbOf = (raw: number) => Math.round(raw * AIRBNB_MUL * AIRBNB_TAX);
export const priceBookingOf = (raw: number) => Math.round(raw * BOOKING_MUL * BOOKING_TAX * PROMO_FACTOR);
export const priceGoogleOf = (raw: number) => Math.round(raw * GOOGLE_MUL);
export const priceExpediaOf = (raw: number) => Math.round(raw * EXPEDIA_MUL * PROMO_FACTOR);

// Número tal cual se escribe en la fórmula: al menos 2 decimales (1.2 → "1.20"), sin ceros de más (1.4433 → "1.4433")
const fmt = (n: number) => {
  const s = String(Number(n.toFixed(7)));
  return (s.split('.')[1] || '').length < 2 ? n.toFixed(2) : s;
};

export const formulaDirecto = () => `* ${fmt(DIRECT_TAX)} TAX`;
export const formulaAirbnb = () => `* ${fmt(AIRBNB_MUL)} MUL * ${fmt(AIRBNB_TAX)} TAX`;
export const formulaBooking = () => `* ${fmt(BOOKING_MUL)} MUL * ${fmt(BOOKING_TAX)} TAX - ${PROMO_PCT}% Promoción`;
export const formulaGoogle = () => `* ${fmt(GOOGLE_MUL)} MUL`;
export const formulaExpedia = () => `* ${fmt(EXPEDIA_MUL)} MUL - ${PROMO_PCT}% Promoción`;

/** "* 1.19 TAX" → "Base × 1.19 TAX" (versión para el recuadro de fórmulas) */
export const asBaseFormula = (formula: string) => `Base ${formula.replace(/\*/g, '×')}`;
