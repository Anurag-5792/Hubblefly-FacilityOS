import './globals.css';

export const metadata = {
  title: 'Hubblefly FacilityOS',
  description: 'QR-first inventory and shopfloor web application'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
