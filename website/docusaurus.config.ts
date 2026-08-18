import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'TezosX',
  tagline: `Relayer & Wallet for Tezos X`,
  favicon: 'img/tezos-logo.svg',
  url: 'https://trilitech.github.io',
  baseUrl: process.env.BASE_URL ?? '/tezos-x-wallet/',
  onBrokenLinks: 'throw',

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
        editUrl: 'https://github.com/trilitech/tezos-x-wallet/tree/main/website/',
        lastVersion: 'current',
        versions: {
          current: { label: '0.17.0' },
        },
      },
    ],
  ],

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },
  themes: [
    '@docusaurus/theme-mermaid',
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        docsRouteBasePath: ['docs', 'wallet'],
        docsDir: ['docs', 'wallet-docs'],
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
          editUrl: 'https://github.com/trilitech/tezos-x-wallet/tree/main/website/',
          lastVersion: 'current',
          versions: {
            current: { label: '0.8.0' },
          },
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    announcementBar: {
      id: 'experimental_poc',
      content: 'Experimental software · Pre-release POC · Do not use with mainnet funds',
      backgroundColor: '#3b2a1a',
      textColor: '#ffd9a8',
      isCloseable: false,
    },
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    image: 'img/tezos-logo.svg',
    navbar: {
      title: 'TezosX',
      logo: {
        alt: 'Tezos X Logo',
        src: 'img/tezos-logo.svg',
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
          dropdownItemsBefore: [
            {
              type: 'html',
              value: '<strong class="dropdown__link" style="pointer-events:none;opacity:0.6;">Relayer docs</strong>',
            },
          ],
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
          dropdownItemsBefore: [
            {
              type: 'html',
              value: '<strong class="dropdown__link" style="pointer-events:none;opacity:0.6;">Wallet docs</strong>',
            },
          ],
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
