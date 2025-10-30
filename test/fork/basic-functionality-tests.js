const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { abis, addresses } = require('@nexusmutual/deployments');
const {
  impersonateAccount,
  setBalance,
  setNextBlockBaseFeePerGas,
  time,
} = require('@nomicfoundation/hardhat-network-helpers');

const {
  Addresses,
  executeGovernorProposal,
  getFundedSigner,
  getImplementation,
  getTrancheId,
  setCbBTCBalance,
  setERC20Balance,
  setUSDCBalance,
} = require('./utils');

const { deployContract, formatEther, ZeroAddress, MaxUint256, parseEther, parseUnits } = ethers;
const { ContractIndexes, AssessmentOutcome, AssessmentStatus } = nexus.constants;

const CLAIM_DEPOSIT = parseEther('0.05');

// eslint-disable-next-line no-unused-vars
let custodyProductId, custodyCoverId, protocolProductId, protocolCoverId;
let poolId, trancheId, tokenId;

describe('basic functionality tests', function () {
  before(async function () {
    await time.increase(7 * 24 * 3600); // +7 days
    trancheId = await getTrancheId(await time.latest());
  });

  it('load token contracts', async function () {
    const rammAddress = await this.registry.getContractAddressByIndex(ContractIndexes.C_RAMM);
    this.ramm = await ethers.getContractAt('Ramm', rammAddress);
    this.dai = await ethers.getContractAt('ERC20Mock', Addresses.DAI_ADDRESS);
    this.usdc = await ethers.getContractAt('ERC20Mock', Addresses.USDC_ADDRESS);
    this.rEth = await ethers.getContractAt('ERC20Mock', Addresses.RETH_ADDRESS);
    this.stEth = await ethers.getContractAt('ERC20Mock', Addresses.STETH_ADDRESS);
    this.awEth = await ethers.getContractAt('ERC20Mock', Addresses.AWETH_ADDRESS);
    this.enzymeShares = await ethers.getContractAt('ERC20Mock', Addresses.ENZYMEV4_VAULT_PROXY_ADDRESS);
    this.aaveUsdcVariableDebtToken = await ethers.getContractAt('ERC20Mock', Addresses.VARIABLE_DEBT_USDC_ADDRESS);
    this.cbbtc = await ethers.getContractAt('ERC20Mock', Addresses.CBBTC_ADDRESS);
  });

  it('funds wallets', async function () {
    this.nxm = await ethers.getContractAt(abis.NXMToken, addresses.NXMToken);

    const accounts = await ethers.getSigners();
    this.members = accounts.slice(1, 15);
    this.manager = this.members[0];
    this.usdcHolder = this.members[1];
    this.cbBTCHolder = this.members[2];
    this.assessors = this.members.slice(10, 15);

    for (const wallet of this.members) {
      await setERC20Balance(this.nxm.target, wallet.address, parseEther('10000'));
    }

    await setERC20Balance(this.nxm.target, this.usdcHolder.address, parseEther('1000'));
    await setUSDCBalance(this.usdc.target, this.usdcHolder.address, parseUnits('1000000', 6));
    await setCbBTCBalance(this.cbbtc.target, this.cbBTCHolder.address, parseUnits('100', 8));
  });

  it('performs hypothetical future Governor upgrade', async function () {
    const newGovernor = await deployContract('Governor', [this.registry]);

    const txs = [
      {
        target: this.registry,
        data: this.registry.interface.encodeFunctionData('upgradeContract', [
          ContractIndexes.C_GOVERNOR,
          newGovernor.target,
        ]),
        value: 0n,
      },
    ];

    await executeGovernorProposal(this.governor, this.abMembers, txs);

    expect(await getImplementation(this.governor)).to.be.equal(newGovernor.target);
  });

  it('switch kyc auth wallet', async function () {
    this.kycAuthSigner = ethers.Wallet.createRandom().connect(ethers.provider);

    const txs = [
      {
        target: this.registry.target,
        data: await this.registry.interface.encodeFunctionData('setKycAuthAddress', [this.kycAuthSigner.address]),
        value: 0,
      },
    ];
    await executeGovernorProposal(this.governor, this.abMembers, txs);

    const currentKycAuth = await this.registry.getKycAuthAddress();
    expect(currentKycAuth).to.be.equal(this.kycAuthSigner.address);
  });

  it('Add new members', async function () {
    const JOINING_FEE = ethers.parseEther('0.002');
    const { chainId } = await ethers.provider.getNetwork();

    for (const member of this.members) {
      const signature = await nexus.signing.signJoinMessage(this.kycAuthSigner, member, this.registry, { chainId });
      await this.registry.join(member, signature, { value: JOINING_FEE });
      expect(await this.registry.isMember(member.address)).to.be.true;
    }
  });

  it('Swap NXM for ETH', async function () {
    const [member] = this.members;
    const nxmIn = parseEther('1');
    const minEthOut = parseEther('0.022');
    const maxEthOut = parseEther('0.024');

    await this.nxm.connect(member).approve(this.tokenController, nxmIn);
    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 5 * 60;

    const poolEthBefore = await ethers.provider.getBalance(this.pool);
    const memberEthBefore = await ethers.provider.getBalance(member);
    const memberNxmBefore = await this.nxm.balanceOf(member);
    const nxmSupplyBefore = await this.nxm.totalSupply();

    await setNextBlockBaseFeePerGas(0).catch(e => e);
    const tx = await this.ramm.connect(member).swap(nxmIn, minEthOut, deadline, { maxPriorityFeePerGas: 0 });

    const poolEthAfter = await ethers.provider.getBalance(this.pool);
    const memberEthAfter = await ethers.provider.getBalance(member);
    const memberNxmAfter = await this.nxm.balanceOf(member);
    const nxmSupplyAfter = await this.nxm.totalSupply();

    const memberEthReceived = memberEthAfter - memberEthBefore;
    const actualEthOut = poolEthBefore - poolEthAfter;
    expect(memberEthReceived).to.be.equal(actualEthOut);
    expect(actualEthOut).to.be.gte(minEthOut);
    expect(actualEthOut).to.be.lte(maxEthOut);

    const memberNxmSent = memberNxmBefore - memberNxmAfter;
    expect(memberNxmSent).to.be.equal(nxmIn);
    expect(memberNxmAfter).to.be.equal(memberNxmBefore - nxmIn);
    expect(nxmSupplyAfter).to.be.equal(nxmSupplyBefore - memberNxmSent);

    await expect(tx).to.emit(this.ramm, 'NxmSwappedForEth').withArgs(member, memberNxmSent, actualEthOut);
  });

  it('Swap ETH for NXM', async function () {
    const [member] = this.members;
    const ethIn = parseEther('0.024');
    const minNxmOut = parseEther('0.95');
    const maxNxmOut = parseEther('1.05');

    const poolEthBefore = await ethers.provider.getBalance(this.pool);
    const memberEthBefore = await ethers.provider.getBalance(member);
    const memberNxmBefore = await this.nxm.balanceOf(member);
    const nxmSupplyBefore = await this.nxm.totalSupply();

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 5 * 60;

    await setNextBlockBaseFeePerGas(0).catch(e => e);
    const tx = await this.ramm.connect(member).swap(0, minNxmOut, deadline, { value: ethIn, maxPriorityFeePerGas: 0 });

    const poolEthAfter = await ethers.provider.getBalance(this.pool);
    const memberEthAfter = await ethers.provider.getBalance(member);
    const memberNxmAfter = await this.nxm.balanceOf(member);
    const nxmSupplyAfter = await this.nxm.totalSupply();

    const memberNxmReceived = memberNxmAfter - memberNxmBefore;
    const actualNxmMinted = nxmSupplyAfter - nxmSupplyBefore;
    expect(memberNxmReceived).to.be.equal(actualNxmMinted);
    expect(actualNxmMinted).to.be.gte(minNxmOut);
    expect(actualNxmMinted).to.be.lte(maxNxmOut);

    const memberEthSent = memberEthBefore - memberEthAfter;
    const actualEthIn = poolEthAfter - poolEthBefore;
    expect(memberEthSent).to.be.equal(actualEthIn);
    expect(actualEthIn).to.be.equal(ethIn);

    await expect(tx).to.emit(this.ramm, 'EthSwappedForNxm').withArgs(member, actualEthIn, memberNxmReceived);
  });

  it('Add product types', async function () {
    const ONE_DAY = 24 * 60 * 60;

    const productTypes = [
      {
        productTypeName: 'x',
        productTypeId: MaxUint256,
        ipfsMetadata: 'protocolCoverIPFSHash',
        productType: {
          claimMethod: 0,
          gracePeriod: 30 * ONE_DAY,
          assessmentCooldownPeriod: ONE_DAY,
          payoutRedemptionPeriod: 30 * ONE_DAY,
        },
      },
      {
        productTypeName: 'y',
        productTypeId: MaxUint256,
        ipfsMetadata: 'custodyCoverIPFSHash',
        productType: {
          claimMethod: 0,
          gracePeriod: 90 * ONE_DAY,
          assessmentCooldownPeriod: ONE_DAY,
          payoutRedemptionPeriod: 30 * ONE_DAY,
        },
      },
    ];

    const productTypesCountBefore = await this.coverProducts.getProductTypeCount();
    await this.coverProducts.connect(this.abMembers[0]).setProductTypes(productTypes);
    const productTypesCountAfter = await this.coverProducts.getProductTypeCount();
    expect(productTypesCountAfter - productTypesCountBefore).to.be.equal(productTypes.length);

    this.newProductTypes = [];
    for (let i = 1; i <= productTypes.length; i++) {
      this.newProductTypes.push(productTypesCountAfter - 1n);
    }
  });

  it('Add assessment groups', async function () {
    const assessorIds = await Promise.all(this.assessors.map(assessor => this.registry.getMemberId(assessor.address)));

    const assessmentGroupId = (await this.assessments.getGroupsCount()) + 1n;
    const txs = [
      // add assessors to a new group (groupId 0 creates new group)
      {
        target: this.assessments.target,
        value: 0n,
        data: this.assessments.interface.encodeFunctionData('addAssessorsToGroup', [assessorIds, 0]),
      },
      // set assessment groupId for product types
      {
        target: this.assessments.target,
        value: 0n,
        data: this.assessments.interface.encodeFunctionData('setAssessingGroupIdForProductTypes', [
          [0, 1], // protocol and custody ProductType
          assessmentGroupId,
        ]),
      },
    ];
    await executeGovernorProposal(this.governor, this.abMembers, txs);
  });

  it('Add protocol product', async function () {
    const productsCountBefore = await this.coverProducts.getProductCount();

    await this.coverProducts.connect(this.abMembers[0]).setProducts([
      {
        productName: 'Protocol Product',
        productId: MaxUint256,
        ipfsMetadata: '',
        product: {
          productType: 0,
          minPrice: 0,
          __gap: 0,
          coverAssets: 0,
          initialPriceRatio: 100,
          capacityReductionRatio: 0,
          useFixedPrice: false,
          isDeprecated: false,
        },
        allowedPools: [],
      },
    ]);

    const productsCountAfter = await this.coverProducts.getProductCount();
    protocolProductId = productsCountAfter - 1n;
    expect(productsCountAfter).to.be.equal(productsCountBefore + 1n);
  });

  it('Add custody product', async function () {
    const productsCountBefore = await this.coverProducts.getProductCount();

    await this.coverProducts.connect(this.abMembers[0]).setProducts([
      {
        productName: 'Custody Product',
        productId: MaxUint256,
        ipfsMetadata: '',
        product: {
          productType: 1,
          minPrice: 0,
          __gap: 0,
          coverAssets: 0,
          initialPriceRatio: 100,
          capacityReductionRatio: 0,
          useFixedPrice: false,
          isDeprecated: false,
        },
        allowedPools: [],
      },
    ]);

    const productsCountAfter = await this.coverProducts.getProductCount();
    custodyProductId = productsCountAfter - 1n;
    expect(productsCountAfter).to.be.equal(productsCountBefore + 1n);
  });

  it('Create StakingPool', async function () {
    const manager = this.manager;
    expect(await this.registry.isMember(manager.address)).to.be.true;
    const products = [
      {
        productId: custodyProductId,
        weight: 100,
        initialPrice: 1000,
        targetPrice: 1000,
      },
      {
        productId: protocolProductId,
        weight: 100,
        initialPrice: 1000,
        targetPrice: 1000,
      },
    ];

    const stakingPoolCountBefore = await this.stakingPoolFactory.stakingPoolCount();
    await this.stakingProducts.connect(manager).createStakingPool(false, 5, 5, products, 'description');

    const stakingPoolCountAfter = await this.stakingPoolFactory.stakingPoolCount();
    expect(stakingPoolCountAfter).to.be.equal(stakingPoolCountBefore + 1n);

    poolId = stakingPoolCountAfter;

    const address = await this.cover.stakingPool(poolId);
    this.stakingPool = await ethers.getContractAt('StakingPool', address);
  });

  it('Deposit to StakingPool', async function () {
    const manager = this.manager;
    const managerAddress = await manager.getAddress();
    const managerBalanceBefore = await this.nxm.balanceOf(managerAddress);
    const totalSupplyBefore = await this.stakingNFT.totalSupply();
    const amount = parseEther('100');

    await this.nxm.connect(manager).approve(this.tokenController.target, amount);
    await this.stakingPool.connect(manager).depositTo(amount, trancheId + 1, 0, ZeroAddress);

    const managerBalanceAfter = await this.nxm.balanceOf(managerAddress);
    const totalSupplyAfter = await this.stakingNFT.totalSupply();
    tokenId = totalSupplyAfter;
    const owner = await this.stakingNFT.ownerOf(tokenId);

    expect(totalSupplyAfter).to.equal(totalSupplyBefore + 1n);
    expect(managerBalanceAfter).to.equal(managerBalanceBefore - amount);
    expect(owner).to.equal(managerAddress);
  });

  it('Extend existing deposit in StakingPool', async function () {
    const manager = this.manager;
    const managerAddress = await manager.getAddress();
    const amount = parseEther('5000');
    const managerBalanceBefore = await this.nxm.balanceOf(managerAddress);
    const tokenControllerBalanceBefore = await this.nxm.balanceOf(this.tokenController.target);

    await this.nxm.connect(manager).approve(this.tokenController.target, amount);
    await this.stakingPool.connect(manager).extendDeposit(tokenId, trancheId + 1, trancheId + 7, amount);

    const tokenControllerBalanceAfter = await this.nxm.balanceOf(this.tokenController.target);
    const managerBalanceAfter = await this.nxm.balanceOf(managerAddress);

    expect(managerBalanceAfter).to.equal(managerBalanceBefore - amount);
    expect(tokenControllerBalanceAfter).to.equal(tokenControllerBalanceBefore + amount);
  });

  it('Buy custody cover', async function () {
    const coverBuyer = this.members[1];
    const coverBuyerAddress = coverBuyer.address;

    const coverAsset = 0; // ETH
    const amount = parseEther('1');
    const commissionRatio = '500'; // 5%

    const coverCountBefore = await this.cover.getCoverDataCount();

    await this.cover.connect(coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverBuyerAddress,
        productId: custodyProductId,
        coverAsset,
        amount,
        period: 3600 * 24 * 30, // 30 days
        maxPremiumInAsset: (amount * 260n) / 10000n,
        paymentAsset: coverAsset,
        payWithNXM: false,
        commissionRatio,
        commissionDestination: coverBuyerAddress,
        ipfsData: '',
      },
      [{ poolId, coverAmountInAsset: amount }],
      { value: amount },
    );

    const coverCountAfter = await this.cover.getCoverDataCount();
    custodyCoverId = coverCountAfter;

    expect(coverCountAfter).to.be.equal(coverCountBefore + 1n);
  });

  it('Submit claim for ETH custody cover and process the assessment', async function () {
    const coverBuyer = this.members[1];
    const claimId = await this.claims.getClaimsCount();
    const claimsCountBefore = claimId;

    // submit claim
    const ipfsMetaData = ethers.solidityPackedKeccak256(['string'], ['Happy path ETH claim proof']);
    const requestedAmount = parseEther('1');

    await this.claims.connect(coverBuyer).submitClaim(custodyCoverId, requestedAmount, ipfsMetaData, {
      value: CLAIM_DEPOSIT,
      gasPrice: 0,
    });

    const claimsCountAfter = await this.claims.getClaimsCount();

    expect(claimsCountAfter).to.equal(claimsCountBefore + 1n);

    const ipfsHashFor = ethers.solidityPackedKeccak256(['string'], ['happy-path-accept']);
    const ipfsHashAgainst = ethers.solidityPackedKeccak256(['string'], ['happy-path-deny']);

    await this.assessments.connect(this.assessors[0]).castVote(claimId, true, ipfsHashFor); // accept
    await this.assessments.connect(this.assessors[1]).castVote(claimId, true, ipfsHashFor); // accept
    await this.assessments.connect(this.assessors[2]).castVote(claimId, true, ipfsHashFor); // accept
    await this.assessments.connect(this.assessors[3]).castVote(claimId, false, ipfsHashAgainst); // deny

    // advance time past voting and cooldown periods
    const assessment = await this.assessments.getAssessment(claimId);
    const cooldownEndTime = assessment.votingEnd + assessment.cooldownPeriod + 24n * 60n * 60n;
    await time.increaseTo(cooldownEndTime);

    // claim ACCEPTED
    const { status, outcome } = await this.claims.getClaimDetails(claimId);
    expect(status).to.equal(AssessmentStatus.Finalized);
    expect(outcome).to.equal(AssessmentOutcome.Accepted);

    const claimDepositAmount = await this.claims.CLAIM_DEPOSIT_IN_ETH();
    const claimantEthBalanceBefore = await ethers.provider.getBalance(coverBuyer.address);

    // redeem claim payout
    const redeemTx = this.claims.connect(coverBuyer).redeemClaimPayout(claimId, { gasPrice: 0 });
    await expect(redeemTx).to.emit(this.claims, 'ClaimPayoutRedeemed');

    // Verify balances after redemption
    const claimantEthBalanceAfter = await ethers.provider.getBalance(coverBuyer.address);

    // Expected increase: claim amount (0.05 ETH) + deposit returned (0.05 ETH) = 0.1 ETH
    const expectedEthIncrease = requestedAmount + claimDepositAmount;
    const actualEthIncrease = claimantEthBalanceAfter - claimantEthBalanceBefore;

    expect(actualEthIncrease).to.equal(expectedEthIncrease);
  });

  it('Buy protocol cbBTC cover', async function () {
    const coverBuyer = this.cbBTCHolder;
    const coverBuyerAddress = coverBuyer.address;

    const coverAsset = await this.pool.getAssetId(Addresses.CBBTC_ADDRESS);
    const amount = parseUnits('1', 8);
    const commissionRatio = '500'; // 5%

    const coverCountBefore = await this.cover.getCoverDataCount();

    await this.cbbtc.connect(coverBuyer).approve(this.cover, parseUnits('1', 8));
    const maxPremiumInAsset = (amount * 260n) / 10000n;

    console.log('Buying cover..');

    await this.cover.connect(coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverBuyerAddress,
        productId: protocolProductId,
        coverAsset,
        amount,
        period: 3600 * 24 * 30, // 30 days
        maxPremiumInAsset,
        paymentAsset: coverAsset,
        payWithNXM: false,
        commissionRatio,
        commissionDestination: coverBuyerAddress,
        ipfsData: '',
      },
      [{ poolId, coverAmountInAsset: amount }],
    );

    console.log('Bought..');
    const coverCountAfter = await this.cover.getCoverDataCount();
    protocolCoverId = coverCountAfter;

    expect(coverCountAfter).to.be.equal(coverCountBefore + 1n);
  });

  it('Submit claim for cbBTC custody cover and process the assessment', async function () {
    const coverBuyer = this.cbBTCHolder;
    const claimId = await this.claims.getClaimsCount();
    const claimsCountBefore = claimId;

    // submit claim
    const ipfsMetaData = ethers.solidityPackedKeccak256(['string'], ['Happy path ETH claim proof']);
    const requestedAmount = parseUnits('1', 8);

    await this.claims.connect(coverBuyer).submitClaim(protocolCoverId, requestedAmount, ipfsMetaData, {
      value: CLAIM_DEPOSIT,
      gasPrice: 0,
    });

    const claimsCountAfter = await this.claims.getClaimsCount();

    expect(claimsCountAfter).to.equal(claimsCountBefore + 1n);

    const ipfsHashFor = ethers.solidityPackedKeccak256(['string'], ['happy-path-accept']);
    const ipfsHashAgainst = ethers.solidityPackedKeccak256(['string'], ['happy-path-deny']);

    await this.assessments.connect(this.assessors[3]).castVote(claimId, false, ipfsHashAgainst); // deny
    await this.assessments.connect(this.assessors[0]).castVote(claimId, true, ipfsHashFor); // accept
    await this.assessments.connect(this.assessors[1]).castVote(claimId, true, ipfsHashFor); // accept
    await this.assessments.connect(this.assessors[2]).castVote(claimId, true, ipfsHashFor); // accept

    // advance time past voting and cooldown periods
    const assessment = await this.assessments.getAssessment(claimId);
    const cooldownEndTime = assessment.votingEnd + assessment.cooldownPeriod + 24n * 60n * 60n;
    await time.increaseTo(cooldownEndTime);

    // claim ACCEPTED
    const { status, outcome } = await this.claims.getClaimDetails(claimId);
    expect(status).to.equal(AssessmentStatus.Finalized);
    expect(outcome).to.equal(AssessmentOutcome.Accepted);

    const claimDepositAmount = await this.claims.CLAIM_DEPOSIT_IN_ETH();
    const claimantEthBalanceBefore = await ethers.provider.getBalance(coverBuyer.address);
    const claimantCBBTCBalanceBefore = await this.cbBTC.balanceOf(coverBuyer.address);

    // redeem claim payout
    const redeemTx = this.claims.connect(coverBuyer).redeemClaimPayout(claimId, { gasPrice: 0 });
    await expect(redeemTx).to.emit(this.claims, 'ClaimPayoutRedeemed');

    // Verify balances after redemption
    const claimantEthBalanceAfter = await ethers.provider.getBalance(coverBuyer.address);
    const claimantCBBTCBalanceAfter = await this.cbBTC.balanceOf(coverBuyer.address);

    expect(claimantEthBalanceAfter).to.be.equal(claimantEthBalanceBefore + claimDepositAmount);
    expect(claimantCBBTCBalanceAfter).to.equal(claimantCBBTCBalanceBefore + requestedAmount);
  });

  it('Buy protocol USDC cover', async function () {
    const coverBuyer = this.usdcHolder;
    const coverBuyerAddress = this.usdcHolder.address;

    const coverAsset = await this.pool.getAssetId(Addresses.USDC_ADDRESS);
    const amount = parseUnits('1000', 6);
    const commissionRatio = '500'; // 5%

    const coverCountBefore = await this.cover.getCoverDataCount();

    await this.usdc.connect(coverBuyer).approve(this.cover.target, amount);

    const maxPremiumInAsset = (amount * 260n) / 10000n;

    console.log('Buying cover..');
    await this.cover.connect(coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverBuyerAddress,
        productId: protocolProductId,
        coverAsset,
        amount,
        period: 3600 * 24 * 30, // 30 days
        maxPremiumInAsset,
        paymentAsset: coverAsset,
        payWithNXM: false,
        commissionRatio,
        commissionDestination: coverBuyerAddress,
        ipfsData: '',
      },
      [{ poolId, coverAmountInAsset: amount }],
    );

    console.log('Bought..');
    const coverCountAfter = await this.cover.getCoverDataCount();
    protocolCoverId = coverCountAfter;

    expect(coverCountAfter).to.be.equal(coverCountBefore + 1n);
  });

  it('Submit claim for USDC custody cover and process the assessment', async function () {
    const coverBuyer = this.usdcHolder;
    const claimId = await this.claims.getClaimsCount();
    const claimsCountBefore = claimId;

    // submit claim
    const ipfsMetaData = ethers.solidityPackedKeccak256(['string'], ['Happy path ETH claim proof']);
    const requestedAmount = parseUnits('1000', 6);

    await this.claims.connect(coverBuyer).submitClaim(protocolCoverId, requestedAmount, ipfsMetaData, {
      value: CLAIM_DEPOSIT,
      gasPrice: 0,
    });

    const claimsCountAfter = await this.claims.getClaimsCount();

    expect(claimsCountAfter).to.equal(claimsCountBefore + 1n);

    const ipfsHashFor = ethers.solidityPackedKeccak256(['string'], ['happy-path-accept']);
    const ipfsHashAgainst = ethers.solidityPackedKeccak256(['string'], ['happy-path-deny']);

    await this.assessments.connect(this.assessors[0]).castVote(claimId, true, ipfsHashFor); // accept
    await this.assessments.connect(this.assessors[1]).castVote(claimId, true, ipfsHashFor); // accept
    await this.assessments.connect(this.assessors[2]).castVote(claimId, true, ipfsHashFor); // accept
    await this.assessments.connect(this.assessors[3]).castVote(claimId, false, ipfsHashAgainst); // deny

    // advance time past voting and cooldown periods
    const assessment = await this.assessments.getAssessment(claimId);
    const cooldownEndTime = assessment.votingEnd + assessment.cooldownPeriod + 24n * 60n * 60n;
    await time.increaseTo(cooldownEndTime);

    // claim ACCEPTED
    const { status, outcome } = await this.claims.getClaimDetails(claimId);
    expect(status).to.equal(AssessmentStatus.Finalized);
    expect(outcome).to.equal(AssessmentOutcome.Accepted);

    const claimDepositAmount = await this.claims.CLAIM_DEPOSIT_IN_ETH();
    const claimantEthBalanceBefore = await ethers.provider.getBalance(coverBuyer.address);
    const claimantUsdcBalanceBefore = await this.usdc.balanceOf(coverBuyer.address);

    // redeem claim payout
    const redeemTx = this.claims.connect(coverBuyer).redeemClaimPayout(claimId, { gasPrice: 0 });
    await expect(redeemTx).to.emit(this.claims, 'ClaimPayoutRedeemed');

    // Verify balances after redemption
    const claimantEthBalanceAfter = await ethers.provider.getBalance(coverBuyer.address);
    const claimantUsdcBalanceAfter = await this.usdc.balanceOf(coverBuyer.address);

    expect(claimantEthBalanceAfter).to.be.equal(claimantEthBalanceBefore + claimDepositAmount);
    expect(claimantUsdcBalanceAfter).to.be.equal(claimantUsdcBalanceBefore + requestedAmount);
  });

  it('buy cover through CoverBroker using ETH', async function () {
    const coverBuyer = await ethers.Wallet.createRandom().connect(ethers.provider);
    const coverBuyerAddress = await coverBuyer.getAddress();

    await setBalance(coverBuyer.address, parseEther('1000000'));

    const amount = parseEther('1');
    const coverCountBefore = await this.cover.getCoverDataCount();

    await this.coverBroker.connect(coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverBuyer.address,
        productId: protocolProductId,
        coverAsset: 0, // ETH
        amount,
        period: 3600 * 24 * 30, // 30 days
        maxPremiumInAsset: (amount * 260n) / 10000n,
        paymentAsset: 0, // ETH
        payWithNXM: false,
        commissionRatio: '500', // 5%,
        commissionDestination: coverBuyerAddress,
        ipfsData: '',
      },
      [{ poolId, coverAmountInAsset: amount }],
      { value: amount },
    );

    const coverCountAfter = await this.cover.getCoverDataCount();
    const coverId = coverCountAfter;
    const isCoverBuyerOwner = await this.coverNFT.isApprovedOrOwner(coverBuyer.address, coverId);

    expect(isCoverBuyerOwner).to.be.equal(true);
    expect(coverCountAfter).to.be.equal(coverCountBefore + 1n);
  });

  it('buy cover through CoverBroker using ERC20 (USDC)', async function () {
    const coverBuyer = await ethers.Wallet.createRandom().connect(ethers.provider);
    const coverBuyerAddress = await coverBuyer.getAddress();

    await setBalance(coverBuyerAddress, parseEther('1000'));
    await setUSDCBalance(this.usdc.target, coverBuyer.address, parseEther('1000000'));
    await this.usdc.connect(coverBuyer).approve(this.coverBroker.target, MaxUint256);

    const coverAsset = await this.pool.getAssetId(Addresses.USDC_ADDRESS);
    const amount = parseUnits('1000', 6);
    const coverCountBefore = await this.cover.getCoverDataCount();

    await this.coverBroker.connect(coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverBuyerAddress,
        productId: protocolProductId,
        coverAsset,
        amount,
        period: 3600 * 24 * 30, // 30 days
        maxPremiumInAsset: (amount * 260n) / 10000n,
        paymentAsset: 6, // USDC
        payWithNXM: false,
        commissionRatio: '500', // 5%,
        commissionDestination: coverBuyerAddress,
        ipfsData: '',
      },
      [{ poolId, coverAmountInAsset: amount }],
    );

    const coverCountAfter = await this.cover.getCoverDataCount();
    const coverId = coverCountAfter;
    const isCoverBuyerOwner = await this.coverNFT.isApprovedOrOwner(coverBuyerAddress, coverId);

    expect(isCoverBuyerOwner).to.be.equal(true);
    expect(coverCountAfter).to.be.equal(coverCountBefore + 1n);
  });

  it('Edit cover', async function () {
    const coverBuyer = this.members[1];
    const coverBuyerAddress = coverBuyer.address;

    const coverAsset = await this.pool.getAssetId(Addresses.USDC_ADDRESS);
    const amount = parseUnits('1000', 6);
    const commissionRatio = '0'; // 0%
    const usdcTopUpAmount = parseUnits('1000000', 6);

    const coverCountBefore = await this.cover.getCoverDataCount();

    await this.usdc.connect(coverBuyer).approve(this.cover.target, usdcTopUpAmount);

    const maxPremiumInAsset = (amount * 260n) / 10000n;
    const period = 3600n * 24n * 30n; // 30 days

    await this.cover.connect(coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverBuyerAddress,
        productId: protocolProductId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset,
        paymentAsset: coverAsset,
        payWithNXM: false,
        commissionRatio,
        commissionDestination: coverBuyerAddress,
        ipfsData: '',
      },
      [{ poolId, coverAmountInAsset: amount }],
    );
    const originalCoverId = await this.cover.getCoverDataCount();

    // editing cover to 2x amount and 2x period
    const currentTimestamp = await time.latest();
    const passedPeriod = 10n;
    const editTimestamp = BigInt(currentTimestamp) + passedPeriod;
    await time.increaseTo(editTimestamp);

    const increasedAmount = amount * 2n;
    const increasedPeriod = period * 2n;

    const maxCoverPeriod = 3600n * 24n * 365n;

    const expectedRefund = (amount * 260n * (period - passedPeriod)) / maxCoverPeriod;
    const expectedEditPremium = (increasedAmount * 260n * increasedPeriod) / maxCoverPeriod;
    const extraPremium = expectedEditPremium - expectedRefund;

    await this.cover.connect(coverBuyer).buyCover(
      {
        coverId: originalCoverId,
        owner: coverBuyerAddress,
        productId: protocolProductId,
        coverAsset,
        amount: increasedAmount,
        period: increasedPeriod,
        maxPremiumInAsset: extraPremium,
        paymentAsset: coverAsset,
        payWithNXM: false,
        commissionRatio,
        commissionDestination: coverBuyerAddress,
        ipfsData: '',
      },
      [{ poolId, coverAmountInAsset: increasedAmount.toString() }],
    );
    const editedCoverId = originalCoverId + 1n;

    const coverCountAfter = await this.cover.getCoverDataCount();
    expect(coverCountAfter).to.equal(coverCountBefore + 2n);
    expect(editedCoverId).to.equal(coverCountAfter);

    const [coverData, coverReference] = await this.cover.getCoverDataWithReference(editedCoverId);
    expect(coverData.period).to.equal(increasedPeriod);
    expect(coverData.amount).to.gte(increasedAmount);
    expect(coverReference.originalCoverId).to.equal(originalCoverId);

    const originalCoverReference = await this.cover.getCoverReference(originalCoverId);
    expect(originalCoverReference.latestCoverId).to.equal(editedCoverId);
  });

  // it('Update MCR GEAR parameter', async function () {
  //   const GEAR = toBytes('GEAR', 8);
  //   const currentGearValue = BigNumber.from(48000);
  //   const newGearValue = BigNumber.from(50000);
  //
  //   expect(currentGearValue).to.be.eq(await this.mcr.gearingFactor());
  //
  //   await submitMemberVoteGovernanceProposal(
  //     PROPOSAL_CATEGORIES.upgradeMCRParameters,
  //     defaultAbiCoder.encode(['bytes8', 'uint'], [GEAR, newGearValue]),
  //     [...this.abMembers, ...this.members], // add other members
  //     this.governance,
  //   );
  //
  //   expect(newGearValue).to.be.eq(await this.mcr.gearingFactor());
  // });

  it('Gets all pool assets balances before upgrade', async function () {
    // Pool value related info
    const safeAddress = await this.safeTracker.safe();

    this.aaveDebtBefore = await this.aaveUsdcVariableDebtToken.balanceOf(safeAddress);
    this.poolValueBefore = await this.pool.getPoolValueInEth();
    this.ethBalanceBefore = await ethers.provider.getBalance(this.pool.target);
    this.daiBalanceBefore = await this.dai.balanceOf(this.pool.target);
    this.stEthBalanceBefore = await this.stEth.balanceOf(this.pool.target);
    this.enzymeSharesBalanceBefore = await this.enzymeShares.balanceOf(this.pool.target);
    this.rethBalanceBefore = await this.rEth.balanceOf(this.pool.target);
  });

  it('Performs hypothetical future Registry upgrade', async function () {
    const newRegistry = await deployContract('Registry', [this.registry, this.master]);
    const upgradableProxy = await ethers.getContractAt('UpgradeableProxy', this.registry);

    const txs = [
      {
        target: this.registry,
        data: upgradableProxy.interface.encodeFunctionData('upgradeTo', [newRegistry.target]),
        value: 0n,
      },
    ];

    await executeGovernorProposal(this.governor, this.abMembers, txs);

    expect(await upgradableProxy.implementation()).to.be.equal(newRegistry.target);
  });

  it('Performs hypothetical future upgrade of contracts', async function () {
    // TokenController.sol
    const tokenController = await deployContract('TokenController', [this.registry.target]);

    const stakingPoolImplementation = await this.cover.stakingPoolImplementation();

    // Cover.sol
    const cover = await deployContract('Cover', [this.registry.target, stakingPoolImplementation, this.cover]);

    const swapOperator = await deployContract('SwapOperator', [
      this.registry,
      Addresses.COWSWAP_SETTLEMENT,
      Addresses.ENZYMEV4_VAULT_PROXY_ADDRESS,
      Addresses.WETH_ADDRESS,
    ]);

    // Pool.sol
    const pool = await deployContract('Pool', [this.registry]);

    // Assessment.sol
    const assessment = await deployContract('Assessments', [this.registry]);

    // Claims
    const claims = await deployContract('Claims', [this.registry]);

    // Ramm.sol
    const ramm = await deployContract('Ramm', [this.registry, '0']);

    const contractUpgrades = [
      { index: ContractIndexes.C_TOKEN_CONTROLLER, address: tokenController.target },
      { index: ContractIndexes.C_COVER, address: cover.target },
      { index: ContractIndexes.C_SWAP_OPERATOR, address: swapOperator.target },
      { index: ContractIndexes.C_POOL, address: pool.target },
      { index: ContractIndexes.C_ASSESSMENTS, address: assessment.target },
      { index: ContractIndexes.C_CLAIMS, address: claims.target },
      { index: ContractIndexes.C_RAMM, address: ramm.target },
    ];

    const transactions = contractUpgrades.map(c => ({
      target: this.registry,
      value: 0n,
      data: this.registry.interface.encodeFunctionData('upgradeContract', [c.index, c.address]),
    }));

    await executeGovernorProposal(this.governor, this.abMembers, transactions);

    // compare proxy implementation addresses
    expect(await getImplementation(this.tokenController)).to.be.equal(tokenController.target);
    expect(await getImplementation(this.cover)).to.be.equal(cover.target);
    expect(await getImplementation(this.swapOperator)).to.be.equal(swapOperator.target);
    expect(await getImplementation(this.pool)).to.be.equal(pool.target);
    expect(await getImplementation(this.assessments)).to.be.equal(assessment.target);
    expect(await getImplementation(this.claims)).to.be.equal(claims.target);
    expect(await getImplementation(this.ramm)).to.be.equal(ramm.target);
  });

  it('Check Pool balance after upgrades', async function () {
    const poolValueAfter = await this.pool.getPoolValueInEth();
    const poolValueDiff = poolValueAfter - this.poolValueBefore;

    // const aaveDebtAfter = await this.aaveUsdcVariableDebtToken.balanceOf(GNOSIS_SAFE_ADDRESS);
    // const aaveDebtDiff = aaveDebtAfter - this.aaveDebtBefore;
    // const usdcDebtInEth = await this.priceFeedOracle.getEthForAsset(USDC_ADDRESS, aaveDebtDiff);

    const ethBalanceAfter = await ethers.provider.getBalance(this.pool.target);
    const daiBalanceAfter = await this.dai.balanceOf(this.pool.target);
    const stEthBalanceAfter = await this.stEth.balanceOf(this.pool.target);
    const enzymeSharesBalanceAfter = await this.enzymeShares.balanceOf(this.pool.target);
    const rEthBalanceAfter = await this.rEth.balanceOf(this.pool.target);

    console.log({
      poolValueBefore: formatEther(this.poolValueBefore),
      poolValueAfter: formatEther(poolValueAfter),
      poolValueDiff: formatEther(poolValueDiff),
      ethBalanceBefore: formatEther(this.ethBalanceBefore),
      ethBalanceAfter: formatEther(ethBalanceAfter),
      ethBalanceDiff: formatEther(ethBalanceAfter - this.ethBalanceBefore),
      daiBalanceBefore: formatEther(this.daiBalanceBefore),
      daiBalanceAfter: formatEther(daiBalanceAfter),
      daiBalanceDiff: formatEther(daiBalanceAfter - this.daiBalanceBefore),
      stEthBalanceBefore: formatEther(this.stEthBalanceBefore),
      stEthBalanceAfter: formatEther(stEthBalanceAfter),
      stEthBalanceDiff: formatEther(stEthBalanceAfter - this.stEthBalanceBefore),
      enzymeSharesBalanceBefore: formatEther(this.enzymeSharesBalanceBefore),
      enzymeSharesBalanceAfter: formatEther(enzymeSharesBalanceAfter),
      enzymeSharesBalanceDiff: formatEther(enzymeSharesBalanceAfter - this.enzymeSharesBalanceBefore),
      rethBalanceBefore: formatEther(this.rethBalanceBefore),
      rethBalanceAfter: formatEther(rEthBalanceAfter),
      rethBalanceDiff: formatEther(rEthBalanceAfter - this.rethBalanceBefore),
    });

    expect(stEthBalanceAfter, 'stETH balance differs').to.be.gte(this.stEthBalanceBefore - 2n);
    expect(ethBalanceAfter, 'ETH balance differs').to.be.eq(this.ethBalanceBefore);
    expect(daiBalanceAfter, 'DAI balance differs').to.be.eq(this.daiBalanceBefore);
    expect(enzymeSharesBalanceAfter, 'Enzyme shares balance differs').to.be.eq(this.enzymeSharesBalanceBefore);
    expect(rEthBalanceAfter, 'rETH balance differs').to.be.eq(this.rethBalanceBefore);
    expect(poolValueAfter, 'Pool value in ETH differs').to.be.gte(this.poolValueBefore - 2n);
  });

  it('Performs hypothetical future CoverBroker deployment', async function () {
    const owner = await this.coverBroker.owner();
    const newCoverBroker = await deployContract('CoverBroker', [this.registry, owner]);

    await impersonateAccount(owner);
    const ownerSigner = await ethers.getSigner(owner);

    await this.coverBroker.connect(ownerSigner).switchMembership(newCoverBroker);
    this.coverBroker = newCoverBroker;

    await this.coverBroker.connect(ownerSigner).maxApproveCoverContract(this.cbbtc);
    await this.coverBroker.connect(ownerSigner).maxApproveCoverContract(this.usdc);

    // buy cover
    const coverBuyer = await ethers.Wallet.createRandom().connect(ethers.provider);
    const coverBuyerAddress = await coverBuyer.getAddress();
    await setBalance(coverBuyerAddress, parseEther('1000'));
    await setUSDCBalance(this.usdc.target, coverBuyer.address, parseEther('1000000'));

    const coverAsset = await this.pool.getAssetId(Addresses.USDC_ADDRESS);
    const amount = parseUnits('1000', 6);
    const coverCountBefore = await this.cover.getCoverDataCount();

    await this.usdc.connect(coverBuyer).approve(this.coverBroker.target, MaxUint256);
    await this.coverBroker.connect(coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverBuyerAddress,
        productId: protocolProductId,
        coverAsset,
        amount,
        period: 3600 * 24 * 30, // 30 days
        maxPremiumInAsset: (amount * 260n) / 10000n,
        paymentAsset: 6, // USDC
        payWithNXM: false,
        commissionRatio: '500', // 5%,
        commissionDestination: coverBuyerAddress,
        ipfsData: '',
      },
      [{ poolId, coverAmountInAsset: amount }],
    );

    const coverCountAfter = await this.cover.getCoverDataCount();
    const coverId = coverCountAfter;
    const isCoverBuyerOwner = await this.coverNFT.isApprovedOrOwner(coverBuyerAddress, coverId);

    expect(isCoverBuyerOwner).to.be.equal(true);
    expect(coverCountAfter).to.be.equal(coverCountBefore + 1n);
  });

  it('trigger emergency pause, do an upgrade and unpause', async function () {
    // this test verifies the scenario in which a critical vulnerability is detected
    // system is paused, system is upgraded, and system is resumed

    const emergencyAdmin1 = await getFundedSigner(Addresses.EMERGENCY_ADMIN_1);
    const emergencyAdmin2 = await getFundedSigner(Addresses.EMERGENCY_ADMIN_2);

    await this.registry.connect(emergencyAdmin1).proposePauseConfig(1);
    await this.registry.connect(emergencyAdmin2).confirmPauseConfig(1);

    const newGovernor = await deployContract('Governor', [this.registry]);

    const txs = [
      {
        target: this.registry,
        data: this.registry.interface.encodeFunctionData('upgradeContract', [
          ContractIndexes.C_GOVERNOR,
          newGovernor.target,
        ]),
        value: 0n,
      },
    ];

    await executeGovernorProposal(this.governor, this.abMembers, txs);

    expect(await getImplementation(this.governor)).to.be.equal(newGovernor.target);

    await this.registry.connect(emergencyAdmin1).proposePauseConfig(0);
    await this.registry.connect(emergencyAdmin2).confirmPauseConfig(0);
  });
});
