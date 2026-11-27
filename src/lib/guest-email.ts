/** Correo de contacto del huésped: validación (igual en pantalla y servidor) y enlace para escribirle desde Gmail. */

export function isValidGuestEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@<>,;"'()]+@[^\s@<>,;"'()]+\.[^\s@<>,;"'()]{2,}$/.test(email);
}

/** Abre en Gmail un correo nuevo dirigido al huésped */
export const gmailComposeUrl = (email: string) => `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`;
