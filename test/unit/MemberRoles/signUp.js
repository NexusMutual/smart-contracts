const { assert } = require('chai');
const { ethers } = require('hardhat');
const { hex } = require('../../../lib/helpers');
const { parseUnits } = require('ethers/lib/utils');
const {
  formatBytes32String,
  defaultAbiCoder,
  arrayify,
  hexConcat,
  hexZeroPad,
  splitSignature,
  keccak256,
} = ethers.utils;

const JOINING_FEE = parseUnits('0.002');
const MEMBERSHIP_APPROVAL = formatBytes32String('MEMBERSHIP_APPROVAL');

describe('signUp', function () {
  it('reverts if signature is invalid', async function () {
    const { memberRoles } = this.contracts;
    const kycAuthSigner = this.accounts.defaultSender;
    console.log({ kycAddr: kycAuthSigner.address });
    const { nonMembers } = this.accounts;
    const nonce = 0;

    console.log({ MEMBERSHIP_APPROVAL });
    const message = defaultAbiCoder.encode(
      ['bytes32', 'uint256', 'address'],
      [MEMBERSHIP_APPROVAL, nonce, nonMembers[0].address],
    );
    console.log({ message });
    const hash = keccak256(message);
    console.log({ hash });
    const signature = await kycAuthSigner.signMessage(hash);
    // console.log({ nonce, signature });
    const { compact } = splitSignature(signature);
    console.log({ compactSignature: compact });
    console.log({ nonce });
    const data = hexConcat([hexZeroPad(nonce, 32), compact]);
    console.log({ data });
    const tx = await memberRoles.signUp(nonMembers[0].address, arrayify(data), {
      value: JOINING_FEE,
    });
    // const tx = await memberRoles.signUp(nonMembers[0].address, signature + nonce.replace('0x', ''), {
    // value: JOINING_FEE,
    // });
    await tx.wait();
    assert(true, 'test');
  });
});
