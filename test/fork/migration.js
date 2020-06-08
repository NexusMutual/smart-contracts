const axios = require('axios');
const Web3 = require('web3');
const { contract, accounts, defaultSender, web3 } = require('@openzeppelin/test-environment');
const { setupLoader } = require('@openzeppelin/contract-loader');
const { ether, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { encode } = require('./external');
const { logEvents, hex } = require('../utils/helpers');

const MemberRoles = contract.fromArtifact('MemberRoles');
const NXMaster = contract.fromArtifact('NXMaster');
const NXMasterNew = contract.fromArtifact('NXMasterNew');
const NXMToken = contract.fromArtifact('NXMToken');
const Governance = contract.fromArtifact('Governance');
const PooledStaking = contract.fromArtifact('PooledStaking');
const TokenFunctions = contract.fromArtifact('TokenFunctions');
const ClaimsReward = contract.fromArtifact('ClaimsReward');
const ProposalCategory = contract.fromArtifact('ProposalCategory');
const TokenData = contract.fromArtifact('TokenData');
const OwnedUpgradeabilityProxy = contract.fromArtifact('OwnedUpgradeabilityProxy');

function getWeb3Contract (name, versionData, web3) {
  const contractData = versionData.mainnet.abis.filter(abi => abi.code === name)[0];
  const contract = new web3.eth.Contract(JSON.parse(contractData.contractAbi), contractData.address);
  console.log(`Loaded contract ${name} at address ${contractData.address}`);
  return contract;
}

function getContractData (name, versionData) {
  return versionData.mainnet.abis.filter(abi => abi.code === name)[0];
}

async function submitGovernanceProposal (categoryId, actionHash, members, gv, memberType, submitter) {
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
    await logEvents(gv.submitVote(p, 1, {
      from: members[i],
    }));
  }

  const increase = 604800;
  console.log(`Advancing time by ${increase} seconds to allow proposal closing..`);
  await time.increase(increase);

  if (memberType !== 3) {
    console.log(`Closing proposal..`);
    await logEvents(gv.closeProposal(p, {
      from: submitter,
    }));
  }
  const proposal = await gv.proposal(p);
  console.log(`Proposal is:`);
  console.log(proposal);
  assert.equal(proposal[2].toNumber(), 3);
}

async function addProposal(master, gv, members, submitter) {
  console.log(`submitting addCategoryProposal.`)
  actionHash = encode(
    'addCategory(string,uint,uint,uint,uint[],uint,string,address,bytes2,uint[])',
    'Description',
    2,
    1,
    0,
    [1],
    604800,
    '',
    master.address,
    hex('MS'),
    [0, 0, 0, 0]
  );
  const p = await gv.getProposalLength();
  await gv.createProposalwithSolution(
    'category to add internal contracts',
    'category to add internal contracts',
    'category to add internal contracts',
    3,
    'category to add internal contracts',
    actionHash, {
      from: submitter
    });

  for (let i = 1; i < members.length; i++) {
    console.log(`Voting from ${members[i]} for ${p}..`);
    await logEvents(gv.submitVote(p, 1, {
      from: members[i],
    }));
  }

  await logEvents(gv.closeProposal(p.toNumber(), {
    from: submitter
  }));

  const proposal = await gv.proposal(p);
  console.log(`Proposal is:`);
  console.log(proposal);
  assert.equal(proposal[2].toNumber(), 3);
}

const directWeb3 = new Web3(process.env.TEST_ENV_FORK);

const oldMasterAddressChangeCategoryId = 27;
const newContractAddressUpgradeCategoryId = 29;

const loader = setupLoader({
  provider: web3.eth.currentProvider,
  defaultSender,
  defaultGas: 7 * 1e6, // 7 million
  defaultGasPrice: 5e9, // 5 gwei
}).truffle;

describe('migration', function () {

  const [owner] = accounts;

  it('upgrades old system', async function () {

    const { data: versionData } = await axios.get('https://api.nexusmutual.io/version-data/data.json');

    const oldMaster = await NXMaster.at(getContractData('NXMASTER', versionData).address);

    const { contractsName, contractsAddress } = await oldMaster.getVersionData();
    console.log(contractsName);
    console.log(contractsAddress);
    const nameToAddressMap = {}
    for (let i = 0; i < contractsName.length; i++) {
      nameToAddressMap[web3.utils.toAscii(contractsName[i])] = contractsAddress[i];
    }
    nameToAddressMap['NXMTOKEN'] = await oldMaster.dAppToken();

    const mr = await MemberRoles.at(nameToAddressMap['MR']);
    const tk = await NXMToken.at(nameToAddressMap['NXMTOKEN']);
    const gv = await Governance.at(nameToAddressMap['GV']);
    const pc = await ProposalCategory.at(nameToAddressMap['PC']);
    const tf = await TokenFunctions.at(nameToAddressMap['TF']);
    const td = await TokenData.at(nameToAddressMap['TD']);

    const directMR = getWeb3Contract('MR', versionData, directWeb3);

    const owners = await directMR.methods.members('3').call();

    const firstBoardMember = owners.memberArray[0];

    const ownerStakedContractCount = await td.getStakerStakedContractLength(firstBoardMember);
    console.log(`Owner ${firstBoardMember} has stakes on  ${ownerStakedContractCount} contracts`);

    const members = await directMR.methods.members('1').call();
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

    console.log(`Deploying new master..`);

    let newMaster = await NXMasterNew.new({
      from: firstBoardMember,
    });
    const masterOwner = await newMaster.owner();
    console.log(`Deployed new master at: ${newMaster.address} with owner: ${masterOwner}`);

    newMaster = await OwnedUpgradeabilityProxy.new(newMaster.address, {
      from: firstBoardMember
    });
    let masterProxy = newMaster;
    newMaster = await NXMasterNew.at(newMaster.address);
    await newMaster.initiateMaster(tk.address, {
      from: firstBoardMember
    });

    const oldVersionData = (await oldMaster.getVersionData())[1];
    console.log(`Initializing master with addNewVersion`);
    console.log(oldVersionData);
    await newMaster.addNewVersion(oldVersionData, {
      from: firstBoardMember,
    });


    await masterProxy.transferProxyOwnership(gv.address, {
      from: firstBoardMember
    });

    const action = 'updateAddressParameters(bytes8,address)';
    const code = hex('MASTADD');
    const proposedValue = newMaster.address;

    let actionHash = encode(action, code, proposedValue);

    await submitGovernanceProposal(oldMasterAddressChangeCategoryId, actionHash, boardMembers, gv, '1', firstBoardMember);
    console.log(`Successfully submitted proposal and passed.`);

    const newMasterGovernanceAddress = await gv.nxMasterAddress();
    assert.equal(newMaster.address, newMasterGovernanceAddress);


    await addProposal(newMaster, gv, boardMembers, firstBoardMember);

    console.log(`Deploying new TokenFunctions..`);
    const newTF = await TokenFunctions.new({
      from: firstBoardMember,
    });

    console.log(`Deploying new ClaimsReward..`);
    const newCR = await ClaimsReward.new({
      from: firstBoardMember,
    });

    actionHash = encode(
      'upgradeMultipleContracts(bytes2[],address[])',
      [hex('TF'), hex('CR')],
      [newTF.address, newCR.address]
    );

    await submitGovernanceProposal(newContractAddressUpgradeCategoryId, actionHash, boardMembers, gv, '1', secondBoardMember);

    const storedTFAddress = await newMaster.getLatestAddress(hex('TF'));
    assert.equal(storedTFAddress, newTF.address);
    const storedCRAddress = await newMaster.getLatestAddress(hex('CR'));
    assert.equal(storedCRAddress, newCR.address);
    console.log(`Successfully submitted proposal for ClaimsReward and TokenFunctions upgrade and passed.`);

    this.master = newMaster;
    this.cr = newCR;
    this.tf = newTF;
    this.mr = mr;
    this.gv = gv;
    this.tk = tk;
    this.pc = pc;
    this.directMR = directMR;

    this.boardMembers = boardMembers;
    this.firstBoardMember = firstBoardMember;
  });

  it('migrates all data from old pooled staking system to new one', async function () {
    const { pc, gv, master, mr, tf, directMR } = this;
    const { boardMembers, firstBoardMember } = this;

    console.log(`Deploying pooled staking..`);
    const ps = await PooledStaking.new({
      from: firstBoardMember,
    });

    console.log(`Deployed pool staking at ${ps.address}`);

    // Creating proposal for adding new internal contract
    actionHash = encode(
      'addNewInternalContract(bytes2,address,uint)',
      'PS',
      ps.address,
      1
    );

    const categoryCount = await pc.totalCategories();
    const addNewInternalContractCategoryId = categoryCount - 1;
    console.log(`addNewInternalContractCategoryId ${addNewInternalContractCategoryId}`);
    await submitGovernanceProposal(
      addNewInternalContractCategoryId,
      actionHash,
      boardMembers,
      gv,
      '1',
      firstBoardMember
    );

    const postNewContractVersionData = await master.getVersionData();
    console.log(postNewContractVersionData);

    // const psMaster = await ps.master();
    // assert.equal(psMaster, master.address);

    const currentPooledStakingAddress = await master.getLatestAddress(hex('PS'));
    assert.equal(currentPooledStakingAddress, ps.address);
    const pooledStakingIsInternal = await master.isInternal(ps.address);
    assert.equal(pooledStakingIsInternal, true);

    const members = await directMR.methods.members('2').call();
    const allMembers = members.memberArray;

    console.log(`Members to process: ${allMembers.length}`);

    for (let i = 0; i < allMembers.length; i++) {
      const member = allMembers[i];
      console.log(`Migrating member: ${member}`);

      const lockedBeforeMigration = await tf.getStakerAllLockedTokens(member);
      if (lockedBeforeMigration.toString() === '0') {
        console.log(`Skipping member: ${member}. He has no staker locked tokens.`);
        continue;
      }
      await logEvents(ps.migrateStaker(member));

      if (member !== firstBoardMember) {
        const lockedPostMigration = await tf.getStakerAllLockedTokens(member);
        assert.equal(lockedPostMigration.toString(), '0');
        const postMigrationStake = await ps.stakerStake(member);
        assert.equal(lockedBeforeMigration.toString(), postMigrationStake.toString());
      }
    }
  });
});
