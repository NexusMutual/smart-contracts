const { artifacts } = require('hardhat');
const { to } = require('../lib/helpers');

async function main () {

  const TokenController = artifacts.require('TokenController');
  const MemberRoles = artifacts.require('MemberRoles');

  const tc = await TokenController.at('0x5407381b6c251cfd498ccd4a1d877739cb7960b8');
  const mr = await MemberRoles.at('0x055cc48f7968fd8640ef140610dd4038e1b03926');

  const ROLE_MEMBER = 2;
  const memberCount = await mr.membersLength(ROLE_MEMBER);
  const reasons = {};

  for (let i = 0; i < memberCount; i++) {

    const { 0: member, 1: active } = await mr.memberAtIndex(ROLE_MEMBER, i);

    if (!active) {
      console.log(`Skipping inactive member ${member}`);
      continue;
    }

    console.log(`Fetching reasons of ${member}`);

    reasons[member] = [];

    for (let j = 0; j < 3000; j++) {

      const [reason, err] = await to(tc.lockReason(member, j));

      if (err) {
        console.log(`Failed to fetch log reason: ${err.message}. Skipping.`);
        break;
      }

      reasons[member].push(reason);
      console.log(`Found reason ${reason}`);
    }

  }

  require('fs').writeFileSync('reasons.json', JSON.stringify(reasons, null, 2));
  console.log(JSON.stringify(reasons, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
