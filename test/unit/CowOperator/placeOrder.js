const { contracts, makeWrongValue } = require('./setup');
const { ethers } = require('hardhat');
const { expect } = require('chai');
const { domain: makeDomain, computeOrderUid } = require('@gnosis.pm/gp-v2-contracts');
const { setEtherBalance } = require('../../utils/evm');
const { hex } = require('../utils').helpers;

const {
  utils: { parseEther, hexZeroPad, keccak256, toUtf8Bytes, hexlify, randomBytes },
} = ethers;

describe('placeOrder', function () {
  let controller, governance;

  let order, contractOrder, domain, orderUID;

  let dai, stEth, weth, pool, swapOperator, cowSettlement, cowVaultRelayer;

  const daiMinAmount = parseEther('3000');
  const daiMaxAmount = parseEther('20000');

  const stethMinAmount = parseEther('10');
  const stethMaxAmount = parseEther('20');

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
      sellAmount: parseEther('10000'),
      feeAmount: parseEther('1'),
      buyAmount: parseEther('2'),
      ...overrides,
    };
    const newContractOrder = makeContractOrder(newOrder);
    const newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);
    return { newOrder, newContractOrder, newOrderUID };
  };

  beforeEach(async () => {
    [controller, governance] = await ethers.getSigners();

    // Assign contracts (destructuring isn't working)
    dai = contracts.dai;
    stEth = contracts.stEth;
    weth = contracts.weth;
    pool = contracts.pool;
    swapOperator = contracts.swapOperator;
    cowSettlement = contracts.cowSettlement;
    cowVaultRelayer = contracts.cowVaultRelayer;

    // Build order struct, domain separator and calculate UID
    const lastBlockTimestamp = (await ethers.provider.getBlock(await ethers.provider.getBlockNumber())).timestamp;
    order = {
      sellToken: weth.address,
      buyToken: dai.address,
      sellAmount: parseEther('0.999'),
      buyAmount: parseEther('4995'),
      validTo: lastBlockTimestamp + 650,
      appData: hexZeroPad(0, 32),
      feeAmount: parseEther('0.001'),
      kind: 'sell',
      receiver: swapOperator.address,
      partiallyFillable: false,
      sellTokenBalance: 'erc20',
      buyTokenBalance: 'erc20',
    };

    contractOrder = makeContractOrder(order);

    const { chainId } = await ethers.provider.getNetwork();
    domain = makeDomain(chainId, cowSettlement.address);
    orderUID = computeOrderUid(domain, order, order.receiver);

    // Fund the pool contract
    await setEtherBalance(pool.address, parseEther('100'));

    // Set asset details for DAI and stEth. 0% slippage
    await pool.connect(governance).setSwapDetails(dai.address, daiMinAmount, daiMaxAmount, 0);
    await pool.connect(governance).setSwapDetails(stEth.address, stethMinAmount, stethMaxAmount, 0);
  });

  it('is callable only by swap controller', async function () {
    // call with non-controller, should fail
    await expect(
      swapOperator.connect(governance).placeOrder(contractOrder, orderUID),
    ).to.revertedWith('SwapOp: only controller can execute');

    // call with controller, should succeed
    await swapOperator.connect(controller).placeOrder(contractOrder, orderUID);
  });

  it('computes order UID on-chain and validates against passed value', async function () {
    // call with invalid UID, should fail
    const wrongUID = hexlify(randomBytes(56));
    await expect(
      swapOperator.placeOrder(contractOrder, wrongUID),
    ).to.revertedWith('SwapOp: Provided UID doesnt match calculated UID');

    // call with invalid struct, with each individual field modified, should fail
    for (const [key, value] of Object.entries(contractOrder)) {
      const wrongOrder = {
        ...contractOrder,
        [key]: makeWrongValue(value),
      };
      await expect(
        swapOperator.placeOrder(wrongOrder, orderUID),
      ).to.revertedWith('SwapOp: Provided UID doesnt match calculated UID');
    }

    // call with valid order and UID, should succeed
    await swapOperator.placeOrder(contractOrder, orderUID);
  });

  it('validates theres no other order already placed', async function () {
    // calling with valid data should succeed first time
    await swapOperator.placeOrder(contractOrder, orderUID);

    // calling with valid data should fail second time, because first order is still there
    await expect(
      swapOperator.placeOrder(contractOrder, orderUID),
    ).to.be.revertedWith('SwapOp: an order is already in place');
  });

  it('fails if neither buyToken or sellToken are WETH', async function () {
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

    await expect(
      swapOperator.placeOrder(newContractOrder, newOrderUID),
    ).to.be.revertedWith('SwapOp: Must either sell or buy eth');
  });

  describe('validating basic CoW protocol parameters', function () {
    it('validates only erc20 is supported for sellTokenBalance', async function () {
      const newOrder = {
        ...order,
        sellTokenBalance: 'external',
      };
      const newContractOrder = makeContractOrder(newOrder);
      const newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);
      await expect(
        swapOperator.placeOrder(newContractOrder, newOrderUID),
      ).to.be.revertedWith('SwapOp: Only erc20 supported for sellTokenBalance');
    });

    it('validates only erc20 is supported for buyTokenBalance', async function () {
      const newOrder = {
        ...order,
        buyTokenBalance: 'internal',
      };
      const newContractOrder = makeContractOrder(newOrder);
      const newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);

      await expect(
        swapOperator.placeOrder(newContractOrder, newOrderUID),
      ).to.be.revertedWith('SwapOp: Only erc20 supported for buyTokenBalance');
    });

    it('validates only sell operations are supported', async function () {
      const newOrder = {
        ...order,
        kind: 'buy',
      };
      const newContractOrder = makeContractOrder(newOrder);
      const newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);
      await expect(
        swapOperator.placeOrder(newContractOrder, newOrderUID),
      ).to.be.revertedWith('SwapOp: Only sell operations are supported');
    });

    it('validates the receiver of the swap is the swap operator contract', async function () {
      const newOrder = {
        ...order,
        receiver: governance.address,
      };
      const newContractOrder = makeContractOrder(newOrder);
      const newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);
      await expect(
        swapOperator.placeOrder(newContractOrder, newOrderUID),
      ).to.be.revertedWith('SwapOp: Receiver must be this contract');
    });

    it('validates that deadline is at least 10 minutes in the future', async function () {
      const newOrder = {
        ...order,
        validTo: Math.floor(new Date().getTime() / 1000 + 500),
      };
      const newContractOrder = makeContractOrder(newOrder);
      const newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);
      await expect(
        swapOperator.placeOrder(newContractOrder, newOrderUID),
      ).to.be.revertedWith('SwapOp: validTo must be at least 10 minutes in the future');
    });
  });

  it('validates the feeAmount is at most 1% of sellAmount', async function () {
    // Order with fee slightly above 1%, should fail
    const invalidOrder = { ...order, sellAmount: 9999, feeAmount: 100 };
    const invalidContractOrder = makeContractOrder(invalidOrder);
    const invalidOrderUID = computeOrderUid(domain, invalidOrder, invalidOrder.receiver);
    await expect(swapOperator.placeOrder(invalidContractOrder, invalidOrderUID))
      .to.be.revertedWith('SwapOp: Fee is above 1% of sellAmount');

    // Order with fee exactly 1%, should succeed
    const validOrder = { ...order, sellAmount: 10000, feeAmount: 100 };
    const validContractOrder = makeContractOrder(validOrder);
    const validOrderUID = computeOrderUid(domain, validOrder, validOrder.receiver);
    await swapOperator.placeOrder(validContractOrder, validOrderUID);
  });

  describe('validating there are asset details for sellToken', function () {
    it('doesnt perform validation when sellToken is WETH, because eth is used', async function () {
      // Ensure eth (weth) is disabled by checking min and max amount
      const swapDetails = await pool.getAssetSwapDetails(weth.address);
      expect(swapDetails.minAmount).to.eq(0);
      expect(swapDetails.maxAmount).to.eq(0);

      // Order selling WETH (eth) still should succeed
      await swapOperator.placeOrder(contractOrder, orderUID);
    });

    it('performs the validation when sellToken is not WETH', async function () {
      // Set up an order to swap DAI for ETH
      const { newContractOrder, newOrderUID } = await setupSellDaiForEth();

      // Since DAI was already registered on setup, set its details to 0
      await pool.connect(governance).setSwapDetails(dai.address, 0, 0, 0);

      // Order selling DAI should fail
      await expect(
        swapOperator.placeOrder(newContractOrder, newOrderUID),
      ).to.be.revertedWith('SwapOp: sellToken is not enabled');
    });
  });

  describe('validating sellToken is within boundaries', function () {
    it('only allows to sell when balance is above asset maxAmount', async function () {
      const { newContractOrder, newOrderUID } = await setupSellDaiForEth();

      // Try to run when balance is at maxAmount,
      await dai.setBalance(pool.address, daiMaxAmount);
      await expect(
        swapOperator.placeOrder(newContractOrder, newOrderUID),
      ).to.be.revertedWith('SwapOp: can only sell asset when > max');

      // When balance > maxAmount, should succeed
      await dai.setBalance(pool.address, daiMaxAmount.add(1));
      await swapOperator.placeOrder(newContractOrder, newOrderUID);
    });

    it('selling cannot bring balance below minAmount', async function () {
      const sellAmount = parseEther('24999');
      const feeAmount = parseEther('1');
      const buyAmount = parseEther('4.9998');
      const { newContractOrder, newOrderUID } = await setupSellDaiForEth({ sellAmount, feeAmount, buyAmount });

      // Set balance so that balance - totalAmountOut is 1 wei below asset minAmount
      await dai.setBalance(pool.address, daiMinAmount.add(sellAmount).add(feeAmount).sub(1));
      await expect(
        swapOperator.placeOrder(newContractOrder, newOrderUID),
      ).to.be.revertedWith('SwapOp: swap brings sellToken below min');

      // Set balance so it can exactly cover totalOutAmount
      await dai.setBalance(pool.address, daiMinAmount.add(sellAmount).add(feeAmount));
      await swapOperator.placeOrder(newContractOrder, newOrderUID);

      expect(await dai.balanceOf(pool.address)).to.eq(daiMinAmount);
    });

    it('selling must bring balance below maxAmount', async function () {
      const sellAmount = parseEther('24999');
      const feeAmount = parseEther('1');
      const buyAmount = parseEther('4.9998');
      const { newContractOrder, newOrderUID } = await setupSellDaiForEth({ sellAmount, feeAmount, buyAmount });

      // Set balance so that balance - totalAmountOut is 1 wei above asset maxAmount
      await dai.setBalance(pool.address, daiMaxAmount.add(sellAmount).add(feeAmount).add(1));
      await expect(
        swapOperator.placeOrder(newContractOrder, newOrderUID),
      ).to.be.revertedWith('SwapOp: swap leaves sellToken above max');

      // Set balance so the swap will leave balance at exactly maxAmount
      await dai.setBalance(pool.address, daiMaxAmount.add(sellAmount).add(feeAmount));
      await swapOperator.placeOrder(newContractOrder, newOrderUID);

      expect(await dai.balanceOf(pool.address)).to.eq(daiMaxAmount);
    });
  });

  it('validates that pools eth balance is not brought below established minimum', async function () {
    // Set pool balance to 2 eth - 1 wei
    await setEtherBalance(pool.address, parseEther('2').sub(1));

    // Set min pool eth to 1 eth
    await pool.connect(governance).updateUintParameters(hex('MIN_ETH'.padEnd(8, '\0')), parseEther('1'));

    // Execute trade for 1 eth, should fail
    expect(contractOrder.sellAmount.add(contractOrder.feeAmount)).to.eq(parseEther('1'));
    await expect(
      swapOperator.placeOrder(contractOrder, orderUID), //
    ).to.revertedWith('SwapOp: Pool eth balance below min');

    // Add 1 wei to balance and it should succeed
    await setEtherBalance(pool.address, parseEther('2'));
    await swapOperator.placeOrder(contractOrder, orderUID);
  });

  describe('validating there are asset details for buyToken', function () {
    it('doesnt perform validation when buyToken is WETH, because eth is used', async function () {
      // Ensure eth (weth) is disabled by checking min and max amount
      const swapDetails = await pool.getAssetSwapDetails(weth.address);
      expect(swapDetails.minAmount).to.eq(0);
      expect(swapDetails.maxAmount).to.eq(0);

      const { newContractOrder, newOrderUID } = await setupSellDaiForEth();

      // Order buying WETH (eth) still should succeed
      await swapOperator.placeOrder(newContractOrder, newOrderUID);
    });

    it('performs the validation when buyToken is not WETH', async function () {
      // Since DAI was already registered on setup, set its details to 0
      await pool.connect(governance).setSwapDetails(dai.address, 0, 0, 0); // otherSigner is governant

      // Order buying DAI should fail
      await expect(
        swapOperator.placeOrder(contractOrder, orderUID),
      ).to.be.revertedWith('SwapOp: buyToken is not enabled');
    });
  });

  describe('validating that buyToken is within boundaries', function () {
    it('only allows to buy when balance is below minAmount', async function () {
      // set buyToken balance to be minAmount, txn should fail
      await dai.setBalance(pool.address, daiMinAmount);
      await expect(swapOperator.placeOrder(contractOrder, orderUID))
        .to.be.revertedWith('SwapOp: can only buy asset when < minAmount');

      // set buyToken balance to be < minAmount, txn should succeed
      await dai.setBalance(pool.address, daiMinAmount.sub(1));
      await swapOperator.placeOrder(contractOrder, orderUID);
    });

    it('the swap cannot bring buyToken above maxAmount', async function () {
      await dai.setBalance(pool.address, 0);

      // try to place an order that will bring balance 1 wei above max, should fail
      const bigOrder = { ...order, buyAmount: daiMaxAmount.add(1) };
      const bigContractOrder = makeContractOrder(bigOrder);
      const bigOrderUID = computeOrderUid(domain, bigOrder, bigOrder.receiver);
      await expect(swapOperator.placeOrder(bigContractOrder, bigOrderUID))
        .to.be.revertedWith('SwapOp: swap brings buyToken above max');

      // place an order that will bring balance exactly to maxAmount, should succeed
      const okOrder = { ...order, buyAmount: daiMaxAmount };
      const okContractOrder = makeContractOrder(okOrder);
      const okOrderUID = computeOrderUid(domain, okOrder, okOrder.receiver);
      await swapOperator.placeOrder(okContractOrder, okOrderUID);
    });

    it('the swap must bring buyToken above minAmount', async function () {
      await dai.setBalance(pool.address, 0);

      // try to place an order that will bring balance 1 wei below min, should fail
      const buyAmount = daiMinAmount.sub(1);
      const smallOrder = { ...order, buyAmount, sellAmount: buyAmount.div(5000) };
      const smallContractOrder = makeContractOrder(smallOrder);
      const smallOrderUID = computeOrderUid(domain, smallOrder, smallOrder.receiver);

      await expect(swapOperator.placeOrder(smallContractOrder, smallOrderUID))
        .to.be.revertedWith('SwapOp: swap leaves buyToken below min');

      // place an order that will bring balance exactly to minAmount, should succeed
      const okOrder = { ...order, buyAmount: daiMinAmount, sellAmount: buyAmount.div(5000) };
      const okContractOrder = makeContractOrder(okOrder);
      const okOrderUID = computeOrderUid(domain, okOrder, okOrder.receiver);
      await swapOperator.placeOrder(okContractOrder, okOrderUID);
    });
  });

  describe('validating prices against oracle', function () {
    describe('when selling eth', function () {
      it('takes oracle price into account', async function () {
        const newOrder = {
          ...order,
          sellAmount: parseEther('1'),
          buyAmount: parseEther('5000').sub(1), // 5000e18 - 1 DAI wei
        };
        let newContractOrder = makeContractOrder(newOrder);
        let newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);

        // Since buyAmount is short by 1 wei, txn should revert
        await expect(swapOperator.placeOrder(newContractOrder, newOrderUID))
          .to.be.revertedWith('SwapOp: order.buyAmount too low (oracle)');

        // Add 1 wei to buyAmount
        newOrder.buyAmount = newOrder.buyAmount.add(1);

        newContractOrder = makeContractOrder(newOrder);
        newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);

        // Now txn should not revert
        await swapOperator.placeOrder(newContractOrder, newOrderUID);
      });

      it('takes slippage into account', async function () {
        await pool.connect(governance).setSwapDetails(dai.address, daiMinAmount, daiMaxAmount, 100); // 1% slippage

        const newOrder = {
          ...order,
          sellAmount: parseEther('1'),
          buyAmount: parseEther('4950').sub(1), // 4950e18 - 1 DAI wei
        };
        let newContractOrder = makeContractOrder(newOrder);
        let newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);

        // Since buyAmount is short by 1 wei, txn should revert
        await expect(swapOperator.placeOrder(newContractOrder, newOrderUID))
          .to.be.revertedWith('SwapOp: order.buyAmount too low (oracle)');

        // Add 1 wei to buyAmount
        newOrder.buyAmount = newOrder.buyAmount.add(1);

        newContractOrder = makeContractOrder(newOrder);
        newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);

        // Now txn should not revert
        await swapOperator.placeOrder(newContractOrder, newOrderUID);
      });
    });

    describe('when buying eth', function () {
      it('takes oracle price into account', async function () {
        let { newOrder, newContractOrder, newOrderUID } = await setupSellDaiForEth();

        // Since buyAmount is short by 1 wei, txn should revert
        newOrder.buyAmount = newOrder.buyAmount.sub(1);
        newContractOrder = makeContractOrder(newOrder);
        newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);

        await expect(swapOperator.placeOrder(newContractOrder, newOrderUID))
          .to.be.revertedWith('SwapOp: order.buyAmount too low (oracle)');

        // Add 1 wei to buyAmount
        newOrder.buyAmount = newOrder.buyAmount.add(1);
        newContractOrder = makeContractOrder(newOrder);
        newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);

        await swapOperator.placeOrder(newContractOrder, newOrderUID);
      });

      it('takes slippage into account', async function () {
        await pool.connect(governance).setSwapDetails(dai.address, daiMinAmount, daiMaxAmount, 100); // 1% slippage

        let { newOrder, newContractOrder, newOrderUID } = await setupSellDaiForEth();

        // Set buyAmount to be (oracle amount * 0.99) - 1 wei
        newOrder.buyAmount = newOrder.buyAmount.mul(99).div(100).sub(1);
        newContractOrder = makeContractOrder(newOrder);
        newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);

        await expect(swapOperator.placeOrder(newContractOrder, newOrderUID))
          .to.be.revertedWith('SwapOp: order.buyAmount too low (oracle)');

        // Set buyAmount to be (oracle amount * 0.99)
        newOrder.buyAmount = newOrder.buyAmount.add(1);
        newContractOrder = makeContractOrder(newOrder);
        newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);

        await swapOperator.placeOrder(newContractOrder, newOrderUID);
      });
    });
  });

  describe('pulling funds from pool', function () {
    it('transfers ether from pool and wrap it into WETH when sellToken is WETH', async function () {
      const poolEthBefore = await ethers.provider.getBalance(pool.address);
      const swapOpWethBefore = await weth.balanceOf(swapOperator.address);

      await swapOperator.placeOrder(contractOrder, orderUID);

      const poolEthAfter = await ethers.provider.getBalance(pool.address);
      const swapOpWethAfter = await weth.balanceOf(swapOperator.address);

      expect(poolEthBefore.sub(poolEthAfter)).to.eq(order.sellAmount.add(order.feeAmount));
      expect(swapOpWethAfter.sub(swapOpWethBefore)).to.eq(order.sellAmount.add(order.feeAmount));
    });

    it('transfer erc20 asset from pool to eth if sellToken is not WETH', async function () {
      const { newOrder, newContractOrder, newOrderUID } = await setupSellDaiForEth();

      const poolDaiBefore = await dai.balanceOf(pool.address);
      const swapOpDaiBefore = await dai.balanceOf(swapOperator.address);

      await swapOperator.placeOrder(newContractOrder, newOrderUID);

      const poolDaiAfter = await dai.balanceOf(pool.address);
      const swapOpDaiAfter = await dai.balanceOf(swapOperator.address);

      expect(poolDaiBefore.sub(poolDaiAfter)).to.eq(newOrder.sellAmount.add(newOrder.feeAmount));
      expect(swapOpDaiAfter.sub(swapOpDaiBefore)).to.eq(newOrder.sellAmount.add(newOrder.feeAmount));
    });
  });

  describe('setting pools swapValue', function () {
    it('works when selling eth', async function () {
      expect(await pool.swapValue()).to.eq(0);

      await swapOperator.placeOrder(contractOrder, orderUID);

      expect(await pool.swapValue()).to.eq(order.sellAmount.add(order.feeAmount));
    });

    it('works when transfering ERC20', async function () {
      const { newContractOrder, newOrderUID } = await setupSellDaiForEth();

      expect(await pool.swapValue()).to.eq(0);

      await swapOperator.placeOrder(newContractOrder, newOrderUID);

      expect((await pool.swapValue()).toString()).to.eq(parseEther('2.0002')); // (10000 + 1) / 5000
    });
  });

  it('approves CoW vault relayer to spend the exact amount of sellToken', async function () {
    expect(await weth.allowance(swapOperator.address, cowVaultRelayer.address)).to.eq(0);

    await swapOperator.placeOrder(contractOrder, orderUID);

    expect(await weth.allowance(swapOperator.address, cowVaultRelayer.address)).to.eq(
      order.sellAmount.add(order.feeAmount),
    );
  });

  it('stores the current orderUID in the contract', async function () {
    expect(await swapOperator.currentOrderUID()).to.eq('0x');

    await swapOperator.placeOrder(contractOrder, orderUID);

    expect(await swapOperator.currentOrderUID()).to.eq(orderUID);
  });

  it('calls setPreSignature on CoW settlement contract', async function () {
    expect(await cowSettlement.presignatures(orderUID)).to.eq(false);

    await swapOperator.placeOrder(contractOrder, orderUID);

    expect(await cowSettlement.presignatures(orderUID)).to.eq(true);
  });

  it('emits an OrderPlaced event', async function () {
    const tx = await swapOperator.placeOrder(contractOrder, orderUID);
    const rcp = await tx.wait();

    expect(rcp.events[2].args.order).to.deep.include.members(Object.values(contractOrder));
  });
});
