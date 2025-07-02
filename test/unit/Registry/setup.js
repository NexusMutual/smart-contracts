const { ethers, nexus } = require('hardhat');
const { impersonateAccount, setNextBlockBaseFeePerGas } = require('@nomicfoundation/hardhat-network-helpers');

const { ZeroAddress } = ethers;
const { toBytes2 } = nexus.helpers;
const { ContractIndexes } = nexus.constants;

const setup = async () => {
  const [, alice, bob, charlie, mallory, governor] = await ethers.getSigners();

  const registryProxy = await ethers.deployContract('UpgradeableProxy');
  const master = await ethers.deployContract('RGMasterMock');
  const registryImplementation = await ethers.deployContract('Registry', [registryProxy, master]);

  await registryProxy.upgradeTo(registryImplementation);
  const registry = await ethers.getContractAt('Registry', registryProxy);

  await impersonateAccount(ZeroAddress);
  const zeroSigner = await ethers.getSigner(ZeroAddress);

  await setNextBlockBaseFeePerGas(0);
  await registry.connect(zeroSigner).addContract(ContractIndexes.C_GOVERNOR, governor, false, { gasPrice: 0 });

  const codes = ['CO', 'CP', 'GV', 'LO', 'MR', 'RA', 'SP', 'ST', 'TC'];

  for (const code of codes) {
    const hexCode = toBytes2(code);
    await master.setLatestAddress(hexCode, `0x000000000000000000000000000000000000${hexCode.replace(/^0x/, '')}`);
  }

  return { registry, registryProxy, master, alice, bob, charlie, mallory, governor };
};

module.exports = { setup };
