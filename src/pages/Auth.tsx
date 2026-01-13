import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTwoStepPin } from '@/hooks/useTwoStepPin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Bot, Loader2, ArrowLeft } from 'lucide-react';
import { TwoStepVerification } from '@/components/auth/TwoStepVerification';

type AuthMode = 'login' | 'register' | 'forgot-password' | 'two-step-verify';

export const Auth = () => {
  const [searchParams] = useSearchParams();
  const initialMode = (searchParams.get('mode') as AuthMode) || 'login';
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingTwoStep, setPendingTwoStep] = useState(false);

  const { signIn, signUp, resetPassword, user, loading, signOut } = useAuth();
  const { getStatus } = useTwoStepPin();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && user && mode !== 'two-step-verify') {
      // Check if user has two-step verification enabled
      const checkTwoStepStatus = async () => {
        const status = await getStatus();
        
        if (status.enabled && pendingTwoStep) {
          // User has two-step enabled and just logged in, show PIN screen
          setMode('two-step-verify');
        } else if (!status.enabled || !pendingTwoStep) {
          // No two-step or already verified, go to dashboard
          navigate('/dashboard');
        }
      };
      
      checkTwoStepStatus();
    }
  }, [user, loading, navigate, mode, pendingTwoStep]);

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
        } else {
          // Mark that we need to check two-step after login
          setPendingTwoStep(true);
        }
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
          description: 'If the email exists, we sent you a password reset link.',
        });
        if (!error) {
          setMode('login');
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleTwoStepSuccess = () => {
    setPendingTwoStep(false);
    toast({
      title: 'Welcome back!',
      description: 'Successfully signed in.',
    });
    navigate('/dashboard');
  };

  const handleTwoStepCancel = async () => {
    // Sign out the user if they cancel two-step verification
    await signOut();
    setPendingTwoStep(false);
    setMode('login');
    toast({
      title: 'Sign in cancelled',
      description: 'You must complete two-step verification to sign in.',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show Two-Step PIN verification screen
  if (mode === 'two-step-verify') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle p-4">
        <TwoStepVerification
          onSuccess={handleTwoStepSuccess}
          onCancel={handleTwoStepCancel}
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
            {mode === 'forgot-password' && 'Enter your email to receive a password reset link'}
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
              {mode === 'forgot-password' && 'Send Reset Link'}
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