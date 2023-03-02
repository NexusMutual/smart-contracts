const { runAction } = require('./utils');

const ARMOR_STAKER = '0x1337def1fc06783d4b03cb8c1bf3ebf7d0593fc4';
const FOUNDATION = '0x963df0066ff8345922df88eebeb1095be4e4e12e';
const HUGH = '0x87b2a7559d85f4653f13e6546a14189cd5455d45';

async function action({ legacyPooledStaking, signer, selectedStakers = [FOUNDATION, HUGH, ARMOR_STAKER], opts = {} }) {
  console.log('Checking that selected stakers cannot withdraw independently');
  for (const staker of selectedStakers) {
    // pooledStaking.withdraw(uint) is not verified here for simplicity; it follows the exact same code path

    console.log(`Migrating staker: ${staker}`);

    const tx = await legacyPooledStaking.connect(signer).migrateToNewV2Pool(staker, opts);

    console.log(`Waiting tx to be mined: https://etherscan.io/tx/${tx.hash}`);
    await tx.wait();

    if (typeof opts.nonce !== 'undefined') {
      // increment nonce for next tx
      opts.nonce++;
    }
  }

  console.log('Done');
}

const main = async () => {
  await runAction('LegacyStakingPool.migrateToNewV2Pool', action);
};

if (require.main === module) {
  main(process.argv[1]).catch(e => {
    console.log('Unhandled error encountered: ', e.stack);
    process.exit(1);
  });
}

module.exports = action;
