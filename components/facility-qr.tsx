'use client';

import { QRCodeSVG } from 'qrcode.react';

export default function FacilityQr({
  value,
  size = 104,
  label,
}: {
  value: string;
  size?: number;
  label?: string;
}) {
  return (
    <div className="facility-qr">
      <QRCodeSVG
        value={value}
        size={size}
        level="M"
        marginSize={1}
        title={label ?? value}
      />
      <small>{label ?? value}</small>
    </div>
  );
}
