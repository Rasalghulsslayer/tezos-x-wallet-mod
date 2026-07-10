import ReactQrCode from 'react-qr-code';

/**
 * A real, scannable QR encoder (react-qr-code → qrcode-generator). Rendered on
 * a white padded background because scanners need dark-on-light contrast and a
 * quiet zone — the surrounding page is dark. The value is the deposit address,
 * so a wrong render would misdirect funds: this must be a genuine encoder, not
 * a decorative pattern.
 */
export function QrCode({ value = '' }: { value?: string }) {
  return (
    <div className="tx-qr">
      {value !== '' && (
        <ReactQrCode
          value={value}
          size={168}
          level="M"
          bgColor="#FFFFFF"
          fgColor="#0B0B12"
          style={{ height: 'auto', maxWidth: '100%', width: '168px' }}
        />
      )}
    </div>
  );
}
