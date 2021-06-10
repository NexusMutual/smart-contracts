const fetch = require('node-fetch');
const { artifacts, web3, accounts, network } = require('hardhat');
const { ether, time } = require('@openzeppelin/test-helpers');

const { submitGovernanceProposal } = require('./utils');
const { hex } = require('../utils').helpers;
const { ProposalCategory, CoverStatus } = require('../utils').constants;

const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const NXMToken = artifacts.require('NXMToken');
const Governance = artifacts.require('Governance');
const TokenFunctions = artifacts.require('TokenFunctions');
const Quotation = artifacts.require('Quotation');
const TokenController = artifacts.require('TokenController');
const Gateway = artifacts.require('Gateway');

const Address = {
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  NXMHOLDER: '0xd7cba5b9a0240770cfd9671961dae064136fa240',
};

const getAddressByCodeFactory = abis => code => abis.find(abi => abi.code === code).address;
const fund = async to => web3.eth.sendTransaction({ from: accounts[0], to, value: ether('1000000') });
const unlock = async member => network.provider.request({ method: 'hardhat_impersonateAccount', params: [member] });

describe('deploy cover interface and locking fixes', function () {

  this.timeout(0);

  it('initializes contracts', async function () {

    const { mainnet: { abis } } = await fetch('https://api.nexusmutual.io/version-data/data.json').then(r => r.json());
    const getAddressByCode = getAddressByCodeFactory(abis);

    this.token = await NXMToken.at(getAddressByCode('NXMTOKEN'));
    this.memberRoles = await MemberRoles.at(getAddressByCode('MR'));
    this.master = await NXMaster.at(getAddressByCode(('NXMASTER')));
    this.governance = await Governance.at(getAddressByCode('GV'));
    this.tokenController = await TokenController.at(getAddressByCode('TC'));
    this.quotation = await Quotation.at(getAddressByCode('QT'));
  });

  it('funds accounts', async function () {

    console.log('Funding accounts');

    const { memberArray: boardMembers } = await this.memberRoles.members('1');
    const voters = boardMembers.slice(1, 4);

    for (const member of [...voters, Address.NXMHOLDER]) {
      await fund(member);
      await unlock(member);
    }

    this.voters = voters;
  });

  it('upgrades contracts', async function () {
    const { master, governance, voters } = this;
    console.log('Deploying contracts');

    const printStorageValues = async gw => {
      const quotation = await gw.quotation();
      const nxmToken = await gw.nxmToken();
      const tokenController = await gw.tokenController();
      const quotationData = await gw.quotationData();
      const claimsData = await gw.claimsData();
      const claims = await gw.claims();
      const pool = await gw.pool();
      const memberRoles = await gw.memberRoles();
      const DAI = await gw.DAI();
      const incidents = await gw.incidents();
      console.log({
        quotation,
        nxmToken,
        tokenController,
        quotationData,
        claimsData,
        claims,
        pool,
        memberRoles,
        DAI,
        incidents,
      });
    };

    const gwAddress = await master.getLatestAddress(hex('GW'));
    const gateway = await Gateway.at(gwAddress);
    await printStorageValues(gateway);

    const newGateway = await Gateway.new();

    console.log('Upgrading proxy contracts');

    const upgradesActionDataProxy = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [
        ['GW'].map(hex),
        [newGateway].map(c => c.address),
      ],
    );

    await submitGovernanceProposal(
      ProposalCategory.upgradeProxy,
      upgradesActionDataProxy,
      voters,
      governance,
    );

    const gwProxy = await OwnedUpgradeabilityProxy.at(gwAddress);
    const gwImplementation = await gwProxy.implementation();
    assert.equal(newGateway.address, gwImplementation);

    await gateway.changeDependentContractAddress();
    await printStorageValues(gateway);

    {
      const nxmToken = await gateway.nxmToken();
      const quotation = await gateway.quotation();
      const tokenController = await gateway.tokenController();
      const quotationData = await gateway.quotationData();
      const claimsData = await gateway.claimsData();
      const claims = await gateway.claims();
      const pool = await gateway.pool();
      const memberRoles = await gateway.memberRoles();
      const incidents = await gateway.incidents();
      assert.strictEqual(nxmToken, await master.tokenAddress());
      assert.strictEqual(quotation, await master.getLatestAddress(hex('QT')));
      assert.strictEqual(tokenController, await master.getLatestAddress(hex('TC')));
      assert.strictEqual(quotationData, await master.getLatestAddress(hex('QD')));
      assert.strictEqual(claimsData, await master.getLatestAddress(hex('CD')));
      assert.strictEqual(claims, await master.getLatestAddress(hex('CL')));
      assert.strictEqual(pool, await master.getLatestAddress(hex('P1')));
      assert.strictEqual(memberRoles, await master.getLatestAddress(hex('MR')));
      assert.strictEqual(incidents, await master.getLatestAddress(hex('IC')));
    }

    const dai = await gateway.DAI();
    assert.strictEqual(dai.toLowerCase(), Address.DAI.toLowerCase());
    this.gateway = gateway;

    console.log('Proxy Upgrade successful.');
  });

  it('submits claim for cover', async function () {
    const { gateway, tokenController } = this;

    const coverId = 2271;
    const coverData = await gateway.getCover(coverId);
    const coverOwner = coverData.memberAddress;
    assert.equal(coverData.coverAsset, '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE');

    const latestTime = await time.latest();
    assert(latestTime.lt(coverData.validUntil), `Validity ${coverData.validUntil.toString()} not in the future.`);

    await unlock(coverOwner);
    await fund(coverOwner);

    await gateway.submitClaim(coverId, '0x', { from: coverOwner });

    const coverInfo = await tokenController.coverInfo(coverId);
    assert.equal(coverInfo.claimCount.toString(), '1');
    assert(coverInfo.hasOpenClaim);
    assert(!coverInfo.hasAcceptedClaim);
  });

  it('expires cover and withdraws cover note after grace period is finished', async function () {
    const { gateway, quotation, tokenController, token } = this;

    // const coverId = 2269;
    const coverId = 2272;
    const coverData = await gateway.getCover(coverId);
    const coverOwner = coverData.memberAddress;
    assert.equal(coverData.coverAsset, '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE');

    const latestTime = await time.latest();
    assert(latestTime.lt(coverData.validUntil), `Validity ${coverData.validUntil.toString()} not in the future.`);

    await time.increaseTo(coverData.validUntil.addn(1000));
    await quotation.expireCover(coverId);

    const newCoverState = await gateway.getCover(coverId);

    assert.equal(newCoverState.status.toString(), CoverStatus.CoverExpired);
    const gracePeriod = await tokenController.claimSubmissionGracePeriod();
    await time.increase(gracePeriod);

    const { expiredCoverIds, lockReasons } = await quotation.getWithdrawableCoverNoteCoverIds(coverOwner);
    const coverIdsWithCoverNotes = expiredCoverIds.map((coverId, index) => {
      return { coverId, lockReason: lockReasons[index] };
    });
    const lockReason = coverIdsWithCoverNotes.filter(e => e.coverId.toString() === coverId.toString())[0].lockReason;

    const reasons = await tokenController.getLockReasons(coverOwner);
    const reasonIndex = reasons.indexOf(lockReason);

    const { amount: lockedAmount } = await tokenController.locked(coverOwner, lockReason);

    const nxmBalanceBefore = await token.balanceOf(coverOwner);
    await quotation.withdrawCoverNote(coverOwner, [coverId], [reasonIndex]);
    const nxmBalanceAfter = await token.balanceOf(coverOwner);

    const returnedAmount = nxmBalanceAfter.sub(nxmBalanceBefore);

    assert.equal(returnedAmount.toString(), lockedAmount.toString());
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
      ProposalCategory.upgradeProxy,
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
