import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  verifyOtp: (email: string, token: string) => Promise<{ error: Error | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    console.log('[Auth] signUp attempt:', { email, redirectUrl });
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName || '' }
      }
    });
    
    console.log('[Auth] signUp response:', { 
      userId: data?.user?.id, 
      session: !!data?.session,
      error: error?.message 
    });
    
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    console.log('[Auth] signIn attempt:', { email });
    
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    console.log('[Auth] signIn response:', { 
      userId: data?.user?.id, 
      session: !!data?.session,
      error: error?.message,
      errorStatus: error?.status
    });
    
    // If login succeeded, verify session
    if (!error && data?.session) {
      const { data: sessionData } = await supabase.auth.getSession();
      console.log('[Auth] session verification:', { 
        hasSession: !!sessionData?.session,
        accessToken: sessionData?.session?.access_token?.substring(0, 20) + '...'
      });
    }
    
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const resetPassword = async (email: string) => {
    console.log('[Auth] resetPassword attempt:', { email });
    
    // Get the appropriate redirect URL
    const baseUrl = window.location.origin.includes('localhost') 
      ? window.location.origin 
      : 'https://craftlytics-ai.lovable.app';
    
    const redirectTo = `${baseUrl}/auth/reset-password`;
    console.log('[Auth] resetPassword redirectTo:', redirectTo);
    
    // This sends a password recovery email with a link
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    
    console.log('[Auth] resetPassword response:', { error: error?.message });
    
    return { error: error as Error | null };
  };

  const verifyOtp = async (email: string, token: string) => {
    console.log('[Auth] verifyOtp attempt:', { email, tokenLength: token.length });
    
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'recovery',
    });
    
    console.log('[Auth] verifyOtp response:', { 
      userId: data?.user?.id, 
      session: !!data?.session,
      error: error?.message 
    });
    
    return { error: error as Error | null };
  };

  const updatePassword = async (newPassword: string) => {
    console.log('[Auth] updatePassword attempt');
    
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    
    console.log('[Auth] updatePassword response:', { error: error?.message });
    
    return { error: error as Error | null };
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      loading, 
      signUp, 
      signIn, 
      signOut, 
      resetPassword, 
      verifyOtp, 
      updatePassword 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
