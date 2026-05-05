import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'TezosX',
  tagline: `Relayer & Wallet for Tezos X / Etherlink`,
  favicon: 'img/tezos-logo.png',
  url: 'https://trilitech.github.io',
  baseUrl: process.env.BASE_URL ?? '/tezos-x-wallet/',
  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  plugins: [
    './src/plugins/tailwind-config.js',
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'wallet',
        path: 'wallet-docs',
        routeBasePath: 'wallet',
        sidebarPath: './sidebars-wallet.ts',
      },
    ],
  ],

  markdown: {
    mermaid: true,
  },
  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    image: 'img/tezos-logo.png',
    navbar: {
      title: 'TezosX',
      logo: {
        alt: 'Tezos X Logo',
        src: 'img/tezos-logo.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Relayer',
        },
        {
          type: 'docsVersionDropdown',
          position: 'left',
        },
        {
          to: '/wallet/intro',
          label: 'Wallet',
          position: 'right',
        },
        {
          type: 'docsVersionDropdown',
          docsPluginId: 'wallet',
          position: 'right',
        },
        {
          href: 'https://github.com/trilitech/tezos-x-wallet',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Introduction', to: '/docs/intro' },
            { label: 'Architecture', to: '/docs/architecture/overview' },
            { label: 'API Reference', to: '/docs/technical/api-reference' },
            { label: 'Wallet', to: '/wallet/intro' },
            { label: 'Security Model', to: '/wallet/technical/security-model' },
          ],
        },
        {
          title: 'Links',
          items: [
            { label: 'GitHub', href: 'https://github.com/trilitech/tezos-x-wallet' },
            { label: 'Etherlink', href: 'https://etherlink.com' },
            { label: 'Tezos', href: 'https://tezos.com' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Nomadic Labs — TezosX — Relayer & Wallet`,
    },
    prism: {
      theme: prismThemes.oneDark,
      darkTheme: prismThemes.oneDark,
      additionalLanguages: ['bash', 'typescript', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
