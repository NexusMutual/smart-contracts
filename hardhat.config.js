import 'dotenv/config';
import toolbox from '@nomicfoundation/hardhat-toolbox-mocha-ethers';
import { parseEther } from 'ethers';

const optimizer = { enabled: true, runs: 200 };
const compilerSettings = process.env.ENABLE_OPTIMIZER ? { optimizer } : {};

const compilers = [
  { settings: { ...compilerSettings }, version: '0.5.17' }, // v1
  { settings: { ...compilerSettings, evmVersion: 'prague' }, version: '0.8.28' }, // v2
];

// override version AND optimizer to always get the same bytecode
const customConfig = {
  version: '0.8.18',
  settings: { optimizer: { enabled: true, runs: 200 } },
};

const overrides = {
  'contracts/modules/staking/MinimalBeaconProxy.sol': customConfig,
  'contracts/modules/staking/StakingPoolFactory.sol': customConfig,
};

const networks = {
  default: {
    accounts: { count: 100, accountsBalance: parseEther('10000') },
    allowUnlimitedContractSize: true,
    blockGasLimit: 30e6,
    gas: 30e6,
    chainId: process.env.FORK_CHAIN_ID ? Number(process.env.FORK_CHAIN_ID) : 31337,
  }
}

const config = {
  plugins: [toolbox],
  solidity: { compilers, overrides },
};

export default config;
