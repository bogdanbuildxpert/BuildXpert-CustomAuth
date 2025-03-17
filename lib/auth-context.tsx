"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import axios from "axios";

// 5 hours in milliseconds
const INACTIVITY_TIMEOUT = 5 * 60 * 60 * 1000;
// Warning 5 minutes before logout
const WARNING_BEFORE_TIMEOUT = 5 * 60 * 1000;

// Define our custom User type to replace Supabase's User
export interface User {
  id: string;
  email: string;
  role: string;
  user_metadata?: Record<string, any>;
  app_metadata?: Record<string, any>;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    metadata: { name: string; role?: string }
  ) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resetInactivityTimer: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Helper function to check if a user is an admin
export function isUserAdmin(user: User | null): boolean {
  if (!user) return false;

  // Check role directly
  if (user.role === "ADMIN" || user.role === "admin") {
    return true;
  }

  // Check in user_metadata
  const metadataRole = user.user_metadata?.role;
  if (metadataRole === "ADMIN" || metadataRole === "admin") {
    return true;
  }

  // Check in app_metadata.roles array (RBAC system)
  const appMetadataRoles = user.app_metadata?.roles;
  if (Array.isArray(appMetadataRoles) && appMetadataRoles.includes("admin")) {
    return true;
  }

  // Special case for specific email (for development/testing)
  if (user.email === "bogdanhutuleac@outlook.com") {
    return true;
  }

  return false;
}

// Create an axios instance with credentials
const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const warningShownRef = useRef<boolean>(false);

  // Function to reset the inactivity timer
  const resetInactivityTimer = useCallback(() => {
    // Clear existing timers
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
    }

    // Reset warning flag
    warningShownRef.current = false;

    // Update last activity timestamp
    lastActivityRef.current = Date.now();

    // Only set new timers if the user is logged in
    if (user) {
      // Set warning timer (5 minutes before logout)
      warningTimerRef.current = setTimeout(() => {
        if (!warningShownRef.current) {
          warningShownRef.current = true;
          toast.warning(
            "You'll be logged out in 5 minutes due to inactivity. Move your mouse or press a key to stay logged in.",
            {
              duration: 10000, // Show for 10 seconds
              id: "inactivity-warning", // Prevent duplicate toasts
            }
          );
        }
      }, INACTIVITY_TIMEOUT - WARNING_BEFORE_TIMEOUT);

      // Set logout timer
      inactivityTimerRef.current = setTimeout(() => {
        // Check if the time since last activity exceeds the timeout
        const timeSinceLastActivity = Date.now() - lastActivityRef.current;
        if (timeSinceLastActivity >= INACTIVITY_TIMEOUT) {
          console.log("Logging out due to inactivity");
          toast.info("You've been logged out due to inactivity", {
            duration: 5000,
          });
          signOut();
        }
      }, INACTIVITY_TIMEOUT);
    }
  }, [user]);

  // Set up event listeners for user activity
  useEffect(() => {
    const activityEvents = ["mousedown", "keypress", "scroll", "touchstart"];

    const handleUserActivity = () => {
      resetInactivityTimer();
    };

    // Add event listeners
    activityEvents.forEach((event) => {
      window.addEventListener(event, handleUserActivity);
    });

    // Initialize the timer
    resetInactivityTimer();

    // Clean up event listeners on unmount
    return () => {
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleUserActivity);
      });

      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      if (warningTimerRef.current) {
        clearTimeout(warningTimerRef.current);
      }
    };
  }, [resetInactivityTimer]);

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        console.log("Getting initial session...");

        try {
          const response = await api.get("/auth/user");
          console.log("Session found:", response.data);
          setUser(response.data.user);
        } catch (error) {
          console.log("No active session:", error);
          setUser(null);
        }

        setIsLoading(false);
      } catch (error) {
        console.error("Unexpected error getting session:", error);
        setUser(null);
        setIsLoading(false);
      }
    };

    getInitialSession();
  }, []);

  // Sign in with email and password
  const signIn = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const response = await api.post("/auth/login", { email, password });

      if (response.data.user) {
        setUser(response.data.user);
        toast.success("Signed in successfully");
        router.push("/dashboard");
      } else {
        toast.error("Failed to sign in");
      }
    } catch (error: any) {
      console.error("Error signing in:", error);
      toast.error(error.response?.data?.error || "Failed to sign in");
    } finally {
      setIsLoading(false);
    }
  };

  // Sign up with email and password
  const signUp = async (
    email: string,
    password: string,
    metadata: { name: string; role?: string }
  ) => {
    try {
      setIsLoading(true);
      const response = await api.post("/auth/register", {
        email,
        password,
        name: metadata.name,
        role: metadata.role || "CLIENT",
      });

      if (response.data.user) {
        setUser(response.data.user);
        toast.success("Signed up successfully");
        router.push("/dashboard");
      } else {
        toast.error("Failed to sign up");
      }
    } catch (error: any) {
      console.error("Error signing up:", error);
      toast.error(error.response?.data?.error || "Failed to sign up");
    } finally {
      setIsLoading(false);
    }
  };

  // Sign in with Google
  const signInWithGoogle = async () => {
    try {
      // Store the redirect URL in localStorage
      const redirectUrl = localStorage.getItem("redirectTo") || "/dashboard";

      // Redirect to the Google OAuth endpoint
      window.location.href = `/api/auth/google?redirectUrl=${encodeURIComponent(
        redirectUrl
      )}`;
    } catch (error: any) {
      console.error("Error signing in with Google:", error);
      toast.error("Failed to sign in with Google");
    }
  };

  // Sign out
  const signOut = async () => {
    try {
      setIsLoading(true);
      await api.post("/auth/logout");
      setUser(null);
      toast.success("Signed out successfully");
      router.push("/login");
    } catch (error) {
      console.error("Error signing out:", error);
      // Even if the API call fails, we should still clear the user state
      setUser(null);
      router.push("/login");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        signIn,
        signUp,
        signOut,
        signInWithGoogle,
        resetInactivityTimer,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
