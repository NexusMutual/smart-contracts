const nexusSdk = require('@nexusmutual/deployments');

const AB_MEMBER = '0x87B2a7559d85f4653f13E6546A14189cd5455d45';
const GOVERNANCE_ADDRESS = nexusSdk.addresses.Governance;
const IPFS_API_URL = 'https://api.nexusmutual.io/ipfs-api/api/v0';

/**
 * @dev Extend with other Governance Proposal Categories as necessary
 */
const PROPOSAL_CATEGORY = {
  4: {
    actionParamTypes: [
      'uint',
      'string',
      'uint',
      'uint',
      'uint',
      'uint[]',
      'uint',
      'string',
      'address',
      'bytes2',
      'uint[]',
      'string',
    ],
    description: 'Edit Category',
  },
  29: {
    actionParamTypes: ['bytes2[]', 'address[]'],
    description: 'Release new smart contract code',
  },
  40: {
    actionParamTypes: ['bytes8', 'address'],
    description: 'Update Pool address Parameters',
  },
  42: {
    actionParamTypes: ['address', 'bool', 'uint', 'uint', 'uint'],
    description: 'Add Asset To Pool',
  },
  43: {
    actionParamTypes: ['bytes2[]', 'address[]', 'uint256[]'],
    description: 'Add new internal contracts',
  },
};

module.exports = {
  AB_MEMBER,
  GOVERNANCE_ADDRESS,
  IPFS_API_URL,
  PROPOSAL_CATEGORY,
};
