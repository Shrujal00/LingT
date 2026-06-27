import type {Metadata} from 'next';
import {Fraunces, Inter, Roboto_Mono} from 'next/font/google';
import {getRuntimeFirebaseConfig} from '@/lib/firebase/runtime-config';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
});

const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  variable: '--font-roboto-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'LingT',
  description: 'A chat-first AI productivity companion powered by Ling and her agentic team.',
};

export const dynamic = 'force-dynamic';

function serializeForScript(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export default function RootLayout({children}: {children: React.ReactNode}) {
  const firebaseConfig = getRuntimeFirebaseConfig();

  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${robotoMono.variable} h-full antialiased`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__LINGT_FIREBASE_CONFIG__=${serializeForScript(firebaseConfig)};`,
          }}
        />
      </head>
      <body className="h-full bg-background text-foreground font-sans selection:bg-brand-soft selection:text-brand-deep" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
