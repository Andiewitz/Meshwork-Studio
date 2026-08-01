import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { MeshworkLogo } from "@/components/MeshworkLogo";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import Lenis from "lenis";

const EFFECTIVE_DATE = "June 4, 2026";

const sectionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.15 + i * 0.06,
      duration: 0.5,
      ease: [0.16, 1, 0.3, 1],
    },
  }),
};

export default function TermsOfService() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    const lenis = new Lenis({ lerp: 0.08, wheelMultiplier: 1.2 });
    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
    return () => lenis.destroy();
  }, []);

  const sections = [
    {
      title: "1. Acceptance of Terms",
      content: `By accessing or using Meshwork Studio ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to all the terms and conditions, you may not access or use the Service. These Terms apply to all visitors, users, and others who access or use the Service.`,
    },
    {
      title: "2. Description of Service",
      content: `Meshwork Studio is a collaborative, real-time visual canvas for designing, mapping, and deploying cloud infrastructure architectures. The Service includes the web application, APIs, templates, AI-assisted features, and all related tools and services provided by Meshwork Studio.`,
    },
    {
      title: "3. User Accounts",
      content: `When you create an account, you must provide accurate and complete information. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must notify us immediately of any unauthorized use of your account. We reserve the right to suspend or terminate accounts that violate these Terms.`,
    },
    {
      title: "4. User Content & Intellectual Property",
      content: `You retain all rights to the content you create using Meshwork Studio, including architecture diagrams, configurations, and workspace data ("User Content"). By using the Service, you grant us a limited, non-exclusive license to host, store, and display your User Content solely for the purpose of providing the Service. We do not claim ownership of your User Content. All Meshwork Studio branding, UI design, codebase, and proprietary technology remain the exclusive property of Meshwork Studio.`,
    },
    {
      title: "5. Acceptable Use",
      content: `You agree not to: (a) use the Service for any unlawful purpose or in violation of any applicable laws; (b) attempt to gain unauthorized access to the Service, other accounts, or any related systems; (c) transmit malware, viruses, or any code of a destructive nature; (d) interfere with or disrupt the integrity or performance of the Service; (e) use the Service to develop a competing product; (f) reverse-engineer, decompile, or disassemble any aspect of the Service; (g) scrape, crawl, or harvest data from the Service without authorization.`,
    },
    {
      title: "6. Collaborative Features",
      content: `Meshwork Studio includes real-time collaboration features. By inviting others to your workspace, you grant them access to view and edit shared content according to the permissions you set. You are responsible for managing access to your workspaces. We are not liable for actions taken by collaborators you have invited.`,
    },
    {
      title: "7. AI-Assisted Features",
      content: `The Service may include AI-powered features for generating infrastructure suggestions, code, and architecture recommendations. AI-generated content is provided "as-is" and should be reviewed before deployment. We do not guarantee the accuracy, completeness, or suitability of AI-generated suggestions. You are solely responsible for validating and deploying any infrastructure configurations.`,
    },
    {
      title: "8. Service Availability & Modifications",
      content: `We strive to maintain high availability but do not guarantee uninterrupted access. We reserve the right to modify, suspend, or discontinue any part of the Service at any time with or without notice. We shall not be liable for any modification, suspension, or discontinuation of the Service.`,
    },
    {
      title: "9. Termination",
      content: `We may terminate or suspend your account and access to the Service immediately, without prior notice, for conduct that we believe violates these Terms or is harmful to other users, us, or third parties, or for any other reason at our sole discretion. Upon termination, your right to use the Service will immediately cease. You may export your data before termination where technically feasible.`,
    },
    {
      title: "10. Limitation of Liability",
      content: `To the maximum extent permitted by applicable law, Meshwork Studio and its affiliates, officers, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, use, or goodwill, arising out of or related to your use of the Service. Our total aggregate liability shall not exceed the amount you paid us in the twelve (12) months preceding the claim.`,
    },
    {
      title: "11. Disclaimer of Warranties",
      content: `The Service is provided on an "AS IS" and "AS AVAILABLE" basis without warranties of any kind, whether express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the Service will be error-free, secure, or available at all times.`,
    },
    {
      title: "12. Governing Law",
      content: `These Terms shall be governed by and construed in accordance with applicable laws, without regard to conflict of law principles. Any disputes arising from these Terms or the Service shall be resolved through binding arbitration or in the courts of the applicable jurisdiction.`,
    },
    {
      title: "13. Changes to Terms",
      content: `We reserve the right to update these Terms at any time. We will notify users of material changes by posting the updated Terms on the Service and updating the "Effective Date." Your continued use of the Service after changes are posted constitutes acceptance of the revised Terms.`,
    },
    {
      title: "14. Contact",
      content: `If you have any questions about these Terms of Service, please contact us at support@meshwork.studio.`,
    },
  ];

  return (
    <div
      ref={containerRef}
      className="relative font-sans text-white min-h-screen flex flex-col bg-background"
    >
      <Helmet>
        <title>Terms of Service — Meshwork Studio</title>
        <meta
          name="description"
          content="Terms of Service for Meshwork Studio, the collaborative cloud architecture design platform."
        />
      </Helmet>

      {/* Background Atmosphere */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[5%] left-[20%] w-[40%] h-[30%] rounded-full bg-primary/5 blur-[150px]" />
        <div className="absolute bottom-[10%] right-[10%] w-[30%] h-[40%] rounded-full bg-purple-500/5 blur-[150px]" />
      </div>

      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/40 backdrop-blur-2xl border-b border-white/[0.05] shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 flex items-center justify-center transition-all group-hover:drop-shadow-[0_0_12px_rgba(26,115,232,0.5)]">
              <MeshworkLogo />
            </div>
            <span className="text-lg font-headline font-bold tracking-tight hidden sm:block text-white">
              Meshwork Studio
            </span>
          </Link>
          <Link href="/">
            <button className="flex items-center gap-2 text-sm font-medium text-white/60 hover:text-white transition-colors cursor-pointer">
              <ArrowLeftIcon className="w-4 h-4" />
              Back to Home
            </button>
          </Link>
        </div>
      </nav>

      {/* Content */}
      <main className="w-full relative z-10 pt-32 pb-24 flex-1">
        <div className="max-w-3xl mx-auto px-6">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs font-bold tracking-widest uppercase text-white/50 mb-6">
              Legal
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-4">
              Terms of Service
            </h1>
            <p className="text-white/40 text-base font-medium">
              Effective Date: {EFFECTIVE_DATE}
            </p>
          </motion.div>

          {/* Sections */}
          <div className="space-y-10">
            {sections.map((section, i) => (
              <motion.div
                key={i}
                custom={i}
                initial="hidden"
                animate="visible"
                variants={sectionVariants}
                className="group"
              >
                <h2 className="text-lg font-bold text-white mb-3 tracking-tight">
                  {section.title}
                </h2>
                <p className="text-white/50 text-[15px] leading-[1.8] font-medium">
                  {section.content}
                </p>
                {i < sections.length - 1 && (
                  <div className="mt-10 border-t border-white/[0.04]" />
                )}
              </motion.div>
            ))}
          </div>

          {/* Footer link */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.5 }}
            className="mt-20 pt-10 border-t border-white/[0.06] flex items-center justify-between"
          >
            <Link
              href="/privacy"
              className="text-sm text-white/40 hover:text-white transition-colors font-medium"
            >
              Privacy Policy →
            </Link>
            <Link
              href="/"
              className="text-sm text-white/40 hover:text-white transition-colors font-medium"
            >
              Back to Home
            </Link>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
