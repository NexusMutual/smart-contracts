const axios = require('axios');
const Web3 = require('web3');
const { contract, accounts, web3 } = require('@openzeppelin/test-environment');
const { ether, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { encode1 } = require('./external');
const { logEvents, hex } = require('../utils/helpers');

const MemberRoles = contract.fromArtifact('MemberRoles');
const NXMaster = contract.fromArtifact('NXMaster');
const NXMToken = contract.fromArtifact('NXMToken');
const Governance = contract.fromArtifact('Governance');
const PooledStaking = contract.fromArtifact('PooledStaking');
const TokenFunctions = contract.fromArtifact('TokenFunctions');
const ClaimsReward = contract.fromArtifact('ClaimsReward');
const ProposalCategory = contract.fromArtifact('ProposalCategory');
const TokenData = contract.fromArtifact('TokenData');
const UpgradeabilityProxy = contract.fromArtifact('UpgradeabilityProxy');

const BN = web3.utils.BN;

function getWeb3Contract (name, versionData, web3) {
  const contractData = versionData.mainnet.abis.filter(abi => abi.code === name)[0];
  const contract = new web3.eth.Contract(JSON.parse(contractData.contractAbi), contractData.address);
  console.log(`Loaded contract ${name} at address ${contractData.address}`);
  return contract;
}

function getContractData (name, versionData) {
  return versionData.mainnet.abis.filter(abi => abi.code === name)[0];
}

async function getMemberStakes (member, td) {
  const stakedContractLength = await td.methods.getStakerStakedContractLength(member).call();
  const stakes = [];
  for (let i = 0; i < stakedContractLength; i++) {
    const stake = await td.methods.stakerStakedContracts(member, i).call();
    console.log(stake);
    const { dateAdd, stakeAmount: initialStake, stakedContractAddress: contractAddress, burnedAmount } = stake;
    stakes.push({ dateAdd: new BN(dateAdd), initialStake: new BN(initialStake), contractAddress, burnedAmount: new BN(burnedAmount) });
  }

  return stakes;
}

async function submitGovernanceProposal (categoryId, actionHash, members, gv, submitter) {
  const p = await gv.getProposalLength();
  console.log(`Creating proposal ${p}..`);
  await gv.createProposal('proposal', 'proposal', 'proposal', 0, {
    from: submitter,
  });
  console.log(`Categorizing proposal ${p}..`);
  await gv.categorizeProposal(p, categoryId, 0, {
    from: submitter,
  });

  console.log(`Submitting proposal ${p}..`);
  await gv.submitProposalWithSolution(p, 'proposal', actionHash, {
    from: submitter,
  });
  for (let i = 1; i < members.length; i++) {
    console.log(`Voting from ${members[i]} for ${p}..`);
    logEvents(await gv.submitVote(p, 1, {
      from: members[i],
    }));
  }

  const increase = 604800;
  console.log(`Advancing time by ${increase} seconds to allow proposal closing..`);
  await time.increase(increase);

  console.log(`Closing proposal..`);
  logEvents(await gv.closeProposal(p, {
    from: submitter,
  }));

  const proposal = await gv.proposal(p);
  assert.equal(proposal[2].toNumber(), 3);
}

const directWeb3 = new Web3(process.env.TEST_ENV_FORK);

const newContractAddressUpgradeCategoryId = 29;
const newProxyContractAddressUpgradeCategoryId = 5;
const addNewInternalContractCategoryId = 34;

const VALID_DAYS = 250;

describe('migration', function () {
  const [owner] = accounts;

  it('upgrades old system', async function () {

    const { data: versionData } = await axios.get('https://api.nexusmutual.io/version-data/data.json');

    const master = await NXMaster.at(getContractData('NXMASTER', versionData).address);

    const { contractsName, contractsAddress } = await master.getVersionData();
    console.log(contractsName);
    console.log(contractsAddress);
    const nameToAddressMap = {};
    for (let i = 0; i < contractsName.length; i++) {
      nameToAddressMap[web3.utils.toAscii(contractsName[i])] = contractsAddress[i];
    }
    nameToAddressMap['NXMTOKEN'] = await master.dAppToken();

    const mr = await MemberRoles.at(nameToAddressMap['MR']);
    const tk = await NXMToken.at(nameToAddressMap['NXMTOKEN']);
    const gv = await Governance.at(nameToAddressMap['GV']);
    const pc = await ProposalCategory.at(nameToAddressMap['PC']);
    const tf = await TokenFunctions.at(nameToAddressMap['TF']);
    const td = await TokenData.at(nameToAddressMap['TD']);

    const directMR = getWeb3Contract('MR', versionData, directWeb3);
    const directTD = getWeb3Contract('TD', versionData, directWeb3);
    const directTF = getWeb3Contract('TF', versionData, directWeb3);

    const owners = await mr.members('3');

    const firstBoardMember = owners.memberArray[0];

    const members = await mr.members('1');
    const boardMembers = members.memberArray;

    const secondBoardMember = boardMembers[1];
    console.log('Board members:', boardMembers);

    const topUp = ether('100');
    for (const member of boardMembers) {
      console.log(`Topping up ${member}`);
      await web3.eth.sendTransaction({
        from: owner,
        to: member,
        value: topUp,
      });
    }

    assert.equal(boardMembers.length, 5);

    console.log(`Deploying new TokenFunctions..`);
    const newTF = await TokenFunctions.new({
      from: firstBoardMember,
    });

    console.log(`Deploying new ClaimsReward..`);
    const newCR = await ClaimsReward.new({
      from: firstBoardMember,
    });

    const upgradeMultipleContractsActionHash = encode1(
      ['bytes2[]', 'address[]'],
      [[hex('TF'), hex('CR')],
        [newTF.address, newCR.address]],
    );

    await submitGovernanceProposal(newContractAddressUpgradeCategoryId, upgradeMultipleContractsActionHash,
      boardMembers, gv, secondBoardMember);

    const storedTFAddress = await master.getLatestAddress(hex('TF'));
    assert.equal(storedTFAddress, newTF.address);
    const storedCRAddress = await master.getLatestAddress(hex('CR'));
    assert.equal(storedCRAddress, newCR.address);
    console.log(`Successfully submitted proposal for ClaimsReward and TokenFunctions upgrade and passed.`);

    const newMR = await MemberRoles.new({
      from: firstBoardMember,
    });

    const upgradeMultipleImplementationsActionHash = encode1(
      ['bytes2[]', 'address[]'],
      [[hex('MR')], [newMR.address]],
    );

    await submitGovernanceProposal(newProxyContractAddressUpgradeCategoryId,
      upgradeMultipleImplementationsActionHash, boardMembers, gv, secondBoardMember);

    const mrProxy = await UpgradeabilityProxy.at(await master.getLatestAddress(hex('MR')));
    const storedNewMRAddress = await mrProxy.implementation();
    assert.equal(storedNewMRAddress, newMR.address);

    console.log(`Successfully deployed new MR.`);

    this.master = master;
    this.cr = newCR;
    this.tf = newTF;
    this.mr = mr;
    this.gv = gv;
    this.tk = tk;
    this.pc = pc;
    this.td = td;
    this.directMR = directMR;
    this.directTD = directTD;
    this.directTF = directTF;

    this.boardMembers = boardMembers;
    this.firstBoardMember = firstBoardMember;
  });

  it('migrates all data from old pooled staking system to new one', async function () {
    const { gv, master, directMR, directTF, directTD, tf, td, tk, mr } = this;
    const { boardMembers, firstBoardMember } = this;

    console.log(`Deploying pooled staking..`);
    const psImpl = await PooledStaking.new({
      from: firstBoardMember,
    });

    console.log(`Deployed pool staking at ${psImpl.address}`);

    // Creating proposal for adding new internal contract
    const addNewInternalContractActionHash = encode1(
      ['bytes2', 'address', 'uint'],
      [hex('PS'), psImpl.address, 2],
    );

    await submitGovernanceProposal(
      addNewInternalContractCategoryId,
      addNewInternalContractActionHash,
      boardMembers,
      gv,
      firstBoardMember,
    );

    const postNewContractVersionData = await master.getVersionData();
    console.log(postNewContractVersionData);

    const psProxy = await master.getLatestAddress(hex('PS'));
    const ps = await PooledStaking.at(psProxy);
    assert.equal(await master.isInternal(ps.address), true);

    const members = await directMR.methods.members('2').call();
    const allMembers = members.memberArray;
    console.log(`Members to process: ${allMembers.length}`);

    const memberSet = new Set(allMembers);

    console.log(`Member set size: ${memberSet.size}`);

    const lockedBeforeMigration = {};

    const memberStakes = {};

    console.log(`Fetching getStakerAllLockedTokens and member stakes for each member for assertions.`);
    for (let i = 0; i < allMembers.length; i++) {
      const member = allMembers[i];
      lockedBeforeMigration[member] = await directTF.methods.getStakerAllLockedTokens(member).call();
      console.log(`Loading per-contract staking expected amounts for ${member}`);
      memberStakes[member] = await getMemberStakes(member, directTD);
    }

    console.log(`Finished fetching.`);

    const STAKER_MIGRATION_COMPLETED_EVENT = 'StakersMigrationCompleted';
    const MIGRATED_MEMBER_EVENT = 'MigratedMember';
    let totalGasUsage = 0;
    let completed = false;
    let maxGasUsagePerCall = 0;
    let totalCallCount = 0;

    const migratedMembersSet = new Set();
    const totalDeposits = {};

    while (!completed) {
      const iterations = 10;
      console.log(`Running migrateStakers wih ${iterations}`);
      // const gasEstimate = await ps.migrateStakers.estimateGas(iterations);
      const gasEstimate = 6e6;
      console.log(`gasEstimate: ${gasEstimate}`);

      const tx = await ps.migrateStakers(iterations, {
        gas: gasEstimate,
      });
      logEvents(tx);

      const now = await time.latest();

      const [stakerMigrationCompleted] = tx.logs.filter(log => log.event === STAKER_MIGRATION_COMPLETED_EVENT);
      completed = stakerMigrationCompleted.args.completed;
      console.log(`Processing migration completed: ${completed}`);
      totalCallCount++;
      const gasUsed = tx.receipt.gasUsed;
      totalGasUsage += gasUsed;
      if (maxGasUsagePerCall < gasUsed) {
        maxGasUsagePerCall = gasUsed;
      }
      console.log(`gasUsed ${gasUsed} | totalGasUsage ${totalGasUsage} | maxGasUsagePerCall ${maxGasUsagePerCall} | totalCallCount ${totalCallCount}`);

      const migratedMemberEvents = tx.logs.filter(log => log.event === MIGRATED_MEMBER_EVENT);
      for (const migratedMemberEvent of migratedMemberEvents) {
        const migratedMember = migratedMemberEvent.args.member;
        migratedMembersSet.add(migratedMember);
        console.log(`Finished migrating ${migratedMember}. Asserting migration values.`);

        const [lockedPostMigration, unlockable, commissionEarned, commissionReedmed] = await Promise.all([
          tf.deprecated_getStakerAllLockedTokens(migratedMember),
          tf.deprecated_getStakerAllUnlockableStakedTokens(migratedMember),
          td.getStakerTotalEarnedStakeCommission(migratedMember),
          td.getStakerTotalReedmedStakeCommission(migratedMember),
        ]);
        assert.equal(lockedPostMigration.toString(), '0', `Failed for ${migratedMember}`);
        assert.equal(unlockable.toString(), '0', `Failed for ${migratedMember}`);
        assert.equal(commissionEarned.toString(), commissionReedmed.toString(), `Failed for ${migratedMember}`);

        if (memberStakes[migratedMember] !== undefined) {
          console.log(`Asserting per contract stakes for member ${migratedMember}`);
          const stakesWithStakeLeft = memberStakes[migratedMember].map(({ dateAdd, initialStake, contractAddress, burnedAmount }) => {
            const daysPassed = now.sub(dateAdd).divn(86400);

            console.log(`daysPassed ${daysPassed.toString()}`);

            let stakeLeft = new BN('0');
            if (daysPassed.ltn(VALID_DAYS)) {

              const daysLeft = new BN(VALID_DAYS.toString()).sub(daysPassed);
              stakeLeft =
                daysLeft
                  .mul(initialStake)
                  .muln(100000)
                  .divn(VALID_DAYS)
                  .divn(100000);
            }
            stakeLeft = stakeLeft.sub(burnedAmount);
            if (stakeLeft.ltn(0)) {
              stakeLeft = new BN('0');
            }
            console.log(stakeLeft.toString());

            return { stakeLeft, dateAdd, initialStake, contractAddress };
          });

          const totalExpectedStake = stakesWithStakeLeft.reduce((a, b) => a.add(b.stakeLeft), new BN('0'));
          const postMigrationStake = await ps.stakerDeposit(migratedMember);
          totalDeposits[migratedMember] = postMigrationStake;
          assert.equal(postMigrationStake.toString(), totalExpectedStake.toString(), `Total stake doesn't match for ${migratedMember}`);

          const aggregatedStakes = {};
          for (const stake of stakesWithStakeLeft) {
            if (stake.stakeLeft.eqn(0)) {
              continue;
            }
            if (!aggregatedStakes[stake.contractAddress]) {
              aggregatedStakes[stake.contractAddress] = new BN('0');
            }
            aggregatedStakes[stake.contractAddress] = aggregatedStakes[stake.contractAddress].add(stake.stakeLeft);
          }

          const migratedContractsArray = await ps.stakerContractsArray(migratedMember);

          const expectedContracts = Object.keys(aggregatedStakes);
          expectedContracts.sort();
          migratedContractsArray.sort();
          assert.deepEqual(migratedContractsArray, expectedContracts, `Not same set of contracts ${migratedMember}`);

          for (const stakedContract of migratedContractsArray) {
            const contractStake = await ps.stakerContractStake(migratedMember, stakedContract);
            assert.equal(contractStake.toString(), aggregatedStakes[stakedContract].toString()
              , `Failed to match stake value for contract ${stakedContract} for member ${migratedMember}`);
          }
        }
      }
    }

    console.log(`Checking total migrated Tokens to new PS.`);
    const totalStakedTokens = await tk.balanceOf(ps.address);

    let totalDepositsSum = new BN('0');
    for (const totalDeposit of Object.values(totalDeposits)) {
      totalDepositsSum = totalDepositsSum.add(totalDeposit);
    }

    assert.equal(totalStakedTokens.toString(), totalDepositsSum.toString());

    console.log(`Asserting all initial members have been migrated..`);
    for (const member of memberSet) {
      assert(migratedMembersSet.has(member), `${member} not found in migratedMemberSet`);
    }
  });
});
