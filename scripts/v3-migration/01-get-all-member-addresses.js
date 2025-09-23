const { ethers, nexus } = require('hardhat');
const fs = require('node:fs');
const path = require('node:path');
const { addresses, MemberRoles } = require('@nexusmutual/deployments');

const { multicall, encodeWithSelector, decodeResult } = nexus.multicall;
const { Role } = nexus.constants;

const fetchMembers = async () => {
  const memberRoles = await ethers.getContractAt(MemberRoles, addresses.MemberRoles);
  const membersArrayLenght = await memberRoles.membersLength(Role.Member);

  const calls = Array.from({ length: Number(membersArrayLenght) }, (_, i) => ({
    target: addresses.MemberRoles,
    callData: encodeWithSelector(memberRoles.memberAtIndex.fragment, [Role.Member, i]),
  }));

  const members = (await multicall(calls, ethers.provider, 200))
    .map(member => decodeResult(memberRoles.memberAtIndex.fragment, member))
    .filter(([, active]) => active)
    .map(([address]) => address);

  return members;
};

async function main() {
  const members = await fetchMembers();
  console.log(`Found ${members.length} members`);

  const outfile = path.join(__dirname, 'data/members.json');
  fs.writeFileSync(outfile, JSON.stringify(members, null, 2));

  console.log(`Members saved to: ${outfile}`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
}

module.exports = { fetchMembers };
