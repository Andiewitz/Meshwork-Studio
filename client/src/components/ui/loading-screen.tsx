import { motion } from "framer-motion";
import { MeshworkLogo } from "@/components/MeshworkLogo";
import { AnimatedSpinner } from "@/components/ui/animated-spinner";

interface LoadingScreenProps {
  message?: string;
  subMessage?: string;
}

// Standard loading — centered logo inside glowing brand AnimatedSpinner
export function LoadingScreen({ message, subMessage }: LoadingScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background fixed inset-0 z-[100]">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="flex flex-col items-center gap-6"
      >
        <div className="relative flex items-center justify-center">
          <AnimatedSpinner size="5.5rem" />
          <div className="absolute w-8 h-8 flex items-center justify-center pointer-events-none">
            <MeshworkLogo />
          </div>
        </div>
        {message && (
          <div className="flex flex-col items-center gap-1">
            <p className="text-xs font-medium text-white/70 tracking-wider uppercase">
              {message}
            </p>
            {subMessage && (
              <p className="text-[11px] text-white/30">{subMessage}</p>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

// Dashboard/workspace loading — unified brand spinner
export function LineSyncLoader({ message }: { message?: string }) {
  return <LoadingScreen message={message} />;
}

// Auth redirecting — unified brand spinner
export function RedirectingScreen() {
  return <LoadingScreen message="Redirecting..." />;
}
