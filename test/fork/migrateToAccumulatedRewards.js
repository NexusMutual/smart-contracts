const axios = require('axios');
const { contract, accounts, web3 } = require('@openzeppelin/test-environment');
const { ether, expectRevert, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const BN = require('web3').utils.BN;

const { encode1 } = require('./external');
const { logEvents, hex } = require('../utils/helpers');

const MemberRoles = contract.fromArtifact('MemberRoles');
const NXMaster = contract.fromArtifact('NXMaster');
const NXMToken = contract.fromArtifact('NXMToken');
const Governance = contract.fromArtifact('Governance');
const PooledStaking = contract.fromArtifact('PooledStaking');
const TokenController = contract.fromArtifact('TokenController');
const UpgradeabilityProxy = contract.fromArtifact('UpgradeabilityProxy');

const upgradeProxyImplementationCategoryId = 5;
const newContractAddressUpgradeCategoryId = 29;
const addNewInternalContractCategoryId = 34;

async function submitGovernanceProposal (categoryId, actionHash, members, gv, submitter) {

  const proposalTitle = 'proposal';
  const proposalSD = 'proposal';
  const proposalDescHash = 'proposal';
  const incentive = 0;
  const proposalId = await gv.getProposalLength();
  console.log(`Creating proposal ${proposalId}`);

  await gv.createProposal(proposalTitle, proposalSD, proposalDescHash, 0, { from: submitter });
  await gv.categorizeProposal(proposalId, categoryId, incentive, { from: submitter });
  await gv.submitProposalWithSolution(proposalId, 'proposal', actionHash, { from: submitter });

  console.log(`Voting for proposal ${proposalId}`);

  for (let i = 0; i < members.length; i++) {
    await gv.submitVote(proposalId, 1, { from: members[i] });
  }

  console.log(`Closing proposal`);
  await time.increase(604800);
  logEvents(await gv.closeProposal(proposalId, { from: submitter }));

  const proposal = await gv.proposal(proposalId);
  assert.equal(proposal[2].toNumber(), 3);
}

describe('migration', function () {

  this.timeout(0);

  it('performs contract upgrades', async function () {

    const { data: versionData } = await axios.get('https://api.nexusmutual.io/version-data/data.json');
    const [{ address: masterAddress }] = versionData.mainnet.abis.filter(({ code }) => code === 'NXMASTER');

    const master = await NXMaster.at(masterAddress);
    const { contractsName, contractsAddress } = await master.getVersionData();

    const nameToAddressMap = {
      NXMTOKEN: await master.dAppToken(),
    };

    for (let i = 0; i < contractsName.length; i++) {
      nameToAddressMap[web3.utils.toAscii(contractsName[i])] = contractsAddress[i];
    }

    const mr = await MemberRoles.at(nameToAddressMap['MR']);
    const tk = await NXMToken.at(nameToAddressMap['NXMTOKEN']);
    const gv = await Governance.at(nameToAddressMap['GV']);

    const owners = await mr.members('3');
    const firstBoardMember = owners.memberArray[0];
    const secondBoardMember = owners.memberArray[1];

    const members = await mr.members('1');
    const boardMembers = members.memberArray;

    assert.equal(boardMembers.length, 5);
    console.log('Board members:', boardMembers);

    const [funder] = accounts;

    for (const member of boardMembers) {
      console.log(`Topping up ${member}`);
      await web3.eth.sendTransaction({ from: funder, to: member, value: ether('100') });
    }

    console.log(`Deploying new contracts`);
    const newPS = await PooledStaking.new();

    const txData = encode1(
      ['bytes2[]', 'address[]'],
      [[hex('PS')], [newPS.address]],
    );

    console.log(`Proposal tx data: ${txData}`);

    await submitGovernanceProposal(
      upgradeProxyImplementationCategoryId,
      txData, boardMembers, gv, firstBoardMember,
    );

    const psProxy = await UpgradeabilityProxy.at(await master.getLatestAddress(hex('PS')));
    const storedNewPSAddress = await psProxy.implementation();
    assert.equal(storedNewPSAddress, newPS.address);


    const newTF = await TokenFunctions.new();
    const upgradeMultipleContractsActionHash = encode1(
      ['bytes2[]', 'address[]'],
      [[hex('TF')], [newTF.address]],
    );

    await submitGovernanceProposal(
      newContractAddressUpgradeCategoryId, upgradeMultipleContractsActionHash, boardMembers, gv, secondBoardMember,
    );
    const storedTFAddress = await master.getLatestAddress(hex('TF'));

    assert.equal(storedTFAddress, newTF.address);

    console.log(`Successfully deployed new contracts`);

    this.firstBoardMember = firstBoardMember;
    this.secondBoardMember = secondBoardMember;
    this.master = master;
    this.tk = tk;
    this.tf = await TokenFunctions.at(await master.getLatestAddress(hex('TF')));
    this.ps = await PooledStaking.at(await master.getLatestAddress(hex('PS')));
  });

  it('stakes on a contract', async function () {

  });
});
