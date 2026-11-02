import { ScrollProgress } from "@/components/motion";
import LandingNav from "@/components/landing/LandingNav";
import Hero from "@/components/landing/Hero";
import Footer from "@/components/landing/Footer";
import {
  LogoMarquee,
  StatsBand,
  AgentsSection,
  TechnologySection,
  ShowcaseSection,
  ReportSection,
  WorkflowSection,
  SecuritySection,
  EnterpriseSection,
  TestimonialsSection,
  FaqSection,
  FinalCta,
} from "@/components/landing/Sections";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg text-text">
      <ScrollProgress />
      <LandingNav />
      <main>
        <Hero />
        <LogoMarquee />
        <StatsBand />
        <AgentsSection />
        <TechnologySection />
        <ShowcaseSection />
        <ReportSection />
        <WorkflowSection />
        <SecuritySection />
        <EnterpriseSection />
        <TestimonialsSection />
        <FaqSection />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
