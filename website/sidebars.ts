import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'intro',
    'installation',
    'quickstart',
    'gotchas',
    {
      type: 'category',
      label: 'Architecture',
      collapsed: false,
      items: [
        'architecture/overview',
        'architecture/eip1193',
        'architecture/eip6963',
        'architecture/nac-gateway',
      ],
    },
    {
      type: 'category',
      label: 'SDK',
      collapsed: false,
      items: [
        'sdk/overview',
        'sdk/provider',
        'sdk/wallet-clients',
        'sdk/cross-runtime',
        'sdk/constants-and-types',
      ],
    },
    {
      type: 'category',
      label: 'User Flows',
      collapsed: false,
      items: [
        'user-flows/connect-wallet',
        'user-flows/transfer',
        'user-flows/smart-contract-call',
        'user-flows/dapp-compatibility',
      ],
    },
  ],
};

export default sidebars;
