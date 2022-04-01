/* eslint-disable no-unused-expressions */
const { contracts, makeWrongValue } = require('./setup');
const { ethers } = require('hardhat');
const { expect } = require('chai');
const { domain: makeDomain, computeOrderUid } = require('@gnosis.pm/gp-v2-contracts');
const { setEtherBalance, setNextBlockTime, revertToSnapshot, takeSnapshot } = require('../../utils/evm');
const { time } = require('@openzeppelin/test-helpers');

const {
  utils: { parseEther, hexZeroPad, keccak256, toUtf8Bytes },
} = ethers;

describe('closeOrder', function () {
  let controller, governance;

  let order, contractOrder, domain, orderUID;

  let dai, weth, pool, swapOperator, cowSettlement, cowVaultRelayer;

  let MIN_TIME_BETWEEN_ORDERS;

  const daiMinAmount = parseEther('3000');
  const daiMaxAmount = parseEther('20000');

  const hashUtf = str => keccak256(toUtf8Bytes(str));

  const makeContractOrder = (order) => {
    return {
      ...order,
      kind: hashUtf(order.kind),
      sellTokenBalance: hashUtf(order.sellTokenBalance),
      buyTokenBalance: hashUtf(order.buyTokenBalance),
    };
  };

  const setupSellDaiForEth = async (overrides = {}) => {
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

  const lastBlockTimestamp = async () => (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;

  beforeEach(async () => {
    [controller, governance] = await ethers.getSigners();

    // Assign contracts (destructuring isn't working)
    dai = contracts.dai;
    weth = contracts.weth;
    pool = contracts.pool;
    swapOperator = contracts.swapOperator;
    cowSettlement = contracts.cowSettlement;
    cowVaultRelayer = contracts.cowVaultRelayer;

    // Read constants
    MIN_TIME_BETWEEN_ORDERS = (await swapOperator.MIN_TIME_BETWEEN_ORDERS()).toNumber();

    // Build order struct, domain separator and calculate UID
    order = {
      sellToken: weth.address,
      buyToken: dai.address,
      sellAmount: parseEther('0.999'),
      buyAmount: parseEther('4995'),
      validTo: await lastBlockTimestamp() + 650,
      appData: hexZeroPad(0, 32),
      feeAmount: parseEther('0.001'),
      kind: 'sell',
      receiver: swapOperator.address,
      partiallyFillable: false,
      sellTokenBalance: 'erc20',
      buyTokenBalance: 'erc20',
    };

    contractOrder = {
      ...order,
      kind: hashUtf(order.kind),
      sellTokenBalance: hashUtf(order.sellTokenBalance),
      buyTokenBalance: hashUtf(order.buyTokenBalance),
    };

    const { chainId } = await ethers.provider.getNetwork();
    domain = makeDomain(chainId, cowSettlement.address);
    orderUID = computeOrderUid(domain, order, order.receiver);

    // Fund the contracts
    await setEtherBalance(pool.address, parseEther('1000000'));
    await setEtherBalance(weth.address, parseEther('1000000'));
    await dai.mint(cowVaultRelayer.address, parseEther('1000000'));

    // Set asset details for DAI
    await pool.connect(governance).setSwapDetails(dai.address, daiMinAmount, daiMaxAmount, 100);

    // place order
    await swapOperator.placeOrder(contractOrder, orderUID);
  });

  describe('access control', function () {
    it('before deadline, its callable only by controller', async function () {
      const deadline = order.validTo;
      const snapshot = await takeSnapshot();

      // Executing as non-controller should fail
      await setNextBlockTime(deadline);
      await expect(swapOperator.connect(governance).closeOrder(contractOrder))
        .to.be.revertedWith('SwapOp: only controller can execute');

      // Executing as controller should succeed
      await revertToSnapshot(snapshot);
      await setNextBlockTime(deadline);
      await swapOperator.connect(controller).closeOrder(contractOrder);
    });

    it('after deadline, its callable by anyone', async function () {
      const deadline = order.validTo;
      const snapshot = await takeSnapshot();

      // Executing as non-controller should succeed
      await setNextBlockTime(deadline + 1);
      await swapOperator.connect(governance).closeOrder(contractOrder);

      // Executing as controller should succeed
      await revertToSnapshot(snapshot);
      await setNextBlockTime(deadline + 1);
      await swapOperator.connect(controller).closeOrder(contractOrder);
    });
  });

  it('computes order UID on-chain and validates against placed order UID', async function () {
    // the contract's currentOrderUID is the one for the placed order in beforeEach step
    // we call with multiple invalid orders, with each individual field modified. it should fail
    for (const [key, value] of Object.entries(contractOrder)) {
      const wrongOrder = {
        ...contractOrder,
        [key]: makeWrongValue(value),
      };
      await expect(
        swapOperator.closeOrder(wrongOrder),
      ).to.revertedWith('SwapOp: Provided UID doesnt match calculated UID');
    }

    // call with an order that matches currentOrderUID, should succeed
    await expect(
      swapOperator.closeOrder(contractOrder),
    ).to.not.be.reverted;
  });

  it('validates that theres an order in place', async function () {
    // cancel the current order, leaving no order in place
    await expect(swapOperator.closeOrder(contractOrder)).to.not.be.reverted;

    await expect(swapOperator.closeOrder(contractOrder)).to.be.revertedWith('SwapOp: No order in place');
  });

  describe('canceling the presignature and allowance', function () {
    it('does so if the order was not filled at all', async function () {
      expect(await cowSettlement.presignatures(orderUID)).to.equal(true);
      expect(await weth.allowance(swapOperator.address, cowVaultRelayer.address))
        .to.eq(order.sellAmount.add(order.feeAmount));

      await swapOperator.closeOrder(contractOrder);

      expect(await cowSettlement.presignatures(orderUID)).to.equal(false);
      expect(await weth.allowance(swapOperator.address, cowVaultRelayer.address)).to.eq(0);
    });

    it('does so if the order is partially filled', async function () {
      // intially there is some sellToken, no buyToken
      expect(await dai.balanceOf(swapOperator.address)).to.eq(0);
      expect(await weth.balanceOf(swapOperator.address)).to.gt(0);

      // Fill 50% of order
      await cowSettlement.fill(
        contractOrder, orderUID, order.sellAmount.div(2), order.feeAmount.div(2), order.buyAmount.div(2),
      );

      // now there is some sellToken and buyToken
      expect(await dai.balanceOf(swapOperator.address)).to.gt(0);
      expect(await weth.balanceOf(swapOperator.address)).to.gt(0);

      // presignature still valid, allowance was decreased
      expect(await cowSettlement.presignatures(orderUID)).to.equal(true);
      expect(await weth.allowance(swapOperator.address, cowVaultRelayer.address))
        .to.eq(order.sellAmount.div(2).add(order.feeAmount.div(2)));

      await swapOperator.closeOrder(contractOrder);

      // after closing, presignature = false and allowance = 0
      expect(await cowSettlement.presignatures(orderUID)).to.equal(false);
      expect(await weth.allowance(swapOperator.address, cowVaultRelayer.address)).to.eq(0);
    });

    it('doesnt cancel the presignature if the order was fully filled', async function () {
      expect(await cowSettlement.presignatures(orderUID)).to.equal(true);
      expect(await weth.allowance(swapOperator.address, cowVaultRelayer.address)).to.eq(order.sellAmount.add(order.feeAmount));
      expect(await dai.balanceOf(swapOperator.address)).to.eq(0);
      expect(await weth.balanceOf(swapOperator.address)).to.gt(0);

      // fill 100% of the order
      await cowSettlement.fill(contractOrder, orderUID, order.sellAmount, order.feeAmount, order.buyAmount);

      // after filling, there's only buyToken balance
      expect(await dai.balanceOf(swapOperator.address)).to.be.gt(0);
      expect(await weth.balanceOf(swapOperator.address)).to.eq(0);

      await swapOperator.closeOrder(contractOrder);

      // After closing, there's 0 allowance because all has been used up, but presignature is not canceled to save gas
      expect(await cowSettlement.presignatures(orderUID)).to.equal(true);
      expect(await weth.allowance(swapOperator.address, cowVaultRelayer.address)).to.eq(0);
    });
  });

  it('clears the currentOrderUID variable', async function () {
    expect(await swapOperator.currentOrderUID()).to.eq(orderUID);

    await swapOperator.closeOrder(contractOrder);

    expect(await swapOperator.currentOrderUID()).to.eq('0x');
  });

  describe('withdrawing buyToken to pool', function () {
    it('withdraws and unwraps ether if buyToken is weth', async function () {
      // Cancel current order
      await swapOperator.closeOrder(contractOrder);

      // Advance time to enable swapping again
      await time.increase(MIN_TIME_BETWEEN_ORDERS);

      // Place new order that is selling dai for weth
      const { newContractOrder, newOrderUID } = await setupSellDaiForEth({ validTo: await lastBlockTimestamp() + 650 });

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

    it('transfer the erc20 token if its not weth', async function () {
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
  });

  describe('returning sellToken to pool', function () {
    it('withdraws and unwraps ether if sellToken is weth', async function () {
      const initialPoolEth = await ethers.provider.getBalance(pool.address);
      const initialOperatorWeth = await weth.balanceOf(swapOperator.address);

      expect(initialPoolEth).to.be.gt(0);
      expect(initialOperatorWeth).to.be.gt(0);

      await swapOperator.closeOrder(contractOrder);

      expect(await ethers.provider.getBalance(pool.address)).to.eq(initialPoolEth.add(initialOperatorWeth));
      expect(await weth.balanceOf(swapOperator.address)).to.eq(0);
    });

    it('transfers the erc20 token to pool if its not weth', async function () {
      // Cancel current order
      await swapOperator.closeOrder(contractOrder);

      // Advance time to enable swapping again
      await time.increase(MIN_TIME_BETWEEN_ORDERS);

      // Place an order swapping DAI for ETH
      const { newOrder, newContractOrder, newOrderUID } = await setupSellDaiForEth({ validTo: await lastBlockTimestamp() + 650 });
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
  });

  describe('emitting OrderClosed event', function () {
    it('when order was not filled', async function () {
      const tx = await swapOperator.closeOrder(contractOrder);
      const rcp = await tx.wait();

      const event = rcp.events.find(e => e.event === 'OrderClosed');

      expect(event.args.order).to.deep.include.members(Object.values(contractOrder));
      expect(event.args.filledAmount).to.eq(0);
    });

    it('when order was partially filled', async function () {
      await cowSettlement.fill(contractOrder, orderUID, order.sellAmount.div(2), order.feeAmount.div(2), order.buyAmount.div(2));

      const tx = await swapOperator.closeOrder(contractOrder);
      const rcp = await tx.wait();

      const event = rcp.events.find(e => e.event === 'OrderClosed');

      expect(event.args.order).to.deep.include.members(Object.values(contractOrder));
      expect(event.args.filledAmount).to.eq(order.sellAmount.div(2));
    });

    it('when order was fully filled', async function () {
      await cowSettlement.fill(contractOrder, orderUID, order.sellAmount, order.feeAmount, order.buyAmount);

      const tx = await swapOperator.closeOrder(contractOrder);
      const rcp = await tx.wait();

      const event = rcp.events.find(e => e.event === 'OrderClosed');

      expect(event.args.order).to.deep.include.members(Object.values(contractOrder));
      expect(event.args.filledAmount).to.eq(order.sellAmount);
    });
  });

  it('sets swapValue to 0 on the pool', async function () {
    const oldSwapValue = await pool.swapValue();
    expect(oldSwapValue).to.be.gt(0);

    await swapOperator.closeOrder(contractOrder);

    const newSwapValue = await pool.swapValue();
    expect(newSwapValue).to.eq(0);
  });
});
