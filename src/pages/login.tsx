import LoginView from '@/components/login-view';

export default function LoginPage() {
  const handleSuccess = (_user: any) => {
    // Perform a clean location navigation to / so auth_token cookie & server state refresh cleanly
    window.location.href = '/';
  };

  return <LoginView onLoginSuccess={handleSuccess} />;
}
