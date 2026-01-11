import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useMFA } from '@/hooks/useMFA';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Bot, Loader2, ArrowLeft } from 'lucide-react';
import { MFAVerification } from '@/components/auth/MFAVerification';
import { OTPVerification } from '@/components/auth/OTPVerification';

type AuthMode = 'login' | 'register' | 'forgot-password' | 'verify-otp' | 'mfa-verify';

interface MFAState {
  factorId: string;
}

const Auth = () => {
  const [searchParams] = useSearchParams();
  const initialMode = (searchParams.get('mode') as AuthMode) || 'login';
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mfaState, setMfaState] = useState<MFAState | null>(null);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');

  const { signIn, signUp, resetPassword, user, loading } = useAuth();
  const { getAuthenticatorAssuranceLevel, getMFAFactors } = useMFA();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && user && mode !== 'mfa-verify' && mode !== 'verify-otp') {
      // Check if user needs to complete MFA
      const checkMFAStatus = async () => {
        const { currentLevel, nextLevel } = await getAuthenticatorAssuranceLevel();
        
        if (currentLevel === 'aal1' && nextLevel === 'aal2') {
          // User has MFA enabled but hasn't completed it
          const factors = await getMFAFactors();
          const verifiedFactor = factors.find(f => f.status === 'verified');
          
          if (verifiedFactor) {
            setMfaState({ factorId: verifiedFactor.id });
            setMode('mfa-verify');
            return;
          }
        }
        
        navigate('/dashboard');
      };
      
      checkMFAStatus();
    }
  }, [user, loading, navigate, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password);
        if (error) {
          toast({
            variant: 'destructive',
            title: 'Sign in failed',
            description: error.message,
          });
        }
        // Navigation handled by useEffect after checking MFA
      } else if (mode === 'register') {
        const { error } = await signUp(email, password, fullName);
        if (error) {
          if (error.message.includes('already registered')) {
            toast({
              variant: 'destructive',
              title: 'Account exists',
              description: 'This email is already registered. Please sign in instead.',
            });
          } else {
            toast({
              variant: 'destructive',
              title: 'Sign up failed',
              description: error.message,
            });
          }
        } else {
          toast({
            title: 'Account created',
            description: 'Welcome! Redirecting to dashboard...',
          });
          navigate('/dashboard');
        }
      } else if (mode === 'forgot-password') {
        const { error } = await resetPassword(email);
        // Always show success message to prevent email enumeration
        toast({
          title: 'Check your email',
          description: 'If the email exists, we sent you a verification code.',
        });
        if (!error) {
          setForgotPasswordEmail(email);
          setMode('verify-otp');
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleMFASuccess = () => {
    setMfaState(null);
    navigate('/dashboard');
  };

  const handleMFACancel = async () => {
    // Sign out the user if they cancel MFA
    const { signOut } = await import('@/hooks/useAuth').then(m => ({ signOut: m.useAuth }));
    setMfaState(null);
    setMode('login');
  };

  const handleOTPSuccess = () => {
    toast({
      title: 'Success!',
      description: 'Your password has been reset. Please sign in.',
    });
    setMode('login');
    setEmail(forgotPasswordEmail);
    setForgotPasswordEmail('');
  };

  const handleOTPBack = () => {
    setMode('forgot-password');
    setEmail(forgotPasswordEmail);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show MFA verification screen
  if (mode === 'mfa-verify' && mfaState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle p-4">
        <MFAVerification
          factorId={mfaState.factorId}
          onSuccess={handleMFASuccess}
          onCancel={handleMFACancel}
        />
      </div>
    );
  }

  // Show OTP verification screen for password reset
  if (mode === 'verify-otp') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle p-4">
        <OTPVerification
          email={forgotPasswordEmail}
          onSuccess={handleOTPSuccess}
          onBack={handleOTPBack}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-subtle p-4">
      <Card className="w-full max-w-md animate-slide-up">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 rounded-xl gradient-primary flex items-center justify-center">
              <Bot className="h-7 w-7 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">
            {mode === 'login' && 'Welcome back'}
            {mode === 'register' && 'Create an account'}
            {mode === 'forgot-password' && 'Reset password'}
          </CardTitle>
          <CardDescription>
            {mode === 'login' && 'Sign in to your AI App Builder account'}
            {mode === 'register' && 'Start building AI applications today'}
            {mode === 'forgot-password' && 'Enter your email to receive a verification code'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {mode !== 'forgot-password' && (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            )}
            <Button type="submit" className="w-full gradient-primary" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'login' && 'Sign In'}
              {mode === 'register' && 'Create Account'}
              {mode === 'forgot-password' && 'Send Code'}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
            {mode === 'login' && (
              <>
                <button
                  type="button"
                  onClick={() => setMode('forgot-password')}
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  Forgot password?
                </button>
                <div className="mt-2">
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setMode('register')}
                    className="text-primary font-medium hover:underline"
                  >
                    Sign up
                  </button>
                </div>
              </>
            )}
            {mode === 'register' && (
              <div>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-primary font-medium hover:underline"
                >
                  Sign in
                </button>
              </div>
            )}
            {mode === 'forgot-password' && (
              <button
                type="button"
                onClick={() => setMode('login')}
                className="inline-flex items-center text-muted-foreground hover:text-primary transition-colors"
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back to sign in
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
