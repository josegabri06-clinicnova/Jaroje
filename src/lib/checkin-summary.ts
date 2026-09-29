export const RECEPTION_WA_GROUP_URL = 'https://chat.whatsapp.com/BiuXSGpiTVL92fjPEsHbma?mode=gi_t';

export interface CheckInSummaryParams {
  guestName: string;
  rooms: string;
  phone: string;
  adults: number;
  children: number;
  checkIn: string;
  checkOut: string;
  nights: number;
  dailyRate?: number;
  totalStay: number;
  channel?: string;
  paymentDetails: {
    method: string; // 'efectivo' | 'tarjeta' | 'transferencia' | 'mixto' | 'prepagado'
    amountPaid: number;
    accountOrEnvelope: string;
    method2?: string;
    amountPaid2?: number;
    accountOrEnvelope2?: string;
  };
  notes?: string;
  dniUrl?: string | null;
  voucherUrl?: string | null;
  operatorName: string;
}

export function buildCheckInSummaryMessage(p: CheckInSummaryParams): string {
  const isOta = p.channel && ['airbnb', 'booking', 'expedia', 'vrbo'].some(c => p.channel?.toLowerCase().includes(c));

  const fmtDate = (dStr: string) => {
    try {
      const parts = dStr.split('T')[0].split(' ')[0].split('-');
      if (parts.length < 3) return dStr;
      const [, m, d] = parts;
      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      return `${d} ${months[parseInt(m, 10) - 1]}`;
    } catch {
      return dStr;
    }
  };

  const datesText = p.checkIn && p.checkOut 
    ? `${p.nights} ${p.nights === 1 ? 'noche' : 'noches'} (${fmtDate(p.checkIn)} - ${fmtDate(p.checkOut)})`
    : `${p.nights} noches`;

  const guestsText = `${p.adults} ${p.adults === 1 ? 'adulto' : 'adultos'}${p.children > 0 ? `, ${p.children} ${p.children === 1 ? 'niño' : 'niños'}` : ''}`;

  let paymentText = '';
  if (isOta && p.paymentDetails.amountPaid === 0) {
    paymentText = `Prepagado vía ${p.channel}`;
  } else if (p.paymentDetails.method === 'mixto' || (p.paymentDetails.amountPaid2 && p.paymentDetails.amountPaid2 > 0)) {
    const m1 = (p.paymentDetails.method || 'Efectivo').toUpperCase();
    const a1 = p.paymentDetails.accountOrEnvelope || 'N/A';
    const m2 = (p.paymentDetails.method2 || 'Tarjeta').toUpperCase();
    const a2 = p.paymentDetails.accountOrEnvelope2 || 'N/A';
    paymentText = `Mixto: $${p.paymentDetails.amountPaid.toLocaleString('es-MX')} (${m1} - ${a1}) + $${p.paymentDetails.amountPaid2?.toLocaleString('es-MX')} (${m2} - ${a2})`;
  } else if (p.paymentDetails.amountPaid > 0) {
    const methUpper = (p.paymentDetails.method || 'Efectivo').toUpperCase();
    const accStr = p.paymentDetails.accountOrEnvelope ? ` (${p.paymentDetails.accountOrEnvelope})` : '';
    paymentText = `$${p.paymentDetails.amountPaid.toLocaleString('es-MX')} MXN vía ${methUpper}${accStr}`;
  } else {
    paymentText = `Sin cobro adicional / Prepagado`;
  }

  let text = `🏨 *CHECK-IN COMPLETADO*\n` +
             `✨ *Condominios Jaroje*\n\n` +
             `👤 *Nombre de huésped:* ${p.guestName || 'Huésped'}\n` +
             `🚪 *Habitación(es):* ${p.rooms}\n` +
             `📱 *Teléfono:* ${p.phone || 'No registrado'}\n` +
             `👥 *# Personas:* ${guestsText}\n` +
             (p.dailyRate && p.dailyRate > 0 ? `💵 *Tarifa:* $${Math.round(p.dailyRate).toLocaleString('es-MX')} MXN / noche\n` : '') +
             `📅 *# Noches:* ${datesText}\n` +
             `💰 *Total Estancia:* $${Math.round(p.totalStay).toLocaleString('es-MX')} MXN\n` +
             `💳 *Cuenta / Cobro:* ${paymentText}\n`;

  // Observaciones
  const obsList: string[] = [];
  if (p.paymentDetails.method === 'efectivo' && p.paymentDetails.accountOrEnvelope) {
    obsList.push(`Sobre: ${p.paymentDetails.accountOrEnvelope}`);
  }
  if (p.paymentDetails.method2 === 'efectivo' && p.paymentDetails.accountOrEnvelope2) {
    obsList.push(`Sobre (Pago 2): ${p.paymentDetails.accountOrEnvelope2}`);
  }
  if (p.notes && p.notes.trim()) {
    obsList.push(p.notes.trim());
  }
  if (p.voucherUrl) {
    obsList.push(`🔗 Foto Voucher TPV / Comprobante: ${p.voucherUrl}`);
  }
  if (p.dniUrl) {
    obsList.push(`🔗 Foto Identificación DNI: ${p.dniUrl}`);
  }

  if (obsList.length > 0) {
    text += `📝 *Observaciones:*\n${obsList.map(o => `  • ${o}`).join('\n')}\n`;
  }

  text += `\n👨‍💼 *Atendido por:* ${p.operatorName || 'Recepción'}\n` +
          `_Registrado en Jaroje OS · ${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}_`;

  return text;
}
