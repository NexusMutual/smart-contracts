const { ethers } = require('hardhat');
const { expect } = require('chai');

const evm = require('./evm')();
const {
  Address,
  UserAddress,
  EnzymeAdress,
  AggregatorType,
  PriceFeedOracle,
  calculateCurrentTrancheId,
  getSigner,
  submitGovernanceProposal,
  submitMemberVoteGovernanceProposal,
  toBytes,
  Aave,
} = require('./utils');

const { ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const { setNextBlockTime, mineNextBlock } = require('../utils/evm');
const VariableDebtTokenAbi = require('./abi/aave/VariableDebtToken.json');
const { InternalContractsIDs } = require('../utils').constants;

const { BigNumber, deployContract } = ethers;
const { AddressZero, MaxUint256 } = ethers.constants;
const { parseEther, defaultAbiCoder, toUtf8Bytes, formatEther, parseUnits } = ethers.utils;

const ASSESSMENT_VOTER_COUNT = 3;
const { USDC_ADDRESS } = Address;
const { NXM_WHALE_1, NXM_WHALE_2, DAI_NXM_HOLDER, NXMHOLDER, DAI_HOLDER, USDC_HOLDER, NXM_AB_MEMBER } = UserAddress;

let custodyProductId, custodyCoverId;
let protocolProductId, protocolCoverId;
let assessmentId, requestedClaimAmount, claimDeposit;
let poolId, trancheId, tokenId;

const NEW_POOL_MANAGER = NXMHOLDER;
const GNOSIS_SAFE_ADDRESS = '0x51ad1265C8702c9e96Ea61Fe4088C2e22eD4418e';

const compareProxyImplementationAddress = async (proxyAddress, addressToCompare) => {
  const proxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', proxyAddress);
  const implementationAddress = await proxy.implementation();
  expect(implementationAddress).to.be.equal(addressToCompare);
};

const getCapitalSupplyAndBalances = async (pool, tokenController, nxm, memberAddress) => {
  return {
    ethCapital: await pool.getPoolValueInEth(),
    nxmSupply: await tokenController.totalSupply(),
    ethBalance: await ethers.provider.getBalance(memberAddress),
    nxmBalance: await nxm.balanceOf(memberAddress),
  };
};

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

async function castAssessmentVote() {
  // vote
  await Promise.all(
    this.abMembers
      .slice(0, ASSESSMENT_VOTER_COUNT)
      .map(abMember => this.assessment.connect(abMember).castVotes([assessmentId], [true], [''], 0)),
  );

  const { poll } = await this.assessment.assessments(assessmentId);

  const payoutCooldown = (await this.assessment.getPayoutCooldown()).toNumber();

  const futureTime = poll.end + payoutCooldown;

  await setTime(futureTime);
}

describe('basic functionality tests', function () {
  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);
    await evm.increaseTime(7 * 24 * 3600); // +7 days
    trancheId = await calculateCurrentTrancheId();
  });

  it('load token contracts', async function () {
    this.dai = await ethers.getContractAt('ERC20Mock', Address.DAI_ADDRESS);
    this.usdc = await ethers.getContractAt('ERC20Mock', Address.USDC_ADDRESS);
    this.rEth = await ethers.getContractAt('ERC20Mock', Address.RETH_ADDRESS);
    this.stEth = await ethers.getContractAt('ERC20Mock', Address.STETH_ADDRESS);
    this.awEth = await ethers.getContractAt('ERC20Mock', Address.AWETH_ADDRESS);
    this.enzymeShares = await ethers.getContractAt('ERC20Mock', EnzymeAdress.ENZYMEV4_VAULT_PROXY_ADDRESS);
    this.aaveUsdcVariableDebtToken = await ethers.getContractAt(VariableDebtTokenAbi, Aave.VARIABLE_DEBT_USDC_ADDRESS);
  });

  it('Impersonate addresses', async function () {
    await Promise.all([
      // Impersonate addresses
      evm.impersonate(NXM_WHALE_1),
      evm.impersonate(NXM_WHALE_2),
      evm.impersonate(NXMHOLDER),
      evm.impersonate(DAI_HOLDER),
      evm.impersonate(NEW_POOL_MANAGER),
      // Set balances
      evm.setBalance(NXM_WHALE_1, parseEther('100000')),
      evm.setBalance(NXM_WHALE_2, parseEther('100000')),
      evm.setBalance(NXMHOLDER, parseEther('100000')),
      evm.setBalance(NEW_POOL_MANAGER, parseEther('100000')),
      evm.setBalance(DAI_HOLDER, parseEther('100000')),
      evm.setBalance(DAI_NXM_HOLDER, parseEther('100000')),
    ]);

    this.members = await Promise.all([NXM_WHALE_1, NXM_WHALE_2, NXMHOLDER].map(address => getSigner(address)));
    this.manager = await getSigner(NEW_POOL_MANAGER);
    this.daiHolder = await getSigner(DAI_HOLDER);
    this.usdcHolder = await getSigner(USDC_HOLDER);
  });

  it('Verify dependencies for each contract', async function () {
    // IMPORTANT: This mapping needs to be updated if we add new dependencies to the contracts.
    const dependenciesToVerify = {
      AS: ['TC', 'MR', 'RA'],
      CI: ['TC', 'MR', 'P1', 'CO', 'AS', 'RA'],
      MC: ['P1', 'MR', 'CO'],
      P1: ['MC', 'MR', 'RA'],
      CO: ['P1', 'TC', 'MR', 'SP'],
      MR: ['TC', 'P1', 'CO', 'AS'],
      SP: [], // none
      TC: ['AS', 'GV', 'P1'],
      RA: ['P1', 'MC', 'TC'],
    };

    const latestAddresses = {};
    const master = this.master;

    async function getLatestAddress(contractCode) {
      if (!latestAddresses[contractCode]) {
        latestAddresses[contractCode] = await master.getLatestAddress(toUtf8Bytes(contractCode));
      }
      return latestAddresses[contractCode];
    }

    await Promise.all(
      Object.keys(dependenciesToVerify).map(async contractCode => {
        const dependencies = dependenciesToVerify[contractCode];

        const masterAwareV2 = await ethers.getContractAt('IMasterAwareV2', await getLatestAddress(contractCode));

        await Promise.all(
          dependencies.map(async dependency => {
            const dependencyAddress = await getLatestAddress(dependency);

            const contractId = InternalContractsIDs[dependency];
            const storedDependencyAddress = await masterAwareV2.internalContracts(contractId);
            expect(storedDependencyAddress).to.be.equal(
              dependencyAddress,
              `Dependency ${dependency} for ${contractCode} is not set correctly ` +
                `(expected ${dependencyAddress}, got ${storedDependencyAddress})`,
            );
          }),
        );
      }),
    );
  });

  it('Stake for assessment', async function () {
    // stake
    const amount = parseEther('200');
    await Promise.all(
      this.abMembers.slice(0, ASSESSMENT_VOTER_COUNT).map(async abMember => {
        const memberAddress = await abMember.getAddress();
        const { amount: stakeAmountBefore } = await this.assessment.stakeOf(memberAddress);
        await this.assessment.connect(abMember).stake(amount);
        const { amount: stakeAmountAfter } = await this.assessment.stakeOf(memberAddress);
        expect(stakeAmountAfter).to.be.equal(stakeAmountBefore.add(amount));
      }),
    );
  });

  it('Swap NXM for ETH', async function () {
    const [member] = this.abMembers;
    const nxmIn = parseEther('1');
    const minEthOut = parseEther('0.0152');

    const awEthBefore = await this.awEth.balanceOf(GNOSIS_SAFE_ADDRESS);
    const aaveDebtBefore = await this.aaveUsdcVariableDebtToken.balanceOf(GNOSIS_SAFE_ADDRESS);
    const before = await getCapitalSupplyAndBalances(this.pool, this.tokenController, this.nxm, member._address);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 5 * 60;

    await this.evm.setNextBlockBaseFee(0);
    const tx = await this.ramm.connect(member).swap(nxmIn, minEthOut, deadline, { maxPriorityFeePerGas: 0 });
    const receipt = await tx.wait();

    const awEthAfter = await this.awEth.balanceOf(GNOSIS_SAFE_ADDRESS);
    const aaveDebtAfter = await this.aaveUsdcVariableDebtToken.balanceOf(GNOSIS_SAFE_ADDRESS);
    const aaveDebtDiff = aaveDebtAfter.sub(aaveDebtBefore);
    const after = await getCapitalSupplyAndBalances(this.pool, this.tokenController, this.nxm, member._address);

    const ethDebt = await this.priceFeedOracle.getEthForAsset(USDC_ADDRESS, aaveDebtDiff);
    const awEthRewards = awEthAfter.sub(awEthBefore);

    const ethReceived = after.ethBalance.sub(before.ethBalance);
    const nxmSwappedForEthFilter = this.ramm.filters.NxmSwappedForEth(member.address);
    const nxmSwappedForEthEvents = await this.ramm.queryFilter(nxmSwappedForEthFilter, receipt.blockNumber);
    const ethOut = nxmSwappedForEthEvents[0]?.args?.ethOut;

    // ETH goes out of capital pool and debt and rewards are added
    const expectedCapital = before.ethCapital.sub(ethReceived).sub(ethDebt).add(awEthRewards);

    expect(ethOut).to.be.equal(ethReceived);
    expect(after.nxmBalance).to.be.equal(before.nxmBalance.sub(nxmIn)); // member sends NXM
    expect(after.nxmSupply).to.be.equal(before.nxmSupply.sub(nxmIn)); // nxmIn is burned
    expect(after.ethCapital).to.be.closeTo(expectedCapital, 1); // time sensitive due to rewards and debt
    expect(after.ethBalance).to.be.equal(before.ethBalance.add(ethOut)); // member receives ETH
  });

  it('Swap ETH for NXM', async function () {
    const [member] = this.abMembers;
    const ethIn = parseEther('1');
    const minNxmOut = parseEther('28.8');

    const awEthBefore = await this.awEth.balanceOf(GNOSIS_SAFE_ADDRESS);
    const aaveDebtBefore = await this.aaveUsdcVariableDebtToken.balanceOf(GNOSIS_SAFE_ADDRESS);
    const before = await getCapitalSupplyAndBalances(this.pool, this.tokenController, this.nxm, member._address);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 5 * 60;

    await this.evm.setNextBlockBaseFee(0);
    const tx = await this.ramm.connect(member).swap(0, minNxmOut, deadline, { value: ethIn, maxPriorityFeePerGas: 0 });
    const receipt = await tx.wait();

    const after = await getCapitalSupplyAndBalances(this.pool, this.tokenController, this.nxm, member._address);

    const awEthAfter = await this.awEth.balanceOf(GNOSIS_SAFE_ADDRESS);
    const aaveDebtAfter = await this.aaveUsdcVariableDebtToken.balanceOf(GNOSIS_SAFE_ADDRESS);
    const aaveDebtDiff = aaveDebtAfter.sub(aaveDebtBefore);

    const ethDebt = await this.priceFeedOracle.getEthForAsset(USDC_ADDRESS, aaveDebtDiff);
    const awEthRewards = awEthAfter.sub(awEthBefore);

    const nxmReceived = after.nxmBalance.sub(before.nxmBalance);
    const nxmTransferFilter = this.nxm.filters.Transfer(ethers.constants.AddressZero, member._address);
    const nxmTransferEvents = await this.nxm.queryFilter(nxmTransferFilter, receipt.blockNumber);
    const nxmOut = nxmTransferEvents[0]?.args?.value;

    // ETH goes in the capital pool and aave debt and rewards are added
    const expectedCapital = before.ethCapital.add(ethIn).sub(ethDebt).add(awEthRewards);

    expect(nxmOut).to.be.equal(nxmReceived);
    expect(after.ethBalance).to.be.equal(before.ethBalance.sub(ethIn)); // member sends ETH
    expect(after.ethCapital).to.be.closeTo(expectedCapital, 1); // time sensitive due to rewards and debt
    expect(after.nxmSupply).to.be.equal(before.nxmSupply.add(nxmReceived)); // nxmOut is minted
    expect(after.nxmBalance).to.be.equal(before.nxmBalance.add(nxmOut)); // member receives NXM
  });

  it('Add product types', async function () {
    const productTypes = [
      {
        productTypeName: 'x',
        productTypeId: MaxUint256,
        ipfsMetadata: 'protocolCoverIPFSHash',
        productType: {
          descriptionIpfsHash: 'protocolCoverIPFSHash',
          claimMethod: 0,
          gracePeriod: 30,
        },
      },
      {
        productTypeName: 'y',
        productTypeId: MaxUint256,
        ipfsMetadata: 'custodyCoverIPFSHash',
        productType: {
          descriptionIpfsHash: 'custodyCoverIPFSHash',
          claimMethod: 0,
          gracePeriod: 90,
        },
      },
    ];

    const productTypesCountBefore = await this.coverProducts.getProductTypeCount();
    await this.coverProducts.connect(this.abMembers[0]).setProductTypes(productTypes);
    const productTypesCountAfter = await this.coverProducts.getProductTypeCount();
    expect(productTypesCountAfter).to.be.equal(productTypesCountBefore.add(productTypes.length));
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
    protocolProductId = productsCountAfter.toNumber() - 1;
    expect(productsCountAfter).to.be.equal(productsCountBefore.add(1));
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
    custodyProductId = productsCountAfter.toNumber() - 1;
    expect(productsCountAfter).to.be.equal(productsCountBefore.add(1));
  });

  it('Create StakingPool', async function () {
    const manager = this.manager;
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

    await this.stakingPool.connect(manager).depositTo(amount, trancheId + 1, 0, AddressZero);

    const managerBalanceAfter = await this.nxm.balanceOf(managerAddress);
    const totalSupplyAfter = await this.stakingNFT.totalSupply();
    tokenId = totalSupplyAfter;
    const owner = await this.stakingNFT.ownerOf(tokenId);

    expect(totalSupplyAfter).to.equal(totalSupplyBefore.add(1));
    expect(managerBalanceAfter).to.equal(managerBalanceBefore.sub(amount));
    expect(owner).to.equal(managerAddress);
  });

  it('Extend existing deposit in StakingPool', async function () {
    const manager = this.manager;
    const managerAddress = await manager.getAddress();
    const amount = parseEther('5000');
    const managerBalanceBefore = await this.nxm.balanceOf(managerAddress);
    const tokenControllerBalanceBefore = await this.nxm.balanceOf(this.tokenController.address);

    await this.stakingPool.connect(manager).extendDeposit(tokenId, trancheId + 1, trancheId + 7, amount);

    const tokenControllerBalanceAfter = await this.nxm.balanceOf(this.tokenController.address);
    const managerBalanceAfter = await this.nxm.balanceOf(managerAddress);

    expect(managerBalanceAfter).to.equal(managerBalanceBefore.sub(amount));
    expect(tokenControllerBalanceAfter).to.equal(tokenControllerBalanceBefore.add(amount));
  });

  it('Buy custody cover', async function () {
    await evm.impersonate(DAI_NXM_HOLDER);
    const coverBuyer = await getSigner(DAI_NXM_HOLDER);
    const coverBuyerAddress = await coverBuyer.getAddress();

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
        maxPremiumInAsset: parseEther('1').mul(260).div(10000),
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

    expect(coverCountAfter).to.be.equal(coverCountBefore.add(1));
  });

  it('Submit claim for ETH custody cover', async function () {
    await evm.impersonate(DAI_NXM_HOLDER);
    const coverBuyer = await getSigner(DAI_NXM_HOLDER);

    const claimsCountBefore = await this.individualClaims.getClaimsCount();
    const assessmentCountBefore = await this.assessment.getAssessmentsCount();

    const ipfsHash = '0x68747470733a2f2f7777772e796f75747562652e636f6d2f77617463683f763d423365414d47584677316f';
    const requestedAmount = parseEther('1');
    const coverData = await this.cover.getCoverData(custodyCoverId);

    const [deposit] = await this.individualClaims.getAssessmentDepositAndReward(
      requestedAmount,
      coverData.period,
      0, // ETH
    );
    await this.individualClaims
      .connect(coverBuyer)
      .submitClaim(custodyCoverId, requestedAmount, ipfsHash, { value: deposit });

    const claimsCountAfter = await this.individualClaims.getClaimsCount();
    const assessmentCountAfter = await this.assessment.getAssessmentsCount();

    assessmentId = assessmentCountBefore.toString();
    expect(claimsCountAfter).to.be.equal(claimsCountBefore.add(1));
    expect(assessmentCountAfter).to.be.equal(assessmentCountBefore.add(1));

    requestedClaimAmount = requestedAmount;
    claimDeposit = deposit;
  });

  it('Process assessment for custody cover and ETH payout', async function () {
    await castAssessmentVote.call(this);

    const coverIdV2 = custodyCoverId;
    const coverBuyerAddress = DAI_NXM_HOLDER;
    const claimId = (await this.individualClaims.getClaimsCount()).toNumber() - 1;

    const memberAddress = await this.coverNFT.ownerOf(coverIdV2);

    const ethBalanceBefore = await ethers.provider.getBalance(coverBuyerAddress);

    console.log(`Current member balance ${ethBalanceBefore.toString()}. Redeeming claim ${claimId}`);

    // redeem payout
    await this.individualClaims.redeemClaimPayout(claimId);

    const ethBalanceAfter = await ethers.provider.getBalance(memberAddress);

    console.log(`Check correct balance increase`);
    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(requestedClaimAmount).add(claimDeposit));

    const { payoutRedeemed } = await this.individualClaims.claims(claimId);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('Buy protocol DAI cover', async function () {
    await evm.impersonate(DAI_NXM_HOLDER);
    const coverBuyer = await getSigner(DAI_NXM_HOLDER);
    const coverBuyerAddress = await coverBuyer.getAddress();

    const coverAsset = 1; // DAI
    const amount = parseEther('1000');
    const commissionRatio = '500'; // 5%

    const daiTopUpAmount = parseEther('1000000');
    await this.dai.connect(this.daiHolder).transfer(DAI_NXM_HOLDER, daiTopUpAmount);

    const coverCountBefore = await this.cover.getCoverDataCount();

    await this.dai.connect(coverBuyer).approve(this.cover.address, daiTopUpAmount);

    const maxPremiumInAsset = amount.mul(260).div(10000);

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

    expect(coverCountAfter).to.be.equal(coverCountBefore.add(1));
  });

  it('Submit claim for protocol cover in DAI', async function () {
    await evm.impersonate(DAI_NXM_HOLDER);
    const coverBuyer = await getSigner(DAI_NXM_HOLDER);

    const claimsCountBefore = await this.individualClaims.getClaimsCount();
    const assessmentCountBefore = await this.assessment.getAssessmentsCount();

    const ipfsHash = '0x68747470733a2f2f7777772e796f75747562652e636f6d2f77617463683f763d423365414d47584677316f';
    const requestedAmount = parseEther('1000');
    const coverData = await this.cover.getCoverData(custodyCoverId);

    const [deposit] = await this.individualClaims.getAssessmentDepositAndReward(
      requestedAmount,
      coverData.period,
      1, // DAI
    );
    await this.individualClaims
      .connect(coverBuyer)
      .submitClaim(protocolCoverId, requestedAmount, ipfsHash, { value: deposit });

    const claimsCountAfter = await this.individualClaims.getClaimsCount();
    const assessmentCountAfter = await this.assessment.getAssessmentsCount();

    assessmentId = assessmentCountBefore.toString();
    expect(claimsCountAfter).to.be.equal(claimsCountBefore.add(1));
    expect(assessmentCountAfter).to.be.equal(assessmentCountBefore.add(1));

    requestedClaimAmount = requestedAmount;
    claimDeposit = deposit;
  });

  it('Process assessment and DAI payout for protocol cover', async function () {
    await castAssessmentVote.call(this);

    const coverIdV2 = custodyCoverId;
    const claimId = (await this.individualClaims.getClaimsCount()).toNumber() - 1;

    const memberAddress = await this.coverNFT.ownerOf(coverIdV2);

    const daiBalanceBefore = await this.dai.balanceOf(memberAddress);

    // redeem payout
    await this.individualClaims.redeemClaimPayout(claimId);

    const daiBalanceAfter = await this.dai.balanceOf(memberAddress);
    expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(requestedClaimAmount));

    const { payoutRedeemed } = await this.individualClaims.claims(claimId);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('Buy protocol USDC cover', async function () {
    await evm.impersonate(NXM_AB_MEMBER);
    const coverBuyer = await getSigner(NXM_AB_MEMBER);
    const coverBuyerAddress = await coverBuyer.getAddress();

    const coverAsset = 6; // USDC
    const amount = parseUnits('1000', 6);
    const commissionRatio = '500'; // 5%

    const usdcTopUpAmount = parseUnits('1000000', 6);

    const coverCountBefore = await this.cover.getCoverDataCount();

    await this.usdc.connect(this.usdcHolder).transfer(coverBuyerAddress, usdcTopUpAmount);
    await this.usdc.connect(coverBuyer).approve(this.cover.address, usdcTopUpAmount);

    const maxPremiumInAsset = amount.mul(260).div(10000);

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

    expect(coverCountAfter).to.be.equal(coverCountBefore.add(1));
  });

  it('Submit claim for protocol cover in USDC', async function () {
    await evm.impersonate(NXM_AB_MEMBER);
    const coverBuyer = await getSigner(NXM_AB_MEMBER);

    const claimsCountBefore = await this.individualClaims.getClaimsCount();
    const assessmentCountBefore = await this.assessment.getAssessmentsCount();

    const ipfsHash = '0x68747470733a2f2f7777772e796f75747562652e636f6d2f77617463683f763d423365414d47584677316f';
    const requestedAmount = parseUnits('1000', 6);
    const coverData = await this.cover.getCoverData(custodyCoverId);

    const [deposit] = await this.individualClaims.getAssessmentDepositAndReward(
      requestedAmount,
      coverData.period,
      6, // USDC
    );
    await this.individualClaims
      .connect(coverBuyer)
      .submitClaim(protocolCoverId, requestedAmount, ipfsHash, { value: deposit });

    const claimsCountAfter = await this.individualClaims.getClaimsCount();
    const assessmentCountAfter = await this.assessment.getAssessmentsCount();

    assessmentId = assessmentCountBefore.toString();
    expect(claimsCountAfter).to.be.equal(claimsCountBefore.add(1));
    expect(assessmentCountAfter).to.be.equal(assessmentCountBefore.add(1));

    requestedClaimAmount = requestedAmount;
    claimDeposit = deposit;
  });

  it('Process assessment and USDC payout for protocol cover', async function () {
    await castAssessmentVote.call(this);

    const coverIdV2 = protocolCoverId;
    const claimId = (await this.individualClaims.getClaimsCount()).toNumber() - 1;

    const memberAddress = await this.coverNFT.ownerOf(coverIdV2);

    const usdcBalanceBefore = await this.usdc.balanceOf(memberAddress);

    // redeem payout
    await this.individualClaims.redeemClaimPayout(claimId);

    const usdcBalanceAfter = await this.usdc.balanceOf(memberAddress);
    expect(usdcBalanceAfter).to.be.equal(usdcBalanceBefore.add(requestedClaimAmount));

    const { payoutRedeemed } = await this.individualClaims.claims(claimId);
    expect(payoutRedeemed).to.be.equal(true);
  });

  it('buy cover through CoverBroker using ETH', async function () {
    const coverBuyer = await ethers.Wallet.createRandom().connect(ethers.provider);

    await evm.setBalance(coverBuyer.address, parseEther('1000000'));

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
        maxPremiumInAsset: parseEther('1').mul(260).div(10000),
        paymentAsset: 0, // ETH
        payWithNXM: false,
        commissionRatio: '500', // 5%,
        commissionDestination: coverBuyer.address,
        ipfsData: '',
      },
      [{ poolId, coverAmountInAsset: amount }],
      { value: amount },
    );

    const coverCountAfter = await this.cover.getCoverDataCount();
    const coverId = coverCountAfter;
    const isCoverBuyerOwner = await this.coverNFT.isApprovedOrOwner(coverBuyer.address, coverId);

    expect(isCoverBuyerOwner).to.be.equal(true);
    expect(coverCountAfter).to.be.equal(coverCountBefore.add(1));
  });

  it('buy cover through CoverBroker using ERC20 (USDC)', async function () {
    await evm.impersonate(USDC_HOLDER);
    await evm.setBalance(USDC_HOLDER, parseEther('1000000'));

    const coverBuyer = await getSigner(USDC_HOLDER);
    const coverBuyerAddress = await coverBuyer.getAddress();

    const amount = parseUnits('1000', 6);
    const coverCountBefore = await this.cover.getCoverDataCount();

    await this.usdc.connect(coverBuyer).approve(this.coverBroker.address, MaxUint256);
    await this.coverBroker.connect(coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverBuyerAddress,
        productId: protocolProductId,
        coverAsset: 6, // USDC
        amount,
        period: 3600 * 24 * 30, // 30 days
        maxPremiumInAsset: amount.mul(260).div(10000),
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
    expect(coverCountAfter).to.be.equal(coverCountBefore.add(1));
  });

  it('Edit cover', async function () {
    await evm.impersonate(NXM_AB_MEMBER);
    const coverBuyer = await getSigner(NXM_AB_MEMBER);
    const coverBuyerAddress = await coverBuyer.getAddress();

    const coverAsset = 6; // USDC
    const amount = parseUnits('1000', 6);
    const commissionRatio = '0'; // 0%

    const usdcTopUpAmount = parseUnits('1000000', 6);

    const coverCountBefore = await this.cover.getCoverDataCount();

    await this.usdc.connect(this.usdcHolder).transfer(coverBuyerAddress, usdcTopUpAmount);
    await this.usdc.connect(coverBuyer).approve(this.cover.address, usdcTopUpAmount);

    const maxPremiumInAsset = amount.mul(260).div(10000);
    const period = BigNumber.from(3600 * 24 * 30); // 30 days

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
    const currentTimestamp = (await ethers.provider.getBlock('latest')).timestamp;
    const passedPeriod = BigNumber.from(10);
    const editTimestamp = BigNumber.from(currentTimestamp).add(passedPeriod);
    await setTime(editTimestamp.toNumber());

    const increasedAmount = amount.mul(2);
    const increasedPeriod = period.mul(2);

    const maxCoverPeriod = 3600 * 24 * 365;

    const expectedRefund = amount.mul(260).mul(period.sub(passedPeriod)).div(maxCoverPeriod);
    const expectedEditPremium = increasedAmount.mul(260).mul(increasedPeriod).div(maxCoverPeriod);
    const extraPremium = expectedEditPremium.sub(expectedRefund);

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
        payWitNXM: false,
        commissionRatio,
        commissionDestination: coverBuyerAddress,
        ipfsData: '',
      },
      [{ poolId, coverAmountInAsset: increasedAmount.toString() }],
    );
    const editedCoverId = originalCoverId.add(1);

    const coverCountAfter = await this.cover.getCoverDataCount();
    expect(coverCountAfter).to.equal(coverCountBefore.add(2));
    expect(editedCoverId).to.equal(coverCountAfter);

    const [coverData, coverReference] = await this.cover.getCoverDataWithReference(editedCoverId);
    expect(coverData.period).to.equal(increasedPeriod);
    expect(coverData.amount).to.gte(increasedAmount);
    expect(coverReference.originalCoverId).to.equal(originalCoverId);

    const originalCoverReference = await this.cover.getCoverReference(originalCoverId);
    expect(originalCoverReference.latestCoverId).to.equal(editedCoverId);
  });

  it('Update MCR GEAR parameter', async function () {
    const GEAR = toBytes('GEAR', 8);
    const currentGearValue = BigNumber.from(48000);
    const newGearValue = BigNumber.from(50000);

    expect(currentGearValue).to.be.eq(await this.mcr.gearingFactor());

    await submitMemberVoteGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMCRParameters,
      defaultAbiCoder.encode(['bytes8', 'uint'], [GEAR, newGearValue]),
      [...this.abMembers, ...this.members], // add other members
      this.governance,
    );

    expect(newGearValue).to.be.eq(await this.mcr.gearingFactor());
  });

  it('Gets all pool assets balances before upgrade', async function () {
    // Pool value related info
    this.aaveDebtBefore = await this.aaveUsdcVariableDebtToken.balanceOf(GNOSIS_SAFE_ADDRESS);
    this.poolValueBefore = await this.pool.getPoolValueInEth();
    console.log(this.poolValueBefore.toString());
    this.ethBalanceBefore = await ethers.provider.getBalance(this.pool.address);
    this.daiBalanceBefore = await this.dai.balanceOf(this.pool.address);
    this.stEthBalanceBefore = await this.stEth.balanceOf(this.pool.address);
    this.enzymeSharesBalanceBefore = await this.enzymeShares.balanceOf(this.pool.address);
    this.rethBalanceBefore = await this.rEth.balanceOf(this.pool.address);
  });

  it('Performs hypothetical future Governance upgrade', async function () {
    const newGovernance = await deployContract('Governance');

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts,
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [[toUtf8Bytes('GV')], [newGovernance.address]]),
      this.abMembers,
      this.governance,
    );

    await compareProxyImplementationAddress(this.governance.address, newGovernance.address);
  });

  it('Performs hypothetical future NXMaster upgrade', async function () {
    const newMaster = await deployContract('NXMaster');

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMaster, // upgradeMasterAddress(address)
      defaultAbiCoder.encode(['address'], [newMaster.address]),
      this.abMembers,
      this.governance,
    );
    await compareProxyImplementationAddress(this.master.address, newMaster.address);
  });

  it('Performs hypothetical future upgrade of proxy and non-proxy', async function () {
    // TC - TokenController.sol
    const tokenController = await deployContract('TokenController', [
      this.stakingPoolFactory.address,
      this.nxm.address,
      this.stakingNFT.address,
    ]);

    // MCR - MCR.sol
    const mcr = await deployContract('MCR', [this.master.address, 0]);

    // MR - MemberRoles.sol
    const memberRoles = await deployContract('MemberRoles', [this.nxm.address]);

    // CO - Cover.sol
    const cover = await deployContract('Cover', [
      this.coverNFT.address,
      this.stakingNFT.address,
      this.stakingPoolFactory.address,
      this.stakingPool.address,
    ]);

    // PriceFeedOracle.sol
    const priceFeedAssets = [
      {
        address: Address.DAI_ADDRESS,
        aggregator: PriceFeedOracle.DAI_ETH_PRICE_FEED_ORACLE_AGGREGATOR,
        aggregatorType: AggregatorType.ETH,
        decimals: 18,
      },
      {
        address: Address.STETH_ADDRESS,
        aggregator: PriceFeedOracle.STETH_ETH_PRICE_FEED_ORACLE_AGGREGATOR,
        aggregatorType: AggregatorType.ETH,
        decimals: 18,
      },
      {
        address: EnzymeAdress.ENZYMEV4_VAULT_PROXY_ADDRESS,
        aggregator: PriceFeedOracle.ENZYMEV4_VAULT_ETH_PRICE_FEED_ORACLE_AGGREGATOR,
        aggregatorType: AggregatorType.ETH,
        decimals: 18,
      },
      {
        address: Address.RETH_ADDRESS,
        aggregator: PriceFeedOracle.RETH_ETH_PRICE_FEED_ORACLE_AGGREGATOR,
        aggregatorType: AggregatorType.ETH,
        decimals: 18,
      },
      {
        address: Address.USDC_ADDRESS,
        aggregator: PriceFeedOracle.USDC_ETH_PRICE_FEED_ORACLE_AGGREGATOR,
        aggregatorType: AggregatorType.ETH,
        decimals: 6,
      },
      {
        address: Address.CBBTC_ADDRESS,
        aggregator: PriceFeedOracle.CBBTC_USD_PRICE_FEED_ORACLE_AGGREGATOR,
        aggregatorType: AggregatorType.USD,
        decimals: 8,
      },
      {
        address: Address.ETH,
        aggregator: PriceFeedOracle.ETH_USD_PRICE_FEED_ORACLE_AGGREGATOR,
        aggregatorType: AggregatorType.USD,
        decimals: 18,
      },
    ];

    this.priceFeedOracle = await ethers.deployContract('PriceFeedOracle', [
      priceFeedAssets.map(asset => asset.address),
      priceFeedAssets.map(asset => asset.aggregator),
      priceFeedAssets.map(asset => asset.aggregatorType),
      priceFeedAssets.map(asset => asset.decimals),
      this.safeTracker.address,
    ]);

    const swapOperatorAddress = await this.swapOperator.address;

    // P1 - Pool.sol
    const pool = await deployContract('Pool', [
      this.master.address,
      this.priceFeedOracle.address,
      swapOperatorAddress,
      this.nxm.address,
      this.pool.address,
    ]);

    // AS - Assessment.sol
    const assessment = await deployContract('Assessment', [this.nxm.address]);

    // CI - IndividualClaims.sol
    const individualClaims = await deployContract('IndividualClaims', [this.coverNFT.address]);

    // RA - Ramm.sol
    const ramm = await deployContract('Ramm', ['0']);

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(
        ['bytes2[]', 'address[]'],
        [
          ['MR', 'MC', 'CO', 'TC', 'P1', 'AS', 'CI', 'RA'].map(code => toUtf8Bytes(code)),
          [memberRoles, mcr, cover, tokenController, pool, assessment, individualClaims, ramm].map(c => c.address),
        ],
      ),
      this.abMembers,
      this.governance,
    );

    // Compare proxy implementation addresses
    await compareProxyImplementationAddress(this.memberRoles.address, memberRoles.address);
    await compareProxyImplementationAddress(this.tokenController.address, tokenController.address);
    await compareProxyImplementationAddress(this.individualClaims.address, individualClaims.address);
    await compareProxyImplementationAddress(this.assessment.address, assessment.address);
    await compareProxyImplementationAddress(this.cover.address, cover.address);
    await compareProxyImplementationAddress(this.ramm.address, ramm.address);

    // Compare non-proxy addresses
    expect(pool.address).to.be.equal(await this.master.contractAddresses(toUtf8Bytes('P1')));
    expect(mcr.address).to.be.equal(await this.master.contractAddresses(toUtf8Bytes('MC')));

    this.mcr = mcr;
    this.pool = pool;
  });

  it('Check Pool balance after upgrades', async function () {
    const poolValueAfter = await this.pool.getPoolValueInEth();
    const aaveDebtAfter = await this.aaveUsdcVariableDebtToken.balanceOf(GNOSIS_SAFE_ADDRESS);

    const poolValueDiff = poolValueAfter.sub(this.poolValueBefore);
    const aaveDebtDiff = aaveDebtAfter.sub(this.aaveDebtBefore);
    const ethDebt = await this.priceFeedOracle.getEthForAsset(USDC_ADDRESS, aaveDebtDiff);

    const ethBalanceAfter = await ethers.provider.getBalance(this.pool.address);
    const daiBalanceAfter = await this.dai.balanceOf(this.pool.address);
    const stEthBalanceAfter = await this.stEth.balanceOf(this.pool.address);
    const enzymeSharesBalanceAfter = await this.enzymeShares.balanceOf(this.pool.address);
    const rEthBalanceAfter = await this.rEth.balanceOf(this.pool.address);

    console.log({
      poolValueBefore: formatEther(this.poolValueBefore),
      poolValueAfter: formatEther(poolValueAfter),
      poolValueDiff: formatEther(poolValueDiff),
      ethBalanceBefore: formatEther(this.ethBalanceBefore),
      ethBalanceAfter: formatEther(ethBalanceAfter),
      ethBalanceDiff: formatEther(ethBalanceAfter.sub(this.ethBalanceBefore)),
      daiBalanceBefore: formatEther(this.daiBalanceBefore),
      daiBalanceAfter: formatEther(daiBalanceAfter),
      daiBalanceDiff: formatEther(daiBalanceAfter.sub(this.daiBalanceBefore)),
      stEthBalanceBefore: formatEther(this.stEthBalanceBefore),
      stEthBalanceAfter: formatEther(stEthBalanceAfter),
      stEthBalanceDiff: formatEther(stEthBalanceAfter.sub(this.stEthBalanceBefore)),
      enzymeSharesBalanceBefore: formatEther(this.enzymeSharesBalanceBefore),
      enzymeSharesBalanceAfter: formatEther(enzymeSharesBalanceAfter),
      enzymeSharesBalanceDiff: formatEther(enzymeSharesBalanceAfter.sub(this.enzymeSharesBalanceBefore)),
      rethBalanceBefore: formatEther(this.rethBalanceBefore),
      rethBalanceAfter: formatEther(await this.rEth.balanceOf(this.pool.address)),
      rethBalanceDiff: formatEther(rEthBalanceAfter.sub(this.rethBalanceBefore)),
    });

    expect(poolValueDiff.abs(), 'Pool value in ETH should be the same').to.be.lte(ethDebt.add(2));
    expect(stEthBalanceAfter.sub(this.stEthBalanceBefore).abs(), 'stETH balance should be the same').to.be.lte(2);
    expect(ethBalanceAfter.sub(this.ethBalanceBefore), 'ETH balance should be the same').to.be.eq(0);
    expect(daiBalanceAfter.sub(this.daiBalanceBefore), 'DAI balance should be the same').to.be.eq(0);
    expect(
      enzymeSharesBalanceAfter.sub(this.enzymeSharesBalanceBefore),
      'Enzyme shares balance should be the same',
    ).to.be.eq(0);
    expect(rEthBalanceAfter.sub(this.rethBalanceBefore), 'rETH balance should be the same').to.be.eq(0);
  });

  it('trigger emergency pause, do an upgrade and unpause', async function () {
    // this test verifies the scenario in which a critical vulnerability is detected
    // system is paused, system is upgraded, and system is resumed

    const emergencyAdminAddress = await this.master.emergencyAdmin();

    await evm.impersonate(emergencyAdminAddress);
    await evm.setBalance(emergencyAdminAddress, parseEther('1000'));
    const emergencyAdmin = await getSigner(emergencyAdminAddress);

    await this.master.connect(emergencyAdmin).setEmergencyPause(true);

    const newGovernance = await deployContract('Governance');

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts,
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [[toUtf8Bytes('GV')], [newGovernance.address]]),
      this.abMembers,
      this.governance,
    );

    await compareProxyImplementationAddress(this.governance.address, newGovernance.address);

    await this.master.connect(emergencyAdmin).setEmergencyPause(false);
  });
});
