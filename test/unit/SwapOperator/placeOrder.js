const { ethers } = require('hardhat');
const { expect } = require('chai');
const { domain: makeDomain, computeOrderUid } = require('@cowprotocol/contracts');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const {
  makeWrongValue,
  makeContractOrder,
  lastBlockTimestamp,
  daiMinAmount,
  stEthMinAmount,
  stEthMaxAmount,
  daiMaxAmount,
} = require('./helpers');
const setup = require('./setup');
const utils = require('../utils');

const { setEtherBalance, setNextBlockTime } = utils.evm;
const { ETH: ETH_ADDRESS } = utils.constants.Assets;

const { parseEther, hexZeroPad, hexlify, randomBytes } = ethers.utils;

function createContractOrder(domain, order, overrides = {}) {
  order = { ...order, ...overrides };
  const contractOrder = makeContractOrder(order);
  const orderUID = computeOrderUid(domain, order, order.receiver);
  return { contractOrder, orderUID };
}

async function placeOrderSetup(order, fixture) {
  const [controller, governance] = await ethers.getSigners();

  const { dai, stEth, pool, swapOperator, cowSettlement } = fixture.contracts;
  // Read constants
  const MIN_TIME_BETWEEN_ORDERS = (await swapOperator.MIN_TIME_BETWEEN_ORDERS()).toNumber();

  const { chainId } = await ethers.provider.getNetwork();
  const domain = makeDomain(chainId, cowSettlement.address);
  const { contractOrder, orderUID } = createContractOrder(domain, order);

  // Fund the pool contract
  await setEtherBalance(pool.address, parseEther('100'));

  // Set asset details for DAI and stEth. 0% slippage
  await pool.connect(governance).setSwapDetails(dai.address, daiMinAmount, daiMaxAmount, 0);
  await pool.connect(governance).setSwapDetails(stEth.address, stEthMinAmount, stEthMaxAmount, 0);

  return {
    ...fixture,
    domain,
    contractOrder,
    order,
    orderUID,
    MIN_TIME_BETWEEN_ORDERS,
    controller,
    governance,
  };
}

const orderParams = {
  appData: hexZeroPad(0, 32),
  feeAmount: parseEther('0.001'),
  kind: 'sell',
  partiallyFillable: false,
  sellTokenBalance: 'erc20',
  buyTokenBalance: 'erc20',
};

/**
 * WETH -> DAI swap
 */
async function placeSellWethOrderSetup(overrides = {}) {
  const fixture = await loadFixture(setup);
  const { dai, weth, swapOperator } = fixture.contracts;

  // Build order struct, domain separator and calculate UID
  const order = {
    sellToken: weth.address,
    buyToken: dai.address,
    receiver: swapOperator.address,
    sellAmount: parseEther('0.999'),
    buyAmount: parseEther('4995'),
    validTo: (await lastBlockTimestamp()) + 650,
    ...orderParams,
    ...overrides,
  };

  return placeOrderSetup(order, fixture);
}

/**
 * DAI -> WETH swap
 */
async function placeSellDaiOrderSetup(overrides = {}) {
  const fixture = await loadFixture(setup);
  const { dai, weth, pool, swapOperator } = fixture.contracts;

  await dai.setBalance(pool.address, parseEther('25000'));

  // Set reasonable amounts for DAI so selling does not bring balance below min
  const order = {
    sellToken: dai.address,
    buyToken: weth.address,
    receiver: swapOperator.address,
    sellAmount: parseEther('10000'),
    feeAmount: parseEther('1'),
    buyAmount: parseEther('2'),
    validTo: (await lastBlockTimestamp()) + 650,
    ...orderParams,
    ...overrides,
  };

  return placeOrderSetup(order, fixture);
}

/**
 * stETH -> DAI swap
 */
async function placeNonEthOrderSellStethSetup() {
  const fixture = await loadFixture(setup);
  const { dai, stEth, swapOperator, priceFeedOracle, pool } = fixture.contracts;

  const sellAmount = parseEther('2');
  await stEth.mint(pool.address, parseEther('50'));

  // Build order struct, domain separator and calculate UID
  const order = {
    sellToken: stEth.address,
    buyToken: dai.address,
    receiver: swapOperator.address,
    sellAmount,
    buyAmount: await priceFeedOracle.getAssetForEth(dai.address, sellAmount),
    validTo: (await lastBlockTimestamp()) + 650,
    ...orderParams,
  };

  return placeOrderSetup(order, fixture);
}

/**
 * DAI -> stETH swap
 */
async function placeNonEthOrderSellDaiSetup() {
  const fixture = await loadFixture(setup);
  const { dai, stEth, swapOperator, priceFeedOracle, pool } = fixture.contracts;

  const sellAmount = parseEther('5000');
  await dai.mint(pool.address, parseEther('30000'));

  // Build order struct, domain separator and calculate UID
  const order = {
    sellToken: dai.address,
    buyToken: stEth.address,
    receiver: swapOperator.address,
    sellAmount,
    buyAmount: await priceFeedOracle.getEthForAsset(dai.address, sellAmount),
    validTo: (await lastBlockTimestamp()) + 650,
    ...orderParams,
  };

  return placeOrderSetup(order, fixture);
}

describe('placeOrder', function () {
  it('is callable only by swap controller', async function () {
    const { contracts, governance, controller, contractOrder, orderUID } = await loadFixture(placeSellWethOrderSetup);
    const { swapOperator } = contracts;

    // call with non-controller, should fail
    const placeOrder = swapOperator.connect(governance).placeOrder(contractOrder, orderUID);
    await expect(placeOrder).to.revertedWithCustomError(swapOperator, 'OnlyController');

    // call with controller, should succeed
    await swapOperator.connect(controller).placeOrder(contractOrder, orderUID);
  });

  it('computes order UID on-chain and validates against passed value', async function () {
    const { contracts, contractOrder, orderUID } = await loadFixture(placeSellWethOrderSetup);
    const { swapOperator } = contracts;

    // call with invalid UID, should fail
    const wrongUID = hexlify(randomBytes(56));
    const placeOrder = swapOperator.placeOrder(contractOrder, wrongUID);
    await expect(placeOrder).to.revertedWithCustomError(swapOperator, 'OrderUidMismatch');

    // call with invalid struct, with each individual field modified, should fail
    for (const [key, value] of Object.entries(contractOrder)) {
      const wrongOrder = {
        ...contractOrder,
        [key]: makeWrongValue(value),
      };
      const placeWrongOrder = swapOperator.placeOrder(wrongOrder, orderUID);
      await expect(placeWrongOrder).to.revertedWithCustomError(swapOperator, 'OrderUidMismatch');
    }

    // call with valid order and UID, should succeed
    await swapOperator.placeOrder(contractOrder, orderUID);
  });

  it('validates theres no other order already placed', async function () {
    const { contracts, contractOrder, orderUID } = await loadFixture(placeSellWethOrderSetup);
    const { swapOperator } = contracts;

    // calling with valid data should succeed first time
    await swapOperator.placeOrder(contractOrder, orderUID);

    // calling with valid data should fail second time, because first order is still there
    const placeOrder = swapOperator.placeOrder(contractOrder, orderUID);
    await expect(placeOrder).to.be.revertedWithCustomError(swapOperator, 'OrderInProgress').withArgs(orderUID);
  });

  it('validates only erc20 is supported for sellTokenBalance', async function () {
    const { contracts, order, domain } = await loadFixture(placeSellWethOrderSetup);
    const { swapOperator } = contracts;

    const { contractOrder, orderUID } = createContractOrder(domain, order, { sellTokenBalance: 'external' });
    const placeOrder = swapOperator.placeOrder(contractOrder, orderUID);
    await expect(placeOrder).to.be.revertedWithCustomError(swapOperator, 'UnsupportedTokenBalance').withArgs('sell');
  });

  it('validates only erc20 is supported for buyTokenBalance', async function () {
    const { contracts, order, domain } = await loadFixture(placeSellWethOrderSetup);
    const { swapOperator } = contracts;

    const { contractOrder, orderUID } = createContractOrder(domain, order, { buyTokenBalance: 'internal' });
    const placeOrder = swapOperator.placeOrder(contractOrder, orderUID);
    await expect(placeOrder).to.be.revertedWithCustomError(swapOperator, 'UnsupportedTokenBalance').withArgs('buy');
  });

  it('validates the receiver of the swap is the swap operator contract', async function () {
    const { contracts, governance, order, domain } = await loadFixture(placeSellWethOrderSetup);
    const { swapOperator } = contracts;

    const { contractOrder, orderUID } = createContractOrder(domain, order, { receiver: governance.address });
    const placeOrder = swapOperator.placeOrder(contractOrder, orderUID);
    await expect(placeOrder)
      .to.be.revertedWithCustomError(swapOperator, 'InvalidReceiver')
      .withArgs(swapOperator.address);
  });

  it('validates that order.validTo is at least 10 minutes in the future', async function () {
    const MIN_VALID_TO_PERIOD_SECONDS = 60 * 10; // 10 min
    const { contracts, order, domain } = await loadFixture(placeSellWethOrderSetup);
    const { swapOperator } = contracts;
    const { timestamp } = await ethers.provider.getBlock('latest');

    // orders less than 10 minutes validTo should fail
    const blockOneTimestamp = timestamp + 1;
    const badOrder = createContractOrder(domain, order, { validTo: blockOneTimestamp + 500 });
    const placeOrder = swapOperator.placeOrder(badOrder.contractOrder, badOrder.orderUID);
    const expectMinValidTo = blockOneTimestamp + MIN_VALID_TO_PERIOD_SECONDS;
    await expect(placeOrder).to.be.revertedWithCustomError(swapOperator, 'BelowMinValidTo').withArgs(expectMinValidTo);

    // order at least 10 minutes validTo should succeed
    const blockTwoTimestamp = blockOneTimestamp + 1;
    const correctValidTo = blockTwoTimestamp + MIN_VALID_TO_PERIOD_SECONDS;
    const goodOrder = createContractOrder(domain, order, { validTo: correctValidTo });
    await swapOperator.placeOrder(goodOrder.contractOrder, goodOrder.orderUID);
  });

  it('validates that sellToken is not ETH address on ETH swaps', async function () {
    const { contracts, order, domain } = await loadFixture(placeSellWethOrderSetup);
    const { swapOperator } = contracts;

    const badOrder = createContractOrder(domain, order, { sellToken: ETH_ADDRESS });
    const placeOrder = swapOperator.placeOrder(badOrder.contractOrder, badOrder.orderUID);
    await expect(placeOrder).to.be.revertedWithCustomError(swapOperator, 'InvalidTokenAddress').withArgs('sellToken');
  });

  it('validates that buyToken is not ETH address on ETH swaps', async function () {
    const { contracts, order, domain } = await loadFixture(placeSellDaiOrderSetup);
    const { swapOperator } = contracts;

    const badOrder = createContractOrder(domain, order, { buyToken: ETH_ADDRESS });
    const placeOrder = swapOperator.placeOrder(badOrder.contractOrder, badOrder.orderUID);
    await expect(placeOrder).to.be.revertedWithCustomError(swapOperator, 'InvalidTokenAddress').withArgs('buyToken');
  });

  it('validates that order.validTo is at most 1 month in the future', async function () {
    const MAX_VALID_TO_PERIOD_SECONDS = 60 * 60 * 24 * 31; // 1 month
    const { contracts, order, domain } = await loadFixture(placeSellWethOrderSetup);
    const { swapOperator } = contracts;
    const { timestamp } = await ethers.provider.getBlock('latest');

    // orders greater than 60 minutes validTo should fail
    const blockOneTimestamp = timestamp + 1;
    const exceedingMaxValidTo = blockOneTimestamp + MAX_VALID_TO_PERIOD_SECONDS + 10;
    const badOrder = createContractOrder(domain, order, { validTo: exceedingMaxValidTo });
    const placeOrder = swapOperator.placeOrder(badOrder.contractOrder, badOrder.orderUID);
    const expectMaxValidTo = blockOneTimestamp + MAX_VALID_TO_PERIOD_SECONDS;
    await expect(placeOrder).to.be.revertedWithCustomError(swapOperator, 'AboveMaxValidTo').withArgs(expectMaxValidTo);

    // orders within 60 minutes validTo should succeed
    const blockTwoTimestamp = blockOneTimestamp + 1;
    const goodOrder = createContractOrder(domain, order, { validTo: blockTwoTimestamp + MAX_VALID_TO_PERIOD_SECONDS });
    await swapOperator.placeOrder(goodOrder.contractOrder, goodOrder.orderUID);
  });

  it('does not perform token enabled validation when sellToken is WETH, because eth is used', async function () {
    const { contracts, contractOrder, orderUID } = await loadFixture(placeSellWethOrderSetup);
    const { swapOperator, weth, pool } = contracts;

    // Ensure eth (weth) is disabled by checking min and max amount
    const swapDetails = await pool.getAssetSwapDetails(weth.address);
    expect(swapDetails.minAmount).to.eq(0);
    expect(swapDetails.maxAmount).to.eq(0);

    // Order selling WETH (eth) still should succeed
    await swapOperator.placeOrder(contractOrder, orderUID);
  });

  it('performs token enabled validation when sellToken is not WETH', async function () {
    const { contracts, contractOrder, orderUID, governance } = await loadFixture(placeNonEthOrderSellStethSetup);
    const { swapOperator, stEth, dai, pool } = contracts;

    // Since stEth was already registered on setup, set its details to 0
    await pool.connect(governance).setSwapDetails(stEth.address, 0, 0, 0);
    await pool.connect(governance).setSwapDetails(dai.address, daiMinAmount, daiMaxAmount, 0);

    // Order selling stEth should fail
    const placeOrder = swapOperator.placeOrder(contractOrder, orderUID);
    await expect(placeOrder).to.be.revertedWithCustomError(swapOperator, 'TokenDisabled').withArgs(stEth.address);
  });

  it('only allows to sell when sellToken balance is above asset maxAmount - ASSET -> WETH', async function () {
    const { contracts, contractOrder, orderUID } = await loadFixture(placeSellDaiOrderSetup);
    const { swapOperator, dai, pool } = contracts;

    // Try to run when balance is at maxAmount,
    await dai.setBalance(pool.address, daiMaxAmount);
    const placeOrder = swapOperator.placeOrder(contractOrder, orderUID);
    await expect(placeOrder)
      .to.be.revertedWithCustomError(swapOperator, 'InvalidBalance')
      .withArgs(daiMaxAmount, daiMaxAmount);

    // When balance > maxAmount, should succeed
    await dai.setBalance(pool.address, daiMaxAmount.add(1));
    await swapOperator.placeOrder(contractOrder, orderUID);
  });

  it('only allows to sell when sellToken balance is above asset maxAmount - ASSET -> ASSET', async function () {
    const { contracts, contractOrder, orderUID } = await loadFixture(placeNonEthOrderSellStethSetup);
    const { swapOperator, stEth, pool } = contracts;

    // Try to run when balance is at maxAmount,
    await stEth.setBalance(pool.address, stEthMaxAmount);
    const placeOrder = swapOperator.placeOrder(contractOrder, orderUID);
    await expect(placeOrder)
      .to.be.revertedWithCustomError(swapOperator, 'InvalidBalance')
      .withArgs(stEthMaxAmount, stEthMaxAmount);

    // When balance > maxAmount, should succeed
    await stEth.setBalance(pool.address, stEthMaxAmount.add(1));
    await swapOperator.placeOrder(contractOrder, orderUID);
  });

  it('only allows to buy when buyToken balance is below minAmount - ASSET -> ASSET', async function () {
    const { contracts, contractOrder, orderUID } = await loadFixture(placeNonEthOrderSellStethSetup);
    const { swapOperator, dai, pool } = contracts;

    // set buyToken balance to be minAmount, txn should fail
    await dai.setBalance(pool.address, daiMinAmount);

    const placeOrder = swapOperator.placeOrder(contractOrder, orderUID);
    await expect(placeOrder)
      .to.be.revertedWithCustomError(swapOperator, 'InvalidBalance')
      .withArgs(daiMinAmount, daiMinAmount);

    // set buyToken balance to be < minAmount, txn should succeed
    await dai.setBalance(pool.address, daiMinAmount.sub(1));
    await swapOperator.placeOrder(contractOrder, orderUID);
  });

  it('selling cannot bring sellToken balance below minAmount', async function () {
    const sellAmount = parseEther('24999');
    const feeAmount = parseEther('1');
    const buyAmount = parseEther('4.9998');
    const sellDaiForEthSetup = () => placeSellDaiOrderSetup({ sellAmount, feeAmount, buyAmount });

    const { contracts, contractOrder, orderUID } = await loadFixture(sellDaiForEthSetup);
    const { swapOperator, dai, pool } = contracts;

    // Set balance so that balance - totalOutAmount is 1 wei below asset minAmount
    const totalOutAmount = sellAmount.add(feeAmount);
    const invalidBalance = daiMinAmount.add(totalOutAmount).sub(1);
    await dai.setBalance(pool.address, invalidBalance);

    const placeOrder = swapOperator.placeOrder(contractOrder, orderUID);
    await expect(placeOrder)
      .to.be.revertedWithCustomError(swapOperator, 'InvalidPostSwapBalance')
      .withArgs(invalidBalance.sub(totalOutAmount), daiMinAmount);

    // Set balance so it can exactly cover totalOutAmount
    await dai.setBalance(pool.address, daiMinAmount.add(totalOutAmount));
    await swapOperator.placeOrder(contractOrder, orderUID);

    expect(await dai.balanceOf(pool.address)).to.eq(daiMinAmount);
  });

  it('selling can leave balance above maxAmount', async function () {
    const sellAmount = parseEther('24999');
    const feeAmount = parseEther('1');
    const buyAmount = parseEther('4.9998');
    const sellDaiForEthSetup = () => placeSellDaiOrderSetup({ sellAmount, feeAmount, buyAmount });

    const { contracts, contractOrder, orderUID } = await loadFixture(sellDaiForEthSetup);
    const { swapOperator, dai, pool } = contracts;

    // Set balance so that balance - totalOutAmount is 1 wei above asset maxAmount, should succeed
    await dai.setBalance(pool.address, daiMaxAmount.add(sellAmount).add(feeAmount).add(1));
    await swapOperator.placeOrder(contractOrder, orderUID);
  });

  it('validates that pools eth balance is not brought below established minimum when selling ETH', async function () {
    const { contracts, contractOrder, orderUID } = await loadFixture(placeSellWethOrderSetup);
    const { swapOperator, pool } = contracts;

    // Set pool balance to 2 eth - 1 wei
    const underTwoEthBalance = parseEther('2').sub(1);
    await setEtherBalance(pool.address, underTwoEthBalance);

    // Execute trade for 1 eth, should fail
    expect(contractOrder.sellAmount.add(contractOrder.feeAmount)).to.eq(parseEther('1'));
    const placeOrder = swapOperator.placeOrder(contractOrder, orderUID);
    const ethPostSwap = underTwoEthBalance.sub(parseEther('1'));
    const minPoolEth = parseEther('1');

    await expect(placeOrder)
      .to.revertedWithCustomError(swapOperator, 'InvalidPostSwapBalance')
      .withArgs(ethPostSwap, minPoolEth);

    // Set pool balance to 2 eth, should succeed
    await setEtherBalance(pool.address, parseEther('2'));
    await swapOperator.placeOrder(contractOrder, orderUID);
  });

  it('does not perform WETH token enabled validation when buying WETH', async function () {
    const { contracts, contractOrder, orderUID } = await loadFixture(placeSellDaiOrderSetup);
    const { swapOperator, weth, pool } = contracts;

    // Ensure eth (weth) is disabled by checking min and max amount
    const swapDetails = await pool.getAssetSwapDetails(weth.address);
    expect(swapDetails.minAmount).to.eq(0);
    expect(swapDetails.maxAmount).to.eq(0);

    // Order buying WETH (eth) still should succeed
    await swapOperator.placeOrder(contractOrder, orderUID);
  });

  it('performs token enabled validation when not buying WETH', async function () {
    const { contracts, contractOrder, orderUID, governance } = await loadFixture(placeNonEthOrderSellStethSetup);
    const { swapOperator, stEth, dai, pool } = contracts;

    // Since DAI was already registered on setup, set its details to 0
    // Since stEth was already registered on setup, set its details to 0
    await pool.connect(governance).setSwapDetails(stEth.address, stEthMinAmount, stEthMaxAmount, 0);
    await pool.connect(governance).setSwapDetails(dai.address, 0, 0, 0);

    // Order buying DAI should fail
    const placeOrder = swapOperator.placeOrder(contractOrder, orderUID);
    await expect(placeOrder).to.be.revertedWithCustomError(swapOperator, 'TokenDisabled').withArgs(dai.address);
  });

  it('only allows to buy when buyToken balance is below minAmount (WETH -> ASSET)', async function () {
    const { contracts, contractOrder, orderUID } = await loadFixture(placeSellWethOrderSetup);
    const { swapOperator, dai, pool } = contracts;

    // set buyToken balance to be minAmount, txn should fail
    await dai.setBalance(pool.address, daiMinAmount);

    const placeOrder = swapOperator.placeOrder(contractOrder, orderUID);
    await expect(placeOrder)
      .to.be.revertedWithCustomError(swapOperator, 'InvalidBalance')
      .withArgs(daiMinAmount, daiMinAmount);

    // set buyToken balance to be < minAmount, txn should succeed
    await dai.setBalance(pool.address, daiMinAmount.sub(1));
    await swapOperator.placeOrder(contractOrder, orderUID);
  });

  it('the swap cannot bring buyToken above maxAmount', async function () {
    const exceedingMaxOrderSetup = () => placeSellWethOrderSetup({ buyAmount: daiMaxAmount.add(1) });
    const { contracts, order, domain } = await loadFixture(exceedingMaxOrderSetup);
    const { swapOperator, dai, pool } = contracts;

    await dai.setBalance(pool.address, 0);

    // try to place an order that will bring balance 1 wei above max, should fail
    const exceedsMaxOrder = createContractOrder(domain, order, { buyAmount: daiMaxAmount.add(1) });
    const placeOrder = swapOperator.placeOrder(exceedsMaxOrder.contractOrder, exceedsMaxOrder.orderUID);
    await expect(placeOrder)
      .to.be.revertedWithCustomError(swapOperator, 'InvalidPostSwapBalance')
      .withArgs(order.buyAmount, daiMaxAmount);

    // place an order that will bring balance exactly to maxAmount, should succeed
    const withinMaxOrder = createContractOrder(domain, order, { buyAmount: daiMaxAmount });
    await swapOperator.placeOrder(withinMaxOrder.contractOrder, withinMaxOrder.orderUID);
  });

  it('the swap can leave buyToken below minAmount', async function () {
    // place an order that will bring balance 1 wei below min, should succeed
    const buyAmount = daiMinAmount.sub(1);
    const buyTokenBelowMinOrderSetup = () => placeSellWethOrderSetup({ buyAmount, sellAmount: buyAmount.div(5000) });

    const { contracts, contractOrder, orderUID } = await loadFixture(buyTokenBelowMinOrderSetup);
    const { swapOperator, dai, pool } = contracts;
    await dai.setBalance(pool.address, 0);

    await swapOperator.placeOrder(contractOrder, orderUID);
  });

  it('validates minimum time between swaps of buyToken when selling eth', async function () {
    const {
      contracts: { swapOperator, dai, pool },
      governance,
      contractOrder,
      order,
      orderUID,
      domain,
      MIN_TIME_BETWEEN_ORDERS,
    } = await loadFixture(placeSellWethOrderSetup);

    // Place and close an order
    await swapOperator.placeOrder(contractOrder, orderUID);
    await swapOperator.closeOrder(contractOrder);

    // ETH lastSwapTime should be 0 since it does not have set swapDetails
    const { lastSwapTime } = await pool.getAssetSwapDetails(dai.address);
    const minValidSwapTime = lastSwapTime + MIN_TIME_BETWEEN_ORDERS;

    // Prepare valid pool params for allowing next order
    await pool.connect(governance).setSwapDetails(dai.address, daiMinAmount.mul(2), daiMaxAmount.mul(2), 0);

    // Set next block time to minimum - 2
    await setNextBlockTime(minValidSwapTime - 2);

    // Try to place order, should revert because of frequency
    const secondOrder = createContractOrder(domain, order, { validTo: minValidSwapTime + 650 });
    const placeOrder = swapOperator.placeOrder(secondOrder.contractOrder, secondOrder.orderUID);
    await expect(placeOrder)
      .to.be.revertedWithCustomError(swapOperator, 'InsufficientTimeBetweenSwaps')
      .withArgs(minValidSwapTime);

    // Set next block time to minimum, should succeed now
    await setNextBlockTime(minValidSwapTime);
    await swapOperator.placeOrder(secondOrder.contractOrder, secondOrder.orderUID);
  });

  it('validates minimum time between swaps of sellToken when buying eth', async function () {
    const {
      contracts: { swapOperator, dai, pool },
      domain,
      order,
      contractOrder,
      orderUID,
      governance,
      MIN_TIME_BETWEEN_ORDERS,
    } = await loadFixture(placeSellDaiOrderSetup);

    // Place and close an order
    await swapOperator.placeOrder(contractOrder, orderUID);
    await swapOperator.closeOrder(contractOrder);

    // Prepare valid pool params for allowing next order
    await pool.connect(governance).setSwapDetails(dai.address, 3000, 6000, 0);

    // ETH lastSwapTime should be 0 since it does not have set swapDetails
    const { lastSwapTime } = await pool.getAssetSwapDetails(dai.address);
    const minValidSwapTime = lastSwapTime + MIN_TIME_BETWEEN_ORDERS;

    // Set next block time to minimum - 2
    await setNextBlockTime(minValidSwapTime - 2);

    // Build a new valid order
    const secondOrder = createContractOrder(domain, order, { validTo: lastSwapTime + MIN_TIME_BETWEEN_ORDERS + 650 });

    // Try to place order, should revert because of frequency
    const placeOrder = swapOperator.placeOrder(secondOrder.contractOrder, secondOrder.orderUID);
    await expect(placeOrder)
      .to.be.revertedWithCustomError(swapOperator, 'InsufficientTimeBetweenSwaps')
      .withArgs(minValidSwapTime);

    // Set next block time to minimum
    await setNextBlockTime(lastSwapTime + MIN_TIME_BETWEEN_ORDERS);

    // Placing the order should succeed now
    await swapOperator.placeOrder(secondOrder.contractOrder, secondOrder.orderUID);
  });

  it('validates minimum time between swaps of sellToken when swapping asset to asset', async function () {
    const {
      contracts: { swapOperator, stEth, dai, pool },
      governance,
      contractOrder,
      order,
      orderUID,
      domain,
      MIN_TIME_BETWEEN_ORDERS,
    } = await loadFixture(placeNonEthOrderSellStethSetup);

    // Place and close an order
    await swapOperator.placeOrder(contractOrder, orderUID);
    await swapOperator.closeOrder(contractOrder);

    // Prepare valid pool params for allowing next order
    await pool.connect(governance).setSwapDetails(stEth.address, stEthMinAmount.mul(2), stEthMaxAmount.mul(2), 0);
    await pool.connect(governance).setSwapDetails(dai.address, daiMinAmount.mul(2), daiMaxAmount.mul(2), 0);

    // Read last swap time
    const { lastSwapTime } = await pool.getAssetSwapDetails(stEth.address);
    const minValidSwapTime = lastSwapTime + MIN_TIME_BETWEEN_ORDERS;

    // Set next block time to minimum - 2
    await setNextBlockTime(minValidSwapTime - 2);

    // Build a new valid order
    const secondOrder = createContractOrder(domain, order, { validTo: lastSwapTime + MIN_TIME_BETWEEN_ORDERS + 650 });

    // Try to place order, should revert because of frequency
    const placeOrder = swapOperator.placeOrder(secondOrder.contractOrder, secondOrder.orderUID);
    await expect(placeOrder)
      .to.be.revertedWithCustomError(swapOperator, 'InsufficientTimeBetweenSwaps')
      .withArgs(minValidSwapTime);

    // Set next block time to minimum
    await setNextBlockTime(lastSwapTime + MIN_TIME_BETWEEN_ORDERS);

    // Placing the order should succeed now
    await swapOperator.placeOrder(secondOrder.contractOrder, secondOrder.orderUID);
  });

  it('validates minimum time between swaps of buyToken when swapping asset to asset', async function () {
    const {
      contracts: { swapOperator, stEth, dai, pool },
      governance,
      contractOrder,
      order,
      orderUID,
      domain,
      MIN_TIME_BETWEEN_ORDERS,
    } = await loadFixture(placeNonEthOrderSellStethSetup);

    // Place and close an order
    await swapOperator.placeOrder(contractOrder, orderUID);
    await swapOperator.closeOrder(contractOrder);

    // Prepare valid pool params for allowing next order
    await pool.connect(governance).setSwapDetails(stEth.address, stEthMinAmount.mul(2), stEthMaxAmount.mul(2), 0);
    await pool.connect(governance).setSwapDetails(dai.address, daiMinAmount.mul(2), daiMaxAmount.mul(2), 0);

    // Read last swap time
    const { lastSwapTime } = await pool.getAssetSwapDetails(dai.address);
    const minValidSwapTime = lastSwapTime + MIN_TIME_BETWEEN_ORDERS;

    // Set next block time to minimum - 2
    await setNextBlockTime(minValidSwapTime - 2);

    // Build a new valid order
    const secondOrder = createContractOrder(domain, order, { validTo: lastSwapTime + MIN_TIME_BETWEEN_ORDERS + 650 });

    // Try to place order, should revert because of frequency
    const placeOrder = swapOperator.placeOrder(secondOrder.contractOrder, secondOrder.orderUID);
    await expect(placeOrder)
      .to.be.revertedWithCustomError(swapOperator, 'InsufficientTimeBetweenSwaps')
      .withArgs(minValidSwapTime);

    // Set next block time to minimum
    await setNextBlockTime(lastSwapTime + MIN_TIME_BETWEEN_ORDERS);

    // Placing the order should succeed now
    await swapOperator.placeOrder(secondOrder.contractOrder, secondOrder.orderUID);
  });

  it('when selling ETH, checks that feeAmount is not higher than maxFee', async function () {
    const { contracts, order, domain } = await loadFixture(placeSellWethOrderSetup);
    const { swapOperator } = contracts;
    const maxFee = await swapOperator.MAX_FEE();

    // Place order with fee 1 wei higher than maximum, should fail
    const badOrder = createContractOrder(domain, order, { feeAmount: maxFee.add(1) });
    const placeOrder = swapOperator.placeOrder(badOrder.contractOrder, badOrder.orderUID);
    await expect(placeOrder)
      .to.be.revertedWithCustomError(swapOperator, 'AboveMaxFee')
      .withArgs(badOrder.contractOrder.feeAmount, maxFee);

    // Place order with exactly maxFee, should succeed
    const goodOrder = createContractOrder(domain, order, { feeAmount: maxFee });
    await swapOperator.placeOrder(goodOrder.contractOrder, goodOrder.orderUID);
  });

  it('when selling other asset, uses oracle to check fee in ether is not higher than maxFee', async function () {
    const { contracts, order, domain } = await loadFixture(placeSellDaiOrderSetup);
    const { swapOperator, priceFeedOracle, dai } = contracts;
    const maxFee = await swapOperator.MAX_FEE();
    const daiToEthRate = await priceFeedOracle.getAssetToEthRate(dai.address);
    const ethToDaiRate = parseEther('1').div(daiToEthRate); // 1 ETH -> N DAI

    // Place order with fee 1 wei higher than maximum, should fail
    const badOrder = createContractOrder(domain, order, { feeAmount: maxFee.add(1).mul(ethToDaiRate) });
    const feeInEth = await priceFeedOracle.getEthForAsset(order.sellToken, badOrder.contractOrder.feeAmount);
    const placeOrder = swapOperator.placeOrder(badOrder.contractOrder, badOrder.orderUID);
    await expect(placeOrder).to.be.revertedWithCustomError(swapOperator, 'AboveMaxFee').withArgs(feeInEth, maxFee);

    // Place order with exactly maxFee, should succeed
    const goodOrder = createContractOrder(domain, order, { feeAmount: maxFee.mul(ethToDaiRate) });
    await swapOperator.placeOrder(goodOrder.contractOrder, goodOrder.orderUID);
  });

  it('when selling eth validates buyAmount against oracle price if both assets has 0% slippage', async function () {
    const { contracts, order, domain } = await loadFixture(placeSellWethOrderSetup);
    const { swapOperator, priceFeedOracle, pool, dai, weth } = contracts;

    const wethSellSwapDetails = await pool.getAssetSwapDetails(weth.address);
    const daiBuySwapDetails = await pool.getAssetSwapDetails(dai.address);
    expect(wethSellSwapDetails.maxSlippageRatio === daiBuySwapDetails.maxSlippageRatio).to.equal(true);

    // Since buyAmount is short by 1 DAI wei, txn should revert
    const buyOracleAmount = await priceFeedOracle.getAssetForEth(dai.address, order.sellAmount);
    const badOrder = createContractOrder(domain, order, { buyAmount: buyOracleAmount.sub(1) });
    const placeOrder = swapOperator.placeOrder(badOrder.contractOrder, badOrder.orderUID);
    await expect(placeOrder)
      .to.be.revertedWithCustomError(swapOperator, 'AmountOutTooLow')
      .withArgs(buyOracleAmount.sub(1), buyOracleAmount);

    // Oracle price buyAmount should not revert
    const goodOrder = createContractOrder(domain, order, { buyAmount: buyOracleAmount });
    await swapOperator.placeOrder(goodOrder.contractOrder, goodOrder.orderUID);
  });

  it('when selling ETH validates buyAmount against oracle + the higher slippage ratio', async function () {
    const { contracts, governance, order, domain } = await loadFixture(placeSellWethOrderSetup);
    const { swapOperator, pool, dai, weth } = contracts;

    // set 1% slippage ratio for DAI
    await pool.connect(governance).setSwapDetails(dai.address, daiMinAmount, daiMaxAmount, 100);

    const wethSellSwapDetails = await pool.getAssetSwapDetails(weth.address);
    const daiBuySwapDetails = await pool.getAssetSwapDetails(dai.address);
    expect(daiBuySwapDetails.maxSlippageRatio > wethSellSwapDetails.maxSlippageRatio).to.equal(true);

    // Since buyAmount is > 1% slippage (i.e. 99% -1 wei), txn should revert
    const buyAmountOnePercentSlippage = order.buyAmount.mul(99).div(100);
    const badOrderOverrides = { buyAmount: buyAmountOnePercentSlippage.sub(1) };
    const badOrder = createContractOrder(domain, order, badOrderOverrides);
    const placeOrder = swapOperator.placeOrder(badOrder.contractOrder, badOrder.orderUID);
    await expect(placeOrder)
      .to.be.revertedWithCustomError(swapOperator, 'AmountOutTooLow')
      .withArgs(buyAmountOnePercentSlippage.sub(1), buyAmountOnePercentSlippage); // 1% slippage from oracle buyAmount

    // Exactly 1% slippage buyAmount should not revert
    const goodOrder = createContractOrder(domain, order, { buyAmount: buyAmountOnePercentSlippage });
    await swapOperator.placeOrder(goodOrder.contractOrder, goodOrder.orderUID);
  });

  it('when buying ETH validates buyAmount against oracle price if both assets has 0% slippage', async function () {
    const { contracts, order, domain } = await loadFixture(placeSellDaiOrderSetup);
    const { swapOperator, priceFeedOracle, pool, dai, weth } = contracts;

    const daiSellSwapDetails = await pool.getAssetSwapDetails(dai.address);
    const wethBuySwapDetails = await pool.getAssetSwapDetails(weth.address);
    expect(wethBuySwapDetails.maxSlippageRatio === daiSellSwapDetails.maxSlippageRatio).to.equal(true);

    // Since buyAmount is short by 1 wei, txn should revert
    const buyOracleAmount = await priceFeedOracle.getEthForAsset(dai.address, order.sellAmount);
    const badOrder = createContractOrder(domain, order, { buyAmount: buyOracleAmount.sub(1) });
    const placeOrder = swapOperator.placeOrder(badOrder.contractOrder, badOrder.orderUID);
    await expect(placeOrder)
      .to.be.revertedWithCustomError(swapOperator, 'AmountOutTooLow')
      .withArgs(buyOracleAmount.sub(1), buyOracleAmount);

    // Oracle price buyAmount should not revert
    const goodOrder = createContractOrder(domain, order);
    await swapOperator.placeOrder(goodOrder.contractOrder, goodOrder.orderUID);
  });

  it('when buying ETH validates buyAmount against oracle + the higher slippage ratio', async function () {
    const { contracts, governance, order, domain } = await loadFixture(placeSellDaiOrderSetup);
    const { swapOperator, pool, dai, weth } = contracts;

    // set 2% slippage ratio for DAI
    await pool.connect(governance).setSwapDetails(dai.address, daiMinAmount, daiMaxAmount, 200);

    const daiSellSwapDetails = await pool.getAssetSwapDetails(dai.address);
    const wethBuySwapDetails = await pool.getAssetSwapDetails(weth.address);
    expect(daiSellSwapDetails.maxSlippageRatio > wethBuySwapDetails.maxSlippageRatio).to.equal(true);

    // Since buyAmount is > 2% slippage (i.e. 98% -1 wei), txn should revert
    const ethBuyAmountTwoPercentSlippage = order.buyAmount.mul(98).div(100);
    const badOrder = createContractOrder(domain, order, { buyAmount: ethBuyAmountTwoPercentSlippage.sub(1) });
    const placeOrder = swapOperator.placeOrder(badOrder.contractOrder, badOrder.orderUID);
    await expect(placeOrder)
      .to.be.revertedWithCustomError(swapOperator, 'AmountOutTooLow')
      .withArgs(ethBuyAmountTwoPercentSlippage.sub(1), ethBuyAmountTwoPercentSlippage);

    // Exactly 2% slippage sellAmount should not revert
    const goodOrder = createContractOrder(domain, order, { buyAmount: ethBuyAmountTwoPercentSlippage });
    await swapOperator.placeOrder(goodOrder.contractOrder, goodOrder.orderUID);
  });

  it('non-ETH swap, validates buyAmount against oracle price if both assets has 0% slippage', async function () {
    const { contracts, order, domain } = await loadFixture(placeNonEthOrderSellStethSetup);
    const { swapOperator, priceFeedOracle, pool, dai, stEth } = contracts;

    const stEthSellSwapDetails = await pool.getAssetSwapDetails(stEth.address);
    const daiSwapDetails = await pool.getAssetSwapDetails(dai.address);
    expect(stEthSellSwapDetails.maxSlippageRatio === daiSwapDetails.maxSlippageRatio).to.equal(true);

    // Since buyAmount is short by 1 DAI wei, txn should revert
    const buyOracleAmount = await priceFeedOracle.getAssetForEth(dai.address, order.sellAmount);
    const badOrder = createContractOrder(domain, order, { buyAmount: buyOracleAmount.sub(1) });
    const placeOrder = swapOperator.placeOrder(badOrder.contractOrder, badOrder.orderUID);
    await expect(placeOrder)
      .to.be.revertedWithCustomError(swapOperator, 'AmountOutTooLow')
      .withArgs(buyOracleAmount.sub(1), buyOracleAmount);

    // Oracle price buyAmount should not revert
    const goodOrder = createContractOrder(domain, order, { buyAmount: buyOracleAmount });
    await swapOperator.placeOrder(goodOrder.contractOrder, goodOrder.orderUID);
  });

  it('non-ETH swap, validates buyAmount with oracle price + higher slippage ratio (stEth -> dai)', async function () {
    const { contracts, governance, order, domain } = await loadFixture(placeNonEthOrderSellStethSetup);
    const { swapOperator, pool, dai, stEth } = contracts;

    // set 1% slippage ratio for DAI
    await pool.connect(governance).setSwapDetails(dai.address, daiMinAmount, daiMaxAmount, 100);

    const stEthSellSwapDetails = await pool.getAssetSwapDetails(stEth.address);
    const daiBuySwapDetails = await pool.getAssetSwapDetails(dai.address);
    expect(daiBuySwapDetails.maxSlippageRatio > stEthSellSwapDetails.maxSlippageRatio).to.equal(true);

    // Since buyAmount is > 1% slippage (i.e. 99% -1 wei), txn should revert
    const daiBuyAmountOnePercentSlippage = order.buyAmount.mul(99).div(100);
    const badOrder = createContractOrder(domain, order, { buyAmount: daiBuyAmountOnePercentSlippage.sub(1) });
    const placeOrder = swapOperator.placeOrder(badOrder.contractOrder, badOrder.orderUID);
    await expect(placeOrder)
      .to.be.revertedWithCustomError(swapOperator, 'AmountOutTooLow')
      .withArgs(daiBuyAmountOnePercentSlippage.sub(1), daiBuyAmountOnePercentSlippage);

    // Exactly 1% slippage buyAmount should not revert
    const goodOrder = createContractOrder(domain, order, { buyAmount: daiBuyAmountOnePercentSlippage });
    await swapOperator.placeOrder(goodOrder.contractOrder, goodOrder.orderUID);
  });

  it('non-ETH swap, validates buyAmount with oracle price + higher slippage ratio (dai -> stEth)', async function () {
    const { contracts, governance, order, domain } = await loadFixture(placeNonEthOrderSellDaiSetup);
    const { swapOperator, pool, dai, stEth } = contracts;

    // set 3% slippage ratio for stETH
    await pool.connect(governance).setSwapDetails(stEth.address, stEthMinAmount, stEthMaxAmount, 300);

    const stEthSellSwapDetails = await pool.getAssetSwapDetails(stEth.address);
    const daiBuySwapDetails = await pool.getAssetSwapDetails(dai.address);
    expect(stEthSellSwapDetails.maxSlippageRatio > daiBuySwapDetails.maxSlippageRatio).to.equal(true);

    // Since sellAmount is > 3% slippage (i.e. 97% -1 wei), txn should revert
    const stEthBuyAmountThreePercentSlippage = order.buyAmount.mul(97).div(100);
    const badOrder = createContractOrder(domain, order, { buyAmount: stEthBuyAmountThreePercentSlippage.sub(1) });
    const placeOrder = swapOperator.placeOrder(badOrder.contractOrder, badOrder.orderUID);
    await expect(placeOrder)
      .to.be.revertedWithCustomError(swapOperator, 'AmountOutTooLow')
      .withArgs(stEthBuyAmountThreePercentSlippage.sub(1), stEthBuyAmountThreePercentSlippage);

    // Exactly 3% slippage sellAmount should not revert
    const goodOrder = createContractOrder(domain, order, { buyAmount: stEthBuyAmountThreePercentSlippage });
    await swapOperator.placeOrder(goodOrder.contractOrder, goodOrder.orderUID);
  });

  // TODO: same

  it('pulling funds from pool: transfers ETH from pool and wrap it into WETH when sellToken is ETH', async function () {
    const { contracts, order, contractOrder, orderUID } = await loadFixture(placeSellWethOrderSetup);
    const { swapOperator, weth, pool } = contracts;

    const ethPoolBefore = await ethers.provider.getBalance(pool.address);
    const wethSwapOpBefore = await weth.balanceOf(swapOperator.address);

    await swapOperator.placeOrder(contractOrder, orderUID);

    const ethPoolAfter = await ethers.provider.getBalance(pool.address);
    const wethSwapOpAfter = await weth.balanceOf(swapOperator.address);

    expect(ethPoolBefore.sub(ethPoolAfter)).to.eq(order.sellAmount.add(order.feeAmount));
    expect(wethSwapOpAfter.sub(wethSwapOpBefore)).to.eq(order.sellAmount.add(order.feeAmount));
  });

  it('pulling funds from pool: transfer erc20 asset from pool to eth if sellToken is not WETH', async function () {
    const { contracts, order, orderUID, contractOrder } = await loadFixture(placeNonEthOrderSellDaiSetup);
    const { swapOperator, dai, pool } = contracts;

    const daiPoolBefore = await dai.balanceOf(pool.address);
    const daiSwapOpBefore = await dai.balanceOf(swapOperator.address);

    await swapOperator.placeOrder(contractOrder, orderUID);

    const daiPoolAfter = await dai.balanceOf(pool.address);
    const daiSwapOpAfter = await dai.balanceOf(swapOperator.address);

    expect(daiPoolBefore.sub(daiPoolAfter)).to.eq(order.sellAmount.add(order.feeAmount));
    expect(daiSwapOpAfter.sub(daiSwapOpBefore)).to.eq(order.sellAmount.add(order.feeAmount));
  });

  it('sets lastSwapDate on buyToken when selling ETH', async function () {
    const { contracts, contractOrder, orderUID } = await loadFixture(placeSellWethOrderSetup);
    const { swapOperator, dai, pool } = contracts;

    const before = await pool.getAssetSwapDetails(dai.address);
    expect(before.lastSwapTime).to.not.eq(await lastBlockTimestamp());

    await swapOperator.placeOrder(contractOrder, orderUID);

    const after = await pool.getAssetSwapDetails(dai.address);
    expect(after.lastSwapTime).to.eq(await lastBlockTimestamp());
  });

  it('sets lastSwapDate on sellToken when buying ETH', async function () {
    const { contracts, contractOrder, orderUID } = await loadFixture(placeSellDaiOrderSetup);
    const { swapOperator, dai, pool } = contracts;

    const before = await pool.getAssetSwapDetails(dai.address);
    expect(before.lastSwapTime).to.not.eq(await lastBlockTimestamp());

    await swapOperator.placeOrder(contractOrder, orderUID);

    const after = await pool.getAssetSwapDetails(dai.address);
    expect(after.lastSwapTime).to.eq(await lastBlockTimestamp());
  });

  it('sets lastSwapDate on both sellToken / buyToken when swapping asset to asset', async function () {
    const { contracts, contractOrder, orderUID } = await loadFixture(placeNonEthOrderSellStethSetup);
    const { swapOperator, stEth, dai, pool } = contracts;

    const stEthBefore = await pool.getAssetSwapDetails(stEth.address);
    const daBefore = await pool.getAssetSwapDetails(dai.address);
    expect(stEthBefore.lastSwapTime).to.not.eq(await lastBlockTimestamp());
    expect(daBefore.lastSwapTime).to.not.eq(await lastBlockTimestamp());

    await swapOperator.placeOrder(contractOrder, orderUID);

    const stEthAfter = await pool.getAssetSwapDetails(stEth.address);
    const daiAfter = await pool.getAssetSwapDetails(dai.address);
    expect(stEthAfter.lastSwapTime).to.eq(await lastBlockTimestamp());
    expect(daiAfter.lastSwapTime).to.eq(await lastBlockTimestamp());
  });

  // TODO: transfers assets to swapOperator tests

  it('should set totalOutAmount in ETH as pool.assetInSwapOperator when selling ETH', async function () {
    const { contracts, order, contractOrder, orderUID } = await loadFixture(placeSellWethOrderSetup);
    const { swapOperator, pool } = contracts;

    expect(await pool.assetInSwapOperator()).to.eq(0);

    await swapOperator.placeOrder(contractOrder, orderUID);

    // sellAmount & already in ETH
    const totalOutAmountInEth = order.sellAmount.add(order.feeAmount);
    expect(await pool.assetInSwapOperator()).to.eq(totalOutAmountInEth);
  });

  it('should set totalOutAmount in ETH as pool.assetInSwapOperator when selling non-ETH assets', async function () {
    const orderSetupsToTest = [placeSellDaiOrderSetup, placeNonEthOrderSellStethSetup, placeNonEthOrderSellDaiSetup];
    for (const orderSetup of orderSetupsToTest) {
      const { contracts, contractOrder, orderUID } = await loadFixture(orderSetup);
      const { swapOperator, pool } = contracts;

      expect(await pool.assetInSwapOperator()).to.eq(0);

      await swapOperator.placeOrder(contractOrder, orderUID);

      // convert non-ETH sellAmount + fee to ETH
      const { sellAmount, feeAmount } = contractOrder;
      expect(await pool.assetInSwapOperator()).to.be.equal(sellAmount.add(feeAmount));
    }
  });

  it('should set totalOutAmount in ETH as pool.assetInSwapOperator on non-ETH asset swaps', async function () {
    const { contracts, order, orderUID, contractOrder } = await loadFixture(placeNonEthOrderSellStethSetup);
    const { swapOperator, pool, priceFeedOracle, stEth } = contracts;
    const { sellAmount, feeAmount } = order;

    console.log(order.sellToken);
    expect(await pool.assetInSwapOperator()).to.eq(0);

    await swapOperator.placeOrder(contractOrder, orderUID);

    // convert stETH sellAmount + fee to ETH
    const totalOutAmountInEth = await priceFeedOracle.getEthForAsset(stEth.address, sellAmount.add(feeAmount));
    expect(await pool.assetInSwapOperator()).to.eq(totalOutAmountInEth);
  });

  it('approves CoW vault relayer to spend exactly sellAmount + fee', async function () {
    const orderSetupsToTest = [
      { sellTokenName: 'weth', orderSetup: placeSellWethOrderSetup },
      { sellTokenName: 'dai', orderSetup: placeSellDaiOrderSetup },
      { sellTokenName: 'stEth', orderSetup: placeNonEthOrderSellStethSetup },
      { sellTokenName: 'dai', orderSetup: placeNonEthOrderSellDaiSetup },
    ];
    for (const { sellTokenName, orderSetup } of orderSetupsToTest) {
      const { contracts, order, contractOrder, orderUID } = await loadFixture(orderSetup);
      const { sellAmount, feeAmount } = order;
      const { swapOperator, cowVaultRelayer } = contracts;
      const sellToken = contracts[sellTokenName];

      expect(await sellToken.allowance(swapOperator.address, cowVaultRelayer.address)).to.eq(0);
      await swapOperator.placeOrder(contractOrder, orderUID);
      expect(await sellToken.allowance(swapOperator.address, cowVaultRelayer.address)).to.eq(sellAmount.add(feeAmount));
    }
  });

  it('stores the current orderUID in the contract', async function () {
    const { contracts, contractOrder, orderUID } = await loadFixture(placeSellWethOrderSetup);
    const { swapOperator } = contracts;

    expect(await swapOperator.currentOrderUID()).to.eq('0x');
    await swapOperator.placeOrder(contractOrder, orderUID);
    expect(await swapOperator.currentOrderUID()).to.eq(orderUID);
  });

  it('calls setPreSignature on CoW settlement contract', async function () {
    const { contracts, contractOrder, orderUID } = await loadFixture(placeSellWethOrderSetup);
    const { swapOperator, cowSettlement } = contracts;

    expect(await cowSettlement.presignatures(orderUID)).to.eq(false);
    await swapOperator.placeOrder(contractOrder, orderUID);
    expect(await cowSettlement.presignatures(orderUID)).to.eq(true);
  });

  it('emits an OrderPlaced event', async function () {
    const { contracts, contractOrder, orderUID } = await loadFixture(placeSellWethOrderSetup);
    const { swapOperator } = contracts;

    await expect(swapOperator.placeOrder(contractOrder, orderUID))
      .to.emit(swapOperator, 'OrderPlaced')
      .withArgs(Object.values(contractOrder));
  });
});
