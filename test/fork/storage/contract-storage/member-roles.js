const { Sema } = require('async-sema');
const { ethers } = require('hardhat');
const { abis, addresses } = require('@nexusmutual/deployments');

const { Role } = require('../../../../lib/constants');
const { tokenControllerMembers } = require('./token-controller');
const { Storage } = require('./storage');

const defaultStorage = {
  members: {
    [Role.Member]: [], // roleId => [address, active bool][]
  },
};

const storage = new Storage('member-roles.json', defaultStorage);

// list of members
// when updating should only add new members from previous list (members array will not change)

const getStorage = async () => {
  console.info('Getting MemberRoles storage...');
  return storage.get();
};

const updateStorage = async () => {
  await storage._init();

  const memberRoles = await ethers.getContractAt(abis.MemberRoles, addresses.MemberRoles);
  const latestMembersCount = await memberRoles.membersLength(Role.Member);

  // Load storage, only get the new members
  const existingMembers = await storage.get(`members[${Role.Member}]`);
  const existingMembersCount = existingMembers?.length || 0;

  if (latestMembersCount <= existingMembersCount) {
    return;
  }

  // Get only the new members indexes
  // const newMemberIndexes = Array.from(
  //   { length: latestMembersCount - existingMembersCount },
  //   (_, i) => i + existingMembersCount,
  // );
  const newMemberIndexes = Array.from({ length: 150 }).map((_, i) => i);

  const contractClasses = await Promise.all([tokenControllerMembers()]);

  try {
    await processNewMembers(memberRoles, contractClasses, newMemberIndexes);
  } finally {
    // save / capture progress if success or error
    console.log('SAVING progress **********************');
    await Promise.all([storage.save(), ...contractClasses.map(contract => contract.save())]);
  }

  const newStorage = await storage.get();
  console.debug('memberroles newStorage: ', require('util').inspect(newStorage, { depth: null }));
};

// TODO:
// 3. how to pick up from where we left off?
// 4. how to make it robust and fix any discrepancies?
//

const processNewMembers = async (memberRoles, contractClasses, newMemberIndexes) => {
  const membersSemaphore = new Sema(100, { capacity: newMemberIndexes.length });

  const newMemberPromises = newMemberIndexes.map(async (memberIndex, i) => {
    await membersSemaphore.acquire();

    process.stdout.write(`\rmember ${i} of ${newMemberIndexes.length}`);
    const member = await processMemberIndex(memberRoles, contractClasses, memberIndex);

    // only update members array on success
    storage.data.members[Role.Member] = storage.data.members[Role.Member] || [];
    storage.data.members[Role.Member][memberIndex] = member;

    membersSemaphore.release();
  });

  return Promise.all(newMemberPromises);
};

// TODO: how to catch and capture progress on other contracts?

const processMemberIndex = async (memberRoles, contractClasses, memberIndex) => {
  const [member, active] = await memberRoles.memberAtIndex(Role.Member, memberIndex);
  await Promise.all(contractClasses.map(contract => contract.processMember(member)));
  return { member, active };
};

updateStorage().catch(e => console.log(e));

module.exports = { updateStorage, getStorage };
