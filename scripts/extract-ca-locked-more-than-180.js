const { artifacts, web3 } = require('hardhat');
const { to, hex } = require('../lib/helpers');
const { BN } = web3.utils;

async function main () {
  const TokenController = artifacts.require('TokenController');
  const MemberRoles = artifacts.require('MemberRoles');

  const tc = await TokenController.at(
    '0x5407381b6c251cfd498ccd4a1d877739cb7960b8',
  );
  const mr = await MemberRoles.at('0x055cc48f7968fd8640ef140610dd4038e1b03926');

  const ROLE_MEMBER = 2;
  const memberCount = await mr.membersLength(ROLE_MEMBER);
  const elidgibleForReset = {};
  const lockCap = new BN(Date.now() / 1000 + 180 * 24 * 60 * 60);
  const zero = new BN('0');

  for (let i = 0; i < memberCount; i++) {
    const { 0: member, 1: active } = await mr.memberAtIndex(ROLE_MEMBER, i);

    if (!active) {
      console.log(`Skipping inactive member ${member}`);
      continue;
    }

    const [amount, validity] = await Promise.all([
      tc.tokensLocked(member, hex('CLA')),
      tc.getLockedTokensValidity(member, hex('CLA')),
    ]);

    if (amount.eq(zero)) {
      console.log(`Skipping 0 amount lock for ${member}`);
      continue;
    }
    if (validity.lte(lockCap)) {
      console.log(`Skipping validity < 180 for ${member}`);
      continue;
    }
    console.log({
      member,
      amount: amount.toString(),
      validity: (new Date(validity.toNumber() * 1000)).toDateString(),
    });
    elidgibleForReset[member] = { amount: amount.toString(), validity: validity.toString() };
  }

  require('fs').writeFileSync('elidgibleForReset.json', JSON.stringify(elidgibleForReset, null, 2));
  console.log(JSON.stringify(elidgibleForReset, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
