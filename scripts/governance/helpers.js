const axios = require('axios');
const nexusSdk = require('@nexusmutual/deployments');

const AB_MEMBER = '0x87B2a7559d85f4653f13E6546A14189cd5455d45';
const GOVERNANCE_ADDRESS = nexusSdk.addresses.Governance;

const IPFS_API_URL = 'https://api.nexusmutual.io/ipfs-api/api/v0';

const CATEGORY_PARAM_TYPES = {
  29: ['bytes2[]', 'address[]'],
  41: ['address', 'uint256', 'uint256', 'uint256'],
  43: ['bytes2[]', 'address[]', 'uint256[]'],
};

/**
 * NOTE: requires TENDERLY_ACCESS_KEY env
 * @param {HexString} data - the tx.data
 * @param {string} title - the title of the proposal that will be used for the vnet creation
 */
const simulateTransaction = async (data, title) => {
  const payload = {
    callArgs: {
      from: AB_MEMBER,
      to: GOVERNANCE_ADDRESS,
      gas: '0x7a1200',
      gasPrice: '0x0',
      value: '0x0',
      data,
    },
  };

  const vnetId = await createVNet(title);

  const response = await axios.post(
    `https://api.tenderly.co/api/v1/account/NexusMutual/project/nexusmutual/vnets/${vnetId}/transactions`,
    payload,
    { headers: { 'X-Access-Key': process.env.TENDERLY_ACCESS_KEY } },
  );
  const { tx_hash: txHash } = response.data;

  console.info(
    '\nTenderly Simulated transaction:\n',
    `https://dashboard.tenderly.co/NexusMutual/nexusmutual/testnet/${vnetId}/tx/mainnet/${txHash}`,
  );
};

const createVNet = async title => {
  const slug = title.replace(/\d/g, '').replace(/,/g, '').trim().replace(/\s/g, '-').toLowerCase();
  const { data: vnet } = await axios.post(
    'https://api.tenderly.co/api/v1/account/NexusMutual/project/nexusmutual/vnets',
    {
      slug,
      display_name: title,
      fork_config: {
        network_id: 1,
        block_number: 'latest',
      },
      virtual_network_config: {
        chain_config: {
          chain_id: 1,
        },
      },
      sync_state_config: {
        enabled: false,
      },
      explorer_page_config: {
        enabled: false,
        verification_visibility: 'bytecode',
      },
    },
    { headers: { 'X-Access-Key': process.env.TENDERLY_ACCESS_KEY } },
  );
  return vnet.id;
};

module.exports = {
  simulateTransaction,
  createVNet,
  constants: {
    GOVERNANCE_ADDRESS,
    AB_MEMBER,
    IPFS_API_URL,
    CATEGORY_PARAM_TYPES,
  },
};
