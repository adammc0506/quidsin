/** True if text looks like it contains a bank account, sort code + account, IBAN or card number. */
export function looksLikeAccountDetails(text: string): boolean {
  const compact = text.replace(/[\s-]/g, "");
  if (/\d{8,}/.test(compact)) return true;
  return /[A-Za-z]{2}\d{2}[A-Za-z0-9]{11,30}/.test(compact) && /\d{6,}/.test(compact.replace(/[A-Za-z]/g, ""));
}
