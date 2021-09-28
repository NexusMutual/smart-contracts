const { ethers } = require('hardhat');
const { assert, expect } = require('chai');

const { ASSET } = require('./helpers');

const { parseEther, formatEther } = ethers.utils;

describe('onERC721Received', function () {
  it('reverts when receiving anything other than cover NFTs is not a cover', async function () {
    const { claims, unkownNFT, cover } = this.contracts;
    const [member] = this.accounts.members;

    unkownNFT.safeMint(member.address, 0);
    await expect(
      unkownNFT
        .connect(member)
        ['safeTransferFrom(address,address,uint256)'](member.address, claims.address, parseEther('0')),
    ).to.be.revertedWith('Unexpected NFT');

    await cover.buyCover(
      member.address,
      0, // productId
      ASSET.ETH,
      0,
      0,
      parseEther('2.6'),
      [],
    );
    await expect(
      cover
        .connect(member)
        ['safeTransferFrom(address,address,uint256)'](member.address, claims.address, parseEther('0')),
    ).not.to.be.revertedWith('Unexpected NFT');
  });
});
