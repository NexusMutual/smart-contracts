const { ethers, nexus } = require('hardhat');
const {
  impersonateAccount,
  loadFixture,
  setNextBlockBaseFeePerGas,
} = require('@nomicfoundation/hardhat-network-helpers');

const { init } = require('../../init');

const { ZeroAddress } = ethers;
const { toBytes2, numberToBytes32 } = nexus.helpers;
const { ContractIndexes } = nexus.constants;

const setup = async () => {
  await loadFixture(init);
  // note: kycAuth is the same as defaultSender
  const signers = await ethers.getSigners();
  const [kycAuth, alice, bob, charlie, mallory, ea1, ea2, governor] = signers;

  const seats = 5;
  const abMembersIndex = signers.indexOf(governor) + 1;
  const advisoryBoardMembers = signers.slice(abMembersIndex, abMembersIndex + seats);

  const registryProxy = await ethers.deployContract('UpgradeableProxy');
  const master = await ethers.deployContract('RGMockMaster');
  const poolImplementation = await ethers.deployContract('RGMockPool');
  const tokenControllerImplementation = await ethers.deployContract('RGMockTokenController');
  const registryImplementation = await ethers.deployContract('Registry', [registryProxy, master]);

  await registryProxy.upgradeTo(registryImplementation);
  const registry = await ethers.getContractAt('Registry', registryProxy);

  await impersonateAccount(ZeroAddress);
  const zeroSigner = await ethers.getSigner(ZeroAddress);
  const overrides = { gasPrice: 0 };

  await setNextBlockBaseFeePerGas(0);
  await registry
    .connect(zeroSigner) // the governor is initially unset
    .addContract(ContractIndexes.C_GOVERNOR, governor, false, overrides);

  await registry.connect(governor).addContract(
    ContractIndexes.C_REGISTRY, // add self
    registry,
    false,
  );

  await registry.connect(governor).deployContract(
    ContractIndexes.C_TOKEN_CONTROLLER, //
    numberToBytes32(0),
    tokenControllerImplementation,
  );

  await registry.connect(governor).deployContract(
    ContractIndexes.C_POOL, //
    numberToBytes32(1),
    poolImplementation,
  );

  const tokenController = await ethers.getContractAt(
    'RGMockTokenController',
    await registry.getContractAddressByIndex(ContractIndexes.C_TOKEN_CONTROLLER), // fetches the proxy address
  );

  const pool = await ethers.getContractAt(
    'RGMockPool',
    await registry.getContractAddressByIndex(ContractIndexes.C_POOL), // fetches the proxy address
  );

  await registry.connect(governor).setEmergencyAdmin(ea1, true);
  await registry.connect(governor).setEmergencyAdmin(ea2, true);
  await registry.connect(governor).setKycAuthAddress(kycAuth);

  const codes = ['CO', 'CP', 'GV', 'LO', 'MR', 'RA', 'SP', 'ST', 'TC'];

  for (const code of codes) {
    const hexCode = toBytes2(code);
    await master.setLatestAddress(hexCode, `0x000000000000000000000000000000000000${hexCode.replace(/^0x/, '')}`);
  }

  const contracts = { registry, registryProxy, master, tokenController, pool };
  const fixtureSigners = { kycAuth, alice, bob, charlie, mallory, ea1, ea2, governor };

  return { ...contracts, ...fixtureSigners, advisoryBoardMembers };
};

module.exports = { setup };
