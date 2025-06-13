const { ethers, network } = require('hardhat');
const { expect } = require('chai');

const evm = require('./evm')();

const {
  Address: { ETH },
} = require('./utils');
const { daysToSeconds } = require('../../lib/helpers');
const { setNextBlockTime, mineNextBlock } = require('../utils/evm');
const { ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const { signMembershipApproval } = require('../integration/utils').membership;
const { parseUnits } = require('ethers/lib/utils');

const JOINING_FEE = parseUnits('0.002');

const { parseEther, defaultAbiCoder, toUtf8Bytes } = ethers.utils;

const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const HUGH = '0x87B2a7559d85f4653f13E6546A14189cd5455d45';

const ASSET_V1_TO_ASSET_V2 = {};
ASSET_V1_TO_ASSET_V2[ETH.toLowerCase()] = 0;
ASSET_V1_TO_ASSET_V2[DAI_ADDRESS.toLowerCase()] = 1;

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

async function enrollMember({ mr }, members, kycAuthSigner) {
  for (const member of members) {
    const memberAddress = await member.getAddress();

    console.log(`Creating member ${memberAddress}`);
    const membershipApprovalData0 = await signMembershipApproval({
      nonce: 0,
      address: memberAddress,
      kycAuthSigner,
      chainId: network.config.chainId,
    });

    console.log('calling join');

    await mr.connect(member).join(memberAddress, 0, membershipApprovalData0, {
      value: JOINING_FEE,
    });
  }
}

describe('Migrated claims', function () {
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
    this.productsV1 = await ethers.getContractAt('ProductsV1', V2Addresses.ProductsV1);
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

  it('upgrades Cover', async function () {
    const codes = ['CO'].map(code => toUtf8Bytes(code));

    const coverNFT = await this.cover.coverNFT();
    const stakingNFT = await this.cover.stakingNFT();
    const stakingPoolFactory = await this.cover.stakingPoolFactory();
    const stakingPoolImplementation = await this.cover.stakingPoolImplementation();

    const coverImpl = await ethers.deployContract('Cover', [
      coverNFT,
      stakingNFT,
      stakingPoolFactory,
      stakingPoolImplementation,
    ]);

    const addresses = [coverImpl].map(c => c.address);

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [codes, addresses]),
      this.abMembers,
      this.governance,
    );
  });

  const setTime = async timestamp => {
    await setNextBlockTime(timestamp);
    await mineNextBlock();
  };

  async function acceptClaim({ staker, assessmentStakingAmount, as, assessmentId }) {
    await as.connect(staker).stake(assessmentStakingAmount);

    await as.connect(staker).castVotes([assessmentId], [true], ['Assessment data hash'], 0);

    const { poll } = await as.assessments(assessmentId);

    return poll;
  }

  async function migrateClaimAndRedeem({
    coverIDsV1,
    expectedGracePeriod,
    v1ProductId,
    submitAndClaimProcess,
    useSubmitAndClaimProcess,
    claimAmounts,
    distributorCoverOwners,
  }) {
    let expectedClaimId = (await this.individualClaims.getClaimsCount()).toNumber();
    const segmentId = 0;

    const v2ProductId = await this.productsV1.getNewProductId(v1ProductId);

    console.log(`Initial expected claim Id: ${expectedClaimId}`);

    const stakerAddress = HUGH;
    const staker = await getSigner(stakerAddress);
    await evm.impersonate(stakerAddress);
    await evm.setBalance(stakerAddress, parseEther('1000'));

    const coverData = [];
    for (const coverIdV1 of coverIDsV1) {
      const {
        memberAddress: onChainMemberAddress,
        sumAssured,
        coverAsset: legacyCoverAsset,
      } = await this.gateway.getCover(coverIdV1);

      const memberAddress =
        distributorCoverOwners && distributorCoverOwners[coverIdV1]
          ? distributorCoverOwners[coverIdV1]
          : onChainMemberAddress;

      const { coverPeriod: coverPeriodInDays, validUntil } = await this.quotationData.getCoverDetailsByCoverID2(
        coverIdV1,
      );
      const expectedPeriod = coverPeriodInDays * 3600 * 24;
      const expectedStart = validUntil.sub(expectedPeriod);
      const expectedCoverAsset = ASSET_V1_TO_ASSET_V2[legacyCoverAsset.toLowerCase()];

      const member = await getSigner(memberAddress);
      await evm.impersonate(memberAddress);
      await evm.setBalance(memberAddress, parseEther('1000'));

      const requestedAmount = claimAmounts && claimAmounts[coverIdV1] ? claimAmounts[coverIdV1] : sumAssured;

      const [deposit] = await this.individualClaims.getAssessmentDepositAndReward(
        sumAssured,
        expectedPeriod,
        expectedCoverAsset,
      );
      let coverIdV2;
      if (useSubmitAndClaimProcess && useSubmitAndClaimProcess[coverIdV1]) {
        const { coverIdV2: newCoverIdV2 } = await submitAndClaimProcess({
          coverIdV1,
          segmentId,
          requestedAmount,
          deposit,
        });
        coverIdV2 = newCoverIdV2;
      } else {
        const tx = await this.coverMigrator
          .connect(member)
          .migrateAndSubmitClaim(coverIdV1, segmentId, requestedAmount, '', {
            value: deposit,
          });
        const receipt = await tx.wait();
        const coverMigratedEvent = receipt.events.find(x => x.event === 'CoverMigrated');
        coverIdV2 = coverMigratedEvent.args.coverIdV2;
      }

      console.log(`Cover V1 ${coverIdV1} mapped to V2 cover: ${coverIdV2}`);

      const covers = await this.coverViewer.getCovers([coverIdV2]);
      const { productId, coverAsset, amountPaidOut, segments } = covers[0];

      expect(productId).to.be.equal(v2ProductId);
      expect(coverAsset).to.be.equal(expectedCoverAsset);
      expect(amountPaidOut).to.be.equal(0);
      expect(segments.length).to.be.equal(1);

      const { amount, remainingAmount, start, period, gracePeriod } = segments[segmentId];

      expect(amount).to.be.equal(sumAssured);
      expect(remainingAmount).to.be.equal(sumAssured);
      expect(period).to.be.equal(expectedPeriod);
      expect(start).to.be.equal(expectedStart);
      expect(gracePeriod).to.be.equal(expectedGracePeriod * 3600 * 24);

      const coverSegments = await this.cover.coverSegments(coverIdV2);
      expect(coverSegments[0].amount).to.be.equal(sumAssured);

      // claim assertions

      const claimId = expectedClaimId++;

      console.log(`Claim ID: ${claimId}. Amount: ${requestedAmount.toString()}. Period: ${period.toString()}`);

      const claimsArray = await this.individualClaims.getClaimsToDisplay([claimId]);
      const {
        productId: claimProductId,
        coverId,
        amount: claimAmount,
        assetSymbol,
        claimStatus,
        assessmentId,
      } = claimsArray[0];

      expect(claimAmount).to.be.equal(requestedAmount);
      expect(claimProductId).to.be.equal(productId);
      expect(assetSymbol).to.be.equal(expectedCoverAsset === 0 ? 'ETH' : 'DAI');
      expect(coverId).to.be.equal(coverIdV2);
      expect(claimStatus).to.be.equal(0); // ClaimStatus.PENDING

      coverData.push({
        coverIdV1,
        coverIdV2,
        assessmentId,
        claimId,
        sumAssured,
        expectedCoverAsset,
        claimAmount,
        memberAddress,
        deposit,
        requestedAmount,
      });
    }

    console.log(`Accept all claims`);
    let poll;
    for (const cover of coverData) {
      const assessmentStakingAmount = parseEther('1000');
      poll = await acceptClaim({
        staker,
        assessmentStakingAmount,
        as: this.assessment,
        assessmentId: cover.assessmentId,
      });
    }

    console.log('Advance time for all claims.');
    const { payoutCooldownInDays } = await this.assessment.config();

    const futureTime = poll.end + daysToSeconds(payoutCooldownInDays);

    await setTime(futureTime);

    for (const cover of coverData) {
      const { coverIdV2, claimId, expectedCoverAsset, claimAmount, memberAddress, deposit } = cover;

      console.log(`Redeeming payout in coverAsset ${expectedCoverAsset} for Cover with V2 ID: ${coverIdV2}`);
      if (expectedCoverAsset === 0) {
        // ETH
        const ethBalanceBefore = await ethers.provider.getBalance(memberAddress);

        console.log(`Current member balance ${ethBalanceBefore.toString()}. Redeeming claim ${claimId}`);

        // redeem payout
        await this.individualClaims.redeemClaimPayout(claimId);

        const ethBalanceAfter = await ethers.provider.getBalance(memberAddress);

        console.log(`Check correct balance increase`);
        expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(claimAmount).add(deposit));

        const { payoutRedeemed } = await this.individualClaims.claims(claimId);
        expect(payoutRedeemed).to.be.equal(true);
      } else {
        // DAI
        const daiBalanceBefore = await this.dai.balanceOf(memberAddress);

        console.log(`Current member balance ${daiBalanceBefore.toString()}.  Redeeming claim ${claimId}`);

        // redeem payout
        await this.individualClaims.redeemClaimPayout(claimId);

        console.log(`Check correct balance increase`);
        const daiBalanceAfter = await this.dai.balanceOf(memberAddress);
        expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(claimAmount));

        const { payoutRedeemed } = await this.individualClaims.claims(claimId);
        expect(payoutRedeemed).to.be.equal(true);
      }

      console.log(`Payout reedemed succesfully.`);
    }
  }

  it('Migrate specific sherlock covers', async function () {
    const coverIDsV1 = [8305];

    const SHERLLOCK_GRACE_PERIOD = 35; // 35 days
    const SHERLOCK_ID_V1 = '0x0000000000000000000000000000000000000029';

    const claimAmounts = {
      8305: parseEther('1116000'),
    };

    await migrateClaimAndRedeem.apply(this, [
      { coverIDsV1, expectedGracePeriod: SHERLLOCK_GRACE_PERIOD, v1ProductId: SHERLOCK_ID_V1, claimAmounts },
    ]);
  });

  it('Migrates, claims and reedeems existing FTX covers to V2', async function () {
    const coverIDsV1 = [7907, 7881, 7863, 7643, 7598, 7572, 7542, 7313, 7134];

    const FTX_GRACE_PERIOD = 120; // 120 days
    const FTX_ID_V1 = '0xC57d000000000000000000000000000000000011';

    await migrateClaimAndRedeem.apply(this, [
      { coverIDsV1, expectedGracePeriod: FTX_GRACE_PERIOD, v1ProductId: FTX_ID_V1 },
    ]);
  });

  it('Migrates normal Euler and Bright Union Euler covers to V2', async function () {
    const BRIGHT_UNION_DISTRIBUTOR = '0x425b3A68f1FD5dE26b4B9F4Be8049E36406B187A';

    const brightUnionDistributor = await ethers.getContractAt('IBrightUnionDistributor', BRIGHT_UNION_DISTRIBUTOR);

    const simpleCoverIds = [7898, 8121, 8166, 8167, 8201, 8210, 8223, 8234, 8285, 8317];

    const brightUnionCoverIds = [8090, 8220, 8221, 8233, 8251];

    const coverIDsV1 = [...simpleCoverIds, ...brightUnionCoverIds];

    const coverContract = this.cover;
    const individualClaims = this.individualClaims;
    const mr = this.memberRoles;

    const governanceImpersonated = await getSigner(this.governance.address);
    await evm.impersonate(this.governance.address);
    await evm.setBalance(this.governance.address, parseEther('1000'));

    const kycAuthAddress = '0x5c422f8B5E28530e0972b75E32F4f6A03421E858';
    const kycAuthPVK = '9fcb6d09c64316b95f17b03c66729562f85abd5299f9e653d060eb6a3ed62c0d';
    const kycAuthSigner = new ethers.Wallet(kycAuthPVK, ethers.defaultProvider);

    await mr.connect(governanceImpersonated).setKycAuthAddress(kycAuthAddress);

    const distributorCoverOwners = {};

    // load cover owners according to the distributor
    for (const coverId of brightUnionCoverIds) {
      const ownerAddress = await brightUnionDistributor.ownerOf(coverId);
      distributorCoverOwners[coverId] = ownerAddress;
    }

    const useSubmitAndClaimProcess = {};
    for (const id of brightUnionCoverIds) {
      useSubmitAndClaimProcess[id] = true;
    }

    async function submitAndClaimProcess({ coverIdV1, segmentId, requestedAmount, deposit }) {
      const ownerAddress = distributorCoverOwners[coverIdV1];

      const owner = await getSigner(ownerAddress);
      await evm.impersonate(ownerAddress);
      await evm.setBalance(ownerAddress, parseEther('1000'));

      console.log(`Migrating cover ${coverIdV1} from Bright Union.`);
      // migrate cover through submitClaim
      await brightUnionDistributor.connect(owner).submitClaim(coverIdV1, toUtf8Bytes(''));

      const coverIdV2 = await coverContract.coverDataCount();

      console.log(`Make owner a member so it can claim.`);
      await enrollMember({ mr }, [owner], kycAuthSigner);

      console.log(`Submit claim for new V2 cover ${coverIdV2} for former Bright Union cover.`);
      // actually submit the claim - owner == tx.origin and becomes the new owner
      await individualClaims.connect(owner).submitClaim(coverIdV2, segmentId, requestedAmount, '', {
        value: deposit,
      });

      return { coverIdV2 };
    }

    const EULER_GRACE_PERIOD = 35; // 35 days
    const EULER_ID_V1 = '0x0000000000000000000000000000000000000028';

    await migrateClaimAndRedeem.apply(this, [
      {
        coverIDsV1,
        expectedGracePeriod: EULER_GRACE_PERIOD,
        v1ProductId: EULER_ID_V1,
        submitAndClaimProcess,
        useSubmitAndClaimProcess,
        distributorCoverOwners,
      },
    ]);
  });
});
