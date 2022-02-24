const { ethers } = require('hardhat');
const { domain } = require('@gnosis.pm/gp-v2-contracts');
const { swapOperator: swapOperatorAddress } = require('./addresses');
const { address: settlementAddress } = require('@gnosis.pm/gp-v2-contracts/deployments/mainnet/GPv2Settlement.json');

const fs = require('fs');

const main = async () => {
  const _domain = domain(4, settlementAddress);
  const domainHash = ethers.utils._TypedDataEncoder.hashDomain(_domain);

  const swapOperatorContract = await ethers.getContractAt('CowSwapOperator', swapOperatorAddress);

  const contractOrder = JSON.parse(fs.readFileSync('./contractOrder.json'));

  console.log('Canceling order', JSON.stringify(contractOrder, null, 2));
  const cancelTx = await swapOperatorContract.cancelOrder(contractOrder, domainHash);
  console.log('Cancel order tx', cancelTx.hash);
  await cancelTx.wait();
  console.log('Done');
};

main()
  .then(() => process.exit())
  .catch(e => {
    if (e.isAxiosError) {
      console.error(`HTTP Error: Status ${e.response.status}. ${JSON.stringify(e.response.data, null, 2)}`);
    } else {
      console.error(e);
    }
    process.exit(1);
  });
