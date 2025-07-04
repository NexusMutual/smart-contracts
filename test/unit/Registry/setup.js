const { ethers, nexus } = require('hardhat');
const { impersonateAccount, setNextBlockBaseFeePerGas } = require('@nomicfoundation/hardhat-network-helpers');

const { ZeroAddress } = ethers;
const { toBytes2 } = nexus.helpers;
const { ContractIndexes } = nexus.constants;

const setup = async () => {
  // note: kycAuth is the same as defaultSender
  const [kycAuth, alice, bob, charlie, mallory, ea1, ea2, governor] = await ethers.getSigners();

  const registryProxy = await ethers.deployContract('UpgradeableProxy');
  const master = await ethers.deployContract('RGMockMaster');
  const pool = await ethers.deployContract('RGMockPool');
  const tokenController = await ethers.deployContract('RGMockTokenController');
  const registryImplementation = await ethers.deployContract('Registry', [registryProxy, master]);

  await registryProxy.upgradeTo(registryImplementation);
  const registry = await ethers.getContractAt('Registry', registryProxy);

  await impersonateAccount(ZeroAddress);
  const zeroSigner = await ethers.getSigner(ZeroAddress);
  const overrides = { gasPrice: 0 };

  await setNextBlockBaseFeePerGas(0);
  await registry
    .connect(zeroSigner) // the governor is not set initially
    .addContract(ContractIndexes.C_GOVERNOR, governor, false, overrides);

  await registry.connect(governor).addContract(ContractIndexes.C_TOKEN_CONTROLLER, tokenController, false, overrides);
  await registry.connect(governor).addContract(ContractIndexes.C_POOL, pool, false, overrides);
  await registry.connect(governor).setEmergencyAdmin(ea1, true, overrides);
  await registry.connect(governor).setEmergencyAdmin(ea2, true, overrides);
  await registry.connect(governor).setKycAuthAddress(kycAuth);

  const codes = ['CO', 'CP', 'GV', 'LO', 'MR', 'RA', 'SP', 'ST', 'TC'];

  for (const code of codes) {
    const hexCode = toBytes2(code);
    await master.setLatestAddress(hexCode, `0x000000000000000000000000000000000000${hexCode.replace(/^0x/, '')}`);
  }

  const contracts = { registry, registryProxy, master, tokenController, pool };
  const signers = { kycAuth, alice, bob, charlie, mallory, ea1, ea2, governor };

  return { ...contracts, ...signers };
};

module.exports = { setup };
