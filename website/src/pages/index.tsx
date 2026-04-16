import { type ReactNode } from 'react';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

import { Hero } from '../components/landing/Hero';
import { Stats } from '../components/landing/Stats';
import { Features } from '../components/landing/Features';
import { FlowSection } from '../components/landing/FlowSection';
import { QuickStart } from '../components/landing/QuickStart';

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();

  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <div id="tw-scope" style={{ background: '#000' }}>
        <Hero />
        <main className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <Stats />
          <Features />
          <FlowSection />
          <QuickStart />
        </main>
      </div>
    </Layout>
  );
}
