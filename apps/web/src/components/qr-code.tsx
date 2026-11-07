import QRCodeModule from 'react-qr-code'

/**
 * `react-qr-code` é CommonJS: no SSR do Vite o import padrão chega como o
 * módulo inteiro, com o componente em `default`.
 */
const qrCodeModule = QRCodeModule as unknown
export const QRCode =
  typeof qrCodeModule === 'object' &&
  qrCodeModule !== null &&
  'default' in qrCodeModule
    ? (qrCodeModule.default as typeof QRCodeModule)
    : QRCodeModule
