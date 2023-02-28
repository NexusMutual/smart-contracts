const { ethers } = require('hardhat');
const { runAction } = require('./utils');

async function action({ cover, signer, opts }) {
  const tx = await cover.connect(signer).initialize({
    maxFeePerGas: opts.maxFeePerGas,
    maxPriorityFeePerGas: opts.maxPriorityFeePerGas,
    gasLimit: opts.gasLimit,
  });

  console.log(`Waiting tx to be mined: https://etherscan.io/tx/${tx.hash}`);
  await tx.wait();
  console.log('Done');
}

const main = async () => {
  await runAction('LegacyStakingPool.processPendingActions', action);
};

if (require.main === module) {
  main(process.argv[1]).catch(e => {
    console.log('Unhandled error encountered: ', e.stack);
    process.exit(1);
  });
}

module.exports = action;
