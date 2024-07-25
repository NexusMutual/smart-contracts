const axios = require('axios');
const { inspect } = require('node:util');
const nexusSdk = require('@nexusmutual/deployments');

const AB_MEMBER = '0x87B2a7559d85f4653f13E6546A14189cd5455d45';
const GOVERNANCE_ADDRESS = nexusSdk.addresses.Governance;

const IPFS_API_URL = 'https://api.nexusmutual.io/ipfs-api/api/v0';

const CATEGORY_PARAM_TYPES = {
  29: ['bytes2[]', 'address[]'],
  43: ['bytes2[]', 'address[]', 'uint256[]'],
};

/**
 * NOTE: requires TENDERLY_ACCESS_KEY env
 * @param {HexString} input - the tx.data
 */
const simulateTransaction = async input => {
  const payload = {
    save: true, // save result to dashboard
    save_if_fails: true, // show reverted txs in dashboard
    simulation_type: 'full',
    network_id: '1',
    from: AB_MEMBER,
    to: GOVERNANCE_ADDRESS,
    gas: 8000000,
    gas_price: 0,
    value: 0,
    input,
  };

  const response = await axios.post(
    `https://api.tenderly.co/api/v1/account/NexusMutual/project/nexusmutual/simulate`,
    payload,
    { headers: { 'X-Access-Key': process.env.TENDERLY_ACCESS_KEY } },
  );

  const { transaction, simulation } = response.data;
  const decodedTxInputs = transaction.transaction_info.call_trace.decoded_input.map(input => input.value);
  console.info('governance.createProposal input:\n', inspect(decodedTxInputs, { depth: null }));
  console.info(
    '\nTenderly Simulated transaction:\n',
    `https://dashboard.tenderly.co/NexusMutual/nexusmutual/simulator/${simulation.id}`,
  );

  return decodedTxInputs;
};

module.exports = {
  simulateTransaction,
  constants: {
    GOVERNANCE_ADDRESS,
    AB_MEMBER,
    IPFS_API_URL,
    CATEGORY_PARAM_TYPES,
  },
};
