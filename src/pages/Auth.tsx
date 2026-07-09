import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

import { useAuth } from "@/hooks/use-auth";
import { ArrowRight, BookOpen, Loader2, Mail, ShieldCheck } from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { motion } from "framer-motion";
import { ADMIN_EMAIL } from "@/lib/auth";

interface AuthProps {
  redirectAfterAuth?: string;
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirectPath = useMemo(
    () => redirectAfterAuth ?? params.get("next") ?? "/library",
    [redirectAfterAuth, params],
  );

  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirectPath, { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate, redirectPath]);

  const handleEmailSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({ email: formData.get("email") as string });
      setIsLoading(false);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to send verification code. Please try again.",
      );
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      navigate(redirectPath);
    } catch (error) {
      setError("The verification code you entered is incorrect.");
      setIsLoading(false);
      setOtp("");
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Editorial left panel */}
      <aside className="hidden lg:flex w-1/2 border-r border-border p-12 flex-col justify-between">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 grid place-items-center border border-foreground/40 relative">
              <div className="absolute inset-1.5 border border-foreground/15" />
              <BookOpen className="w-4 h-4" strokeWidth={1.4} />
            </div>
            <div>
              <div className="font-display text-base">Atelier</div>
              <div className="studio-caps text-muted-foreground">Translation Studio</div>
            </div>
          </div>
          <div className="mt-16 max-w-[28ch]">
            <div className="studio-caps text-muted-foreground">Plate I</div>
            <h1 className="font-display text-5xl mt-3 tracking-tight leading-tight">
              A quiet entrance to the studio.
            </h1>
            <p className="text-foreground/80 mt-4 leading-relaxed">
              Sign in with the email assigned to you. The English translation
              desk and the curator's gallery will open automatically based on
              your role.
            </p>
          </div>
        </motion.div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <div
              key={i}
              className="aspect-[3/4] border border-border bg-muted"
            />
          ))}
        </div>
      </aside>

      {/* Form */}
      <main className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-[440px]"
        >
          <div className="studio-caps text-muted-foreground">Gate</div>
          <h2 className="font-display text-3xl mt-2 tracking-tight">
            {step === "signIn" ? "Sign in" : "Verify your email"}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            {step === "signIn"
              ? "Enter your email. A six-digit code will be sent to your inbox."
              : `A code was sent to ${(step as { email: string }).email}.`}
          </p>

          {step === "signIn" ? (
            <form onSubmit={handleEmailSubmit} className="mt-8 space-y-4">
              <div className="border border-border focus-within:border-foreground transition-colors px-3 h-12 flex items-center gap-3">
                <Mail className="w-4 h-4 text-muted-foreground" strokeWidth={1.4} />
                <input
                  name="email"
                  type="email"
                  required
                  placeholder={ADMIN_EMAIL}
                  className="bg-transparent outline-none flex-1 text-sm placeholder:text-muted-foreground/60"
                />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 bg-foreground text-background hover:bg-foreground/90"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.4} />
                ) : (
                  <ArrowRight className="w-4 h-4" strokeWidth={1.4} />
                )}
                <span className="text-xs uppercase tracking-[0.18em] ml-2">
                  {isLoading ? "Sending" : "Continue"}
                </span>
              </Button>
              <div className="mt-6 border border-border bg-card p-4 text-xs text-muted-foreground flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-foreground mt-0.5" strokeWidth={1.4} />
                <p>
                  The studio is curated. The administrator's email
                  ({ADMIN_EMAIL}) is the only address allowed to import and
                  arrange books. Other addresses can read translations but
                  cannot curate the shelf.
                </p>
              </div>
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit} className="mt-8 space-y-6">
              <input type="hidden" name="email" value={(step as { email: string }).email} />
              <input type="hidden" name="code" value={otp} />
              <div className="flex justify-center">
                <InputOTP
                  value={otp}
                  onChange={setOtp}
                  maxLength={6}
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && otp.length === 6 && !isLoading) {
                      const form = (e.target as HTMLElement).closest("form");
                      if (form) form.requestSubmit();
                    }
                  }}
                >
                  <InputOTPGroup>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              {error && <p className="text-xs text-destructive text-center">{error}</p>}
              <Button
                type="submit"
                disabled={isLoading || otp.length !== 6}
                className="w-full h-11 bg-foreground text-background hover:bg-foreground/90"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" strokeWidth={1.4} />
                    <span className="text-xs uppercase tracking-[0.18em]">Verifying…</span>
                  </>
                ) : (
                  <>
                    <span className="text-xs uppercase tracking-[0.18em]">Verify code</span>
                    <ArrowRight className="w-4 h-4 ml-2" strokeWidth={1.4} />
                  </>
                )}
              </Button>
              <button
                type="button"
                onClick={() => setStep("signIn")}
                className="block mx-auto text-xs text-muted-foreground hover:text-foreground"
              >
                Use a different email
              </button>
            </form>
          )}
        </motion.div>
      </main>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense fallback={null}>
      <Auth {...props} />
    </Suspense>
  );
}

// satisfied-unused
void Input;
