import { motion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import {
  Squares2X2Icon as LayoutGrid,
  ArrowLeftIcon as ArrowLeft,
} from "@heroicons/react/24/outline";
import { Link } from "wouter";

export default function Templates() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-6">
      <Helmet>
        <title>Templates — Meshwork Studio</title>
      </Helmet>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-24 h-24 bg-primary/10 rounded-3xl flex items-center justify-center border border-primary/20 mb-8"
      >
        <LayoutGrid className="w-12 h-12 text-primary" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tighter text-white font-sans mb-4 uppercase">
          Template Marketplace
        </h1>
        <p className="text-outline text-lg max-w-md mx-auto mb-10 font-body">
          We're hand-crafting a library of production-ready architectures to
          help you skip the boilerplate.
        </p>

        <div className="flex items-center justify-center gap-6">
          <div className="px-4 py-2 rounded-full border border-primary/20 bg-primary/5 text-primary text-[10px] font-sans font-bold uppercase tracking-widest">
            Coming Soon
          </div>
          <Link href="/home">
            <button className="flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm font-sans uppercase tracking-widest cursor-figma-pointer">
              <ArrowLeft className="w-4 h-4" /> Go Back
            </button>
          </Link>
        </div>
      </motion.div>

      {/* Decorative elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[120px]" />
      </div>
    </div>
  );
}
