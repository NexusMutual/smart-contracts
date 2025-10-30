const { ethers, network } = require('hardhat');
const { expect } = require('chai');

const evm = require('./evm')();

const {
  Address: { ETH },
  UserAddress,
} = require('./utils');
const { ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const { formatBytes32String } = ethers.utils;

const { NXM_WHALE_1, NXM_WHALE_2 } = UserAddress;

const { parseEther, defaultAbiCoder, toUtf8Bytes } = ethers.utils;

const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

const ASSET_V1_TO_ASSET_V2 = {};
ASSET_V1_TO_ASSET_V2[ETH.toLowerCase()] = 0;
ASSET_V1_TO_ASSET_V2[DAI_ADDRESS.toLowerCase()] = 1;

const V2Addresses = {
  SwapOperator: '0xcafea536d7f79F31Fa49bC40349f6a5F7E19D842',
  PriceFeedOracle: '0xcafeaf0a0672360941B7F0b6D015797292e842C6',
  Pool: '0xcafea112Db32436c2390F5EC988f3aDB96870627',
  NXMaster: '0xcafea0047591B979c714A63283B8f902554deB66',
  ProductsV1: '0xcafeab02966FdC69Ce5aFDD532DD51466892E32B',
  CoverNFTDescriptor: '0xcafead1E31Ac8e4924Fc867c2C54FAB037458cb9',
  CoverNFT: '0xcafeaCa76be547F14D0220482667B42D8E7Bc3eb',
  StakingPoolFactory: '0xcafeafb97BF8831D95C0FC659b8eB3946B101CB3',
  StakingNFTDescriptor: '0xcafea534e156a41b3e77f29Bf93C653004f1455C',
  StakingNFT: '0xcafea508a477D94c502c253A58239fb8F948e97f',
  StakingPool: '0xcafeacf62FB96fa1243618c4727Edf7E04D1D4Ca',
  CoverImpl: '0xcafeaCbabeEd884AE94046d87C8aAB120958B8a6',
  StakingProductsImpl: '0xcafea524e89514e131eE9F8462536793d49d8738',
  IndividualClaimsImpl: '0xcafeaC308bC9B49d6686897270735b4Dc11Fa1Cf',
  YieldTokenIncidentsImpl: '0xcafea7F77b63E995aE864dA9F36c8012666F8Fa4',
  AssessmentImpl: '0xcafea40dE114C67925BeB6e8f0F0e2ee4a25Dd88',
  LegacyClaimsReward: '0xcafeaDcAcAA2CD81b3c54833D6896596d218BFaB',
  TokenController: '0xcafea53357c11b3967A8C7167Fb4973C75063DbB',
  MCR: '0xcafea444db21dc06f34570185cF0014701c7D62e',
  MemberRoles: '0xcafea22Faff6aEc1d1bfc146b2e2EABC73Fa7Acc',
  LegacyPooledStaking: '0xcafea16366682a6c0083c38b2a731BC223c53D27',
  CoverMigrator: '0xcafeac41b010299A9bec5308CCe6aFC2c4DF8D39',
  LegacyGateway: '0xcafeaD694A05815f03F19c357200c6D95968e205',
  Governance: '0xcafeafA258Be9aCb7C0De989be21A8e9583FBA65',
  CoverViewer: '0xcafea84e199C85E44F34CD75374188D33FB94B4b',
  StakingViewer: '0xcafea2B7904eE0089206ab7084bCaFB8D476BD04',
};

const NXM_TOKEN_ADDRESS = '0xd7c49CEE7E9188cCa6AD8FF264C1DA2e69D4Cf3B';

const getSigner = async address => {
  const provider =
    network.name !== 'hardhat' // ethers errors out when using non-local accounts
      ? new ethers.providers.JsonRpcProvider(network.config.url)
      : ethers.provider;
  return provider.getSigner(address);
};
async function submitGovernanceProposal(categoryId, actionData, signers, gv) {
  const id = await gv.getProposalLength();

  console.log(`Proposal ${id}`);

  await gv.connect(signers[0]).createProposal('', '', '', 0);
  await gv.connect(signers[0]).categorizeProposal(id, categoryId, 0);
  await gv.connect(signers[0]).submitProposalWithSolution(id, '', actionData);

  for (let i = 0; i < signers.length; i++) {
    await gv.connect(signers[i]).submitVote(id, 1);
  }

  const tx = await gv.closeProposal(id, { gasLimit: 21e6 });
  const receipt = await tx.wait();

  assert.equal(
    receipt.events.some(x => x.event === 'ActionSuccess' && x.address === gv.address),
    true,
    'ActionSuccess was expected',
  );

  const proposal = await gv.proposal(id);
  assert.equal(proposal[2].toNumber(), 3, 'Proposal Status != ACCEPTED');
}

describe('prevent switch or withdraw membership when tokens are locked', function () {
  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);

    // Get or revert snapshot if network is tenderly
    if (network.name === 'tenderly') {
      const { TENDERLY_SNAPSHOT_ID } = process.env;
      if (TENDERLY_SNAPSHOT_ID) {
        await evm.revert(TENDERLY_SNAPSHOT_ID);
        console.log(`Reverted to snapshot ${TENDERLY_SNAPSHOT_ID}`);
      } else {
        console.log('Snapshot ID: ', await evm.snapshot());
      }
    }
  });

  it('load contracts', async function () {
    this.master = await ethers.getContractAt('NXMaster', '0x01BFd82675DBCc7762C84019cA518e701C0cD07e');
    this.gateway = await ethers.getContractAt('LegacyGateway', '0x089Ab1536D032F54DFbC194Ba47529a4351af1B5');
    this.quotationData = await ethers.getContractAt(
      'LegacyQuotationData',
      '0x1776651F58a17a50098d31ba3C3cD259C1903f7A',
    );
    this.individualClaims = await ethers.getContractAt(
      'IndividualClaims',
      await this.master.getLatestAddress(toUtf8Bytes('CI')),
    );
    this.coverMigrator = await ethers.getContractAt(
      'CoverMigrator',
      await this.master.getLatestAddress(toUtf8Bytes('CL')),
    );
    this.coverViewer = await ethers.getContractAt('CoverViewer', V2Addresses.CoverViewer);
    this.assessment = await ethers.getContractAt('Assessment', await this.master.getLatestAddress(toUtf8Bytes('AS')));
    this.dai = await ethers.getContractAt('ERC20Mock', DAI_ADDRESS);
    this.cover = await ethers.getContractAt('Cover', await this.master.getLatestAddress(toUtf8Bytes('CO')));
    this.memberRoles = await ethers.getContractAt('MemberRoles', await this.master.getLatestAddress(toUtf8Bytes('MR')));
    this.governance = await ethers.getContractAt('Governance', await this.master.getLatestAddress(toUtf8Bytes('GV')));
    this.tokenController = await ethers.getContractAt(
      'TokenController',
      await this.master.getLatestAddress(toUtf8Bytes('TC')),
    );
    this.legacyPooledStaking = await ethers.getContractAt(
      'LegacyPooledStaking',
      await this.master.getLatestAddress(toUtf8Bytes('PS')),
    );
    this.assessment = await ethers.getContractAt('Assessment', await this.master.getLatestAddress(toUtf8Bytes('AS')));
    this.nxmToken = await ethers.getContractAt('NXMToken', NXM_TOKEN_ADDRESS);
  });

  it('Impersonate AB members', async function () {
    const { memberArray: abMembers } = await this.memberRoles.members(1);
    this.abMembers = [];
    for (const address of abMembers) {
      await evm.impersonate(address);
      await evm.setBalance(address, parseEther('1000'));
      this.abMembers.push(await getSigner(address));
    }
  });

  it('upgrades MemberRoles', async function () {
    const codes = ['MR'].map(code => toUtf8Bytes(code));

    const memberRolesImpl = await ethers.deployContract('MemberRoles', [NXM_TOKEN_ADDRESS]);

    const addresses = [memberRolesImpl].map(c => c.address);

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [codes, addresses]),
      this.abMembers,
      this.governance,
    );
  });

  it('should revert when a member with locked tokens switches or withdraws membership', async function () {
    const address = NXM_WHALE_1;
    await evm.impersonate(address);
    await evm.setBalance(address, parseEther('1000'));
    const signer = await getSigner(address);

    const pendingRewards = await this.tokenController.getPendingRewards(address);

    expect(pendingRewards).to.be.greaterThan('0');
    await expect(this.memberRoles.connect(signer).withdrawMembership()).to.be.revertedWith('TC pendingRewards != 0');

    const newAddress = '0x63E3fa77780B21ab89E036C660770Ec4134f13D0';
    await expect(this.memberRoles.connect(signer).switchMembership(newAddress)).to.be.revertedWith(
      'TC pendingRewards != 0',
    );
  });

  it('should not revert when a member has no tokens locked', async function () {
    const address = NXM_WHALE_2;

    expect(await this.legacyPooledStaking.stakerDeposit(address)).to.be.equal(0);
    expect(await this.legacyPooledStaking.stakerReward(address)).to.be.equal(0);

    expect(await this.tokenController.tokensLocked(address, formatBytes32String('CLA'))).to.be.equal(0);
    const { withdrawableAmount } = await this.tokenController.getWithdrawableCoverNotes(address);
    expect(withdrawableAmount).to.be.equal('0');

    expect(await this.tokenController.getPendingRewards(address)).to.be.equal('0');

    const { amount: stakeAmount } = await this.assessment.stakeOf(address);
    expect(stakeAmount).to.be.equal(0);

    await evm.impersonate(address);
    await evm.setBalance(address, parseEther('1000'));
    const signer = await getSigner(address);
    await this.memberRoles.connect(signer).withdrawMembership();
  });
});
