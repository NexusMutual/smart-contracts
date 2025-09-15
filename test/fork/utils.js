const { ethers, network } = require('hardhat');
const assert = require('assert');
const {
  impersonateAccount,
  setBalance,
  setStorageAt,
  setNextBlockBaseFeePerGas,
  time,
} = require('@nomicfoundation/hardhat-network-helpers');

const {
  AbiCoder,
  Interface,
  JsonRpcProvider,
  JsonRpcSigner,
  concat,
  getBytes,
  keccak256,
  parseEther,
  solidityPacked,
  toBeHex,
  zeroPadValue,
} = ethers;

const Addresses = {
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  DAI_ADDRESS: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  USDC_ADDRESS: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  CBBTC_ADDRESS: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
  WETH_ADDRESS: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  STETH_ADDRESS: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
  RETH_ADDRESS: '0xae78736cd615f374d3085123a210448e74fc6393',
  AWETH_ADDRESS: '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8',
  SWAP_CONTROLLER: '0x551D5500F613a4beC77BA8B834b5eEd52ad5764f',
  // cowswap
  COWSWAP_SETTLEMENT: '0x9008D19f58AAbD9eD0D60971565AA8510560ab41',
  COWSWAP_SOLVER: '0x423cEc87f19F0778f549846e0801ee267a917935',
  COWSWAP_RELAYER: '0xC92E8bdf79f0507f65a392b0ab4667716BFE0110',
  // enzyme
  ENZYMEV4_VAULT_PROXY_ADDRESS: '0x27F23c710dD3d878FE9393d93465FeD1302f2EbD',
  ENZYME_FUND_VALUE_CALCULATOR_ROUTER: '0x7c728cd0CfA92401E01A4849a01b57EE53F5b2b9',
  ENZYME_COMPTROLLER_PROXY_ADDRESS: '0x01F328d6fbe73d3cf25D00a43037EfCF8BfA6F83',
  ENZYME_ADDRESS_LIST_REGISTRY: '0x4eb4c7babfb5d54ab4857265b482fb6512d22dff',
  // aave
  POOL_V3_ADDRESS: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
  POOL_DATA_PROVIDER: '0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3',
  WETH_GATEWAY_ADDRESS: '0xD322A49006FC828F9B5B37Ab215F99B4E5caB19C',
  VARIABLE_DEBT_USDC_ADDRESS: '0x72E95b8931767C79bA4EeE721354d6E99a61D004',
  // Emergency Pause
  EMERGENCY_ADMIN_1: '0x422D71fb8040aBEF53f3a05d21A9B85eebB2995D',
  EMERGENCY_ADMIN_2: '0x87B2a7559d85f4653f13E6546A14189cd5455d45',
  // misc
  ADVISORY_BOARD_MULTISIG: '0x422D71fb8040aBEF53f3a05d21A9B85eebB2995D',
  KYC_AUTH_ADDRESS: '0x176c27973E0229501D049De626d50918ddA24656',
  // Safe DELEGATECALL txes
  // https://docs.safe.global/advanced/smart-account-supported-networks?service=Transaction+Service&expand=1
  MULTISEND: '0xA83c336B20401Af773B6219BA5027174338D1836',
};

async function submitGovernanceProposal(categoryId, actionData, signers, gv) {
  const id = await gv.getProposalLength();

  console.log(`Proposal ${id}`);

  await gv.connect(signers[0]).createProposal('', '', '', 0);
  await gv.connect(signers[0]).categorizeProposal(id, categoryId, 0);
  await gv.connect(signers[0]).submitProposalWithSolution(id, '', actionData);

  for (const signer of signers) {
    await gv.connect(signer).submitVote(id, 1);
  }

  const tx = await gv.closeProposal(id, { gasLimit: 21e6 });
  const receipt = await tx.wait();

  assert(
    receipt.logs.some(log => {
      try {
        return gv.interface.parseLog(log).name === 'ActionSuccess';
      } catch {
        return false;
      }
    }),
    'ActionSuccess was expected',
  );
}

async function executeGovernorProposal(governor, abMembers, txs) {
  const [proposer] = abMembers;
  await governor.connect(proposer).propose(txs, 'Governor Proposal');
  const proposalId = await governor.proposalCount();

  for (const voter of abMembers.slice(0, 3)) {
    await governor.connect(voter).vote(proposalId, 1);
  }

  await time.increase(4 * 24 * 3600 + 1);
  await governor.connect(proposer).execute(proposalId);
  console.log(`Governor proposal ${proposalId} executed`);
}

// type Tx = { to: string, value?: bigint | number | string, data?: string };
// pack one inner tx: [op(uint8), to(address), value(uint256), dataLen(uint256), data(bytes)]
const packMultiSendTx = tx => {
  const data = tx.data ?? '0x';
  const len = getBytes(data).length;
  return solidityPacked(
    ['uint8', 'address', 'uint256', 'uint256', 'bytes'],
    [0 /* = CALL */, tx.to, BigInt(tx.value ?? 0), BigInt(len), data],
  );
};

const createSafeExecutor = async multisigAddress => {
  const safeAbi = [
    // eslint-disable-next-line max-len
    'function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) returns (bool)',
    'function getOwners() view returns (address[] memory)',
  ];

  let safe = await ethers.getContractAt(safeAbi, multisigAddress);
  const multiSendIface = new Interface(['function multiSend(bytes)']);

  const [owner] = await safe.getOwners();
  const ownerSigner = await getFundedSigner(owner);
  safe = safe.connect(ownerSigner);

  // sets threshold to 1
  await setStorageAt(multisigAddress, 4, 1);

  const executeSafeTransaction = async (txs, value = 0n, overrides = {}) => {
    const blob = concat(txs.map(packMultiSendTx));
    const data = multiSendIface.encodeFunctionData('multiSend', [blob]);
    await setNextBlockBaseFeePerGas(0);

    return safe.execTransaction(
      Addresses.MULTISEND,
      value,
      data,
      1, // operation is always DELEGATECALL
      0, // safeTxGas
      0, // baseGas
      0, // gasPrice
      ethers.ZeroAddress, // gasToken
      ethers.ZeroAddress, // refundReceiver
      // signature packing, ref: https://blog.tenderly.co/how-to-run-safe-simulations-on-tenderly/
      //              padding    address   zero slot     1
      solidityPacked(['uint96', 'address', 'uint256', 'uint8'], [0, owner, 0, 1]),
      { ...overrides, value, maxFeePerGas: 0, maxPriorityFeePerGas: 0 }, // overrides
    );
  };

  return executeSafeTransaction;
};

const getSigner = async address => {
  if (network.name !== 'hardhat') {
    return new JsonRpcSigner(new JsonRpcProvider(network.config.url), address);
  }

  await impersonateAccount(address);
  return ethers.getSigner(address);
};

const getFundedSigner = async (address, amount = parseEther('1000')) => {
  await setBalance(address, amount);
  return getSigner(address);
};

const revertToSnapshot = async snapshotId => ethers.provider.send('evm_revert', [snapshotId]);

const getTrancheId = timestamp => Math.floor(timestamp / (91 * 24 * 3600));

const setERC20Balance = async (token, address, balance) => {
  // ERC20 tokens usually use slot 0 for _balances mapping
  const standardSlot = 0;
  const abiCoder = new AbiCoder();
  const userBalanceSlot = keccak256(abiCoder.encode(['address', 'uint256'], [address, standardSlot]));
  const valueHex = zeroPadValue(toBeHex(balance), 32);
  await ethers.provider.send('hardhat_setStorageAt', [token, userBalanceSlot, valueHex]);
};

const setUSDCBalance = async (token, address, balance) => {
  const slot = 9;
  const abiCoder = new AbiCoder();
  const userBalanceSlot = keccak256(abiCoder.encode(['address', 'uint256'], [address, slot]));
  const currentValue = await ethers.provider.getStorage(token, userBalanceSlot);
  const currentBigInt = ethers.getBigInt(currentValue);
  const blacklistBit = currentBigInt >> 255n;
  const newValue = (blacklistBit << 255n) | BigInt(balance);
  const valueHex = zeroPadValue(toBeHex(newValue), 32);
  await ethers.provider.send('hardhat_setStorageAt', [token, userBalanceSlot, valueHex]);
};

const setCbBTCBalance = async (token, address, balance) => {
  const slot = 9; // Found to work at slot 9
  const abiCoder = new AbiCoder();
  const userBalanceSlot = keccak256(abiCoder.encode(['address', 'uint256'], [address, slot]));
  const valueHex = zeroPadValue(toBeHex(balance), 32);
  await ethers.provider.send('hardhat_setStorageAt', [token, userBalanceSlot, valueHex]);
};

const getImplementation = async proxyAddress => {
  const proxy = await ethers.getContractAt('UpgradeableProxy', proxyAddress);
  return await proxy.implementation();
};

module.exports = {
  Addresses,
  submitGovernanceProposal,
  executeGovernorProposal,
  createSafeExecutor,
  getTrancheId,
  getSigner,
  getFundedSigner,
  revertToSnapshot,
  setERC20Balance,
  setUSDCBalance,
  setCbBTCBalance,
  getImplementation,
};
