import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import pkg from '../package.json';

const config: Config = {
  title: 'Tezos X Relayer',
  tagline: `v${pkg.version} — Interact with Etherlink dApps using your Tezos wallet`,
  favicon: 'img/tezos-logo.png',
  url: 'https://tezosx-relayer-9c5cf1.gitlab.io',
  baseUrl: process.env.BASE_URL ?? '/',
  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

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
      disableSwitch: false,
      respectPrefersColorScheme: false,
    },
    image: 'img/tezos-logo.png',
    navbar: {
      title: 'Tezos X Relayer',
      logo: {
        alt: 'Tezos X Logo',
        src: 'img/tezos-logo.png',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Docs',
        },
        {
          to: '/docs/technical/api-reference',
          label: 'API',
          position: 'left',
        },
        {
          to: '/docs/user-flows/connect-wallet',
          label: 'User Flows',
          position: 'left',
        },
        {
          type: 'docsVersionDropdown',
          position: 'right',
        },
        {
          href: 'https://gitlab.com/tezos-infra/techrel/support-xdev-qa/tezosx-relayer',
          label: 'GitLab',
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
          ],
        },
        {
          title: 'Links',
          items: [
            { label: 'GitLab', href: 'https://gitlab.com/tezos-infra/techrel/support-xdev-qa/tezosx-relayer' },
            { label: 'Etherlink', href: 'https://etherlink.com' },
            { label: 'Tezos', href: 'https://tezos.com' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Nomadic Labs — Tezos X Relayer`,
    },
    prism: {
      theme: prismThemes.oneDark,
      darkTheme: prismThemes.oneDark,
      additionalLanguages: ['bash', 'typescript', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
