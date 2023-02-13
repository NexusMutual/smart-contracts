const fetch = require('node-fetch');
const { artifacts, web3, network: { provider } } = require('hardhat');
const { ether, time, expectRevert } = require('@openzeppelin/test-helpers');

const { submitGovernanceProposal } = require('./utils');
const { hex, bnEqual } = require('../utils').helpers;
const { ProposalCategory } = require('../utils').constants;

const toBN = s => web3.utils.toBN(s);

const VERSION_DATA = 'https://api.nexusmutual.io/version-data/data.json';

const ClaimsReward = artifacts.require('ClaimsReward');
const ClaimsData = artifacts.require('ClaimsData');
const TokenController = artifacts.require('TokenController');
const Quotation = artifacts.require('Quotation');
const QuotationData = artifacts.require('QuotationData');
const Pool = artifacts.require('Pool');
const PooledStaking = artifacts.require('PooledStaking');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const NXMToken = artifacts.require('NXMToken');
const Governance = artifacts.require('Governance');
const TokenFunctions = artifacts.require('TokenFunctions');
const Gateway = artifacts.require('Gateway');

const ERC20 = artifacts.require('ERC20Mock');
const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');

const Address = {
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  NXMHOLDER: '0xd7cba5b9a0240770cfd9671961dae064136fa240',
};

const ClaimStatus = [
  'CA Vote',
  'Does not exist',
  'CA Vote Threshold not Reached Accept',
  'CA Vote Threshold not Reached Deny',
  'CA Consensus not reached Accept',
  'CA Consensus not reached Deny',
  'CA Vote Denied',
  'CA Vote Accepted',
  'CA Vote no solution, MV Accepted',
  'CA Vote no solution, MV Denied',
  'CA Vote no solution (maj: accept), MV Nodecision',
  'CA Vote no solution (maj: denied), MV Nodecision',
  'Claim Accepted Payout Pending',
  'Claim Accepted No Payout',
  'Claim Accepted Payout Done',
];

const getAddressByCodeFactory = abis => code => abis.find(abi => abi.code === code).address;
const unlock = async account => provider.request({ method: 'hardhat_impersonateAccount', params: [account] });

const moneymoney = '0x' + ether('1000000').toString(16);
const fund = async to => provider.request({ method: 'hardhat_setBalance', params: [to, moneymoney] });

describe('deploy cover interface and locking fixes', function () {

  this.timeout(0);
  this.bail(true);

  it('initializes contracts', async function () {

    const { mainnet: { abis } } = await fetch(VERSION_DATA).then(r => r.json());
    const getAddressByCode = getAddressByCodeFactory(abis);

    this.token = await NXMToken.at(getAddressByCode('NXMTOKEN'));
    this.memberRoles = await MemberRoles.at(getAddressByCode('MR'));
    this.master = await NXMaster.at(getAddressByCode(('NXMASTER')));
    this.governance = await Governance.at(getAddressByCode('GV'));
    this.quotation = await Quotation.at(getAddressByCode('QT'));
    this.claimsData = await ClaimsData.at(getAddressByCode('CD'));
    this.quotationData = await QuotationData.at(getAddressByCode('QD'));
    this.tokenController = await TokenController.at(getAddressByCode('TC'));
    this.pool = await Pool.at(getAddressByCode('P1'));
    this.pooledStaking = await PooledStaking.at(getAddressByCode('PS'));
    this.dai = await ERC20.at(Address.DAI);
  });

  it('funds accounts', async function () {

    console.log('Funding accounts');

    const AB_ROLE = '1';
    const { memberArray: boardMembers } = await this.memberRoles.members(AB_ROLE);
    const voters = boardMembers.slice(0, 5);

    for (const member of voters) {
      await unlock(member);
      await fund(member);
    }

    this.voters = voters;
  });

  it('upgrades contracts', async function () {
    const { governance, master, voters } = this;

    console.log('Deploying contracts');
    const newCR = await ClaimsReward.new(this.master.address, Address.DAI);
    const newQT = await Quotation.new();

    console.log('Upgrading contracts');

    const upgradesActionData = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [
        ['CR', 'QT'].map(hex),
        [newCR, newQT].map(c => c.address),
      ],
    );

    await submitGovernanceProposal(
      ProposalCategory.upgradeNonProxy, // == 29 upgradeMultipleContracts
      upgradesActionData,
      voters,
      governance,
    );

    assert.equal(newCR.address, await master.getLatestAddress(hex('CR')));
    assert.equal(newQT.address, await master.getLatestAddress(hex('QT')));

    this.claimsReward = newCR;
    this.quotation = newQT;
  });

  it('accept pending claims', async function () {
    const { claimsReward, claimsData, quotationData, pooledStaking, tokenController, pool, dai } = this;
    const claimIds = [
      169, // ftx           580 ETH
      157, // ftx     1,150,000 DAI
      160, // ftx     1,000,000 DAI
      161, // ftx           200 ETH
      163, // ftx       799,840 DAI
      172, // ftx         8,000 DAI
      174, // blockfi    10,000 DAI
    ];

    const ASSETS = {
      [hex('ETH\0')]: 'ETH',
      [hex('DAI\0')]: 'DAI',
    };

    const getBalance = async (asset, address) => ({
      ETH: toBN(await web3.eth.getBalance(address)),
      DAI: await dai.balanceOf(address),
    });

    for (const claimId of claimIds) {
      console.log('Closing claim: ', claimId);

      const { coverid: coverId } = await claimsData.getClaimCoverId(claimId);
      const coverOwner = await quotationData.getCoverMemberAddress(coverId);
      const coverAsset = await quotationData.getCurrencyOfCover(coverId);
      const { requestedPayoutAmount } = await tokenController.coverInfo(coverId);

      console.log('Asset:', Buffer.from(coverAsset.slice(2), 'hex').toString('utf8'));
      console.log('Owner:', coverOwner);

      const ownerBalanceBefore = await getBalance(coverAsset, coverOwner);
      const poolBalanceBefore = await getBalance(coverAsset, pool.address);

      await claimsReward.closeClaim(claimId);
      const { statno: claimStatusId } = await claimsData.getClaimStatusNumber(claimId);
      console.log(`Claim status: ${claimStatusId} - ${ClaimStatus[claimStatusId]}`);

      const ownerBalanceAfter = await getBalance(coverAsset, coverOwner);
      const poolBalanceAfter = await getBalance(coverAsset, pool.address);

      console.log('Owner ETH balance before:', ownerBalanceBefore.ETH.toString() / 1e18);
      console.log('Owner ETH balance after:', ownerBalanceAfter.ETH.toString() / 1e18);

      console.log('Pool ETH balance before:', poolBalanceBefore.ETH.toString() / 1e18);
      console.log('Pool ETH balance after:', poolBalanceAfter.ETH.toString() / 1e18);

      console.log('Owner DAI balance before:', ownerBalanceBefore.DAI.toString() / 1e18);
      console.log('Owner DAI balance after:', ownerBalanceAfter.DAI.toString() / 1e18);

      console.log('Pool DAI balance before:', poolBalanceBefore.DAI.toString() / 1e18);
      console.log('Pool DAI balance after:', poolBalanceAfter.DAI.toString() / 1e18);

      const payoutAmount = ether(requestedPayoutAmount.toString());
      const asset = ASSETS[coverAsset];

      bnEqual(ownerBalanceAfter[asset].sub(ownerBalanceBefore[asset]), payoutAmount, 'Owner balance mismatch');
      bnEqual(poolBalanceBefore[asset].sub(poolBalanceAfter[asset]), payoutAmount, 'Pool balance mismatch');

      const { claimCount, hasOpenClaim, hasAcceptedClaim } = await tokenController.coverInfo(coverId);
      assert(claimCount.gte(1), 'Expected to have claim count >= 1');
      assert(!hasOpenClaim, 'Expected to have no open claims');
      assert(hasAcceptedClaim, 'Expected to have an accepted claim');

      console.log('Processing pending actions');
      while (await pooledStaking.hasPendingActions()) {
        await pooledStaking.processPendingActions(100);
      }
    }
  });

  it('performs hypothetical future proxy upgrade', async function () {

    const { voters, governance, master } = this;

    const gatewayImplementation = await Gateway.new();
    const upgradesActionDataProxy = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [
        ['GW'].map(hex),
        [gatewayImplementation].map(c => c.address),
      ],
    );

    await submitGovernanceProposal(
      ProposalCategory.upgradeNonProxy, // == 29 upgradeMultipleContracts
      upgradesActionDataProxy,
      voters,
      governance,
    );

    const gwProxy = await OwnedUpgradeabilityProxy.at(await master.getLatestAddress(hex('GW')));
    const gwImplementation = await gwProxy.implementation();

    assert.equal(gwImplementation, gatewayImplementation.address);
  });

  it('performs hypothetical future non-proxy upgrade', async function () {

    const { voters, governance, master } = this;

    const tokenFunctionsImplementation = await TokenFunctions.new();
    const upgradesActionDataNonProxy = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [
        ['TF'].map(hex),
        [tokenFunctionsImplementation].map(c => c.address),
      ],
    );

    await submitGovernanceProposal(
      ProposalCategory.upgradeNonProxy,
      upgradesActionDataNonProxy,
      voters,
      governance,
    );

    const tfStoredAddress = await master.getLatestAddress(hex('TF'));

    assert.equal(tfStoredAddress, tokenFunctionsImplementation.address);
  });

  it('performs hypothetical future master upgrade', async function () {

    const { voters, governance, master } = this;

    const masterProxy = await OwnedUpgradeabilityProxy.at(master.address);

    // upgrade to new master
    const masterImplementation = await NXMaster.new();

    // vote and upgrade
    const upgradeMaster = web3.eth.abi.encodeParameters(['address'], [masterImplementation.address]);
    await submitGovernanceProposal(ProposalCategory.upgradeMaster, upgradeMaster, voters, governance);

    // check implementation
    const actualMasterImplementation = await masterProxy.implementation();
    assert.strictEqual(actualMasterImplementation, masterImplementation.address);
  });
});
