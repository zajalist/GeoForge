import './globals.css';

export const metadata = {
  title: 'Wilson Cycles - Interactive Plate Tectonics Visualization',
  description: 'Interactive Wilson Cycle plate tectonics visualization using custom physics',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head></head>
      <body>
        {children}
      </body>
    </html>
  );
}
