const { runAction } = require('./utils');

const PRODUCTS_WITH_REWARDS_PATH = '../input/products-with-v1-rewards.json';

async function action({ legacyPooledStaking, signer, opts = {} }) {
  const productsWithPossibleRewards = require(PRODUCTS_WITH_REWARDS_PATH).map(address => address.toLowerCase());
  console.log(`Call pushRewards with ${productsWithPossibleRewards.length} products.`);
  const tx = await legacyPooledStaking.connect(signer).pushRewards(productsWithPossibleRewards, opts);

  console.log(`Waiting tx to be mined: https://etherscan.io/tx/${tx.hash}`);
  await tx.wait();
  console.log('Done');
}

const main = async () => {
  await runAction('LegacyClaimsReward.transferRewards', action);
};

if (require.main === module) {
  main(process.argv[1]).catch(e => {
    console.log('Unhandled error encountered: ', e.stack);
    process.exit(1);
  });
}

module.exports = action;
