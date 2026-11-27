import './globals.css';
import logo from './assets/hubblefly-official-logo.png';

export const metadata = {
  title: 'HFT-OS | Hubblefly Technologies Limited',
  icons: { icon: logo.src },
  description: 'QR-first inventory and shopfloor web application'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
