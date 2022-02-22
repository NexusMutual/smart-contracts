const { ethers } = require('hardhat');
const { BigNumber, Contract } = require('ethers');
const { domain, computeOrderUid, hashOrder } = require('@gnosis.pm/gp-v2-contracts');
const { swapOperator: swapOperatorAddress, pool: poolAddress } = require('./addresses');
const {
  address: settlementAddress,
  abi: settlementABI,
} = require('@gnosis.pm/gp-v2-contracts/deployments/mainnet/GPv2Settlement.json');
const axios = require('axios');
const { keccak256 } = require('ethers/lib/utils');

const sellToken = '0xc778417e063141139fce010982780140aa0cd5ab'; // weth
// const sellToken = '0xb07de0148b53e5ec7bb73e16016bb4d3fc71f0ca'; // some random lido token
const buyToken = '0x5592ec0cfb4dbc12d3ab100b257153436a1f0fea'; // dai
const baseUrl = 'https://api.cow.fi/rinkeby/api/v1';

const sellAmount = 1e15;

const main = async () => {
  // const signer = (await ethers.getSigners())[0];

  const _domain = domain(4, settlementAddress);

  // get fee and quote
  const http = axios.create({ baseURL: baseUrl });
  const httpParams = { sellToken, buyToken, sellAmountBeforeFee: sellAmount };
  console.log(`Calling cowswap API with params ${JSON.stringify(httpParams, null, 2)}`);
  const { data } = await http.get('feeAndQuote/sell', {
    params: httpParams,
    headers: { Accept: 'application/json' },
  });

  const buyAmount = data.buyAmountAfterFee;
  const fee = BigNumber.from(data.fee.amount);
  const expirationDate = data.fee.expirationDate;
  const sellAmountAfterFee = BigNumber.from(sellAmount).sub(fee);
  const validTo = Math.floor(new Date().getTime() / 1000 + 3600);

  console.log('sellAmount', ethers.utils.formatEther(sellAmount));
  console.log('sellAmountAfterFee', ethers.utils.formatEther(sellAmountAfterFee));
  console.log('buyAmount', ethers.utils.formatEther(buyAmount));
  console.log('fee', ethers.utils.formatEther(fee));
  console.log('expirationDate', expirationDate);
  console.log('validTo', validTo);

  // Check the pool has funds to execute the order
  const sellTokenContract = await ethers.getContractAt(
    '@openzeppelin/contracts-v4/token/ERC20/IERC20.sol:IERC20',
    sellToken,
  );
  const sellTokenBalance = await sellTokenContract.balanceOf(poolAddress);

  if (sellTokenBalance.lt(sellAmount)) {
    console.log(`Not enough sellToken balance in pool (currently ${sellTokenBalance.toString()})`);
    return;
  }

  // The data to sign
  const order = {
    sellToken,
    buyToken,
    sellAmount: sellAmountAfterFee.toString(),
    buyAmount: buyAmount,
    validTo: validTo,
    appData: ethers.utils.hexZeroPad(0, 32),
    feeAmount: fee.toString(),
    kind: 'sell',
    receiver: swapOperatorAddress,
    partiallyFillable: false,
    sellTokenBalance: 'erc20',
    buyTokenBalance: 'erc20',
  };

  const hashUtf = str => keccak256(ethers.utils.toUtf8Bytes(str));

  const contractOrder = {
    ...order,
    kind: hashUtf('sell'),
    sellTokenBalance: hashUtf('erc20'),
    buyTokenBalance: hashUtf('erc20'),
  };

  const payload = {
    ...order,
    signingScheme: 'presign',
    signature: swapOperatorAddress, // when presign, signature = address of trader
    from: swapOperatorAddress,
  };

  const computedUID = computeOrderUid(_domain, order, order.receiver);
  const digest = hashOrder(_domain, order);

  console.log({ uid: computedUID });
  console.log({ digest });

  const domainHash = ethers.utils._TypedDataEncoder.hashDomain(_domain);
  const swapOperatorContract = await ethers.getContractAt('CowSwapOperator', swapOperatorAddress);

  const contractDigest = await swapOperatorContract.getDigest(contractOrder, domainHash);
  console.log({ contractDigest });

  const contractUID = await swapOperatorContract.getUID(contractOrder, domainHash);
  console.log({ contractUID });

  // Place order in api
  console.log(JSON.stringify(payload, null, 2));
  console.log('Creating order');
  const response = await http.post('orders', payload);
  const uidFromApi = response.data;
  console.log('Response', uidFromApi);
  console.log(`All orders: https://explorer.cow.fi/rinkeby/address/${swapOperatorAddress}`);
  console.log(`This order: https://explorer.cow.fi/rinkeby/orders/${uidFromApi}`);

  if (computedUID !== uidFromApi) {
    console.error(`ERROR: Got different uid from api (${uidFromApi}) than calculated (${computedUID})`);
  }

  // Presign via contract
  console.log('Sending placeOrder tx');
  const placeOrderTx = await swapOperatorContract.placeOrder(contractOrder, domainHash, uidFromApi, {
    gasLimit: 1e6,
  });
  console.log(`placeOrder tx hash ${placeOrderTx.hash}`);
  await placeOrderTx.wait();
  console.log('Done');
};

main()
  .then(() => process.exit())
  .catch(e => {
    if (e.isAxiosError) {
      console.error(`HTTP Error: Status ${e.response.status}. ${JSON.stringify(e.response.data, null, 2)}`);
    } else {
      console.error(e);
    }
    process.exit(1);
  });
