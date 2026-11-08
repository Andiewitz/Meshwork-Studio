import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { MeshworkLogo } from "@/components/MeshworkLogo";
import {
  ArrowLeftIcon,
  AdjustmentsHorizontalIcon,
} from "@heroicons/react/24/outline";
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

export default function PrivacyPolicy() {
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
      title: "1. Information We Collect",
      subsections: [
        {
          subtitle: "Account Information",
          content: `When you create an account, we collect your name, email address, and profile photo (if provided via Google OAuth). If you register with email and password, your password is securely hashed and stored — we never have access to your plaintext password.`,
        },
        {
          subtitle: "Usage Data",
          content: `We automatically collect information about how you interact with the Service, including pages visited, features used, session duration, browser type, operating system, device information, and IP address. This data helps us improve the Service and diagnose issues.`,
        },
        {
          subtitle: "Workspace Content",
          content: `We store the architecture diagrams, configurations, annotations, and other content you create within your workspaces ("User Content") to provide the Service. Your User Content is yours — we do not use it for purposes other than delivering and improving the Service.`,
        },
        {
          subtitle: "Cookies & Local Storage",
          content: `We use essential cookies for authentication and session management. We may use local storage to persist your UI preferences (theme, layout settings). We do not use third-party advertising cookies.`,
        },
      ],
    },
    {
      title: "2. How We Use Your Information",
      content: `We use your information to: (a) provide, maintain, and improve the Service; (b) authenticate your identity and manage your account; (c) enable real-time collaboration features; (d) send you important service-related communications; (e) analyze usage patterns to improve user experience; (f) detect and prevent fraud, abuse, and security incidents; (g) comply with legal obligations. We do not sell your personal information to third parties.`,
    },
    {
      title: "3. Data Sharing & Third Parties",
      content: `We may share your information with: (a) service providers who assist in operating the Service (hosting, analytics, email delivery), bound by confidentiality agreements; (b) other users in your workspace, limited to your profile information and shared content; (c) law enforcement or regulatory authorities when required by law; (d) a successor entity in the event of a merger, acquisition, or sale of assets. We do not share your User Content with third parties for their own purposes.`,
    },
    {
      title: "4. Data Security",
      content: `We implement industry-standard security measures to protect your data, including encryption in transit (TLS/HTTPS), secure password hashing, CSRF protection, and access controls. While we strive to protect your personal information, no method of electronic transmission or storage is 100% secure. We cannot guarantee absolute security but are committed to promptly addressing any security incidents.`,
    },
    {
      title: "5. Data Retention",
      content: `We retain your account data for as long as your account is active. If you delete your account, we will delete or anonymize your personal information within 30 days, except where we are required to retain it by law. Workspace data shared with other collaborators may persist in their workspaces after your account deletion. Usage logs and analytics data are retained in aggregate, anonymized form.`,
    },
    {
      title: "6. Your Rights",
      content: `Depending on your jurisdiction, you may have the right to: (a) access the personal data we hold about you; (b) request correction of inaccurate data; (c) request deletion of your data; (d) export your data in a portable format; (e) object to or restrict certain processing; (f) withdraw consent where processing is based on consent. To exercise these rights, contact us at privacy@meshwork.studio.`,
    },
    {
      title: "7. International Data Transfers",
      content: `Your data may be processed and stored in servers located outside your country of residence. By using the Service, you consent to the transfer of your information to countries that may have different data protection laws. We implement appropriate safeguards to ensure your data receives the same level of protection regardless of where it is processed.`,
    },
    {
      title: "8. Children's Privacy",
      content: `The Service is not intended for children under the age of 13 (or the applicable age of digital consent in your jurisdiction). We do not knowingly collect personal information from children. If we become aware that a child has provided us with personal data, we will take steps to delete such information promptly.`,
    },
    {
      title: "9. Third-Party Links & Integrations",
      content: `The Service may contain links to third-party websites or integrate with third-party services (e.g., cloud providers). We are not responsible for the privacy practices of these external services. We encourage you to read their privacy policies before providing any personal information.`,
    },
    {
      title: "10. Changes to This Policy",
      content: `We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy on the Service and updating the "Effective Date." Your continued use of the Service after changes are posted constitutes acceptance of the revised policy.`,
    },
    {
      title: "11. Contact Us",
      content: `If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us at privacy@meshwork.studio.`,
    },
  ];

  return (
    <div
      ref={containerRef}
      className="relative font-sans text-foreground min-h-screen flex flex-col bg-background"
    >
      <Helmet>
        <title>Privacy Policy</title>
        <meta
          name="description"
          content="Privacy Policy for Meshwork Studio. Learn how we collect, use, and protect your data."
        />
      </Helmet>

      {/* Background Atmosphere */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[5%] right-[20%] w-[40%] h-[30%] rounded-full bg-blue-500/5 blur-[150px]" />
        <div className="absolute bottom-[10%] left-[10%] w-[30%] h-[40%] rounded-full bg-primary/5 blur-[150px]" />
      </div>

      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/95 border-b border-border">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 flex items-center justify-center transition-all group-hover:drop-shadow-[0_0_12px_rgba(26,115,232,0.5)]">
              <MeshworkLogo />
            </div>
            <span className="text-lg font-headline font-bold tracking-tight hidden sm:block text-foreground">
              Meshwork Studio
            </span>
          </Link>
          <Link href="/">
            <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
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
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-foreground/[0.05] border border-border text-xs font-bold tracking-widest uppercase text-muted-foreground mb-6">
              Legal
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
              Privacy Policy
            </h1>
            <p className="text-muted-foreground text-base font-medium">
              Effective Date: {EFFECTIVE_DATE}
            </p>
          </motion.div>

          {/* Intro */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="text-muted-foreground text-[15px] leading-[1.8] font-medium mb-8"
          >
            At Meshwork Studio, we take your privacy seriously. This Privacy
            Policy explains what information we collect, how we use it, how we
            share it, and what choices you have. By using our Service, you agree
            to the practices described in this policy.
          </motion.p>

          {/* Cookie Preferences Quick Action Banner */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="p-4 sm:p-5 mb-14 bg-foreground/[0.03] border border-border rounded-none flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="space-y-1">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <span className="w-2 h-2 rounded-none bg-emerald-400 inline-block" />
                Cookie &amp; Tracking Controls
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                You can inspect or adjust your cookie permissions and telemetry
                preferences at any time.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent("meshwork:open-cookie-preferences"),
                );
              }}
              className="shrink-0 px-4 py-2.5 bg-foreground/10 hover:bg-foreground/20 border border-border text-foreground font-mono text-xs uppercase tracking-wider rounded-none flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <AdjustmentsHorizontalIcon className="w-3.5 h-3.5 text-indigo-400" />
              <span>Customize Preferences</span>
            </button>
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
                <h2 className="text-lg font-bold text-foreground mb-3 tracking-tight">
                  {section.title}
                </h2>

                {/* If section has subsections */}
                {"subsections" in section && section.subsections ? (
                  <div className="space-y-5">
                    {section.subsections.map((sub, j) => (
                      <div key={j}>
                        <h3 className="text-sm font-bold text-foreground/70 mb-1.5 tracking-wide uppercase">
                          {sub.subtitle}
                        </h3>
                        <p className="text-muted-foreground text-[15px] leading-[1.8] font-medium">
                          {sub.content}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-[15px] leading-[1.8] font-medium">
                    {section.content}
                  </p>
                )}

                {i < sections.length - 1 && (
                  <div className="mt-10 border-t border-border" />
                )}
              </motion.div>
            ))}
          </div>

          {/* Footer link */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.5 }}
            className="mt-20 pt-10 border-t border-border flex items-center justify-between"
          >
            <Link
              href="/terms"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              ← Terms of Service
            </Link>
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              Back to Home
            </Link>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
