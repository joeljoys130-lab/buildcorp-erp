import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import LoginView from '@/components/login-view';

const CLERK_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  'pk_test_c2hhcnAtcGlnbGV0LTg0ODEuY2xlcmsuYWNjb3VudHMuZGV2JA';
const hasClerkKey = Boolean(CLERK_PUBLISHABLE_KEY);

function ClerkAuthSync() {
  const { isSignedIn, isLoaded } = useUser();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      window.location.href = '/';
    }
  }, [isLoaded, isSignedIn]);

  return null;
}

export default function LoginPage() {
  const handleSuccess = (_user: any) => {
    // Perform a clean location navigation to / so auth session & server state refresh cleanly
    window.location.href = '/';
  };

  return (
    <>
      {hasClerkKey && <ClerkAuthSync />}
      <LoginView onLoginSuccess={handleSuccess} />
    </>
  );
}
