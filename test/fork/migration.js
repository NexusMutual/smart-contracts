const { artifacts, accounts, web3 } = require('hardhat');
const { ether, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const fetch = require('node-fetch');
const Web3 = require('web3');

const { encode1 } = require('./external');
const { logEvents, hex } = require('../utils').helpers;

const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const NXMToken = artifacts.require('NXMToken');
const Governance = artifacts.require('Governance');
const PooledStaking = artifacts.require('PooledStaking');
const TokenFunctions = artifacts.require('TokenFunctions');
const ClaimsReward = artifacts.require('ClaimsReward');
const ProposalCategory = artifacts.require('ProposalCategory');
const TokenData = artifacts.require('TokenData');
const Quotation = artifacts.require('Quotation');
const TokenController = artifacts.require('TokenController');
const UpgradeabilityProxy = artifacts.require('UpgradeabilityProxy');

const { BN } = web3.utils;
const directWeb3 = new Web3(process.env.TEST_ENV_FORK);

const newContractAddressUpgradeCategoryId = 29;
const newProxyContractAddressUpgradeCategoryId = 5;
const addNewInternalContractCategoryId = 34;
const VALID_DAYS = 250;

function getWeb3Contract (name, versionData, web3) {
  const contractData = versionData.mainnet.abis.filter(abi => abi.code === name)[0];
  const contract = new web3.eth.Contract(JSON.parse(contractData.contractAbi), contractData.address);
  console.log(`Loaded contract ${name} at address ${contractData.address}`);
  return contract;
}

async function getMemberStakes (member, td) {

  const stakedContractLength = await td.methods.getStakerStakedContractLength(member).call();
  const stakes = [];

  for (let i = 0; i < stakedContractLength; i++) {
    const stake = await td.methods.stakerStakedContracts(member, i).call();
    console.log(stake);
    const { dateAdd, stakeAmount: initialStake, stakedContractAddress: contractAddress, burnedAmount } = stake;
    stakes.push({
      dateAdd: new BN(dateAdd),
      initialStake: new BN(initialStake),
      contractAddress,
      burnedAmount: new BN(burnedAmount),
    });
  }

  return stakes;
}

async function submitGovernanceProposal (categoryId, actionHash, members, gv, submitter) {

  const proposalId = await gv.getProposalLength();

  console.log(`Creating proposal ${proposalId}..`);
  const proposalTitle = 'proposal';
  const proposalSD = 'proposal';
  const proposalDescHash = 'proposal';
  const incentive = 0;
  const solutionHash = 'proposal';
  await gv.createProposal(proposalTitle, proposalSD, proposalDescHash, 0, { from: submitter });

  console.log(`Categorizing proposal ${proposalId}..`);
  await gv.categorizeProposal(proposalId, categoryId, incentive, { from: submitter });

  console.log(`Submitting proposal ${proposalId}..`);
  await gv.submitProposalWithSolution(proposalId, 'proposal', actionHash, { from: submitter });

  // console.log(`createProposalwithSolution`);
  //  await gv.createProposalwithSolution(
  //   proposalTitle,
  //   proposalSD,
  //   proposalDescHash,
  //   categoryId,
  //   solutionHash,
  //   actionHash, {
  //     from: submitter
  //    });

  for (let i = 0; i < members.length; i++) {
    console.log(`Voting from ${members[i]} for ${proposalId}..`);
    try {
      logEvents(await gv.submitVote(proposalId, 1, { from: members[i] }));
    } catch (e) {
      console.error(`Failed to submitVote for member ${i} with address ${members[i]}`);
      throw e;
    }
  }

  const increase = 604800;
  console.log(`Advancing time by ${increase} seconds to allow proposal closing..`);
  await time.increase(increase);

  console.log(`Closing proposal..`);
  logEvents(await gv.closeProposal(proposalId, { from: submitter }));

  const proposal = await gv.proposal(proposalId);
  assert.equal(proposal[2].toNumber(), 3);
}

describe.skip('migration', function () {

  it('upgrades old system', async function () {

    const { data: versionData } = await fetch('https://api.nexusmutual.io/version-data/data.json').then(r => r.json());
    const [{ address: masterAddress }] = versionData.mainnet.abis.filter(({ code }) => code === 'NXMASTER');
    const master = await NXMaster.at(masterAddress);

    const { contractsName, contractsAddress } = await master.getVersionData();
    console.log(contractsName, contractsAddress);

    const nameToAddressMap = {
      NXMTOKEN: await master.dAppToken(),
    };

    for (let i = 0; i < contractsName.length; i++) {
      nameToAddressMap[web3.utils.toAscii(contractsName[i])] = contractsAddress[i];
    }

    const mr = await MemberRoles.at(nameToAddressMap['MR']);
    const tk = await NXMToken.at(nameToAddressMap['NXMTOKEN']);
    const gv = await Governance.at(nameToAddressMap['GV']);
    const pc = await ProposalCategory.at(nameToAddressMap['PC']);
    const td = await TokenData.at(nameToAddressMap['TD']);

    const directMR = getWeb3Contract('MR', versionData, directWeb3);
    const directTD = getWeb3Contract('TD', versionData, directWeb3);
    const directTF = getWeb3Contract('TF', versionData, directWeb3);
    const directTK = getWeb3Contract('NXMTOKEN', versionData, directWeb3);

    const owners = await mr.members('3');
    const firstBoardMember = owners.memberArray[0];

    const members = await mr.members('1');
    const boardMembers = members.memberArray;
    const secondBoardMember = boardMembers[1];

    assert.equal(boardMembers.length, 5);
    console.log('Board members:', boardMembers);

    const [funder] = accounts;

    for (const member of boardMembers) {
      console.log(`Topping up ${member}`);
      await web3.eth.sendTransaction({ from: funder, to: member, value: ether('100') });
    }

    console.log(`Deploying new TokenFunctions..`);
    const newTF = await TokenFunctions.new({ from: firstBoardMember });

    console.log(`Deploying new ClaimsReward..`);
    const newCR = await ClaimsReward.new({ from: firstBoardMember });

    console.log(`Deploying new Quotation..`);
    const newQT = await Quotation.new({ from: firstBoardMember });

    const upgradeMultipleContractsActionHash = encode1(
      ['bytes2[]', 'address[]'],
      [[hex('TF'), hex('CR'), hex('QT')], [newTF.address, newCR.address, newQT.address]],
    );

    await submitGovernanceProposal(
      newContractAddressUpgradeCategoryId, upgradeMultipleContractsActionHash, boardMembers, gv, secondBoardMember,
    );

    const storedTFAddress = await master.getLatestAddress(hex('TF'));
    const storedCRAddress = await master.getLatestAddress(hex('CR'));
    const storedQTAddress = await master.getLatestAddress(hex('QT'));

    assert.equal(storedTFAddress, newTF.address);
    assert.equal(storedCRAddress, newCR.address);
    assert.equal(storedQTAddress, newQT.address);

    console.log(`Successfully submitted proposal for ClaimsReward and TokenFunctions upgrade and passed.`);

    const newMR = await MemberRoles.new({ from: firstBoardMember });

    const newTC = await TokenController.new({ from: firstBoardMember });

    const upgradeMultipleImplementationsActionHash = encode1(
      ['bytes2[]', 'address[]'],
      [[hex('MR'), hex('TC')], [newMR.address, newTC.address]],
    );

    await submitGovernanceProposal(
      newProxyContractAddressUpgradeCategoryId,
      upgradeMultipleImplementationsActionHash, boardMembers, gv, secondBoardMember,
    );

    const mrProxy = await UpgradeabilityProxy.at(await master.getLatestAddress(hex('MR')));
    const storedNewMRAddress = await mrProxy.implementation();
    assert.equal(storedNewMRAddress, newMR.address);

    const tcProxy = await UpgradeabilityProxy.at(await master.getLatestAddress(hex('TC')));
    const storedNewTCAddress = await tcProxy.implementation();
    assert.equal(storedNewTCAddress, newTC.address);

    console.log(`Successfully deployed new MR.`);

    this.master = master;
    this.cr = newCR;
    this.tf = newTF;
    this.mr = mr;
    this.gv = gv;
    this.tk = tk;
    this.pc = pc;
    this.td = td;
    this.tc = await TokenController.at(await master.getLatestAddress(hex('TC')));
    this.directMR = directMR;
    this.directTD = directTD;
    this.directTF = directTF;
    this.directTK = directTK;

    this.boardMembers = boardMembers;
    this.firstBoardMember = firstBoardMember;
  });

  it('migrates all data from old pooled staking system to new one', async function () {

    const { gv, master, directMR, directTF, directTD, directTK, tf, td, tk, tc, cr } = this;
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

    const { memberArray: allMembers } = await directMR.methods.members('2').call();
    console.log(`Members to process: ${allMembers.length}`);

    const memberSet = new Set(allMembers);
    console.log(`Member set size: ${memberSet.size}`);

    const lockedBeforeMigration = {};
    const memberStakes = {};

    console.log(`Fetching getStakerAllLockedTokens and member stakes for each member for assertions.`);

    let totalMemberBalancesPreMigration = new BN('0');

    console.log('Advancing start index..');
    // await ps.setMigrateStakersStartIndex(800);

    for (let i = 0; i < allMembers.length; i++) {
      const member = allMembers[i];
      lockedBeforeMigration[member] = await directTF.methods.getStakerAllLockedTokens(member).call();
      console.log(`Loading per-contract staking expected amounts for ${member}`);
      memberStakes[member] = await getMemberStakes(member, directTD);
      const balance = await directTK.methods.balanceOf(member).call();
      totalMemberBalancesPreMigration = totalMemberBalancesPreMigration.add(new BN(balance));
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

    const tcBalancePreMigration = await tk.balanceOf(tc.address);
    console.log(`TokenController balance pre-migration: ${tcBalancePreMigration.toString()}`);
    const crBalancePreMigration = await tk.balanceOf(cr.address);
    console.log(`ClaimRewards balance pre-migration: ${crBalancePreMigration.toString()}`);

    while (!completed) {
      const iterations = 10;
      console.log(`Running migrateStakers wih ${iterations}`);

      // const gasEstimate = await ps.migrateStakers.estimateGas(iterations);
      const gasEstimate = 6e6;
      console.log(`gasEstimate: ${gasEstimate}`);

      const tx = await ps.migrateStakers(iterations, { gas: gasEstimate });
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
              stakeLeft = daysLeft.mul(initialStake).muln(100000).divn(VALID_DAYS).divn(100000);
            }

            stakeLeft = stakeLeft.sub(burnedAmount);

            if (stakeLeft.ltn(0)) {
              stakeLeft = new BN('0');
            }

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
            assert.equal(
              contractStake.toString(),
              aggregatedStakes[stakedContract].toString(),
              `Failed to match stake value for contract ${stakedContract} for member ${migratedMember}`,
            );
          }

          // end if has stakes
        }

        // end for member events
      }

      // end while !completed
    }

    let totalMemberBalancesPostMigration = new BN('0');
    console.log(`Fetching member balances for ${allMembers.length} members..`);
    for (let i = 0; i < allMembers.length; i++) {
      const member = allMembers[i];
      const balance = await tk.balanceOf(member);
      totalMemberBalancesPostMigration = totalMemberBalancesPostMigration.add(balance);
    }
    console.log(`totalMemberBalancesPreMigration ${totalMemberBalancesPreMigration.toString()}`);
    console.log(`totalMemberBalancesPostMigration ${totalMemberBalancesPostMigration.toString()}`);

    console.log(`Checking total migrated Tokens to new PS.`);
    const totalStakedTokens = await tk.balanceOf(ps.address);
    console.log(`totalStakedTokens on new PooledStaking ${totalStakedTokens.toString()}`);

    const tcBalancePostMigration = await tk.balanceOf(tc.address);
    console.log(`TokenController balance pre-migration: ${tcBalancePreMigration.toString()}`);
    console.log(`TokenController balance post-migration: ${tcBalancePostMigration.toString()}`);
    const crBalancePostMigration = await tk.balanceOf(cr.address);
    console.log(`ClaimRewards balance pre-migration: ${crBalancePreMigration.toString()}`);
    console.log(`ClaimRewards balance post-migration: ${crBalancePostMigration.toString()}`);

    const membersBalanceDifference = totalMemberBalancesPostMigration.sub(totalMemberBalancesPreMigration);
    console.log(`membersBalanceDifference ${membersBalanceDifference.toString()}`);
    const tcBalanceDifference = tcBalancePreMigration.sub(tcBalancePostMigration);
    const crBalanceDifference = crBalancePreMigration.sub(crBalancePostMigration);
    console.log(`tcBalanceDifference ${tcBalanceDifference.toString()}`);
    console.log(`crBalanceDifference ${crBalanceDifference.toString()}`);

    const expected = membersBalanceDifference.add(totalStakedTokens);
    const actual = crBalanceDifference.add(tcBalanceDifference);

    assert.equal(actual.toString(), expected.toString());

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
