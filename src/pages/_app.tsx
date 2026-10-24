import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { ClerkProvider } from '@clerk/nextjs';

const hasClerkKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function MyApp({ Component, pageProps }: AppProps) {
  if (hasClerkKey) {
    return (
      <ClerkProvider {...pageProps}>
        <Component {...pageProps} />
      </ClerkProvider>
    );
  }
  return <Component {...pageProps} />;
}
