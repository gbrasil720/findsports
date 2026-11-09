export function formatPhone(digits: string, countryCode: string): string {
  if (countryCode === 'BR') {
    if (digits.length === 0) return ''
    if (digits.length <= 2) return `(${digits}`
    if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
    if (digits.length <= 10)
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
  }
  return digits
}

export function formatStoredPhone(phone: string): string {
  if (phone.startsWith('+55')) return formatPhone(phone.slice(3), 'BR')
  if (phone.startsWith('+')) return phone
  const digits = phone.replace(/\D/g, '')
  if (digits.length > 0) return formatPhone(digits, 'BR')
  return phone
}
