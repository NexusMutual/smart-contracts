const fetch = require('node-fetch');
const { artifacts, web3, accounts, network } = require('hardhat');
const { ether, expectRevert, time } = require('@openzeppelin/test-helpers');
const Decimal = require('decimal.js');
const { keccak256 } = require('ethereumjs-util');

const { submitGovernanceProposal } = require('./utils');
const { hex } = require('../utils').helpers;
const { ProposalCategory, Role, CoverStatus } = require('../utils').constants;

const {
  toDecimal,
  calculateRelativeError,
  percentageBN,
  calculateEthForNXMRelativeError,
} = require('../utils').tokenPrice;

const { BN, toBN } = web3.utils;

const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');
const MemberRoles = artifacts.require('MemberRoles');
const Pool = artifacts.require('Pool');
const NXMaster = artifacts.require('NXMaster');
const TemporaryNXMaster = artifacts.require('TemporaryNXMaster');
const NXMToken = artifacts.require('NXMToken');
const Governance = artifacts.require('Governance');
const PoolData = artifacts.require('PoolData');
const TokenFunctions = artifacts.require('TokenFunctions');
const Claims = artifacts.require('Claims');
const ClaimsReward = artifacts.require('ClaimsReward');
const Quotation = artifacts.require('Quotation');
const MCR = artifacts.require('MCR');
const Pool2 = artifacts.require('Pool2');
const LegacyPool1 = artifacts.require('LegacyPool1');
const LegacyMCR = artifacts.require('LegacyMCR');
const PriceFeedOracle = artifacts.require('PriceFeedOracle');
const ERC20 = artifacts.require('ERC20');
const SwapAgent = artifacts.require('SwapAgent');
const TwapOracle = artifacts.require('TwapOracle');
const TokenController = artifacts.require('TokenController');
const Cover = artifacts.require('Cover');

const Address = {
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  SAI: '0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359',
  WNXM: '0x0d438F3b5175Bebc262bF23753C1E53d03432bDE',
  DAIFEED: '0x773616E4d11A78F511299002da57A0a94577F1f4',
  UNIFACTORY: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
  NXMHOLDER: '0xd7cba5b9a0240770cfd9671961dae064136fa240',
};

let isHardhat;
const hardhatRequest = async (...params) => {

  if (isHardhat === undefined) {
    const nodeInfo = await web3.eth.getNodeInfo();
    isHardhat = !!nodeInfo.match(/Hardhat/);
  }

  if (isHardhat) {
    return network.provider.request(...params);
  }
};

const owner = '0xeadaceccc5b32e0f2151a94ae5c3cfb11e349754';

const getAddressByCodeFactory = abis => code => abis.find(abi => abi.code === code).address;
const fund = async to => web3.eth.sendTransaction({ from: accounts[0], to, value: ether('1000000') });
const unlock = async member => hardhatRequest({ method: 'hardhat_impersonateAccount', params: [member] });

describe('deploy cover interface and locking fixes', function () {

  this.timeout(0);

  it('initializes contracts', async function () {

    const { mainnet: { abis } } = await fetch('https://api.nexusmutual.io/version-data/data.json').then(r => r.json());
    const getAddressByCode = getAddressByCodeFactory(abis);

    const token = await NXMToken.at(getAddressByCode('NXMTOKEN'));
    const memberRoles = await MemberRoles.at(getAddressByCode('MR'));
    const master = await NXMaster.at(getAddressByCode(('NXMASTER')));
    const governance = await Governance.at(getAddressByCode('GV'));
    this.master = master;
    this.memberRoles = memberRoles;
    this.token = token;
    this.governance = governance;
  });

  it('funds accounts', async function () {

    console.log('Funding accounts');

    const { memberArray: boardMembers } = await this.memberRoles.members('1');
    const voters = boardMembers.slice(1, 4);

    for (const member of [...voters, Address.NXMHOLDER, owner]) {
      await fund(member);
      await unlock(member);
    }

    this.voters = voters;
  });

  it('updating category 5 (Upgrade Proxy) to use AB voting', async function () {
    const { master, governance, voters } = this;

    const functionSignature = 'upgradeMultipleImplementations(bytes2[],address[])';

    const upgradesActionDataNonProxy = web3.eth.abi.encodeParameters(
      ['uint256', 'string', 'uint256', 'uint256', 'uint256', 'uint256[]', 'uint256', 'string', 'address', 'bytes2', 'uint256[]', 'string'],
      [
        ProposalCategory.upgradeProxy.toString(), // 1. Category Id
        'Upgrade a contract Implementation', // 2. Name of category
        '1', // 3. role authorized to vote: AB !! this is the modification vs current state
        '50', // 4. Majority % required for acceptance
        '15', // 5.  Quorum % required for acceptance
        ['2'], // 6. Role Ids allowed to create proposal
        (3 * 24 * 3600).toString(), // 7. Proposal closing time - 3 days
        'QmRKKFHv1xpUtSfyrtUMcrdE6sMEc4CgDUKU135YrAZqV7', // 8. IPFS hash of action to be executed
        '0x0000000000000000000000000000000000000000', // 9. Address of external contract for action execution
        hex('MS'), // 10. Contract code of internal contract for action execution
        ['0', '0', '60', '0'], // 11. [Minimum stake, incentives, Advisory Board % required, Is Special Resolution ]
        functionSignature, // 12. Function Signature
      ],
    );

    await submitGovernanceProposal(
      ProposalCategory.editCategory,
      upgradesActionDataNonProxy,
      voters,
      governance,
    );

    console.log('Updated category successfully.');
  });

  it('upgrades contracts', async function () {
    const { master, governance, voters } = this;
    console.log('Deploying contracts');

    const newCL = await Claims.new();
    const newMR = await MemberRoles.new();
    const newTokenController = await TokenController.new();
    const newQuotation = await Quotation.new();
    const newTokenFunctions = await TokenFunctions.new();
    const newClaimsReward = await ClaimsReward.new(master.address, Address.DAI);

    console.log('Upgrading non-proxy contracts');

    const upgradesActionDataNonProxy = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [
        ['CL', 'QT', 'TF', 'CR'].map(hex),
        [newCL, newQuotation, newTokenFunctions, newClaimsReward].map(c => c.address),
      ],
    );

    await submitGovernanceProposal(
      ProposalCategory.upgradeNonProxy,
      upgradesActionDataNonProxy,
      voters,
      governance,
    );

    const storedCLAddress = await master.getLatestAddress(hex('CL'));
    const storedQTAddress = await master.getLatestAddress(hex('QT'));
    const storedTFAddress = await master.getLatestAddress(hex('TF'));
    const storedCRAddress = await master.getLatestAddress(hex('CR'));

    assert.equal(storedCLAddress, newCL.address);
    assert.equal(storedQTAddress, newQuotation.address);
    assert.equal(storedTFAddress, newTokenFunctions.address);
    assert.equal(storedCRAddress, newClaimsReward.address);

    console.log('Non-proxy upgrade successful.');

    console.log('Upgrading proxy contracts');

    const upgradesActionDataProxy = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [
        ['MR', 'TC'].map(hex),
        [newMR, newTokenController].map(c => c.address),
      ],
    );

    await submitGovernanceProposal(
      ProposalCategory.upgradeProxy,
      upgradesActionDataProxy,
      voters,
      governance,
    );

    const mrProxy = await OwnedUpgradeabilityProxy.at(await master.getLatestAddress(hex('MR')));
    const tcProxy = await OwnedUpgradeabilityProxy.at(await master.getLatestAddress(hex('TC')));
    const mrImplementation = await mrProxy.implementation();
    const tcImplementation = await tcProxy.implementation();

    assert.equal(newMR.address, mrImplementation);
    assert.equal(newTokenController.address, tcImplementation);

    console.log('Proxy Upgrade successful.');

    this.quotation = await Quotation.at(await master.getLatestAddress(hex('QT')));
    this.tokenController = await TokenController.at(await master.getLatestAddress(hex('TC')));
  });

  it('adds new Cover.sol contract', async function () {
    const { master, voters, governance } = this;
    console.log('Adding new cover contract..');
    const coverImplementation = await Cover.new();

    // Creating proposal for adding new internal contract
    const addNewInternalContractActionData = web3.eth.abi.encodeParameters(
      ['bytes2', 'address', 'uint'],
      [hex('CO'), coverImplementation.address, 2],
    );

    await submitGovernanceProposal(
      ProposalCategory.newContract,
      addNewInternalContractActionData,
      voters,
      governance
    );

    const coverProxy = await OwnedUpgradeabilityProxy.at(await master.getLatestAddress(hex('CO')));
    const storedImplementation = await coverProxy.implementation();

    assert.equal(storedImplementation, coverImplementation.address);

    const cover = await Cover.at(await master.getLatestAddress(hex('CO')));

    const storedDAI = await cover.DAI();
    assert.equal(storedDAI, Address.DAI);

    const masterAddress = await cover.master();
    assert.equal(masterAddress, master.address);

    // sanity check an arbitrary cover
    const cover10 = await cover.getCover(10);
    assert.equal(cover10.coverAsset, '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE');
    assert.equal(cover10.contractAddress, '0x448a5065aeBB8E423F0896E6c5D525C040f59af3');

    this.cover = cover;
  });

  it('expires cover and withdraws cover note after grace period is finished', async function () {
    const { master, voters, governance, cover, quotation, tokenController, token } = this;

    // const coverId = 2269;
    const coverId = 2270;
    const coverData = await cover.getCover(coverId);
    const coverOwner = coverData.memberAddress;
    assert.equal(coverData.coverAsset, '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE');

    const latestTime = await time.latest();

    assert(latestTime.lt(coverData.validUntil), `Validity ${coverData.validUntil.toString()} not in the future.`);

    await time.increaseTo(coverData.validUntil.addn(1000));
    await quotation.expireCover(coverId);

    const newCoverState = await cover.getCover(coverId);

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
    await quotation.withdrawCoverNote(coverOwner,[coverId], [reasonIndex]);
    const nxmBalanceAfter = await token.balanceOf(coverOwner);

    const returnedAmount = nxmBalanceAfter.sub(nxmBalanceBefore);

    assert.equal(returnedAmount.toString(), lockedAmount.toString());
  });

  it.skip('performs hypothetical future proxy upgrade', async function () {

    const { voters, governance, master } = this;

    const coverImplementation = await Cover.new();
    const upgradesActionDataProxy = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [
        ['CO'].map(hex),
        [coverImplementation].map(c => c.address),
      ],
    );

    await submitGovernanceProposal(
      ProposalCategory.upgradeProxy,
      upgradesActionDataProxy,
      voters,
      governance,
    );

    const coProxy = await OwnedUpgradeabilityProxy.at(await master.getLatestAddress(hex('CO')));
    const coImplementation = await coProxy.implementation();

    assert.equal(coImplementation, coverImplementation.address);
  });

  it.skip('performs hypothetical future non-proxy upgrade', async function () {

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
});
