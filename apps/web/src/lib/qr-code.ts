import QRCodeModule from 'react-qr-code'

/*
 * O `react-qr-code` chega como `{ default }` no `vite dev` e como componente no
 * build: desembrulha uma vez para todo mundo.
 */
const qrCodeModule = QRCodeModule as unknown
export const QRCode =
  typeof qrCodeModule === 'object' &&
  qrCodeModule !== null &&
  'default' in qrCodeModule
    ? (qrCodeModule.default as typeof QRCodeModule)
    : QRCodeModule
