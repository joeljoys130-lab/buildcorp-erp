/* src/components/login-view.tsx */
import { useState, useEffect, useRef } from "react";
import { Mail, Lock, ArrowRight, ShieldCheck, RefreshCw, KeyRound, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/router";

interface LoginViewProps {
  onLoginSuccess: (user: any) => void;
}

type AuthStep = "login" | "otp" | "forgot-email" | "forgot-otp" | "forgot-reset";

export default function LoginView({ onLoginSuccess }: LoginViewProps) {
  const router = useRouter();
  const otpInputRef = useRef<HTMLInputElement>(null);
  const forgotOtpRef = useRef<HTMLInputElement>(null);

  /* ── state ─────────────────────────────────────────────────────── */
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [step, setStep] = useState<AuthStep>("login");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [timer, setTimer] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  /* ── timer effect ──────────────────────────────────────────────── */
  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => {
      setTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timer]);

  /* ── auto-focus effect ─────────────────────────────────────────── */
  useEffect(() => {
    if (step === "otp") {
      setTimeout(() => otpInputRef.current?.focus(), 100);
    } else if (step === "forgot-otp") {
      setTimeout(() => forgotOtpRef.current?.focus(), 100);
    }
  }, [step]);

  /* ── masking helper ───────────────────────────────────────────── */
  function maskEmail(emailStr: string): string {
    if (!emailStr) return '';
    const [name, domain] = emailStr.split('@');
    if (!name || !domain) return emailStr;
    if (name.length <= 2) return `${name}***@${domain}`;
    return `${name.substring(0, 2)}***@${domain}`;
  }

  /* ── Login handlers ────────────────────────────────────────────────────── */
  async function doLogin(u: string, p: string) {
    setLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: u, password: p }),
      });
      const loginData = await loginRes.json();

      if (!loginData.success) {
        setError(loginData.error ?? "Invalid email or password.");
        setLoading(false);
        return;
      }

      setEmail(loginData.email || loginData.user?.email || u);
      setStep("otp");
      setTimer(30);
    } catch {
      setError("Login failed. Please check your network connection.");
    } finally {
      setLoading(false);
    }
  }

  async function resendLoginOtp() {
    if (timer > 0 || !email) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error ?? "Failed to resend OTP.");
        setLoading(false);
        return;
      }
      setTimer(30);
    } catch {
      setError("Failed to resend OTP.");
    } finally {
      setLoading(false);
    }
  }

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doLogin(username, password);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) {
      setError("Please enter the 6-digit verification code.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, otp: otp.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        if (onLoginSuccess) {
          onLoginSuccess(data.user);
        } else {
          window.location.href = '/';
        }
      } else {
        setError(data.error ?? "Invalid OTP code.");
        setLoading(false);
      }
    } catch {
      setError("Verification failed. Please try again.");
      setLoading(false);
    }
  };

  /* ── Forgot Password handlers ────────────────────────────────────────── */
  const handleForgotRequestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter your registered email.");
      return;
    }
    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request-otp", email: email.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setStep("forgot-otp");
        setTimer(30);
      } else {
        setError(data.error ?? "Unable to send verification code.");
      }
    } catch {
      setError("Failed to request reset code.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyForgotOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotOtp.trim() || forgotOtp.trim().length < 6) {
      setError("Please enter the 6-digit verification code.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify-otp", email: email.trim(), otp: forgotOtp.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setStep("forgot-reset");
      } else {
        setError(data.error ?? "Invalid verification code.");
      }
    } catch {
      setError("Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reset-password",
          email: email.trim(),
          otp: forgotOtp.trim(),
          newPassword,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg("Password reset successfully. Please sign in with your new password.");
        setStep("login");
        setPassword("");
        setForgotOtp("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setError(data.error ?? "Failed to reset password.");
      }
    } catch {
      setError("Password reset failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white font-sans text-neutral-900">
      {/* LEFT NARROW BLACK BRANDING PANEL */}
      <div className="hidden md:flex w-[320px] lg:w-[360px] bg-black text-white p-8 lg:p-10 flex-col justify-between shrink-0 select-none">
        <div>
          <div className="flex items-center gap-3 mb-16">
            <div className="w-8 h-8 rounded border border-neutral-700 bg-black flex items-center justify-center font-bold text-white text-sm">
              B
            </div>
            <span className="font-bold text-sm tracking-wider uppercase text-white">
              BUILDCORP ERP
            </span>
          </div>

          <div className="space-y-4">
            <span className="text-[11px] font-mono tracking-widest text-neutral-400 uppercase font-medium">
              BUILD CORP ERP
            </span>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-white leading-tight">
              Enterprise Construction Management
            </h1>
            <p className="text-neutral-400 text-xs lg:text-sm leading-relaxed">
              Streamline contracts, stock levels, daily site materials, BOQ estimates, and financial operations from a single unified platform.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-mono tracking-wider">
          <ShieldCheck className="w-3.5 h-3.5 text-neutral-300" />
          Secured with Email OTP Authentication
        </div>
      </div>

      {/* RIGHT MAIN WHITE AUTHENTICATION AREA */}
      <div className="flex-1 bg-white flex flex-col justify-center items-center p-6 sm:p-12 relative">
        <div className="md:hidden flex items-center gap-3 mb-8">
          <div className="w-8 h-8 rounded border border-neutral-700 bg-black flex items-center justify-center font-bold text-white text-sm">
            B
          </div>
          <span className="font-bold text-sm tracking-wider uppercase text-neutral-900">
            BUILDCORP ERP
          </span>
        </div>

        {/* CENTERED LIGHT AUTHENTICATION CARD */}
        <div className="w-full max-w-md bg-white border border-neutral-200/90 rounded-2xl p-8 shadow-sm space-y-6">
          {/* Card Step Header */}
          <div>
            <span className="text-[11px] font-mono tracking-widest text-neutral-400 uppercase font-semibold">
              {step === "login" && "AUTHENTICATION"}
              {step === "otp" && "EMAIL VERIFICATION"}
              {(step === "forgot-email" || step === "forgot-otp" || step === "forgot-reset") && "FORGOT PASSWORD"}
            </span>
            <h2 className="text-2xl font-bold tracking-tight text-neutral-900 mt-1">
              {step === "login" && "Sign in to your account"}
              {step === "otp" && "Enter Verification Code"}
              {step === "forgot-email" && "Reset your password"}
              {step === "forgot-otp" && "Verify your code"}
              {step === "forgot-reset" && "Create new password"}
            </h2>
            <p className="text-sm text-neutral-500 mt-1">
              {step === "login" && "Enter your credentials to receive an Email OTP."}
              {step === "otp" && `We sent a 6-digit code to ${email ? maskEmail(email) : "your email"}.`}
              {step === "forgot-email" && "Enter your registered email address to receive a verification code."}
              {step === "forgot-otp" && "Enter the 6-digit code sent to your email."}
              {step === "forgot-reset" && "Set a new password for your account."}
            </p>
          </div>

          {/* Success Alert Banner */}
          {successMsg && (
            <div className="p-3.5 rounded-xl bg-neutral-100 border border-neutral-300 text-neutral-900 text-sm flex items-start gap-3 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-black shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Error Alert Banner */}
          {error && (
            <div className="p-3.5 rounded-xl bg-neutral-100 border border-neutral-300 text-neutral-800 text-sm flex items-center gap-3 animate-in fade-in">
              <div className="w-2 h-2 rounded-full bg-neutral-800 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* ── 1. LOGIN FORM ────────────────────────────────────────────── */}
          {step === "login" && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-medium text-neutral-700 uppercase tracking-wider mb-1.5">
                  USERNAME OR EMAIL
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter email or username"
                    className="w-full bg-neutral-50 border border-neutral-300 rounded-xl px-10 py-2.5 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:bg-white focus:border-black focus:ring-1 focus:ring-black transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-medium text-neutral-700 uppercase tracking-wider">
                    PASSWORD
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("forgot-email");
                      setError("");
                      setSuccessMsg("");
                      if (username.includes("@")) setEmail(username);
                    }}
                    className="text-xs text-neutral-600 hover:text-black transition-colors cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-neutral-50 border border-neutral-300 rounded-xl px-10 py-2.5 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:bg-white focus:border-black focus:ring-1 focus:ring-black transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-black hover:bg-neutral-800 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer border border-black mt-2"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <>
                    <span>Continue to Verification</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ── 2. LOGIN EMAIL OTP FORM ───────────────────────────────────── */}
          {step === "otp" && (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div>
                <label className="block text-[11px] font-medium text-neutral-700 uppercase tracking-wider mb-1.5">
                  ONE-TIME PASSWORD (OTP)
                </label>
                <input
                  ref={otpInputRef}
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="0 0 0 0 0 0"
                  className="w-full bg-neutral-50 border border-neutral-300 rounded-xl px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] text-neutral-900 placeholder-neutral-300 focus:outline-none focus:bg-white focus:border-black focus:ring-1 focus:ring-black transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading || otp.length < 6}
                className="w-full bg-black hover:bg-neutral-800 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer border border-black"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <>
                    <span>Verify & Access Dashboard</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-xs text-neutral-600 border-t border-neutral-100 pt-4">
                <button
                  type="button"
                  onClick={() => setStep("login")}
                  className="hover:text-black transition-colors cursor-pointer"
                >
                  ← Back to Sign In
                </button>
                <button
                  type="button"
                  disabled={timer > 0 || loading}
                  onClick={resendLoginOtp}
                  className="hover:underline disabled:opacity-50 text-neutral-900 font-medium transition-colors cursor-pointer"
                >
                  {timer > 0 ? `Resend OTP in ${timer}s` : "Resend Code"}
                </button>
              </div>
            </form>
          )}

          {/* ── 3. FORGOT PASSWORD: STEP 1 (EMAIL) ───────────────────────── */}
          {step === "forgot-email" && (
            <form onSubmit={handleForgotRequestEmail} className="space-y-4">
              <div>
                <label className="block text-[11px] font-medium text-neutral-700 uppercase tracking-wider mb-1.5">
                  REGISTERED EMAIL
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full bg-neutral-50 border border-neutral-300 rounded-xl px-10 py-2.5 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:bg-white focus:border-black focus:ring-1 focus:ring-black transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-black hover:bg-neutral-800 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer border border-black"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <>
                    <span>Send Verification Code</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="text-center border-t border-neutral-100 pt-4">
                <button
                  type="button"
                  onClick={() => { setStep("login"); setError(""); }}
                  className="text-xs text-neutral-600 hover:text-black transition-colors cursor-pointer"
                >
                  ← Back to Sign In
                </button>
              </div>
            </form>
          )}

          {/* ── 4. FORGOT PASSWORD: STEP 2 (OTP) ─────────────────────────── */}
          {step === "forgot-otp" && (
            <form onSubmit={handleVerifyForgotOtp} className="space-y-5">
              <div>
                <label className="block text-[11px] font-medium text-neutral-700 uppercase tracking-wider mb-1.5">
                  VERIFICATION CODE
                </label>
                <input
                  ref={forgotOtpRef}
                  type="text"
                  maxLength={6}
                  value={forgotOtp}
                  onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="0 0 0 0 0 0"
                  className="w-full bg-neutral-50 border border-neutral-300 rounded-xl px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] text-neutral-900 placeholder-neutral-300 focus:outline-none focus:bg-white focus:border-black focus:ring-1 focus:ring-black transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading || forgotOtp.length < 6}
                className="w-full bg-black hover:bg-neutral-800 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer border border-black"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <>
                    <span>Verify Code</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-xs text-neutral-600 border-t border-neutral-100 pt-4">
                <button
                  type="button"
                  onClick={() => { setStep("login"); setError(""); }}
                  className="hover:text-black transition-colors cursor-pointer"
                >
                  ← Back to Sign In
                </button>
                <button
                  type="button"
                  disabled={timer > 0 || loading}
                  onClick={handleForgotRequestEmail}
                  className="hover:underline disabled:opacity-50 text-neutral-900 font-medium transition-colors cursor-pointer"
                >
                  {timer > 0 ? `Resend Code in ${timer}s` : "Resend Code"}
                </button>
              </div>
            </form>
          )}

          {/* ── 5. FORGOT PASSWORD: STEP 3 (NEW PASSWORD) ────────────────── */}
          {step === "forgot-reset" && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-[11px] font-medium text-neutral-700 uppercase tracking-wider mb-1.5">
                  NEW PASSWORD
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full bg-neutral-50 border border-neutral-300 rounded-xl px-10 py-2.5 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:bg-white focus:border-black focus:ring-1 focus:ring-black transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-700 uppercase tracking-wider mb-1.5">
                  CONFIRM NEW PASSWORD
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full bg-neutral-50 border border-neutral-300 rounded-xl px-10 py-2.5 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:bg-white focus:border-black focus:ring-1 focus:ring-black transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !newPassword || newPassword !== confirmPassword}
                className="w-full bg-black hover:bg-neutral-800 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer border border-black mt-2"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <>
                    <span>Reset Password</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Outer Footer Below Form */}
        <div className="text-center text-xs text-neutral-400 font-mono mt-8">
          BuildCorp ERP · Construction Management Platform
        </div>
      </div>
    </div>
  );
}
