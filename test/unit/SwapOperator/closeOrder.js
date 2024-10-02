const {
  makeWrongValue,
  makeContractOrder,
  lastBlockTimestamp,
  daiMaxAmount,
  daiMinAmount,
  makeOrderTuple,
  lodashValues,
} = require('./helpers');
const { ethers } = require('hardhat');
const { expect } = require('chai');
const { domain: makeDomain, computeOrderUid } = require('@cowprotocol/contracts');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const utils = require('../utils');

const { setEtherBalance, setNextBlockTime, revertToSnapshot, takeSnapshot, increaseTime, mineNextBlock } = utils.evm;

const {
  utils: { parseEther, hexZeroPad },
  constants: { MaxUint256 },
} = ethers;

async function closeOrderSetup() {
  const fixture = await loadFixture(setup);
  const [controller, governance] = await ethers.getSigners();

  // Assign contracts (destructuring isn't working)
  const dai = fixture.contracts.dai;
  const weth = fixture.contracts.weth;
  const pool = fixture.contracts.pool;
  const swapOperator = fixture.contracts.swapOperator;
  const cowSettlement = fixture.contracts.cowSettlement;
  const cowVaultRelayer = fixture.contracts.cowVaultRelayer;

  // Read constants
  const MIN_TIME_BETWEEN_ORDERS = (await swapOperator.MIN_TIME_BETWEEN_ORDERS()).toNumber();

  // Build order struct, domain separator and calculate UID
  const order = {
    sellToken: weth.address,
    buyToken: dai.address,
    sellAmount: parseEther('0.999'),
    buyAmount: parseEther('4995'),
    validTo: (await lastBlockTimestamp()) + 650,
    appData: hexZeroPad(0, 32),
    feeAmount: parseEther('0.001'),
    kind: 'sell',
    receiver: swapOperator.address,
    partiallyFillable: false,
    sellTokenBalance: 'erc20',
    buyTokenBalance: 'erc20',
  };

  const contractOrder = makeContractOrder(order);

  const { chainId } = await ethers.provider.getNetwork();
  const domain = makeDomain(chainId, cowSettlement.address);
  const orderUID = computeOrderUid(domain, order, order.receiver);

  // Fund the contracts
  await setEtherBalance(pool.address, parseEther('1000000'));
  await setEtherBalance(weth.address, parseEther('1000000'));
  await dai.mint(cowVaultRelayer.address, parseEther('1000000'));

  // Set asset details for DAI
  await pool.connect(governance).setSwapDetails(dai.address, daiMinAmount, daiMaxAmount, 100);

  // place order
  await swapOperator.placeOrder(contractOrder, orderUID);

  return {
    ...fixture,
    controller,
    governance,
    order,
    contractOrder,
    domain,
    orderUID,
    dai,
    weth,
    swapOperator,
    cowSettlement,
    cowVaultRelayer,
    MIN_TIME_BETWEEN_ORDERS,
  };
}

describe('closeOrder', function () {
  const setupSellDaiForEth = async (overrides = {}, { dai, pool, order, weth, domain }) => {
    // Set DAI balance above asset max, so we can sell it
    await dai.setBalance(pool.address, parseEther('25000'));

    // Set reasonable amounts for DAI so selling doesnt bring balance below min
    const newOrder = {
      ...order,
      sellToken: dai.address,
      buyToken: weth.address,
      sellAmount: parseEther('9999'),
      feeAmount: parseEther('1'),
      buyAmount: parseEther('2'),
      ...overrides,
    };
    const newContractOrder = makeContractOrder(newOrder);
    const newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);
    return { newOrder, newContractOrder, newOrderUID };
  };

  it('before deadline, its callable only by controller', async function () {
    const {
      contracts: { swapOperator },
      order,
      governance,
      contractOrder,
      controller,
    } = await loadFixture(closeOrderSetup);
    const deadline = order.validTo;
    const snapshot = await takeSnapshot();

    // Executing as non-controller should fail
    await setNextBlockTime(deadline);
    const closeOrder = swapOperator.connect(governance).closeOrder(contractOrder);
    await expect(closeOrder).to.be.revertedWithCustomError(swapOperator, 'OnlyController');
    // Executing as controller should succeed
    await revertToSnapshot(snapshot);
    await setNextBlockTime(deadline);
    await swapOperator.connect(controller).closeOrder(contractOrder);
  });

  it('after deadline, its callable by anyone', async function () {
    const {
      contracts: { swapOperator },
      order,
      contractOrder,
      controller,
    } = await loadFixture(closeOrderSetup);
    const deadline = order.validTo;
    const snapshot = await takeSnapshot();
    const { 36: generalPurposeAddress } = await ethers.getSigners();

    // Executing as non-controller should succeed
    await setNextBlockTime(deadline + 1);
    await swapOperator.connect(generalPurposeAddress).closeOrder(contractOrder);

    // Executing as controller should succeed
    await revertToSnapshot(snapshot);
    await setNextBlockTime(deadline + 1);
    await swapOperator.connect(controller).closeOrder(contractOrder);
  });

  it('computes order UID on-chain and validates against placed order UID', async function () {
    const {
      contracts: { swapOperator },
      contractOrder,
      order,
      orderUID,
      domain,
    } = await loadFixture(closeOrderSetup);
    // the contract's currentOrderUID is the one for the placed order in beforeEach step
    // we call with multiple invalid orders, with each individual field modified. it should fail
    for (const [key, value] of Object.entries(order)) {
      const wrongOrder = { ...order, [key]: makeWrongValue(value) };
      const wrongOrderUID = computeOrderUid(domain, wrongOrder, wrongOrder.receiver);
      const wrongContractOrder = makeContractOrder(wrongOrder);

      await expect(swapOperator.closeOrder(wrongContractOrder))
        .to.revertedWithCustomError(swapOperator, 'OrderUidMismatch')
        .withArgs(orderUID, wrongOrderUID);
    }

    // call with an order that matches currentOrderUID, should succeed
    await expect(swapOperator.closeOrder(contractOrder)).to.not.be.reverted;
  });

  it('validates that theres an order in place', async function () {
    const {
      contracts: { swapOperator },
      contractOrder,
    } = await loadFixture(closeOrderSetup);
    // cancel the current order, leaving no order in place
    await expect(swapOperator.closeOrder(contractOrder)).to.not.be.reverted;

    await expect(swapOperator.closeOrder(contractOrder)).to.be.revertedWithCustomError(swapOperator, 'NoOrderInPlace');
  });

  it('cancels order and removes signature and allowance when order was not filled at all', async function () {
    const {
      contracts: { swapOperator, cowSettlement, weth, cowVaultRelayer },
      contractOrder,
      orderUID,
      order,
    } = await loadFixture(closeOrderSetup);
    expect(await cowSettlement.presignatures(orderUID)).to.equal(true);
    expect(await cowSettlement.filledAmount(orderUID)).to.equal(0);
    expect(await weth.allowance(swapOperator.address, cowVaultRelayer.address)).to.eq(
      order.sellAmount.add(order.feeAmount),
    );

    await swapOperator.closeOrder(contractOrder);

    // order is cancelled when filledAmount is set to MaxUint256
    expect(await cowSettlement.filledAmount(orderUID)).to.equal(MaxUint256);
    // removes signature and allowance
    expect(await cowSettlement.presignatures(orderUID)).to.equal(false);
    expect(await weth.allowance(swapOperator.address, cowVaultRelayer.address)).to.eq(0);
  });

  it('cancels order and removes signature and allowance when the order is partially filled', async function () {
    const {
      contracts: { swapOperator, cowSettlement, weth, dai, cowVaultRelayer },
      contractOrder,
      orderUID,
      order,
    } = await loadFixture(closeOrderSetup);
    // initially there is some sellToken, no buyToken
    expect(await dai.balanceOf(swapOperator.address)).to.eq(0);
    expect(await weth.balanceOf(swapOperator.address)).to.gt(0);

    // Fill 50% of order
    await cowSettlement.fill(
      contractOrder,
      orderUID,
      order.sellAmount.div(2),
      order.feeAmount.div(2),
      order.buyAmount.div(2),
    );

    // now there is some sellToken and buyToken
    expect(await dai.balanceOf(swapOperator.address)).to.gt(0);
    expect(await weth.balanceOf(swapOperator.address)).to.gt(0);

    // presignature still exists, order not cancelled and allowance was decreased
    expect(await cowSettlement.presignatures(orderUID)).to.equal(true);
    expect(await cowSettlement.filledAmount(orderUID)).to.equal(order.sellAmount.div(2));
    expect(await weth.allowance(swapOperator.address, cowVaultRelayer.address)).to.eq(
      order.sellAmount.div(2).add(order.feeAmount.div(2)),
    );

    await swapOperator.closeOrder(contractOrder);

    // order is cancelled when filledAmount is set to MaxUint256 / 0 allowance
    expect(await cowSettlement.filledAmount(orderUID)).to.equal(MaxUint256);
    // removes signature and allowance
    expect(await cowSettlement.presignatures(orderUID)).to.equal(false);
    expect(await weth.allowance(swapOperator.address, cowVaultRelayer.address)).to.eq(0);
  });

  it('cancels order and removes signature and allowance when the order is fully filled', async function () {
    const {
      contracts: { swapOperator, weth, dai, cowSettlement, cowVaultRelayer },
      contractOrder,
      orderUID,
      order,
    } = await loadFixture(closeOrderSetup);
    expect(await cowSettlement.presignatures(orderUID)).to.equal(true);
    expect(await cowSettlement.filledAmount(orderUID)).to.equal(0);
    expect(await weth.allowance(swapOperator.address, cowVaultRelayer.address)).to.eq(
      order.sellAmount.add(order.feeAmount),
    );
    expect(await dai.balanceOf(swapOperator.address)).to.eq(0);
    expect(await weth.balanceOf(swapOperator.address)).to.gt(0);

    // fill 100% of the order
    await cowSettlement.fill(contractOrder, orderUID, order.sellAmount, order.feeAmount, order.buyAmount);

    // after filling, there's only buyToken balance
    expect(await dai.balanceOf(swapOperator.address)).to.be.gt(0);
    expect(await weth.balanceOf(swapOperator.address)).to.eq(0);

    await swapOperator.closeOrder(contractOrder);

    // order is cancelled when filledAmount is set to MaxUint256 / 0 allowance
    expect(await cowSettlement.filledAmount(orderUID)).to.equal(MaxUint256);
    // removes signature and allowance
    expect(await weth.allowance(swapOperator.address, cowVaultRelayer.address)).to.eq(0);
  });

  it('clears the currentOrderUID variable', async function () {
    const {
      contracts: { swapOperator },
      contractOrder,
      orderUID,
    } = await loadFixture(closeOrderSetup);
    expect(await swapOperator.currentOrderUID()).to.eq(orderUID);

    await swapOperator.closeOrder(contractOrder);

    expect(await swapOperator.currentOrderUID()).to.eq('0x');
  });

  it('withdraws buyToken to pool and unwraps ether if buyToken is weth', async function () {
    const {
      contracts: { pool, swapOperator, cowSettlement, weth, dai, cowVaultRelayer },
      order,
      domain,
      contractOrder,
      MIN_TIME_BETWEEN_ORDERS,
    } = await loadFixture(closeOrderSetup);
    // Cancel current order
    await swapOperator.closeOrder(contractOrder);

    // Advance time to enable swapping again
    await increaseTime(MIN_TIME_BETWEEN_ORDERS);
    await mineNextBlock();

    // Place new order that is selling dai for weth
    const { newContractOrder, newOrderUID } = await setupSellDaiForEth(
      {
        validTo: (await lastBlockTimestamp()) + 650,
      },
      { dai, pool, order, weth, domain },
    );

    await dai.mint(pool.address, order.sellAmount.add(order.feeAmount));
    await weth.mint(cowVaultRelayer.address, order.buyAmount);
    await swapOperator.placeOrder(newContractOrder, newOrderUID);

    const initialPoolEth = await ethers.provider.getBalance(pool.address);

    await cowSettlement.fill(newContractOrder, newOrderUID, order.sellAmount, order.feeAmount, order.buyAmount);

    expect(await weth.balanceOf(swapOperator.address)).to.eq(order.buyAmount);
    expect(await ethers.provider.getBalance(pool.address)).to.eq(initialPoolEth);

    await swapOperator.closeOrder(newContractOrder);

    expect(await weth.balanceOf(swapOperator.address)).to.eq(0);
    expect(await ethers.provider.getBalance(pool.address)).to.eq(initialPoolEth.add(order.buyAmount));
  });

  it('withdraws buyToken to pool when buyToken is an erc20 token', async function () {
    const {
      contracts: { dai, swapOperator, pool, cowSettlement },
      contractOrder,
      orderUID,
      order,
    } = await loadFixture(closeOrderSetup);
    expect(await dai.balanceOf(swapOperator.address)).to.eq(0);
    expect(await dai.balanceOf(pool.address)).to.eq(0);

    // Fill the order
    await cowSettlement.fill(contractOrder, orderUID, order.sellAmount, order.feeAmount, order.buyAmount);

    // Mint extra buyToken, simulating a token rebase
    const extraAmount = parseEther('1');
    await dai.mint(swapOperator.address, extraAmount);

    expect(await dai.balanceOf(swapOperator.address)).to.eq(order.buyAmount.add(extraAmount));

    await swapOperator.closeOrder(contractOrder);

    expect(await dai.balanceOf(swapOperator.address)).to.eq(0);
    expect(await dai.balanceOf(pool.address)).to.eq(order.buyAmount.add(extraAmount));
  });

  it('returns sellToken to pool and unwraps ether if sellToken is weth', async function () {
    const {
      contracts: { weth, swapOperator, pool },
      contractOrder,
    } = await loadFixture(closeOrderSetup);
    const initialPoolEth = await ethers.provider.getBalance(pool.address);
    const initialOperatorWeth = await weth.balanceOf(swapOperator.address);

    expect(initialPoolEth).to.be.gt(0);
    expect(initialOperatorWeth).to.be.gt(0);

    await swapOperator.closeOrder(contractOrder);

    expect(await ethers.provider.getBalance(pool.address)).to.eq(initialPoolEth.add(initialOperatorWeth));
    expect(await weth.balanceOf(swapOperator.address)).to.eq(0);
  });

  it('returns sellToken to pool when sellToken is an erc20 token', async function () {
    const {
      contracts: { weth, dai, swapOperator, pool, cowVaultRelayer },
      contractOrder,
      order,
      MIN_TIME_BETWEEN_ORDERS,
      domain,
    } = await loadFixture(closeOrderSetup);
    // Cancel current order
    await swapOperator.closeOrder(contractOrder);

    // Advance time to enable swapping again
    await increaseTime(MIN_TIME_BETWEEN_ORDERS);
    await mineNextBlock();

    // Place an order swapping DAI for ETH
    const { newOrder, newContractOrder, newOrderUID } = await setupSellDaiForEth(
      {
        validTo: (await lastBlockTimestamp()) + 650,
      },
      { dai, pool, order, weth, domain },
    );
    await weth.mint(cowVaultRelayer.address, order.buyAmount);
    await swapOperator.placeOrder(newContractOrder, newOrderUID);

    const checkpointPoolDai = await dai.balanceOf(pool.address);
    const checkpointOperatorDai = await dai.balanceOf(swapOperator.address);
    expect(checkpointOperatorDai).to.eq(newOrder.sellAmount.add(newOrder.feeAmount));

    // Add some extra sellToken to the swap operator balance, simulating a token rebase
    const extraAmount = parseEther('1');
    await dai.mint(swapOperator.address, extraAmount);

    await swapOperator.closeOrder(newContractOrder);

    expect(await dai.balanceOf(pool.address)).to.eq(checkpointPoolDai.add(checkpointOperatorDai).add(extraAmount));
    expect(await dai.balanceOf(swapOperator.address)).to.eq(0);
  });

  it('emits OrderClosed event when order was not filled', async function () {
    const {
      contracts: { swapOperator },
      contractOrder,
    } = await loadFixture(closeOrderSetup);
    await expect(swapOperator.closeOrder(contractOrder))
      .to.emit(swapOperator, 'OrderClosed')
      .withArgs(makeOrderTuple(contractOrder), 0);
  });

  it('emits OrderClosed event when order was partially filled', async function () {
    const {
      contracts: { cowSettlement, swapOperator },
      contractOrder,
      order,
      orderUID,
    } = await loadFixture(closeOrderSetup);
    await cowSettlement.fill(
      contractOrder,
      orderUID,
      order.sellAmount.div(2),
      order.feeAmount.div(2),
      order.buyAmount.div(2),
    );
    await expect(swapOperator.closeOrder(contractOrder))
      .to.emit(swapOperator, 'OrderClosed')
      .withArgs(makeOrderTuple(contractOrder), order.sellAmount.div(2));
  });

  it('emits OrderClosed event when order was fully filled', async function () {
    const {
      contracts: { cowSettlement, swapOperator },
      contractOrder,
      order,
      orderUID,
    } = await loadFixture(closeOrderSetup);
    await cowSettlement.fill(contractOrder, orderUID, order.sellAmount, order.feeAmount, order.buyAmount);

    await expect(swapOperator.closeOrder(contractOrder))
      .to.emit(swapOperator, 'OrderClosed')
      .withArgs(lodashValues(makeOrderTuple(contractOrder)), order.sellAmount);
  });

  it('sets swapValue to 0 on the pool', async function () {
    const {
      contracts: { swapOperator, pool },
      contractOrder,
    } = await loadFixture(closeOrderSetup);
    const oldSwapValue = await pool.assetInSwapOperator();
    expect(oldSwapValue).to.be.gt(0);

    await swapOperator.closeOrder(contractOrder);

    const newSwapValue = await pool.assetInSwapOperator();
    expect(newSwapValue).to.eq(0);
  });
});
