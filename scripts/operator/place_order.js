const { ethers } = require('hardhat');
const { BigNumber, Contract } = require('ethers');
const { domain, computeOrderUid, hashOrder } = require('@gnosis.pm/gp-v2-contracts');
const swapOperatorAddress = require('./operatorAddress');

const {
  address: settlementAddress,
  abi: settlementABI,
} = require('@gnosis.pm/gp-v2-contracts/deployments/mainnet/GPv2Settlement.json');

const axios = require('axios');
const { keccak256 } = require('ethers/lib/utils');

const sellToken = '0xc778417e063141139fce010982780140aa0cd5ab'; // weth
const buyToken = '0x5592ec0cfb4dbc12d3ab100b257153436a1f0fea'; // dai
const baseUrl = 'https://api.cow.fi/rinkeby/api/v1';

const sellAmount = 1e15;

const main = async () => {
  const signer = (await ethers.getSigners())[0];
  const signerAddress = await signer.getAddress();

  const _domain = domain(4, settlementAddress);

  const settlementContract = new Contract(settlementAddress, settlementABI, signer);

  // get fee and quote
  const http = axios.create({ baseURL: baseUrl });
  const { data } = await http.get('feeAndQuote/sell', {
    params: { sellToken, buyToken, sellAmountBeforeFee: sellAmount },
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

  // The data to sign
  const order = {
    sellToken,
    buyToken,
    sellAmount: sellAmountAfterFee.toString(),
    buyAmount: buyAmount,
    validTo: validTo,
    appData: '0x487B02C558D729ABAF3ECF17881A4181E5BC2446429A0995142297E897B6EB38',
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

  // const signingSchemaId = 0; // 0: eip712, 3: presign
  // const signingSchemaSlug = 'eip712'; // 0: eip712, 3: presign
  const signingSchemaSlug = 'presign'; // 0: eip712, 3: presign

  // const signature = (await signOrder(_domain, order, signer, signingSchemaId)).data;
  const signature = swapOperatorAddress; // when presign, signature = address of trader

  // const payload = {
  //   ...order,
  //   signingScheme: signingSchemaSlug,
  //   signature: signature.data,
  //   from: signerAddress,
  // };

  const payload = {
    ...order,
    signingScheme: signingSchemaSlug,
    signature: signature,
    from: swapOperatorAddress,
  };

  const uid = computeOrderUid(_domain, order, order.receiver);
  const digest = hashOrder(_domain, order);

  console.log({ uid });
  console.log({ digest });

  const domainHash = ethers.utils._TypedDataEncoder.hashDomain(_domain);
  const swapOperatorContract = await ethers.getContractAt('CowSwapOperator', swapOperatorAddress);
  const contractDigest = await swapOperatorContract.getDigest(contractOrder, domainHash);
  console.log({ contractDigest });

  const contractUID = await swapOperatorContract.getUID(contractOrder, domainHash, order.receiver, validTo);
  console.log({ contractUID });

  console.log(JSON.stringify(payload, null, 2));

  return;

  console.log('Creating order');
  const response = await http.post('orders', payload);
  const uidFromApi = response.data;
  console.log('Response', uidFromApi);
};

main()
  .then(() => process.exit())
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
