import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'intro',
    'installation',
    {
      type: 'category',
      label: 'Architecture',
      collapsed: false,
      items: [
        'architecture/overview',
        'architecture/eip1193',
        'architecture/eip6963',
        'architecture/crac-gateway',
      ],
    },
    {
      type: 'category',
      label: 'Technical',
      collapsed: false,
      items: [
        'technical/build',
        'technical/injection',
        'technical/api-reference',
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
