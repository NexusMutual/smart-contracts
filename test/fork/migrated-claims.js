const { artifacts, ethers, network, run } = require('hardhat');
const { expect } = require('chai');
const fetch = require('node-fetch');

const evm = require('./evm')();

const {
  Address: { ETH },
} = require('./utils');

const { BigNumber } = ethers;
const { AddressZero, Zero, Two } = ethers.constants;
const { parseEther, formatEther, defaultAbiCoder, toUtf8Bytes, getAddress, keccak256, hexZeroPad } = ethers.utils;
const MaxAddress = '0xffffffffffffffffffffffffffffffffffffffff';

const SCRIPTS_USE_CACHE = !process.env.NO_CACHE;

const CoverCreate2Salt = 4924891554;
const StakingProductsCreate2Salt = 203623750;
const IndividualClaimsCreate2Salt = 352721057824254;
const YieldTokenIncidentsCreate2Salt = 2596290771;
const AssessmentCreate2Salt = 352729799262241;



const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const STETH_ADDRESS = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84';


const VERSION_DATA_URL = 'https://api.nexusmutual.io/version-data/data.json';

const ASSET_V1_TO_ASSET_V2 = {};
ASSET_V1_TO_ASSET_V2[ETH.toLowerCase()] = 0;
ASSET_V1_TO_ASSET_V2[DAI_ADDRESS.toLowerCase()] = 1;

const MaxUint96 = Two.pow(96).sub(1);

const V2Addresses = {
  SwapOperator: '0xcafea536d7f79F31Fa49bC40349f6a5F7E19D842',
  PriceFeedOracle: '0xcafeaf0a0672360941b7f0b6d015797292e842c6',
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
  StakingViewer: '0xcafea2B7904eE0089206ab7084bCaFB8D476BD04'
};

const getSigner = async address => {
  const provider =
    network.name !== 'hardhat' // ethers errors out when using non-local accounts
      ? new ethers.providers.JsonRpcProvider(network.config.url)
      : ethers.provider;
  return provider.getSigner(address);
};

const getContractFactory = async providerOrSigner => {
  const data = await fetch(VERSION_DATA_URL).then(r => r.json());
  const abis = data.mainnet.abis
    .map(item => ({ ...item, abi: JSON.parse(item.contractAbi) }))
    .reduce((data, item) => ({ ...data, [item.code]: item }), {});

  return async code => {
    const { abi, address } = abis[code];
    return new ethers.Contract(address, abi, providerOrSigner);
  };
};

const calculateProxyAddress = (masterAddress, salt) => {
  const { bytecode } = artifacts.readArtifactSync('OwnedUpgradeabilityProxy');
  const initCode = bytecode + defaultAbiCoder.encode(['address'], [MaxAddress]).slice(2);
  const initCodeHash = ethers.utils.keccak256(initCode);
  const saltHex = Buffer.from(salt.toString(16).padStart(64, '0'), 'hex');
  return ethers.utils.getCreate2Address(masterAddress, saltHex, initCodeHash);
};

const formatInternalContracts = ({ _contractAddresses, _contractCodes }) => {
  return _contractCodes.map((code, i) => {
    const index = `${i}`.padStart(2, '0');
    return `[${index}] ${Buffer.from(code.slice(2), 'hex')} -> ${_contractAddresses[i]}`;
  });
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

describe('Migrated claims', function () {
  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);
    await getSigner('0x1eE3ECa7aEF17D1e74eD7C447CcBA61aC76aDbA9');

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

  it('Migrates, claims and reedeems existing FTX and Euler covers to V2', async function () {
    const ftxCoverIds = [7907, 7881, 7863, 7643, 7598, 7572, 7542, 7313, 7134];


    this.master = await ethers.getContractAt('NXMaster', '0x01BFd82675DBCc7762C84019cA518e701C0cD07e');
    this.productsV1 = await ethers.getContractAt('ProductsV1', V2Addresses.ProductsV1);
    this.gateway = await ethers.getContractAt('LegacyGateway', '0x089Ab1536D032F54DFbC194Ba47529a4351af1B5');
    this.quotationData = await ethers.getContractAt('LegacyQuotationData', '0x1776651F58a17a50098d31ba3C3cD259C1903f7A');
    this.individualClaims = await ethers.getContractAt('IndividualClaims', await this.master.getLatestAddress(toUtf8Bytes('CI')));
    this.coverMigrator = await ethers.getContractAt('CoverMigrator', await this.master.getLatestAddress(toUtf8Bytes('CL')));
    this.coverViewer = await ethers.getContractAt('CoverViewer', V2Addresses.CoverViewer);

    const FTX_GRACE_PERIOD = 120; // 120 days
    const FTX_ID_V1 = '0xC57d000000000000000000000000000000000011';
    const ftxProductId = await this.productsV1.getNewProductId(FTX_ID_V1);

    let expectedClaimId = 0;
    const segmentId = 0;

    for (const coverIdV1 of ftxCoverIds) {
      const { memberAddress, sumAssured, coverAsset: legacyCoverAsset } = await this.gateway.getCover(coverIdV1);
      const { coverPeriod: coverPeriodInDays, validUntil } = await this.quotationData.getCoverDetailsByCoverID2(
        coverIdV1,
      );
      const expectedPeriod = coverPeriodInDays * 3600 * 24;
      const expectedStart = validUntil.sub(expectedPeriod);
      const expectedCoverAsset = ASSET_V1_TO_ASSET_V2[legacyCoverAsset.toLowerCase()];

      const member = await getSigner(memberAddress);
      await evm.impersonate(memberAddress);
      await evm.setBalance(memberAddress, parseEther('1000'));

      const [deposit] = await this.individualClaims.getAssessmentDepositAndReward(
        sumAssured,
        expectedPeriod,
        expectedCoverAsset,
      );
      const tx = await this.coverMigrator.connect(member).migrateAndSubmitClaim(coverIdV1, segmentId, sumAssured, '', {
        value: deposit,
      });
      const receipt = await tx.wait();
      const coverMigratedEvent = receipt.events.find(x => x.event === 'CoverMigrated');
      const coverIdV2 = coverMigratedEvent.args.coverIdV2;

      console.log(`FTX cover ${coverIdV1} mapped to V2 cover: ${coverIdV2}`);

      const covers = await this.coverViewer.getCovers([coverIdV2]);
      const { productId, coverAsset, amountPaidOut, segments } = covers[0];

      expect(productId).to.be.equal(ftxProductId);
      expect(coverAsset).to.be.equal(expectedCoverAsset);
      expect(amountPaidOut).to.be.equal(0);
      expect(segments.length).to.be.equal(1);

      const { amount, remainingAmount, start, period, gracePeriod } = segments[segmentId];
      expect(amount).to.be.equal(sumAssured);
      expect(remainingAmount).to.be.equal(sumAssured);
      expect(period).to.be.equal(expectedPeriod);
      expect(start).to.be.equal(expectedStart);
      expect(gracePeriod).to.be.equal(FTX_GRACE_PERIOD);

      // claim assertions

      const claimsArray = await this.individualClaims.getClaimsToDisplay([expectedClaimId++]);
      const { productId: claimProductId, coverId, amount: claimAmount, assetSymbol, claimStatus } = claimsArray[0];

      expect(claimAmount).to.be.equal(sumAssured);
      expect(claimProductId).to.be.equal(ftxProductId);
      expect(assetSymbol).to.be.equal(expectedCoverAsset === 0 ? 'ETH' : 'DAI');
      expect(coverId).to.be.equal(coverIdV2);
      expect(claimStatus).to.be.equal(0); // ClaimStatus.PENDING
    }
  });
});