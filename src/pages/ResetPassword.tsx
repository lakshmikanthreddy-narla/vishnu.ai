import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Bot, Loader2, Eye, EyeOff, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type PageState = 'loading' | 'ready' | 'success' | 'error';

interface PasswordRule {
  label: string;
  check: (password: string) => boolean;
}

const passwordRules: PasswordRule[] = [
  { label: 'At least 8 characters', check: (p) => p.length >= 8 },
  { label: 'Contains uppercase letter', check: (p) => /[A-Z]/.test(p) },
  { label: 'Contains lowercase letter', check: (p) => /[a-z]/.test(p) },
  { label: 'Contains a number', check: (p) => /\d/.test(p) },
];

const ResetPassword = () => {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const checkRecoverySession = async () => {
      // Check for recovery session from URL hash (Supabase adds tokens there)
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const type = hashParams.get('type');

      if (type === 'recovery' && accessToken) {
        // Set the session from recovery tokens
        const refreshToken = hashParams.get('refresh_token');
        if (refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            setErrorMessage('Your password reset link has expired or is invalid. Please request a new one.');
            setPageState('error');
            return;
          }
        }
        setPageState('ready');
        return;
      }

      // Check for existing recovery session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        // Check if this is a recovery session by looking at the auth event
        setPageState('ready');
      } else {
        setErrorMessage('No valid password reset session found. Please request a new password reset link.');
        setPageState('error');
      }
    };

    // Listen for PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPageState('ready');
      }
    });

    checkRecoverySession();

    return () => subscription.unsubscribe();
  }, []);

  const getPasswordStrength = () => {
    const passedRules = passwordRules.filter(rule => rule.check(newPassword)).length;
    if (passedRules === 0) return { label: '', color: '' };
    if (passedRules <= 2) return { label: 'Weak', color: 'text-destructive' };
    if (passedRules === 3) return { label: 'Medium', color: 'text-yellow-500' };
    return { label: 'Strong', color: 'text-green-500' };
  };

  const allRulesPassed = passwordRules.every(rule => rule.check(newPassword));
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const canSubmit = allRulesPassed && passwordsMatch && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!canSubmit) return;

    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        // Map Supabase errors to user-friendly messages
        let friendlyMessage = 'Unable to update password. Please try again.';
        
        if (error.message.includes('same as')) {
          friendlyMessage = 'Your new password must be different from your current password.';
        } else if (error.message.includes('weak')) {
          friendlyMessage = 'Please choose a stronger password.';
        } else if (error.message.includes('session')) {
          friendlyMessage = 'Your session has expired. Please request a new password reset link.';
        }

        toast({
          variant: 'destructive',
          title: 'Password update failed',
          description: friendlyMessage,
        });
        return;
      }

      // Sign out to clear recovery session
      await supabase.auth.signOut();
      
      setPageState('success');
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/auth');
      }, 3000);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Something went wrong',
        description: 'Please try again later.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const strength = getPasswordStrength();

  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (pageState === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle p-4">
        <Card className="w-full max-w-md animate-slide-up">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="h-12 w-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-green-500" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Password Updated!</CardTitle>
            <CardDescription>
              Your password has been successfully reset. Redirecting you to sign in...
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => navigate('/auth')} className="gradient-primary">
              Go to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (pageState === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle p-4">
        <Card className="w-full max-w-md animate-slide-up">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-7 w-7 text-destructive" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Link Invalid</CardTitle>
            <CardDescription>{errorMessage}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => navigate('/auth?mode=forgot-password')} className="gradient-primary">
              Request New Link
            </Button>
          </CardContent>
        </Card>
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
          <CardTitle className="text-2xl font-bold">Reset Your Password</CardTitle>
          <CardDescription>
            Create a new secure password for your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {newPassword && (
                <p className={cn("text-sm font-medium", strength.color)}>
                  Password strength: {strength.label}
                </p>
              )}
            </div>

            {/* Password Rules */}
            <div className="space-y-2 p-3 rounded-lg bg-muted/50">
              <p className="text-sm font-medium text-muted-foreground">Password must have:</p>
              <ul className="space-y-1">
                {passwordRules.map((rule, index) => {
                  const passed = rule.check(newPassword);
                  return (
                    <li key={index} className="flex items-center gap-2 text-sm">
                      {passed ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className={passed ? 'text-foreground' : 'text-muted-foreground'}>
                        {rule.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              {confirmPassword && !passwordsMatch && (
                <Alert variant="destructive" className="py-2">
                  <AlertDescription className="text-sm">
                    Passwords do not match
                  </AlertDescription>
                </Alert>
              )}
              {passwordsMatch && (
                <p className="text-sm text-green-500 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" /> Passwords match
                </p>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full gradient-primary" 
              disabled={!canSubmit}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
