const { ethers, network } = require('hardhat');
const { expect } = require('chai');
const { addresses } = require('@nexusmutual/deployments');

const {
  Address,
  EnzymeAdress,
  getSigner,
  UserAddress,
  calculateCurrentTrancheId,
  submitGovernanceProposal,
  formatInternalContracts,
  calculateProxyAddress,
} = require('./utils');
const { ContractCode, ContractTypes, ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const { enrollMember } = require('../integration/utils/enroll');
const { daysToSeconds } = require('../../lib/helpers');
const { setNextBlockTime, mineNextBlock } = require('../utils/evm');
const { signCoverOrder } = require('../utils/buyCover');
const { NXM_WHALE_1 } = UserAddress;
const evm = require('./evm')();
const ASSESSMENT_VOTER_COUNT = 3;

const { BigNumber } = ethers;
const { parseEther, toUtf8Bytes, defaultAbiCoder } = ethers.utils;
const { AddressZero, MaxUint256 } = ethers.constants;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

async function castAssessmentVote(assessmentId) {
  // vote
  for (const abMember of this.abMembers.slice(0, ASSESSMENT_VOTER_COUNT)) {
    await this.assessment.connect(abMember).castVotes([assessmentId], [true], [''], 0);
  }

  const { poll: pollResult } = await this.assessment.assessments(assessmentId);
  const poll = pollResult;

  const { payoutCooldownInDays } = await this.assessment.config();

  const futureTime = poll.end + daysToSeconds(payoutCooldownInDays);

  await setTime(futureTime);
}

describe('LimitOrders', function () {
  let coverId;
  let limitOrdersProductId;
  let poolId;
  let tokenId;
  let trancheId;
  let assessmentId;
  let requestedClaimAmount;
  let claimDeposit;

  async function getContractByContractCode(contractName, contractCode) {
    this.master = this.master ?? (await ethers.getContractAt('NXMaster', addresses.NXMaster));
    const contractAddress = await this.master?.getLatestAddress(toUtf8Bytes(contractCode));
    return ethers.getContractAt(contractName, contractAddress);
  }

  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);

    // Get or revert snapshot if network is tenderly
    if (network.name === 'tenderly') {
      const { TENDERLY_SNAPSHOT_ID } = process.env;
      if (TENDERLY_SNAPSHOT_ID) {
        await evm.revert(TENDERLY_SNAPSHOT_ID);
        console.info(`Reverted to snapshot ${TENDERLY_SNAPSHOT_ID}`);
      } else {
        console.info('Snapshot ID: ', await evm.snapshot());
      }
    }
    const [deployer] = await ethers.getSigners();
    await evm.setBalance(deployer.address, parseEther('1000'));
    trancheId = await calculateCurrentTrancheId();
  });

  it('load contracts', async function () {
    this.stakingProducts = await ethers.getContractAt('StakingProducts', addresses.StakingProducts);
    this.cover = await ethers.getContractAt('Cover', addresses.Cover);
    this.coverProducts = await ethers.getContractAt('CoverProducts', addresses.CoverProducts);
    this.stakingPoolFactory = await ethers.getContractAt('StakingPoolFactory', addresses.StakingPoolFactory);
    this.stakingViewer = await ethers.getContractAt('StakingViewer', addresses.StakingViewer);
    this.mcr = await ethers.getContractAt('MCR', addresses.MCR);
    this.nxm = await ethers.getContractAt('NXMToken', addresses.NXMToken);
    this.master = await ethers.getContractAt('NXMaster', addresses.NXMaster);
    this.coverNFT = await ethers.getContractAt('CoverNFT', addresses.CoverNFT);
    this.pool = await ethers.getContractAt('ILegacyPool', addresses.Pool);
    this.ramm = await ethers.getContractAt('Ramm', addresses.Ramm);
    this.assessment = await ethers.getContractAt('Assessment', addresses.Assessment);
    this.stakingNFT = await ethers.getContractAt('StakingNFT', addresses.StakingNFT);
    this.swapOperator = await ethers.getContractAt('SwapOperator', addresses.SwapOperator);
    this.priceFeedOracle = await ethers.getContractAt('PriceFeedOracle', addresses.PriceFeedOracle);
    this.tokenController = await ethers.getContractAt('TokenController', addresses.TokenController);
    this.individualClaims = await ethers.getContractAt('IndividualClaims', addresses.IndividualClaims);
    this.quotationData = await ethers.getContractAt('LegacyQuotationData', addresses.LegacyQuotationData);
    this.newClaimsReward = await ethers.getContractAt('LegacyClaimsReward', addresses.LegacyClaimsReward);
    this.proposalCategory = await ethers.getContractAt('ProposalCategory', addresses.ProposalCategory);
    this.pooledStaking = await ethers.getContractAt('LegacyPooledStaking', addresses.LegacyPooledStaking);

    this.dai = await ethers.getContractAt('ERC20Mock', Address.DAI_ADDRESS);
    this.rEth = await ethers.getContractAt('ERC20Mock', Address.RETH_ADDRESS);
    this.stEth = await ethers.getContractAt('ERC20Mock', Address.STETH_ADDRESS);
    this.weth = await ethers.getContractAt('WETH9', Address.WETH_ADDRESS);
    this.enzymeShares = await ethers.getContractAt('ERC20Mock', EnzymeAdress.ENZYMEV4_VAULT_PROXY_ADDRESS);

    this.governance = await getContractByContractCode('Governance', ContractCode.Governance);
    this.memberRoles = await getContractByContractCode('MemberRoles', ContractCode.MemberRoles);
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

  it('Impersonate new pool manager', async function () {
    await evm.impersonate(NXM_WHALE_1);
    await evm.setBalance(NXM_WHALE_1, parseEther('1000000'));
    this.manager = await getSigner(NXM_WHALE_1);
  });

  it('Change MemberRoles KYC Auth wallet to add new members', async function () {
    await evm.impersonate(addresses.Governance);
    await evm.setBalance(addresses.Governance, parseEther('1000'));
    const governanceSigner = await getSigner(addresses.Governance);

    this.kycAuthSigner = ethers.Wallet.createRandom().connect(ethers.provider);

    await this.memberRoles.connect(governanceSigner).setKycAuthAddress(this.kycAuthSigner.address);
  });

  it('Add product to be used for LimitOrders', async function () {
    const productsBefore = await this.coverProducts.getProducts();

    await this.coverProducts.connect(this.abMembers[0]).setProducts([
      {
        productName: 'LimitOrders Product',
        productId: MaxUint256,
        ipfsMetadata: '',
        product: {
          productType: 0,
          minPrice: 0,
          __gap: AddressZero,
          coverAssets: 0,
          initialPriceRatio: 100,
          capacityReductionRatio: 0,
          useFixedPrice: false,
          isDeprecated: false,
        },
        allowedPools: [],
      },
    ]);

    const productsAfter = await this.coverProducts.getProducts();
    limitOrdersProductId = productsAfter.length - 1;
    expect(productsAfter.length).to.be.equal(productsBefore.length + 1);
  });

  it('Create StakingPool', async function () {
    const manager = this.manager;
    const products = [
      {
        productId: limitOrdersProductId,
        weight: 100,
        initialPrice: 1000,
        targetPrice: 1000,
      },
    ];

    const stakingPoolCountBefore = await this.stakingPoolFactory.stakingPoolCount();
    await this.stakingProducts.connect(manager).createStakingPool(false, 5, 5, products, 'description');
    const stakingPoolCountAfter = await this.stakingPoolFactory.stakingPoolCount();

    poolId = stakingPoolCountAfter.toNumber();
    expect(stakingPoolCountAfter).to.be.equal(stakingPoolCountBefore.add(1));

    const address = await this.cover.stakingPool(poolId);
    this.stakingPool = await ethers.getContractAt('StakingPool', address);
  });

  it('Deposit to StakingPool', async function () {
    const manager = this.manager;
    const managerAddress = await manager.getAddress();
    const managerBalanceBefore = await this.nxm.balanceOf(managerAddress);
    const totalSupplyBefore = await this.stakingNFT.totalSupply();
    const amount = parseEther('100');

    await this.nxm.connect(manager).approve(this.tokenController.address, amount);
    await this.stakingPool.connect(manager).depositTo(amount, trancheId + 2, 0, AddressZero);

    const managerBalanceAfter = await this.nxm.balanceOf(managerAddress);
    const totalSupplyAfter = await this.stakingNFT.totalSupply();
    tokenId = totalSupplyAfter;
    const owner = await this.stakingNFT.ownerOf(tokenId);

    expect(totalSupplyAfter).to.equal(totalSupplyBefore.add(1));
    expect(managerBalanceAfter).to.equal(managerBalanceBefore.sub(amount));
    expect(owner).to.equal(managerAddress);
  });

  it('add new LimitOrders (LO) contract', async function () {
    const contractsBefore = await this.master.getInternalContracts();

    // TODO: brute force salt for LimitOrders proxy address on change freeze
    // node scripts/create2/find-salt.js -f '0x01BFd82675DBCc7762C84019cA518e701C0cD07e' \
    //                                   -c '0xffffffffffffffffffffffffffffffffffffffff' \
    //                                   -t cafea OwnedUpgradeabilityProxy
    //
    // tbd -> tbd
    const limitOrdersCreate2Salt = 203789506820;
    this.limitOrders = await ethers.deployContract('LimitOrders', [this.nxm.address, Address.WETH_ADDRESS]);
    const limitOrdersTypeAndSalt = BigNumber.from(limitOrdersCreate2Salt).shl(8).add(ContractTypes.Proxy);
    console.log({
      limitOrdersCreate2Salt,
      limitOrdersTypeAndSalt: limitOrdersTypeAndSalt.toString(),
    });

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.newContracts, // addNewInternalContracts(bytes2[],address[],uint256[])
      defaultAbiCoder.encode(
        ['bytes2[]', 'address[]', 'uint256[]'],
        [[toUtf8Bytes(ContractCode.LimitOrders)], [this.limitOrders.address], [limitOrdersTypeAndSalt]],
      ),
      this.abMembers,
      this.governance,
    );

    const contractsAfter = await this.master.getInternalContracts();

    console.info('LimitOrders Contracts before:', formatInternalContracts(contractsBefore));
    console.info('LimitOrders Contracts after:', formatInternalContracts(contractsAfter));

    const expectedCoverOrderProxyAddress = calculateProxyAddress(this.master.address, limitOrdersCreate2Salt);
    const actualCoverOrderProxyAddress = await this.master.getLatestAddress(toUtf8Bytes('LO'));
    expect(actualCoverOrderProxyAddress).to.equal(expectedCoverOrderProxyAddress);

    // set this.coverProducts to the coverProducts proxy contract
    this.limitOrders = await ethers.getContractAt('LimitOrders', actualCoverOrderProxyAddress);
  });

  it('Upgrade contracts', async function () {
    const contractsBefore = await this.master.getInternalContracts();

    const stakingPoolImplementationAddress = '0xcafea0A9d6Befca134763849C159FBdd1175C2a7';

    const cover = await ethers.deployContract('Cover', [
      this.coverNFT.address,
      this.stakingNFT.address,
      this.stakingPoolFactory.address,
      stakingPoolImplementationAddress,
    ]);

    const contractCodeAddressMapping = {
      [ContractCode.Cover]: cover.address,
    };

    // NOTE: Do not manipulate the map between Object.keys and Object.values otherwise the ordering could go wrong
    const codes = Object.keys(contractCodeAddressMapping).map(code => toUtf8Bytes(code));
    const addresses = Object.values(contractCodeAddressMapping);

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [codes, addresses]),
      this.abMembers,
      this.governance,
    );

    const contractsAfter = await this.master.getInternalContracts();

    this.cover = await getContractByContractCode('Cover', ContractCode.Cover);

    console.info('Upgrade Contracts before:', formatInternalContracts(contractsBefore));
    console.info('Upgrade Contracts after:', formatInternalContracts(contractsAfter));
  });

  it('Buy cover using LimitOrders', async function () {
    this.coverBuyer = await ethers.Wallet.createRandom().connect(ethers.provider);
    await evm.setBalance(this.coverBuyer.address, parseEther('20000000000'));
    await this.weth.connect(this.coverBuyer).deposit({ value: parseEther('100') });
    await this.weth.connect(this.coverBuyer).approve(this.limitOrders.address, parseEther('100'));

    const amount = parseEther('1');
    const commissionRatio = '500'; // 5%

    const coverCountBefore = await this.cover.coverDataCount();

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const maxPremiumInAsset = parseEther('1').mul(260).div(10000);
    const executionDetails = {
      notBefore: currentTimestamp,
      deadline: currentTimestamp + 3600,
      maxPremiumInAsset,
    };

    const buyCoverFixture = {
      productId: limitOrdersProductId,
      amount,
      period: 3600 * 24 * 30, // 30 days
      ipfsData: '',
      paymentAsset: 0,
      coverAsset: 0,
      owner: this.coverBuyer.address,
      commissionRatio: this.coverBuyer.address,
      commissionDestination: this.coverBuyer.address,
      executionDetails,
    };

    const { signature } = await signCoverOrder(this.limitOrders.address, buyCoverFixture, this.coverBuyer);

    await this.limitOrders.connect(this.abMembers[0]).executeOrder(
      {
        ...buyCoverFixture,
        coverId: 0,
        maxPremiumInAsset,
        commissionRatio,
        commissionDestination: this.coverBuyer.address,
        ipfsData: '',
      },
      [{ poolId, coverAmountInAsset: amount }],
      executionDetails,
      signature,
    );

    const coverCountAfter = await this.cover.coverDataCount();
    coverId = coverCountAfter;
    const isCoverBuyerOwner = await this.coverNFT.isApprovedOrOwner(this.coverBuyer.address, coverId);

    expect(isCoverBuyerOwner).to.be.equal(true);
    expect(coverCountAfter).to.be.equal(coverCountBefore.add(1));
  });

  it('Cover Buyer fails to claim cover without becoming a member', async function () {
    const ipfsHash = '0x68747470733a2f2f7777772e796f75747562652e636f6d2f77617463683f763d423365414d47584677316f';
    const requestedAmount = parseEther('1');
    const segmentId = (await this.cover.coverSegmentsCount(coverId)).sub(1);
    const segment = await this.cover.coverSegmentWithRemainingAmount(coverId, segmentId);

    const [deposit] = await this.individualClaims.getAssessmentDepositAndReward(
      requestedAmount,
      segment.period,
      0, // ETH
    );

    await expect(
      this.individualClaims
        .connect(this.coverBuyer)
        .submitClaim(coverId, segmentId, requestedAmount, ipfsHash, { value: deposit }),
    ).to.revertedWith('Caller is not a member');
  });

  it('Cover Buyer becomes a member', async function () {
    await enrollMember(
      { mr: this.memberRoles, tk: this.nxm, tc: this.tokenController },
      [this.coverBuyer],
      this.kycAuthSigner,
      { initialTokens: 0 },
    );

    const isMember = await this.memberRoles.isMember(this.coverBuyer.address);
    expect(isMember).to.be.equal(true);
  });

  it('Cover Buyer submits claim', async function () {
    const claimsCountBefore = await this.individualClaims.getClaimsCount();
    const assessmentCountBefore = await this.assessment.getAssessmentsCount();

    const ipfsHash = '0x68747470733a2f2f7777772e796f75747562652e636f6d2f77617463683f763d423365414d47584677316f';
    const requestedAmount = parseEther('1');
    const segmentId = (await this.cover.coverSegmentsCount(coverId)).sub(1);
    const segment = await this.cover.coverSegmentWithRemainingAmount(coverId, segmentId);

    const [deposit] = await this.individualClaims.getAssessmentDepositAndReward(
      requestedAmount,
      segment.period,
      0, // ETH
    );
    await this.individualClaims
      .connect(this.coverBuyer)
      .submitClaim(coverId, segmentId, requestedAmount, ipfsHash, { value: deposit });

    const claimsCountAfter = await this.individualClaims.getClaimsCount();
    const assessmentCountAfter = await this.assessment.getAssessmentsCount();

    assessmentId = assessmentCountBefore.toString();
    expect(claimsCountAfter).to.be.equal(claimsCountBefore.add(1));
    expect(assessmentCountAfter).to.be.equal(assessmentCountBefore.add(1));

    requestedClaimAmount = requestedAmount;
    claimDeposit = deposit;
  });

  it('Stake for assessment', async function () {
    // stake
    const amount = parseEther('100');
    for (const abMember of this.abMembers.slice(0, ASSESSMENT_VOTER_COUNT)) {
      const memberAddress = await abMember.getAddress();
      const { amount: stakeAmountBefore } = await this.assessment.stakeOf(memberAddress);
      await this.assessment.connect(abMember).stake(amount);
      const { amount: stakeAmountAfter } = await this.assessment.stakeOf(memberAddress);
      expect(stakeAmountAfter).to.be.equal(stakeAmountBefore.add(amount));
    }
  });

  it('Process assessment for custody cover and ETH payout', async function () {
    await castAssessmentVote.call(this, assessmentId);

    const claimId = (await this.individualClaims.getClaimsCount()).toNumber() - 1;

    const balanceBefore = await ethers.provider.getBalance(this.coverBuyer.address);

    // redeem payout
    const tx = await this.individualClaims.connect(this.coverBuyer).redeemClaimPayout(claimId);
    const receipt = await tx.wait();

    const balanceAfter = await ethers.provider.getBalance(this.coverBuyer.address);
    expect(balanceAfter).to.be.equal(
      balanceBefore.add(requestedClaimAmount).add(claimDeposit).sub(receipt.effectiveGasPrice.mul(receipt.gasUsed)),
    );

    const { payoutRedeemed } = await this.individualClaims.claims(claimId);
    expect(payoutRedeemed).to.be.equal(true);
  });

  require('./basic-functionality-tests');
});
