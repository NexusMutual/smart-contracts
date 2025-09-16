// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "@openzeppelin/contracts-v4/utils/Base64.sol";
import "@openzeppelin/contracts-v4/utils/Strings.sol";

import "../../interfaces/IStakingNFT.sol";
import "../../interfaces/IStakingNFTDescriptor.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IStakingPoolFactory.sol";
import "../../libraries/DateTime.sol";
import "../../libraries/FloatingPoint.sol";
import "../../libraries/StakingPoolLibrary.sol";

contract StakingNFTDescriptor is IStakingNFTDescriptor {
  using Strings for uint;
  using DateTime for uint;

  uint public constant TRANCHE_DURATION = 91 days;
  uint public constant MAX_ACTIVE_TRANCHES = 8;
  uint public constant ONE_NXM = 1 ether;
  uint public constant NXM_DECIMALS = 18;

  function tokenURI(uint tokenId) public view returns (string memory) {
    (string memory description, StakeData memory stakeData) = buildDescription(tokenId);
    string memory image = Base64.encode(bytes(generateSVGImage(stakeData)));

    return string(
      abi.encodePacked(
        "data:application/json;base64,",
        Base64.encode(
          bytes(
            abi.encodePacked(
              '{"name":"', IStakingNFT(msg.sender).name(), '",',
              '"description":"', description, '",',
              '"image": "', "data:image/svg+xml;base64,", image,
              '"}'
            )
          )
        )
      )
    );
  }

  function buildDescription(uint tokenId) public view returns (string memory description, StakeData memory stakeData) {
    uint poolId = IStakingNFT(msg.sender).stakingPoolOf(tokenId);
    address stakingPoolFactory = IStakingNFT(msg.sender).stakingPoolFactory();
    address stakingPool = StakingPoolLibrary.getAddress(stakingPoolFactory, poolId);

    // Check if token exists
    (string memory depositInfo, uint totalStake, uint pendingRewards) = getActiveDeposits(
      tokenId,
      IStakingPool(stakingPool)
    );

    // Add pool info
    description = append(
      "This NFT represents a deposit into staking pool: ",
      uint(uint160(stakingPool)).toHexString()
    );
    description = appendWithNewline(description, "Pool ID: ", poolId.toString());

    // No active deposits, assume it has expired
    if (totalStake == 0) {
      description = appendWithNewline(description, "Deposit has expired!");
      return (description, StakeData(poolId, 0, tokenId));
    }

    // Add deposit info
    description = appendWithNewline(description, "Staked amount: ", FloatingPoint.toFloat(totalStake, NXM_DECIMALS), " NXM");
    description = appendWithNewline(description, "Pending rewards: ", FloatingPoint.toFloat(pendingRewards, NXM_DECIMALS), " NXM");
    description = appendWithNewline(description, "Active deposits: ", depositInfo);

    return (description, StakeData(poolId, totalStake, tokenId));
  }

  function getActiveDeposits(
    uint tokenId,
    IStakingPool stakingPool
  ) public view returns (
    string memory depositInfo,
    uint totalStake,
    uint pendingRewards
  ) {

    uint activeStake = stakingPool.getActiveStake();
    uint stakeSharesSupply = stakingPool.getStakeSharesSupply();

    // Get total stake from each active tranche
    for (uint i = 0; i < MAX_ACTIVE_TRANCHES; i++) {
      // get deposit
      (uint lastAccNxmPerRewardShare, uint _pendingRewards, uint _stakeShares, uint _rewardsShares) =
      stakingPool.getDeposit(tokenId, (block.timestamp / TRANCHE_DURATION) + i);

      // no active stake, skip this tranche
      if (_rewardsShares == 0) {
        continue;
      }

      string memory dateString;
      {
        // calculate days left until stake expires
        uint secondsLeftInTranche = (TRANCHE_DURATION - (block.timestamp % TRANCHE_DURATION));
        (uint year, uint month, uint day) = (block.timestamp + (secondsLeftInTranche + (i * TRANCHE_DURATION))).timestampToDate();
        dateString = string(abi.encodePacked(month.getMonthString(), " ", addZeroPrefix(day), " ", year.toString()));
      }

      uint stake = (activeStake * _stakeShares) / stakeSharesSupply;

      depositInfo = appendWithNewline(
        depositInfo,
        " -",
        append(FloatingPoint.toFloat(stake, NXM_DECIMALS), " NXM will expire at tranche: ", uint((block.timestamp / TRANCHE_DURATION) + i).toString()),
        append(" (", dateString, ")")
      );

      // update pending rewards
      uint newRewardPerShare = stakingPool.getAccNxmPerRewardsShare() - lastAccNxmPerRewardShare;
      pendingRewards += _pendingRewards + (newRewardPerShare * _rewardsShares) / ONE_NXM;

      // update total stake
      totalStake += stake;
    }
    return (depositInfo, totalStake, pendingRewards);
  }


  function generateSVGImage(StakeData memory stakeDescription) public pure returns (bytes memory) {
    return abi.encodePacked(
      string(
        abi.encodePacked(
          '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 290 500"><defs><style> .cls-1 { fill: none; } .cls-3 { clip-path: url(#cp1); } .cls-4 { opacity: .04; } .cls-5 { fill: #002332; } .cls-6, .cls-7, .cls-8, .cls-9 { fill: #fff; } .cls-7 { font-size: 18px; } .cls-7, .cls-8 { font-family: ArialMT, Arial, sans-serif; } .cls-9 { clip-path: url(#cp2); } .cls-8, .cls-9 { font-size: 13px; }',
          '</style><clipPath id="cp1"><rect class="cls-1" width="290" height="500" rx="32.74" ry="32.74"/></clipPath><clipPath id="cp2"><rect class="cls-1" x="-382.18" y="-90" width="968.85" height="971"/></clipPath></defs><g><rect class="cls-5" y="0" width="290" height="500" rx="32.74" ry="32.74"/><g><path class="cls-6" d="m137.65,344.29c5.97-5.76,6.14-15.26.38-21.23s-15.26-6.14-21.23-.38-6.14,15.26-.38,21.23c5.76,5.97,15.26,6.14,21.23.38Z"/><path class="cls-6" d="m55.85,382.84c5.97-5.76,6.14-15.26.38-21.23s-15.26-6.14-21.23-.38c-5.97,5.76-6.14,15.26-.38,21.23,5.76,5.97,15.26,6.14,21.23.38Z"/><path class="cls-6" d="m95.2,443.55c-5.78-5.95-15.28-6.09-21.23-.31-5.92,5.75-6.09,15.2-.38,21.16h0c5.7,6.02,15.2,6.28,21.23.58,6.02-5.7,6.28-15.2.58-21.23-.06-.07-.13-.14-.2-.2Z"/><path class="cls-6" d="m176.38,404.39c-5.76-5.97-15.26-6.14-21.23-.38-5.97,5.76-6.14,15.26-.38,21.23,5.76,5.97,15.26,6.14,21.23.38,5.97-5.76,6.14-15.26.38-21.23Z"/><path class="cls-6" d="m170.2,369.41c2.85-2.87,4.35-6.82,4.13-10.86v-.11c-.68-12.34-15.65-18.07-24.39-9.33l-14.15,14.4c-4.53,4.53-15,5.22-20.37-.16l-33.84-34.24c-2.69-2.78-6.4-4.35-10.27-4.35-12.74,0-19.11,15.4-10.1,24.41l14.27,13.77c5.19,5.65,4.62,15.6,0,20.22l-34.28,34.35c-2.64,2.64-4.14,6.21-4.19,9.94v.32c-.15,12.82,15.34,19.34,24.4,10.28l14.24-14.31c4.96-4.96,15.27-5.01,20.46.18l33.7,33.9c2.79,2.79,6.6,4.3,10.53,4.18h.05c12.53-.37,18.55-15.54,9.69-24.4l-13.61-13.75c-5.05-5.05-5.43-14.79-.03-20.19l33.77-34.25Zm-53.42,35.38c-6.27,6.05-16.26,5.87-22.32-.4-6.05-6.27-5.87-16.26.4-22.32,6.27-6.05,16.26-5.87,22.32.4,6.05,6.27,5.87,16.26-.4,22.32Z"/></g><rect class="cls-1" width="290" height="500" rx="32.74" ry="32.74"/><g class="cls-4"><g class="cls-3"><g class="cls-9"><path class="cls-6" d="m166.21,199.57L0,31.41v468.59h279.42c2.06-8.38,5.24-16.47,9.58-23.93V207.76c-32.29,22.54-91.17,23.44-122.79-8.18Zm8.78,267.25c-40.45,39.03-104.88,37.88-143.92-2.57-39.03-40.45-37.88-104.88,2.57-143.92,40.45-39.03,104.88-37.88,143.92,2.57,39.03,40.45,37.88,104.88-2.57,143.92Z"/><path class="cls-6" d="m290,0h-144.24c-1.92,26.48,6.99,53.64,26.88,74.26,31.32,32.46,79.85,38.32,117.36,17.07V0Z"/></g></g></g><g><polygon class="cls-6" points="221.16 46.69 217.76 55.77 216.64 55.77 213.24 46.69 213.24 55.77 210.67 55.77 210.67 43.28 214.27 43.28 217.2 50.64 220.13 43.28 223.75 43.28 223.75 55.77 221.16 55.77 221.16 46.69"/><rect class="cls-6" x="265.25" y="42.99" width="2.43" height="12.78"/><g><path class="cls-6" d="m204.34,47.11c1.18-1.13,1.22-3,.08-4.18-1.15-1.18-3-1.22-4.18-.07-1.16,1.12-1.19,3-.09,4.16,1.13,1.18,3.01,1.22,4.19.1"/><path class="cls-6" d="m184.16,54.75c1.13,1.18,3,1.22,4.18.08,1.18-1.15,1.22-3,.07-4.18-1.12-1.16-3-1.19-4.16-.09-1.18,1.13-1.22,3.01-.1,4.19"/><path class="cls-6" d="m176.56,34.43c-1.18,1.13-1.22,3-.08,4.18,1.15,1.18,3,1.22,4.18.07,1.16-1.12,1.19-3,.09-4.16-1.13-1.18-3.01-1.22-4.19-.1"/><path class="cls-6" d="m196.86,26.91c-1.13-1.18-3-1.22-4.18-.08-1.18,1.15-1.22,3-.07,4.18,1.12,1.16,3,1.19,4.16.09,1.18-1.13,1.22-3.01.1-4.19"/><path class="cls-6" d="m192.67,43.01c-1.24,1.18-3.22,1.14-4.41-.1-1.16-1.22-1.12-3.2.09-4.37,1.24-1.2,3.19-1.17,4.4.08,1.2,1.24,1.17,3.21-.08,4.4m10.52-6.97c.56-.57.86-1.34.81-2.14v-.02c-.13-2.43-3.08-3.56-4.81-1.84l-2.79,2.84c-.89.89-2.95,1.03-4.01-.03l-6.67-6.75c-.53-.55-1.26-.86-2.02-.86-2.51,0-3.76,3.03-1.99,4.81l2.81,2.71c1.02,1.11.91,3.07,0,3.98l-6.75,6.77c-.52.52-.82,1.22-.82,1.96v.06c-.03,2.53,3.02,3.81,4.81,2.03l2.81-2.82c.98-.98,3.01-.99,4.03.04l6.64,6.68c.55.55,1.3.85,2.08.82h0c2.47-.07,3.65-3.06,1.91-4.81l-2.68-2.71c-.99-.99-1.07-2.91,0-3.98l6.65-6.75Z"/></g><g><polygon class="cls-6" points="213.39 30.52 213.39 38.85 210.67 38.85 210.67 26.08 213.47 26.08 219.39 34.1 219.39 26.08 222.11 26.08 222.11 38.85 219.48 38.85 213.39 30.52"/><path class="cls-6" d="m226.49,33.35h4.56c-.06-.88-.67-2.05-2.28-2.05-1.51,0-2.16,1.13-2.28,2.05m2.28-3.98c2.76,0,4.64,2.07,4.64,5.09v.54h-6.88c.15,1.17,1.09,2.14,2.66,2.14.86,0,1.88-.34,2.47-.92l1.07,1.57c-.92.84-2.37,1.28-3.81,1.28-2.82,0-4.94-1.9-4.94-4.86,0-2.68,1.97-4.85,4.79-4.85"/><polygon class="cls-6" points="238.95 35.73 236.82 38.85 234.12 38.85 237.4 34.1 234.31 29.6 237.03 29.6 238.95 32.45 240.85 29.6 243.57 29.6 240.46 34.1 243.78 38.85 241.06 38.85 238.95 35.73"/><path class="cls-6" d="m251.23,37.68c-.63.71-1.74,1.4-3.26,1.4-2.03,0-2.99-1.11-2.99-2.91v-6.57h2.43v5.61c0,1.28.67,1.7,1.7,1.7.94,0,1.69-.52,2.11-1.05v-6.26h2.43v9.25h-2.43v-1.17Z"/><path class="cls-6" d="m256.32,35.94c.67.63,2.05,1.26,3.2,1.26,1.05,0,1.55-.42,1.55-1,0-.63-.84-.8-1.86-1-1.59-.31-3.64-.71-3.64-2.93,0-1.55,1.36-2.91,3.79-2.91,1.57,0,2.82.54,3.74,1.26l-.98,1.67c-.56-.59-1.61-1.07-2.74-1.07-.88,0-1.46.4-1.46.92s.73.69,1.76.9c1.59.31,3.72.75,3.72,3.06,0,1.69-1.44,2.97-4,2.97-1.61,0-3.16-.54-4.14-1.44l1.05-1.7Z"/></g><path class="cls-6" d="m232.28,54.6c-.63.71-1.74,1.4-3.26,1.4-2.03,0-2.99-1.11-2.99-2.91v-6.57h2.43v5.61c0,1.28.67,1.7,1.7,1.7.94,0,1.69-.52,2.11-1.05v-6.26h2.43v9.25h-2.43v-1.17Z"/><path class="cls-6" d="m237.76,53.47v-4.83h-1.53v-2.13h1.53v-2.53h2.45v2.53h1.88v2.13h-1.88v4.18c0,.57.31,1.02.84,1.02.36,0,.71-.13.84-.27l.52,1.84c-.36.33-1.02.59-2.03.59-1.7,0-2.62-.88-2.62-2.53"/><path class="cls-6" d="m250,54.6c-.63.71-1.74,1.4-3.26,1.4-2.03,0-2.99-1.11-2.99-2.91v-6.57h2.43v5.61c0,1.28.67,1.7,1.7,1.7.94,0,1.69-.52,2.11-1.05v-6.26h2.43v9.25h-2.43v-1.17Z"/><path class="cls-6" d="m260.4,52.4c-.4-.54-1.17-.8-1.95-.8-.96,0-1.74.5-1.74,1.4s.78,1.36,1.74,1.36c.79,0,1.55-.27,1.95-.8v-1.15Zm0,2.41c-.63.75-1.72,1.19-2.93,1.19-1.48,0-3.22-1-3.22-3.06s1.74-2.95,3.22-2.95c1.23,0,2.32.38,2.93,1.13v-1.28c0-.94-.8-1.55-2.03-1.55-1,0-1.92.36-2.7,1.09l-.92-1.63c1.13-1,2.59-1.46,4.04-1.46,2.11,0,4.04.84,4.04,3.5v5.98h-2.43v-.96Z"/></g> <text class="cls-7" x="7%" y="25%"><tspan>Staking Info</tspan></text> <text class="cls-8" x="7%" y="35%"><tspan>Pool ID:</tspan></text> <text class="cls-8" x="7%" y="40%"><tspan>Stake:</tspan></text> <text class="cls-8" x="7%" y="45%"><tspan>NFT ID:</tspan></text>',
          '<text class="cls-8" x="93%" y="35%" text-anchor="end"><tspan>', stakeDescription.poolId.toString(), '</tspan></text>',
          '<text class="cls-8" x="93%" y="40%" text-anchor="end"><tspan>', FloatingPoint.toFloat(stakeDescription.stakeAmount, NXM_DECIMALS), ' NXM</tspan></text>',
          '<text class="cls-8" x="93%" y="45%" text-anchor="end"><tspan>', stakeDescription.tokenId.toString(), '</tspan></text></g></svg>'
        )
      )
    );
  }

  // If value is single digit, add a zero prefix
  function addZeroPrefix(uint256 value) public pure returns (string memory) {
    if (value < 10) {
      return string(abi.encodePacked("0", value.toString()));
    }
    return value.toString();
  }

  function append(string memory a, string memory b) internal pure returns (string memory) {
    return string(abi.encodePacked(a, b));
  }

  function append(string memory a, string memory b, string memory c) internal pure returns (string memory) {
    return string(abi.encodePacked(a, b, c));
  }

  function appendWithNewline(string memory a, string memory b) internal pure returns (string memory) {
    return string(abi.encodePacked(a, "\\n", b));
  }

  function appendWithNewline(string memory a, string memory b, string memory c) internal pure returns (string memory) {
    return string(abi.encodePacked(a, "\\n", b, c));
  }

  function appendWithNewline(string memory a, string memory b, string memory c, string memory d) internal pure returns (string memory) {
    return string(abi.encodePacked(a, "\\n", b, c, d));
  }

  function toFloat(uint number, uint decimals) public pure returns (string memory) {
    return FloatingPoint.toFloat(number, decimals);
  }
}
