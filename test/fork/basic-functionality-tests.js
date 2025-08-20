const { ethers, nexus } = require('hardhat');
const { setBalance, time } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const { ContractIndexes } = nexus.constants;

const { Address, EnzymeAddress, calculateCurrentTrancheId, executeGovernorProposal, Aave } = require('./utils');

const EMERGENCY_ADMIN = '0x422D71fb8040aBEF53f3a05d21A9B85eebB2995D';

const VariableDebtTokenAbi = require('./abi/aave/VariableDebtToken.json');
const { abis, addresses } = require('@nexusmutual/deployments');

const {
  deployContract,
  formatEther,
  ZeroAddress,
  MaxUint256,
  parseEther,
  parseUnits,
  keccak256,
  AbiCoder,
  toBeHex,
  zeroPadValue,
} = ethers;

const { USDC_ADDRESS } = Address;

let custodyProductId, custodyCoverId;
let protocolProductId, protocolCoverId;
let poolId, trancheId, tokenId;

const GNOSIS_SAFE_ADDRESS = '0x51ad1265C8702c9e96Ea61Fe4088C2e22eD4418e';

const defaultAbiCoder = AbiCoder.defaultAbiCoder();

const parseError = (error, contract) => {
  console.log('Error executing proposal:', error.message);

  // Try to parse custom error
  if (error.data) {
    console.log('Error data:', error.data);

    try {
      const iface = contract.interface;
      const decodedError = iface.parseError(error.data);
      console.log('Custom error name:', decodedError.name);
      console.log('Custom error args:', decodedError.args);
    } catch (parseError) {
      console.log('Could not parse custom error:', parseError.message);
      console.log('Raw error data:', error.data);
    }
  }

  // Re-throw the error to fail the test
  throw error;
};

const setERC20Balance = async (token, address, balance) => {
  // Standard ERC20 tokens use slot 0 for _balances mapping
  const standardSlot = 0;
  const userBalanceSlot = keccak256(defaultAbiCoder.encode(['address', 'uint256'], [address, standardSlot]));
  const valueHex = zeroPadValue(toBeHex(balance), 32);

  await ethers.provider.send('hardhat_setStorageAt', [token, userBalanceSlot, valueHex]);
};

const setUSDCBalance = async (token, address, balance) => {
  const slot = 9;
  const userBalanceSlot = keccak256(defaultAbiCoder.encode(['address', 'uint256'], [address, slot]));
  const currentValue = await ethers.provider.getStorage(token, userBalanceSlot);
  const currentBigInt = ethers.getBigInt(currentValue);
  const blacklistBit = currentBigInt >> 255n;
  const newValue = (blacklistBit << 255n) | BigInt(balance);
  const valueHex = zeroPadValue(toBeHex(newValue), 32);
  await ethers.provider.send('hardhat_setStorageAt', [token, userBalanceSlot, valueHex]);
};

const setCbBTCBalance = async (token, address, balance) => {
  const slot = 9; // Found to work at slot 9
  const userBalanceSlot = keccak256(defaultAbiCoder.encode(['address', 'uint256'], [address, slot]));
  const valueHex = zeroPadValue(toBeHex(balance), 32);
  await ethers.provider.send('hardhat_setStorageAt', [token, userBalanceSlot, valueHex]);
};

const compareProxyImplementationAddress = async (proxyAddress, addressToCompare) => {
  const proxy = await ethers.getContractAt('UpgradeableProxy', proxyAddress);
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

describe('basic functionality tests', function () {
  before(async function () {
    // Initialize evm helper
    if (!this.evm) {
      this.evm = nexus.evmInit();
      await this.evm.connect(ethers.provider);
      await this.evm.increaseTime(7 * 24 * 3600); // +7 days
    }
    trancheId = await calculateCurrentTrancheId();
  });

  it('load token contracts', async function () {
    this.dai = await ethers.getContractAt('ERC20Mock', Address.DAI_ADDRESS);
    this.usdc = await ethers.getContractAt('ERC20Mock', Address.USDC_ADDRESS);
    this.rEth = await ethers.getContractAt('ERC20Mock', Address.RETH_ADDRESS);
    this.stEth = await ethers.getContractAt('ERC20Mock', Address.STETH_ADDRESS);
    this.awEth = await ethers.getContractAt('ERC20Mock', Address.AWETH_ADDRESS);
    this.enzymeShares = await ethers.getContractAt('ERC20Mock', EnzymeAddress.ENZYMEV4_VAULT_PROXY_ADDRESS);
    this.aaveUsdcVariableDebtToken = await ethers.getContractAt(VariableDebtTokenAbi, Aave.VARIABLE_DEBT_USDC_ADDRESS);
  });

  it('Generate wallets', async function () {
    this.nxm = await ethers.getContractAt(abis.NXMToken, addresses.NXMToken);
    this.usdc = await ethers.getContractAt('ERC20Mock', Address.USDC_ADDRESS);
    this.cbbtc = await ethers.getContractAt('ERC20Mock', Address.CBBTC_ADDRESS);

    const accounts = await ethers.getSigners();
    this.members = accounts.slice(1, 15);
    this.manager = this.members[0];
    this.usdcHolder = this.members[1];
    this.cbBTCHolder = this.members[2];

    await Promise.all(
      this.members.map(wallet => setERC20Balance(this.nxm.target, wallet.address, parseEther('10000'))),
    );

    await setERC20Balance(this.nxm.target, this.usdcHolder.address, parseEther('1000'));
    await setUSDCBalance(this.usdc.target, this.usdcHolder.address, parseUnits('1000000', 6));
    await setCbBTCBalance(this.cbbtc.target, this.cbBTCHolder.address, parseUnits('100', 8));
  });

  it.skip('Verify dependencies for each contract', async function () {
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
    const registry = this.registry;

    async function getLatestAddress(contractIndex) {
      if (!latestAddresses[contractIndex]) {
        latestAddresses[contractIndex] = await registry.getContractAddressByIndex(contractIndex);
      }
      return latestAddresses[contractIndex];
    }

    await Promise.all(
      Object.keys(dependenciesToVerify).map(async contractIndex => {
        const dependencies = dependenciesToVerify[contractIndex];

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

  it('switch kyc auth wallet', async function () {
    this.kycAuthSigner = ethers.Wallet.createRandom().connect(ethers.provider);
    this.kycAuthAddress = await this.kycAuthSigner.getAddress();

    const txs = [
      {
        target: this.registry.target,
        data: await this.registry.interface.encodeFunctionData('setKycAuthAddress', [this.kycAuthAddress]),
        value: 0,
      },
    ];
    await executeGovernorProposal(this.governor, this.abMembers, txs);
  });

  it('Add new members', async function () {
    const JOINING_FEE = ethers.parseEther('0.002');

    for (const member of this.members) {
      const signature = await nexus.membership.signJoinMessage(this.kycAuthSigner, member, this.registry, {
        chainId: 1,
      });
      await this.registry.join(member, signature, { value: JOINING_FEE });
      expect(await this.registry.isMember(member.address)).to.be.true;
    }

    // temp add coverBroker as member
    const coverBrokerSigner = ethers.getSigner(this.coverBroker.target);
    const signature = await nexus.membership.signJoinMessage(
      this.kycAuthSigner,
      this.coverBroker.target,
      this.registry,
      {
        chainId: 1,
      },
    );
    await this.registry.join(this.coverBroker.target, signature, { value: JOINING_FEE });
    expect(await this.registry.isMember(this.coverBroker.target)).to.be.true;
  });

  it.skip('Swap NXM for ETH', async function () {
    const [member] = this.members;
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
    const aaveDebtDiff = aaveDebtAfter - aaveDebtBefore;
    const after = await getCapitalSupplyAndBalances(this.pool, this.tokenController, this.nxm, member._address);

    const ethDebt = await this.priceFeedOracle.getEthForAsset(USDC_ADDRESS, aaveDebtDiff);
    const awEthRewards = awEthAfter - awEthBefore;

    const ethReceived = after.ethBalance - before.ethBalance;
    const nxmSwappedForEthFilter = this.ramm.filters.NxmSwappedForEth(member.address);
    const nxmSwappedForEthEvents = await this.ramm.queryFilter(nxmSwappedForEthFilter, receipt.blockNumber);
    const ethOut = nxmSwappedForEthEvents[0]?.args?.ethOut;

    // ETH goes out of capital pool and debt and rewards are added
    const expectedCapital = before.ethCapital - ethReceived - ethDebt + awEthRewards;

    expect(ethOut).to.be.equal(ethReceived);
    expect(after.nxmBalance).to.be.equal(before.nxmBalance - nxmIn); // member sends NXM
    expect(after.nxmSupply).to.be.equal(before.nxmSupply - nxmIn); // nxmIn is burned
    expect(after.ethCapital).to.be.closeTo(expectedCapital, 1); // time sensitive due to rewards and debt
    expect(after.ethBalance).to.be.equal(before.ethBalance + ethOut); // member receives ETH
  });

  it.skip('Swap ETH for NXM', async function () {
    const [member] = this.member;
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
    const aaveDebtDiff = aaveDebtAfter - aaveDebtBefore;

    const ethDebt = await this.priceFeedOracle.getEthForAsset(USDC_ADDRESS, aaveDebtDiff);
    const awEthRewards = awEthAfter - awEthBefore;

    const nxmReceived = after.nxmBalance - before.nxmBalance;
    const nxmTransferFilter = this.nxm.filters.Transfer(ZeroAddress, member._address);
    const nxmTransferEvents = await this.nxm.queryFilter(nxmTransferFilter, receipt.blockNumber);
    const nxmOut = nxmTransferEvents[0]?.args?.value;

    // ETH goes in the capital pool and aave debt and rewards are added
    const expectedCapital = before.ethCapital + ethIn - ethDebt + awEthRewards;

    expect(nxmOut).to.be.equal(nxmReceived);
    expect(after.ethBalance).to.be.equal(before.ethBalance - ethIn); // member sends ETH
    expect(after.ethCapital).to.be.closeTo(expectedCapital, 1); // time sensitive due to rewards and debt
    expect(after.nxmSupply).to.be.equal(before.nxmSupply + nxmReceived); // nxmOut is minted
    expect(after.nxmBalance).to.be.equal(before.nxmBalance + nxmOut); // member receives NXM
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
    expect(productTypesCountAfter).to.be.equal(productTypesCountBefore + BigInt(productTypes.length));
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
    await this.stakingProducts
      .connect(manager)
      .createStakingPool(false, 5, 5, products, 'description', { gasLimit: 21e6 });
    const stakingPoolCountAfter = await this.stakingPoolFactory.stakingPoolCount();

    poolId = stakingPoolCountAfter;
    expect(stakingPoolCountAfter).to.be.equal(stakingPoolCountBefore + 1n);

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
      { value: amount, gasLimit: 21e6 },
    );

    const coverCountAfter = await this.cover.getCoverDataCount();
    custodyCoverId = coverCountAfter;

    expect(coverCountAfter).to.be.equal(coverCountBefore + 1n);
  });

  // it('Submit claim for ETH custody cover', async function () {
  //   await evm.impersonate(DAI_NXM_HOLDER);
  //   const coverBuyer = await getSigner(DAI_NXM_HOLDER);
  //
  //   const claimsCountBefore = await this.individualClaims.getClaimsCount();
  //   const assessmentCountBefore = await this.assessment.getAssessmentsCount();
  //
  //   const ipfsHash = '0x68747470733a2f2f7777772e796f75747562652e636f6d2f77617463683f763d423365414d47584677316f';
  //   const requestedAmount = parseEther('1');
  //   const coverData = await this.cover.getCoverData(custodyCoverId);
  //
  //   const [deposit] = await this.individualClaims.getAssessmentDepositAndReward(
  //     requestedAmount,
  //     coverData.period,
  //     0, // ETH
  //   );
  //   await this.individualClaims
  //     .connect(coverBuyer)
  //     .submitClaim(custodyCoverId, requestedAmount, ipfsHash, { value: deposit });
  //
  //   const claimsCountAfter = await this.individualClaims.getClaimsCount();
  //   const assessmentCountAfter = await this.assessment.getAssessmentsCount();
  //
  //   assessmentId = assessmentCountBefore.toString();
  //   expect(claimsCountAfter).to.be.equal(claimsCountBefore.add(1));
  //   expect(assessmentCountAfter).to.be.equal(assessmentCountBefore.add(1));
  //
  //   requestedClaimAmount = requestedAmount;
  //   claimDeposit = deposit;
  // });
  //
  // it('Process assessment for custody cover and ETH payout', async function () {
  //   await castAssessmentVote.call(this);
  //
  //   const coverIdV2 = custodyCoverId;
  //   const coverBuyerAddress = DAI_NXM_HOLDER;
  //   const claimId = (await this.individualClaims.getClaimsCount()).toNumber() - 1;
  //
  //   const memberAddress = await this.coverNFT.ownerOf(coverIdV2);
  //
  //   const ethBalanceBefore = await ethers.provider.getBalance(coverBuyerAddress);
  //
  //   console.log(`Current member balance ${ethBalanceBefore.toString()}. Redeeming claim ${claimId}`);
  //
  //   // redeem payout
  //   await this.individualClaims.redeemClaimPayout(claimId);
  //
  //   const ethBalanceAfter = await ethers.provider.getBalance(memberAddress);
  //
  //   console.log(`Check correct balance increase`);
  //   expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(requestedClaimAmount).add(claimDeposit));
  //
  //   const { payoutRedeemed } = await this.individualClaims.claims(claimId);
  //   expect(payoutRedeemed).to.be.equal(true);
  // });

  it('Buy protocol cbBTC cover', async function () {
    const coverBuyer = this.cbBTCHolder;
    const coverBuyerAddress = coverBuyer.address;

    const coverAsset = await this.pool.getAssetId(Address.CBBTC_ADDRESS);
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

  // it('Submit claim for protocol cover in DAI', async function () {
  //   await evm.impersonate(DAI_NXM_HOLDER);
  //   const coverBuyer = await getSigner(DAI_NXM_HOLDER);
  //
  //   const claimsCountBefore = await this.individualClaims.getClaimsCount();
  //   const assessmentCountBefore = await this.assessment.getAssessmentsCount();
  //
  //   const ipfsHash = '0x68747470733a2f2f7777772e796f75747562652e636f6d2f77617463683f763d423365414d47584677316f';
  //   const requestedAmount = parseEther('1000');
  //   const coverData = await this.cover.getCoverData(custodyCoverId);
  //
  //   const [deposit] = await this.individualClaims.getAssessmentDepositAndReward(
  //     requestedAmount,
  //     coverData.period,
  //     1, // DAI
  //   );
  //   await this.individualClaims
  //     .connect(coverBuyer)
  //     .submitClaim(protocolCoverId, requestedAmount, ipfsHash, { value: deposit });
  //
  //   const claimsCountAfter = await this.individualClaims.getClaimsCount();
  //   const assessmentCountAfter = await this.assessment.getAssessmentsCount();
  //
  //   assessmentId = assessmentCountBefore.toString();
  //   expect(claimsCountAfter).to.be.equal(claimsCountBefore.add(1));
  //   expect(assessmentCountAfter).to.be.equal(assessmentCountBefore.add(1));
  //
  //   requestedClaimAmount = requestedAmount;
  //   claimDeposit = deposit;
  // });
  //
  // it('Process assessment and DAI payout for protocol cover', async function () {
  //   await castAssessmentVote.call(this);
  //
  //   const coverIdV2 = custodyCoverId;
  //   const claimId = (await this.individualClaims.getClaimsCount()).toNumber() - 1;
  //
  //   const memberAddress = await this.coverNFT.ownerOf(coverIdV2);
  //
  //   const daiBalanceBefore = await this.dai.balanceOf(memberAddress);
  //
  //   // redeem payout
  //   await this.individualClaims.redeemClaimPayout(claimId);
  //
  //   const daiBalanceAfter = await this.dai.balanceOf(memberAddress);
  //   expect(daiBalanceAfter).to.be.equal(daiBalanceBefore.add(requestedClaimAmount));
  //
  //   const { payoutRedeemed } = await this.individualClaims.claims(claimId);
  //   expect(payoutRedeemed).to.be.equal(true);
  // });

  it('Buy protocol USDC cover', async function () {
    const coverBuyer = this.usdcHolder;
    const coverBuyerAddress = this.usdcHolder.address;

    const coverAsset = await this.pool.getAssetId(Address.USDC_ADDRESS);
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

  // it('Submit claim for protocol cover in USDC', async function () {
  //   await evm.impersonate(NXM_AB_MEMBER);
  //   const coverBuyer = await getSigner(NXM_AB_MEMBER);
  //
  //   const claimsCountBefore = await this.individualClaims.getClaimsCount();
  //   const assessmentCountBefore = await this.assessment.getAssessmentsCount();
  //
  //   const ipfsHash = '0x68747470733a2f2f7777772e796f75747562652e636f6d2f77617463683f763d423365414d47584677316f';
  //   const requestedAmount = parseUnits('1000', 6);
  //   const coverData = await this.cover.getCoverData(custodyCoverId);
  //
  //   const [deposit] = await this.individualClaims.getAssessmentDepositAndReward(
  //     requestedAmount,
  //     coverData.period,
  //     6, // USDC
  //   );
  //   await this.individualClaims
  //     .connect(coverBuyer)
  //     .submitClaim(protocolCoverId, requestedAmount, ipfsHash, { value: deposit });
  //
  //   const claimsCountAfter = await this.individualClaims.getClaimsCount();
  //   const assessmentCountAfter = await this.assessment.getAssessmentsCount();
  //
  //   assessmentId = assessmentCountBefore.toString();
  //   expect(claimsCountAfter).to.be.equal(claimsCountBefore.add(1));
  //   expect(assessmentCountAfter).to.be.equal(assessmentCountBefore.add(1));
  //
  //   requestedClaimAmount = requestedAmount;
  //   claimDeposit = deposit;
  // });

  // it('Process assessment and USDC payout for protocol cover', async function () {
  //   await castAssessmentVote.call(this);
  //
  //   const coverIdV2 = protocolCoverId;
  //   const claimId = (await this.individualClaims.getClaimsCount()).toNumber() - 1;
  //
  //   const memberAddress = await this.coverNFT.ownerOf(coverIdV2);
  //
  //   const usdcBalanceBefore = await this.usdc.balanceOf(memberAddress);
  //
  //   // redeem payout
  //   await this.individualClaims.redeemClaimPayout(claimId);
  //
  //   const usdcBalanceAfter = await this.usdc.balanceOf(memberAddress);
  //   expect(usdcBalanceAfter).to.be.equal(usdcBalanceBefore.add(requestedClaimAmount));
  //
  //   const { payoutRedeemed } = await this.individualClaims.claims(claimId);
  //   expect(payoutRedeemed).to.be.equal(true);
  // });

  it('buy cover through CoverBroker using ETH', async function () {
    const coverBuyer = await ethers.Wallet.createRandom().connect(ethers.provider);
    const coverBuyerAddress = await coverBuyer.getAddress();

    await this.evm.setBalance(coverBuyer.address, parseEther('1000000'));

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

    const coverAsset = await this.pool.getAssetId(Address.USDC_ADDRESS);
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

  it('Edit cover', async function () {
    const coverBuyer = this.members[1];
    const coverBuyerAddress = coverBuyer.address;

    const coverAsset = await this.pool.getAssetId(Address.USDC_ADDRESS);
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
    this.aaveDebtBefore = await this.aaveUsdcVariableDebtToken.balanceOf(GNOSIS_SAFE_ADDRESS);
    this.poolValueBefore = await this.pool.getPoolValueInEth();
    console.log(this.poolValueBefore.toString());
    this.ethBalanceBefore = await ethers.provider.getBalance(this.pool.target);
    this.daiBalanceBefore = await this.dai.balanceOf(this.pool.target);
    this.stEthBalanceBefore = await this.stEth.balanceOf(this.pool.target);
    this.enzymeSharesBalanceBefore = await this.enzymeShares.balanceOf(this.pool.target);
    this.rethBalanceBefore = await this.rEth.balanceOf(this.pool.target);
  });

  it('Performs hypothetical future Governor upgrade', async function () {
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

    await compareProxyImplementationAddress(this.governor.target, newGovernor.target);
  });

  it('Performs hypothetical future Registry upgrade', async function () {
    const newRegistry = await deployContract('Registry', [this.registry, this.master]);
    const upgradableProxy = await ethers.getContractAt('UpgradeableProxy', this.registry.target);

    const owner = await upgradableProxy.proxyOwner();
    const txs = [
      {
        target: this.registry,
        data: upgradableProxy.interface.encodeFunctionData('upgradeTo', [newRegistry.target]),
        value: 0n,
      },
    ];

    await executeGovernorProposal(this.governor, this.abMembers, txs);

    await compareProxyImplementationAddress(this.registry.target, newRegistry.target);
  });

  it('Performs hypothetical future upgrade of contracts', async function () {
    // TokenController.sol
    const tokenController = await deployContract('TokenController', [this.registry.target]);

    // Cover.sol
    const cover = await deployContract('Cover', [
      this.coverNFT.target,
      this.stakingNFT.target,
      this.stakingPoolFactory.target,
      this.stakingPool.target,
    ]);

    const swapOperator = await deployContract('SwapOperator', [
      this.registry.target,
      Address.COWSWAP_SETTLEMENT,
      EnzymeAddress.ENZYMEV4_VAULT_PROXY_ADDRESS,
      Address.WETH_ADDRESS,
    ]);

    // Pool.sol
    const pool = await deployContract('Pool', [this.registry.target]);

    // Assessment.sol
    const assessment = await deployContract('Assessment', [this.registry.target]);

    // Claims
    const claims = await deployContract('Assessment', [this.registry.target]);

    // Ramm.sol
    const ramm = await deployContract('Ramm', [this.registry.target, '0']);

    const contractUpgrades = [
      { index: ContractIndexes.C_TOKEN_CONTROLLER, address: tokenController.target },
      { index: ContractIndexes.C_COVER, address: cover.target },
      { index: ContractIndexes.C_SWAP_OPERATOR, address: swapOperator.target },
      { index: ContractIndexes.C_POOL, address: pool.target },
      { index: ContractIndexes.C_ASSESSMENT, address: assessment.target },
      { index: ContractIndexes.C_CLAIMS, address: claims.target },
      { index: ContractIndexes.C_RAMM, address: ramm.target },
    ];

    const transactions = contractUpgrades.map(c => ({
      target: this.registry.target,
      value: 0n,
      data: this.registry.interface.encodeFunctionData('upgradeContract', [c.index, c.address]),
    }));

    await executeGovernorProposal(this.governor, this.abMembers, transactions);

    // Compare proxy implementation addresses
    await compareProxyImplementationAddress(this.tokenController.target, tokenController.target);
    await compareProxyImplementationAddress(this.cover.target, cover.target);
    // await compareProxyImplementationAddress(this.swapOperator.target, swapOperator.target);
    await compareProxyImplementationAddress(this.pool.target, pool.target);
    // await compareProxyImplementationAddress(this.assessment.target, assessment.target);
    await compareProxyImplementationAddress(this.claims.target, claims.target);
    await compareProxyImplementationAddress(this.ramm.target, ramm.target);
  });

  it('Check Pool balance after upgrades', async function () {
    const poolValueAfter = await this.pool.getPoolValueInEth();
    const aaveDebtAfter = await this.aaveUsdcVariableDebtToken.balanceOf(GNOSIS_SAFE_ADDRESS);

    const poolValueDiff = poolValueAfter - this.poolValueBefore;
    const aaveDebtDiff = aaveDebtAfter - this.aaveDebtBefore;
    const ethDebt = await this.priceFeedOracle.getEthForAsset(USDC_ADDRESS, aaveDebtDiff);

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
      rethBalanceAfter: formatEther(await this.rEth.balanceOf(this.pool.target)),
      rethBalanceDiff: formatEther(rEthBalanceAfter - this.rethBalanceBefore),
    });

    expect(poolValueDiff, 'Pool value in ETH should be the same').to.be.lte(ethDebt + 2n);
    expect(stEthBalanceAfter - this.stEthBalanceBefore, 'stETH balance should be the same').to.be.lte(2);
    expect(ethBalanceAfter - this.ethBalanceBefore, 'ETH balance should be the same').to.be.eq(0);
    expect(daiBalanceAfter - this.daiBalanceBefore, 'DAI balance should be the same').to.be.eq(0);
    expect(
      enzymeSharesBalanceAfter - this.enzymeSharesBalanceBefore,
      'Enzyme shares balance should be the same',
    ).to.be.eq(0);
    expect(rEthBalanceAfter - this.rethBalanceBefore, 'rETH balance should be the same').to.be.eq(0);
  });

  it('Performs hypothetical future Registry deployment', async function () {
    const owner = await this.coverBroker.owner();
    const newCoverBroker = await deployContract('CoverBroker', [this.registry, owner]);

    await this.coverBroker.switchMembership(newCoverBroker);
    await this.coverBroker.maxApproveCoverContract(this.cbbtc);
    await this.coverBroker.maxApproveCoverContract(this.usdc);

    // buy cover
    const coverBuyer = await ethers.Wallet.createRandom().connect(ethers.provider);
    const coverBuyerAddress = await coverBuyer.getAddress();
    await setBalance(coverBuyerAddress, parseEther('1000'));
    await setUSDCBalance(this.usdc.target, coverBuyer.address, parseEther('1000000'));

    const coverAsset = await this.pool.getAssetId(Address.USDC_ADDRESS);
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

    const emergencyAdmin = await ethers.getSigner(EMERGENCY_ADMIN);
    await setBalance(EMERGENCY_ADMIN, parseEther('1000'));

    await this.registry.connect(emergencyAdmin).proposePauseConfig(1);

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

    await compareProxyImplementationAddress(this.governor.target, newGovernor.target);

    await this.registry.connect(emergencyAdmin).proposePauseConfig(0);
  });
});
