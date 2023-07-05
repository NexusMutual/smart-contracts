const {
  makeWrongValue,
  makeContractOrder,
  lastBlockTimestamp,
  daiMinAmount,
  stethMinAmount,
  stethMaxAmount,
  daiMaxAmount,
} = require('./helpers');
const { ethers } = require('hardhat');
const { expect } = require('chai');
const { domain: makeDomain, computeOrderUid } = require('@cowprotocol/contracts');

const { setEtherBalance, setNextBlockTime } = require('../../utils/evm');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');
const { parseEther, hexZeroPad, hexlify, randomBytes } = ethers.utils;

async function loadPlaceOrderFixture() {
  const fixture = await loadFixture(setup);
  const [controller, governance] = await ethers.getSigners();

  // Assign contracts (destructuring isn't working)
  const { dai, stEth, weth, pool, swapOperator, cowSettlement } = fixture.contracts;

  // Read constants
  const MIN_TIME_BETWEEN_ORDERS = (await swapOperator.MIN_TIME_BETWEEN_ORDERS()).toNumber();

  // Build order struct, domain separator and calculate UID
  const order = {
    sellToken: weth.address,
    buyToken: dai.address,
    receiver: swapOperator.address,
    sellAmount: parseEther('0.999'),
    buyAmount: parseEther('4995'),
    validTo: (await lastBlockTimestamp()) + 650,
    appData: hexZeroPad(0, 32),
    feeAmount: parseEther('0.001'),
    kind: 'sell',
    partiallyFillable: false,
    sellTokenBalance: 'erc20',
    buyTokenBalance: 'erc20',
  };

  const contractOrder = makeContractOrder(order);

  const { chainId } = await ethers.provider.getNetwork();
  const domain = makeDomain(chainId, cowSettlement.address);
  const orderUID = computeOrderUid(domain, order, order.receiver);

  // Fund the pool contract
  await setEtherBalance(pool.address, parseEther('100'));

  // Set asset details for DAI and stEth. 0% slippage
  await pool.connect(governance).setSwapDetails(dai.address, daiMinAmount, daiMaxAmount, 0);
  await pool.connect(governance).setSwapDetails(stEth.address, stethMinAmount, stethMaxAmount, 0);

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

describe('placeOrder', function () {
  const setupSellDaiForEth = async (overrides = {}, { dai, pool, order, weth, domain }) => {
    // Set DAI balance above asset max, so we can sell it
    await dai.setBalance(pool.address, parseEther('25000'));

    // Set reasonable amounts for DAI so selling doesnt bring balance below min
    const newOrder = {
      ...order,
      sellToken: dai.address,
      buyToken: weth.address,
      sellAmount: parseEther('10000'),
      feeAmount: parseEther('1'),
      buyAmount: parseEther('2'),
      ...overrides,
    };
    const newContractOrder = makeContractOrder(newOrder);
    const newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);
    return { newOrder, newContractOrder, newOrderUID };
  };

  it('is callable only by swap controller', async function () {
    const {
      contracts: { swapOperator },
      governance,
      controller,
      contractOrder,
      orderUID,
    } = await loadPlaceOrderFixture();
    // call with non-controller, should fail
    await expect(swapOperator.connect(governance).placeOrder(contractOrder, orderUID)).to.revertedWith(
      'SwapOp: only controller can execute',
    );

    // call with controller, should succeed
    await swapOperator.connect(controller).placeOrder(contractOrder, orderUID);
  });

  it('computes order UID on-chain and validates against passed value', async function () {
    const {
      contracts: { swapOperator },
      contractOrder,
      orderUID,
    } = await loadPlaceOrderFixture();
    // call with invalid UID, should fail
    const wrongUID = hexlify(randomBytes(56));
    await expect(swapOperator.placeOrder(contractOrder, wrongUID)).to.revertedWith(
      'SwapOp: Provided UID doesnt match calculated UID',
    );

    // call with invalid struct, with each individual field modified, should fail
    for (const [key, value] of Object.entries(contractOrder)) {
      const wrongOrder = {
        ...contractOrder,
        [key]: makeWrongValue(value),
      };
      await expect(swapOperator.placeOrder(wrongOrder, orderUID)).to.revertedWith(
        'SwapOp: Provided UID doesnt match calculated UID',
      );
    }

    // call with valid order and UID, should succeed
    await swapOperator.placeOrder(contractOrder, orderUID);
  });

  it('validates theres no other order already placed', async function () {
    const {
      contracts: { swapOperator },
      contractOrder,
      orderUID,
    } = await loadPlaceOrderFixture();
    // calling with valid data should succeed first time
    await swapOperator.placeOrder(contractOrder, orderUID);

    // calling with valid data should fail second time, because first order is still there
    await expect(swapOperator.placeOrder(contractOrder, orderUID)).to.be.revertedWith(
      'SwapOp: an order is already in place',
    );
  });

  it('fails if neither buyToken or sellToken are WETH', async function () {
    const {
      contracts: { swapOperator, dai, stEth, pool },
      order,
      domain,
    } = await loadPlaceOrderFixture();
    const newOrder = {
      ...order,
      sellToken: dai.address,
      sellAmount: parseEther('5000'),
      buyToken: stEth.address,
      buyAmount: parseEther('15'),
    };
    const newContractOrder = makeContractOrder(newOrder);
    const newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);

    await dai.setBalance(pool.address, daiMaxAmount.add(1));

    await expect(swapOperator.placeOrder(newContractOrder, newOrderUID)).to.be.revertedWith(
      'SwapOp: Must either sell or buy eth',
    );
  });

  it('validates only erc20 is supported for sellTokenBalance', async function () {
    const {
      contracts: { swapOperator },
      order,
      domain,
    } = await loadPlaceOrderFixture();
    const newOrder = {
      ...order,
      sellTokenBalance: 'external',
    };
    const newContractOrder = makeContractOrder(newOrder);
    const newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);
    await expect(swapOperator.placeOrder(newContractOrder, newOrderUID)).to.be.revertedWith(
      'SwapOp: Only erc20 supported for sellTokenBalance',
    );
  });

  it('validates only erc20 is supported for buyTokenBalance', async function () {
    const {
      contracts: { swapOperator },
      order,
      domain,
    } = await loadPlaceOrderFixture();
    const newOrder = {
      ...order,
      buyTokenBalance: 'internal',
    };
    const newContractOrder = makeContractOrder(newOrder);
    const newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);

    await expect(swapOperator.placeOrder(newContractOrder, newOrderUID)).to.be.revertedWith(
      'SwapOp: Only erc20 supported for buyTokenBalance',
    );
  });

  it('validates the receiver of the swap is the swap operator contract', async function () {
    const {
      contracts: { swapOperator },
      governance,
      order,
      domain,
    } = await loadPlaceOrderFixture();
    const newOrder = {
      ...order,
      receiver: governance.address,
    };
    const newContractOrder = makeContractOrder(newOrder);
    const newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);
    await expect(swapOperator.placeOrder(newContractOrder, newOrderUID)).to.be.revertedWith(
      'SwapOp: Receiver must be this contract',
    );
  });

  it('validates that deadline is at least 10 minutes in the future', async function () {
    const {
      contracts: { swapOperator },
      order,
      domain,
    } = await loadPlaceOrderFixture();
    const newOrder = {
      ...order,
      validTo: Math.floor(new Date().getTime() / 1000 + 500),
    };
    const newContractOrder = makeContractOrder(newOrder);
    const newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);
    await expect(swapOperator.placeOrder(newContractOrder, newOrderUID)).to.be.revertedWith(
      'SwapOp: validTo must be at least 10 minutes in the future',
    );
  });

  it('doesnt perform validation when sellToken is WETH, because eth is used', async function () {
    const {
      contracts: { swapOperator, weth, pool },
      contractOrder,
      orderUID,
    } = await loadPlaceOrderFixture();
    // Ensure eth (weth) is disabled by checking min and max amount
    const swapDetails = await pool.getAssetSwapDetails(weth.address);
    expect(swapDetails.minAmount).to.eq(0);
    expect(swapDetails.maxAmount).to.eq(0);

    // Order selling WETH (eth) still should succeed
    await swapOperator.placeOrder(contractOrder, orderUID);
  });

  it('performs the validation when sellToken is not WETH', async function () {
    const {
      contracts: { swapOperator, dai, weth, pool },
      order,
      domain,
      governance,
    } = await loadPlaceOrderFixture();
    // Set up an order to swap DAI for ETH
    const { newContractOrder, newOrderUID } = await setupSellDaiForEth({}, { dai, pool, order, weth, domain });

    // Since DAI was already registered on setup, set its details to 0
    await pool.connect(governance).setSwapDetails(dai.address, 0, 0, 0);

    // Order selling DAI should fail
    await expect(swapOperator.placeOrder(newContractOrder, newOrderUID)).to.be.revertedWith(
      'SwapOp: sellToken is not enabled',
    );
  });

  it('only allows to sell when balance is above asset maxAmount', async function () {
    const {
      contracts: { swapOperator, dai, weth, pool },
      order,
      domain,
    } = await loadPlaceOrderFixture();
    const { newContractOrder, newOrderUID } = await setupSellDaiForEth({}, { dai, pool, order, weth, domain });

    // Try to run when balance is at maxAmount,
    await dai.setBalance(pool.address, daiMaxAmount);
    await expect(swapOperator.placeOrder(newContractOrder, newOrderUID)).to.be.revertedWith(
      'SwapOp: can only sell asset when > maxAmount',
    );

    // When balance > maxAmount, should succeed
    await dai.setBalance(pool.address, daiMaxAmount.add(1));
    await swapOperator.placeOrder(newContractOrder, newOrderUID);
  });

  it('selling cannot bring balance below minAmount', async function () {
    const {
      contracts: { swapOperator, dai, weth, pool },
      order,
      domain,
    } = await loadPlaceOrderFixture();
    const sellAmount = parseEther('24999');
    const feeAmount = parseEther('1');
    const buyAmount = parseEther('4.9998');
    const { newContractOrder, newOrderUID } = await setupSellDaiForEth(
      { sellAmount, feeAmount, buyAmount },
      { dai, pool, order, weth, domain },
    );

    // Set balance so that balance - totalAmountOut is 1 wei below asset minAmount
    await dai.setBalance(pool.address, daiMinAmount.add(sellAmount).add(feeAmount).sub(1));
    await expect(swapOperator.placeOrder(newContractOrder, newOrderUID)).to.be.revertedWith(
      'SwapOp: swap brings sellToken below min',
    );

    // Set balance so it can exactly cover totalOutAmount
    await dai.setBalance(pool.address, daiMinAmount.add(sellAmount).add(feeAmount));
    await swapOperator.placeOrder(newContractOrder, newOrderUID);

    expect(await dai.balanceOf(pool.address)).to.eq(daiMinAmount);
  });

  it('selling can leave balance above maxAmount', async function () {
    const {
      contracts: { swapOperator, dai, weth, pool },
      order,
      domain,
    } = await loadPlaceOrderFixture();
    const sellAmount = parseEther('24999');
    const feeAmount = parseEther('1');
    const buyAmount = parseEther('4.9998');
    const { newContractOrder, newOrderUID } = await setupSellDaiForEth(
      { sellAmount, feeAmount, buyAmount },
      { dai, pool, order, weth, domain },
    );

    // Set balance so that balance - totalAmountOut is 1 wei above asset maxAmount, should succeed
    await dai.setBalance(pool.address, daiMaxAmount.add(sellAmount).add(feeAmount).add(1));
    await swapOperator.placeOrder(newContractOrder, newOrderUID);
  });

  it('validates that pools eth balance is not brought below established minimum', async function () {
    const {
      contracts: { swapOperator, pool },
      contractOrder,
      orderUID,
    } = await loadPlaceOrderFixture();
    // Set pool balance to 2 eth - 1 wei
    await setEtherBalance(pool.address, parseEther('2').sub(1));

    // Execute trade for 1 eth, should fail
    expect(contractOrder.sellAmount.add(contractOrder.feeAmount)).to.eq(parseEther('1'));
    await expect(
      swapOperator.placeOrder(contractOrder, orderUID), //
    ).to.revertedWith('SwapOp: Pool eth balance below min');

    // Add 1 wei to balance and it should succeed
    await setEtherBalance(pool.address, parseEther('2'));
    await swapOperator.placeOrder(contractOrder, orderUID);
  });

  it('doesnt perform validation asset details when buyToken is WETH, because eth is used', async function () {
    const {
      contracts: { swapOperator, dai, weth, pool },
      order,
      domain,
    } = await loadPlaceOrderFixture();
    // Ensure eth (weth) is disabled by checking min and max amount
    const swapDetails = await pool.getAssetSwapDetails(weth.address);
    expect(swapDetails.minAmount).to.eq(0);
    expect(swapDetails.maxAmount).to.eq(0);

    const { newContractOrder, newOrderUID } = await setupSellDaiForEth({}, { dai, pool, order, weth, domain });

    // Order buying WETH (eth) still should succeed
    await swapOperator.placeOrder(newContractOrder, newOrderUID);
  });

  it('validates asset details when buyToken is not WETH', async function () {
    const {
      contracts: { swapOperator, dai, pool },
      governance,
      contractOrder,
      orderUID,
    } = await loadPlaceOrderFixture();
    // Since DAI was already registered on setup, set its details to 0
    await pool.connect(governance).setSwapDetails(dai.address, 0, 0, 0); // otherSigner is governant

    // Order buying DAI should fail
    await expect(swapOperator.placeOrder(contractOrder, orderUID)).to.be.revertedWith(
      'SwapOp: buyToken is not enabled',
    );
  });

  it('only allows to buy when balance is below minAmount', async function () {
    const {
      contracts: { swapOperator, dai, pool },
      contractOrder,
      orderUID,
    } = await loadPlaceOrderFixture();
    // set buyToken balance to be minAmount, txn should fail
    await dai.setBalance(pool.address, daiMinAmount);
    await expect(swapOperator.placeOrder(contractOrder, orderUID)).to.be.revertedWith(
      'SwapOp: can only buy asset when < minAmount',
    );

    // set buyToken balance to be < minAmount, txn should succeed
    await dai.setBalance(pool.address, daiMinAmount.sub(1));
    await swapOperator.placeOrder(contractOrder, orderUID);
  });

  it('the swap cannot bring buyToken above maxAmount', async function () {
    const {
      contracts: { swapOperator, dai, pool },
      order,
      domain,
    } = await loadPlaceOrderFixture();
    await dai.setBalance(pool.address, 0);

    // try to place an order that will bring balance 1 wei above max, should fail
    const bigOrder = { ...order, buyAmount: daiMaxAmount.add(1) };
    const bigContractOrder = makeContractOrder(bigOrder);
    const bigOrderUID = computeOrderUid(domain, bigOrder, bigOrder.receiver);
    await expect(swapOperator.placeOrder(bigContractOrder, bigOrderUID)).to.be.revertedWith(
      'SwapOp: swap brings buyToken above max',
    );

    // place an order that will bring balance exactly to maxAmount, should succeed
    const okOrder = { ...order, buyAmount: daiMaxAmount };
    const okContractOrder = makeContractOrder(okOrder);
    const okOrderUID = computeOrderUid(domain, okOrder, okOrder.receiver);
    await swapOperator.placeOrder(okContractOrder, okOrderUID);
  });

  it('the swap can leave buyToken below minAmount', async function () {
    const {
      contracts: { swapOperator, dai, pool },
      order,
      domain,
    } = await loadPlaceOrderFixture();
    await dai.setBalance(pool.address, 0);

    // place an order that will bring balance 1 wei below min, should succeed
    const buyAmount = daiMinAmount.sub(1);
    const smallOrder = { ...order, buyAmount, sellAmount: buyAmount.div(5000) };
    const smallContractOrder = makeContractOrder(smallOrder);
    const smallOrderUID = computeOrderUid(domain, smallOrder, smallOrder.receiver);

    await swapOperator.placeOrder(smallContractOrder, smallOrderUID);
  });

  it('validates minimum time between swaps when selling eth', async function () {
    const {
      contracts: { swapOperator, dai, pool },
      governance,
      contractOrder,
      order,
      orderUID,
      domain,
      MIN_TIME_BETWEEN_ORDERS,
    } = await loadPlaceOrderFixture();
    // Place and close an order
    await swapOperator.placeOrder(contractOrder, orderUID);
    await swapOperator.closeOrder(contractOrder);

    // Prepare valid pool params for allowing next order
    await pool.connect(governance).setSwapDetails(dai.address, daiMinAmount.mul(2), daiMaxAmount.mul(2), 0);

    // Read last swap time
    const lastSwapTime = (await pool.getAssetSwapDetails(dai.address)).lastSwapTime;

    // Set next block time to minimum - 2
    await setNextBlockTime(lastSwapTime + MIN_TIME_BETWEEN_ORDERS - 2);

    // Build a new valid order
    const secondOrder = { ...order, validTo: lastSwapTime + MIN_TIME_BETWEEN_ORDERS + 650 };
    const secondContractOrder = makeContractOrder(secondOrder);
    const secondOrderUID = computeOrderUid(domain, secondOrder, secondOrder.receiver);

    // Try to place order, should revert because of frequency
    await expect(swapOperator.placeOrder(secondContractOrder, secondOrderUID)).to.be.revertedWith(
      'SwapOp: already swapped this asset recently',
    );

    // Set next block time to minimum
    await setNextBlockTime(lastSwapTime + MIN_TIME_BETWEEN_ORDERS);

    // Placing the order should succeed now
    await swapOperator.placeOrder(secondContractOrder, secondOrderUID);
  });

  it('validates minimum time between swaps when buying eth', async function () {
    const {
      contracts: { swapOperator, dai, weth, pool },
      order,
      domain,
      governance,
      MIN_TIME_BETWEEN_ORDERS,
    } = await loadPlaceOrderFixture();
    const { newContractOrder, newOrderUID } = await setupSellDaiForEth({}, { dai, pool, order, weth, domain });

    // Place and close an order
    await swapOperator.placeOrder(newContractOrder, newOrderUID);
    await swapOperator.closeOrder(newContractOrder);

    // Prepare valid pool params for allowing next order
    await pool.connect(governance).setSwapDetails(dai.address, 3000, 6000, 0);

    // Read last swap time
    const lastSwapTime = (await pool.getAssetSwapDetails(dai.address)).lastSwapTime;

    // Set next block time to minimum - 2
    await setNextBlockTime(lastSwapTime + MIN_TIME_BETWEEN_ORDERS - 2);

    // Build a new valid order
    const { newContractOrder: secondContractOrder, newOrderUID: secondOrderUID } = await setupSellDaiForEth(
      {
        validTo: lastSwapTime + MIN_TIME_BETWEEN_ORDERS + 650,
      },
      { dai, pool, order, weth, domain },
    );

    // Try to place order, should revert because of frequency
    await expect(swapOperator.placeOrder(secondContractOrder, secondOrderUID)).to.be.revertedWith(
      'SwapOp: already swapped this asset recently',
    );

    // Set next block time to minimum
    await setNextBlockTime(lastSwapTime + MIN_TIME_BETWEEN_ORDERS);

    // Placing the order should succeed now
    await swapOperator.placeOrder(secondContractOrder, secondOrderUID);
  });

  it('when selling ether, checks that feeAmount is not higher than maxFee', async function () {
    const {
      contracts: { swapOperator },
      order,
      domain,
    } = await loadPlaceOrderFixture();
    const maxFee = await swapOperator.maxFee();

    // Place order with fee 1 wei higher than maximum, should fail
    const badOrder = { ...order, feeAmount: maxFee.add(1) };
    const badContractOrder = makeContractOrder(badOrder);
    const badOrderUID = computeOrderUid(domain, badOrder, badOrder.receiver);

    await expect(swapOperator.placeOrder(badContractOrder, badOrderUID)).to.be.revertedWith(
      'SwapOp: Fee amount is higher than configured max fee',
    );

    // Place order with exactly maxFee, should succeed
    const goodOrder = { ...order, feeAmount: maxFee };
    const goodContractOrder = makeContractOrder(goodOrder);
    const goodOrderUID = computeOrderUid(domain, goodOrder, goodOrder.receiver);

    await swapOperator.placeOrder(goodContractOrder, goodOrderUID);
  });

  it('when selling other asset, uses oracle to check fee in ether is not higher than maxFee', async function () {
    const {
      contracts: { swapOperator, pool, dai, weth },
      order,
      domain,
    } = await loadPlaceOrderFixture();
    const maxFee = await swapOperator.maxFee();

    // Place order with fee 1 wei higher than maximum, should fail
    const { newContractOrder: badContractOrder, newOrderUID: badOrderUID } = await setupSellDaiForEth(
      {
        feeAmount: maxFee.add(1).mul(5000),
      },
      { dai, pool, order, weth, domain },
    ); // because 1 eth = 5000 dai

    await expect(swapOperator.placeOrder(badContractOrder, badOrderUID)).to.be.revertedWith(
      'SwapOp: Fee amount is higher than configured max fee',
    );

    // Place order with exactly maxFee, should succeed
    const { newContractOrder: goodContractOrder, newOrderUID: goodOrderUID } = await setupSellDaiForEth(
      {
        feeAmount: maxFee.mul(5000),
      },
      { dai, pool, order, weth, domain },
    ); // because 1 eth = 5000 dai

    await swapOperator.placeOrder(goodContractOrder, goodOrderUID);
  });

  it('when selling eth takes oracle price into account', async function () {
    const {
      contracts: { swapOperator },
      order,
      domain,
    } = await loadPlaceOrderFixture();
    const newOrder = {
      ...order,
      sellAmount: parseEther('1'),
      buyAmount: parseEther('5000').sub(1), // 5000e18 - 1 DAI wei
    };
    let newContractOrder = makeContractOrder(newOrder);
    let newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);

    // Since buyAmount is short by 1 wei, txn should revert
    await expect(swapOperator.placeOrder(newContractOrder, newOrderUID)).to.be.revertedWith(
      'SwapOp: order.buyAmount too low (oracle)',
    );

    // Add 1 wei to buyAmount
    newOrder.buyAmount = newOrder.buyAmount.add(1);

    newContractOrder = makeContractOrder(newOrder);
    newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);

    // Now txn should not revert
    await swapOperator.placeOrder(newContractOrder, newOrderUID);
  });

  it('when selling eth takes slippage into account', async function () {
    const {
      contracts: { swapOperator, dai, pool },
      governance,
      order,
      domain,
    } = await loadPlaceOrderFixture();
    // 1% slippage
    await pool.connect(governance).setSwapDetails(dai.address, daiMinAmount, daiMaxAmount, 100);

    const newOrder = {
      ...order,
      sellAmount: parseEther('1'),
      buyAmount: parseEther('4950').sub(1), // 4950e18 - 1 DAI wei
    };
    let newContractOrder = makeContractOrder(newOrder);
    let newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);

    // Since buyAmount is short by 1 wei, txn should revert
    await expect(swapOperator.placeOrder(newContractOrder, newOrderUID)).to.be.revertedWith(
      'SwapOp: order.buyAmount too low (oracle)',
    );

    // Add 1 wei to buyAmount
    newOrder.buyAmount = newOrder.buyAmount.add(1);

    newContractOrder = makeContractOrder(newOrder);
    newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);

    // Now txn should not revert
    await swapOperator.placeOrder(newContractOrder, newOrderUID);
  });

  it('when buying eth takes oracle price into account', async function () {
    const {
      contracts: { swapOperator, dai, weth, pool },
      order,
      domain,
    } = await loadPlaceOrderFixture();
    let { newOrder, newContractOrder, newOrderUID } = await setupSellDaiForEth({}, { dai, pool, order, weth, domain });

    // Since buyAmount is short by 1 wei, txn should revert
    newOrder.buyAmount = newOrder.buyAmount.sub(1);
    newContractOrder = makeContractOrder(newOrder);
    newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);

    await expect(swapOperator.placeOrder(newContractOrder, newOrderUID)).to.be.revertedWith(
      'SwapOp: order.buyAmount too low (oracle)',
    );

    // Add 1 wei to buyAmount
    newOrder.buyAmount = newOrder.buyAmount.add(1);
    newContractOrder = makeContractOrder(newOrder);
    newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);

    await swapOperator.placeOrder(newContractOrder, newOrderUID);
  });

  it('when buying eth takes slippage into account', async function () {
    const {
      contracts: { swapOperator, dai, weth, pool },
      governance,
      order,
      domain,
    } = await loadPlaceOrderFixture();
    // 1% slippage
    await pool.connect(governance).setSwapDetails(dai.address, daiMinAmount, daiMaxAmount, 100);

    let { newOrder, newContractOrder, newOrderUID } = await setupSellDaiForEth({}, { dai, pool, order, weth, domain });

    // Set buyAmount to be (oracle amount * 0.99) - 1 wei
    newOrder.buyAmount = newOrder.buyAmount.mul(99).div(100).sub(1);
    newContractOrder = makeContractOrder(newOrder);
    newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);

    await expect(swapOperator.placeOrder(newContractOrder, newOrderUID)).to.be.revertedWith(
      'SwapOp: order.buyAmount too low (oracle)',
    );

    // Set buyAmount to be (oracle amount * 0.99)
    newOrder.buyAmount = newOrder.buyAmount.add(1);
    newContractOrder = makeContractOrder(newOrder);
    newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);

    await swapOperator.placeOrder(newContractOrder, newOrderUID);
  });

  // eslint-disable-next-line max-len
  it('pulling funds from pool: transfers ether from pool and wrap it into WETH when sellToken is WETH', async function () {
    const {
      contracts: { swapOperator, weth, pool },
      order,
      contractOrder,
      orderUID,
    } = await loadPlaceOrderFixture();
    const poolEthBefore = await ethers.provider.getBalance(pool.address);
    const swapOpWethBefore = await weth.balanceOf(swapOperator.address);

    await swapOperator.placeOrder(contractOrder, orderUID);

    const poolEthAfter = await ethers.provider.getBalance(pool.address);
    const swapOpWethAfter = await weth.balanceOf(swapOperator.address);

    expect(poolEthBefore.sub(poolEthAfter)).to.eq(order.sellAmount.add(order.feeAmount));
    expect(swapOpWethAfter.sub(swapOpWethBefore)).to.eq(order.sellAmount.add(order.feeAmount));
  });

  it('pulling funds from pool: transfer erc20 asset from pool to eth if sellToken is not WETH', async function () {
    const {
      contracts: { swapOperator, dai, weth, pool },
      order,
      domain,
    } = await loadPlaceOrderFixture();
    const { newOrder, newContractOrder, newOrderUID } = await setupSellDaiForEth(
      {},
      { dai, pool, order, weth, domain },
    );

    const poolDaiBefore = await dai.balanceOf(pool.address);
    const swapOpDaiBefore = await dai.balanceOf(swapOperator.address);

    await swapOperator.placeOrder(newContractOrder, newOrderUID);

    const poolDaiAfter = await dai.balanceOf(pool.address);
    const swapOpDaiAfter = await dai.balanceOf(swapOperator.address);

    expect(poolDaiBefore.sub(poolDaiAfter)).to.eq(newOrder.sellAmount.add(newOrder.feeAmount));
    expect(swapOpDaiAfter.sub(swapOpDaiBefore)).to.eq(newOrder.sellAmount.add(newOrder.feeAmount));
  });

  it('sets lastSwapDate on buyAsset when selling ETH', async function () {
    const {
      contracts: { swapOperator, dai, pool },
      contractOrder,
      orderUID,
    } = await loadPlaceOrderFixture();
    let lastSwapTime = (await pool.getAssetSwapDetails(dai.address)).lastSwapTime;
    expect(lastSwapTime).to.not.eq(await lastBlockTimestamp());

    await swapOperator.placeOrder(contractOrder, orderUID);

    lastSwapTime = (await pool.getAssetSwapDetails(dai.address)).lastSwapTime;
    expect(lastSwapTime).to.eq(await lastBlockTimestamp());
  });

  it('sets lastSwapDate on sellAsset when buying ETH', async function () {
    const {
      contracts: { swapOperator, dai, weth, pool },
      order,
      domain,
    } = await loadPlaceOrderFixture();
    const { newContractOrder, newOrderUID } = await setupSellDaiForEth({}, { dai, pool, order, weth, domain });
    let lastSwapTime = (await pool.getAssetSwapDetails(dai.address)).lastSwapTime;
    expect(lastSwapTime).to.not.eq(await lastBlockTimestamp());

    await swapOperator.placeOrder(newContractOrder, newOrderUID);

    lastSwapTime = (await pool.getAssetSwapDetails(dai.address)).lastSwapTime;
    expect(lastSwapTime).to.eq(await lastBlockTimestamp());
  });

  it('setting pools swapValue works when selling eth', async function () {
    const {
      contracts: { swapOperator, pool },
      order,
      contractOrder,
      orderUID,
    } = await loadPlaceOrderFixture();
    expect(await pool.swapValue()).to.eq(0);

    await swapOperator.placeOrder(contractOrder, orderUID);

    expect(await pool.swapValue()).to.eq(order.sellAmount.add(order.feeAmount));
  });

  it('setting pools swapValue works when transfering ERC20', async function () {
    const {
      contracts: { swapOperator, pool, weth, dai },
      order,
      domain,
    } = await loadPlaceOrderFixture();
    const { newContractOrder, newOrderUID } = await setupSellDaiForEth({}, { dai, pool, order, weth, domain });

    expect(await pool.swapValue()).to.eq(0);

    await swapOperator.placeOrder(newContractOrder, newOrderUID);

    expect(await pool.swapValue()).to.be.equal(parseEther('2.0002')); // (10000 + 1) / 5000
  });

  it('approves CoW vault relayer to spend the exact amount of sellToken', async function () {
    const {
      contracts: { swapOperator, weth, cowVaultRelayer },
      order,
      contractOrder,
      orderUID,
    } = await loadPlaceOrderFixture();
    expect(await weth.allowance(swapOperator.address, cowVaultRelayer.address)).to.eq(0);

    await swapOperator.placeOrder(contractOrder, orderUID);

    expect(await weth.allowance(swapOperator.address, cowVaultRelayer.address)).to.eq(
      order.sellAmount.add(order.feeAmount),
    );
  });

  it('stores the current orderUID in the contract', async function () {
    const {
      contracts: { swapOperator },
      contractOrder,
      orderUID,
    } = await loadPlaceOrderFixture();
    expect(await swapOperator.currentOrderUID()).to.eq('0x');

    await swapOperator.placeOrder(contractOrder, orderUID);

    expect(await swapOperator.currentOrderUID()).to.eq(orderUID);
  });

  it('calls setPreSignature on CoW settlement contract', async function () {
    const {
      contracts: { swapOperator, cowSettlement },
      contractOrder,
      orderUID,
    } = await loadPlaceOrderFixture();
    expect(await cowSettlement.presignatures(orderUID)).to.eq(false);

    await swapOperator.placeOrder(contractOrder, orderUID);

    expect(await cowSettlement.presignatures(orderUID)).to.eq(true);
  });

  it('emits an OrderPlaced event', async function () {
    const {
      contracts: { swapOperator },
      contractOrder,
      orderUID,
    } = await loadPlaceOrderFixture();
    await expect(swapOperator.placeOrder(contractOrder, orderUID))
      .to.emit(swapOperator, 'OrderPlaced')
      .withArgs(Object.values(contractOrder));
  });
});
