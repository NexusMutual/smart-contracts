// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/utils/Strings.sol";
import "@openzeppelin/contracts-v4/utils/Base64.sol";
import "../../libraries/DateTime.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IStakingNFTDescriptor.sol";

contract StakingNFTDescriptor is IStakingNFTDescriptor {
  using Strings for uint;
  using DateTime for uint;

  uint public constant TRANCHE_DURATION = 91 days;
  uint public constant MAX_ACTIVE_TRANCHES = 8;
  uint public constant ONE_NXM = 1 ether;

  function tokenURI(StakingTokenURIParams calldata params) public view returns (string memory) {
    string memory description = buildDescription(params);
    string memory image = Base64.encode(bytes(generateSVGImage(params)));

    return string(
      abi.encodePacked(
        "data:application/json;base64,",
        Base64.encode(
          bytes(
            abi.encodePacked(
              '{"name":"', params.name, '",',
              '"description":"', description, '",',
              '"image": "', "data:image/svg+xml;base64,", image,
              '"}'
            )
          )
        )
      )
    );
  }

  function buildDescription(StakingTokenURIParams calldata params) public view returns (string memory description) {
    // Check if token exists
    if (params.poolId != 0) {
      (string memory depositInfo, uint totalStake, uint pendingRewards) = getActiveDeposits(params);

      // Add pool info
      description = append("This NFT represents a deposit into staking pool: ", uint(uint160(params.stakingPool)).toHexString());
      description = appendWithNewline(description, "Pool ID: ", params.poolId.toString());

      // No active deposits, assume it has expired
      if (totalStake == 0) {
        description = appendWithNewline(description, "Deposit has expired!");
        return description;
      }

      // Add deposit info
      description = appendWithNewline(description, "Staked amount: ", totalStake.toString(), " NXM");
      description = appendWithNewline(description, "Pending rewards: ", pendingRewards.toString(), " NXM");
      description = appendWithNewline(description, "Active deposits: ", depositInfo);
      return description;
    }

    description = string(abi.encodePacked("Token id ", params.tokenId.toString(), " is not minted"));
  }


  function getActiveDeposits(StakingTokenURIParams calldata params)
  public
  view
  returns (string memory depositInfo, uint totalStake, uint pendingRewards) {
    IStakingPool stakingPool = IStakingPool(params.stakingPool);
    uint activeStake = stakingPool.getActiveStake();
    uint stakeSharesSupply = stakingPool.getStakeSharesSupply();

    // Get total stake from each active tranche
    for (uint i = 0; i < MAX_ACTIVE_TRANCHES; i++) {
      // get deposit
      (uint lastAccNxmPerRewardShare, uint _pendingRewards, uint _stakeShares, uint _rewardsShares) =
      stakingPool.getDeposit(params.tokenId, (block.timestamp / TRANCHE_DURATION) + i);

      // no active stake, skip this tranche
      if (_rewardsShares == 0) {
        continue;
      }

      // update pending rewards
      uint newRewardPerShare = stakingPool.getAccNxmPerRewardsShare() - lastAccNxmPerRewardShare;
      pendingRewards += _pendingRewards + (newRewardPerShare * _rewardsShares) / ONE_NXM;

      // update total stake
      uint stake = (activeStake * _stakeShares) / stakeSharesSupply;
      totalStake += stake;

      // calculate days left until stake expires
      uint secondsLeftInTranche = (TRANCHE_DURATION - (block.timestamp % TRANCHE_DURATION));

      string memory dateString;
      {
        (uint year, uint month, uint day) = (block.timestamp + (secondsLeftInTranche + (i * TRANCHE_DURATION))).timestampToDate();
        dateString = string(abi.encodePacked(month.getMonthString(), " ", day.toString(), " ", year.toString()));
      }

      depositInfo = appendWithNewline(
        depositInfo,
        " -",
        append(stake.toString(), " NXM will expire at tranche: ", uint((block.timestamp / TRANCHE_DURATION) + i).toString()),
        append(" (", dateString, ")")
      );
    }
    return (depositInfo, totalStake, pendingRewards);
  }

  function generateSVGImage(StakingTokenURIParams calldata params) public pure returns (bytes memory) {
    return abi.encodePacked(
      string(
        abi.encodePacked(
          '<svg xmlns="http://www.w3.org/2000/svg" class="clock" viewBox="0 0 100 100" style="width:420px;height:420px;"> <style> * {--color-primary: #c0a675;--color-accent: #c5a35b;--color-background: #cfc5ab;--color-hand: #be975e;--color-text: #514a39;-webkit-transform-origin: inherit; transform-origin: inherit; display: flex; align-items: center; justify-content: center; margin: 0; background-color: var(--color-background); font-family: Helvetica, Sans-Serif; font-size: 5px; } .text { color: var(--color-text); } .circle { color: var(--color-accent); } .clock { width: 60vmin; height: 60vmin; fill: currentColor; -webkit-transform-origin: 50px 50px; transform-origin: 50px 50px; -webkit-animation-name: fade-in; animation-name: fade-in; -webkit-animation-duration: 500ms; animation-duration: 500ms; -webkit-animation-fill-mode: both; animation-fill-mode: both; } .clock line { stroke: currentColor; stroke-linecap: round; } .lines { color: var(--color-primary); stroke-width: 0.5px; } .line-1 { -webkit-transform: rotate(30deg); transform: rotate(30deg); } .line-2 { -webkit-transform: rotate(60deg); transform: rotate(60deg); } .line-3 { -webkit-transform: rotate(90deg); transform: rotate(90deg); } .line-4 { -webkit-transform: rotate(120deg); transform: rotate(120deg); } .line-5 { -webkit-transform: rotate(150deg); transform: rotate(150deg); } .line-6 { -webkit-transform: rotate(180deg); transform: rotate(180deg); } .line-7 { -webkit-transform: rotate(210deg); transform: rotate(210deg); } .line-8 { -webkit-transform: rotate(240deg); transform: rotate(240deg); } .line-9 { -webkit-transform: rotate(270deg); transform: rotate(270deg); } .line-10 { -webkit-transform: rotate(300deg); transform: rotate(300deg); } .line-11 { -webkit-transform: rotate(330deg); transform: rotate(330deg); } .line-12 { -webkit-transform: rotate(360deg); transform: rotate(360deg); } .line { stroke-width: 1.5px; transition: -webkit-transform 200ms cubic-bezier(0.175, 0.885, 0.32, 1.275); transition: transform 200ms cubic-bezier(0.175, 0.885, 0.32, 1.275); transition: transform 200ms cubic-bezier(0.175, 0.885, 0.32, 1.275), -webkit-transform 200ms cubic-bezier(0.175, 0.885, 0.32, 1.275); } .line-hour { color: var(--color-hand); animation: rotateClockHour 216000s linear infinite; } .line-minute { color: var(--color-hand); animation: rotateClockMinute 3600s linear infinite; } .line-second { color: var(--color-accent); stroke-width: 1px; animation: rotateClockSecond 60s linear infinite; }@keyframes rotateClockSecond {from { -webkit-transform: rotate(342deg);-moz-transform: rotate(342deg);-ms-transform: rotate(342deg);-o-transform: rotate(342deg);transform: rotate(342deg); }to { -webkit-transform: rotate(702deg);-moz-transform: rotate(702deg);-ms-transform: rotate(702deg);-o-transform: rotate(702deg);transform: rotate(702deg); } }@keyframes rotateClockMinute {from { -webkit-transform: rotate(288deg);-moz-transform: rotate(288deg);-ms-transform: rotate(288deg);-o-transform: rotate(288deg);transform: rotate(288deg); }to { -webkit-transform: rotate(648deg);-moz-transform: rotate(648deg);-ms-transform: rotate(648deg);-o-transform: rotate(648deg);transform: rotate(648deg); } }@keyframes rotateClockHour {from { -webkit-transform: rotate(169deg);-moz-transform: rotate(169deg);-ms-transform: rotate(169deg);-o-transform: rotate(169deg);transform: rotate(169deg); }to { -webkit-transform: rotate(529deg);-moz-transform: rotate(529deg);-ms-transform: rotate(529deg);-o-transform: rotate(529deg);transform: rotate(529deg); } }</style>',
          '<text class="text" x="50%" y="30%" dominant-baseline="middle" text-anchor="middle">',
          params.name,
          '</text><text class="text" style="font-size: 2px" x="50%" y="70%" dominant-baseline="middle" text-anchor="middle">UTC+0</text><g class="lines"> <line class="line line-1" x1="50" y1="5" x2="50" y2="10"></line> <line class="line line-2" x1="50" y1="5" x2="50" y2="10"></line> <line class="line line-3" x1="50" y1="5" x2="50" y2="10"></line> <line class="line line-4" x1="50" y1="5" x2="50" y2="10"></line> <line class="line line-5" x1="50" y1="5" x2="50" y2="10"></line> <line class="line line-6" x1="50" y1="5" x2="50" y2="10"></line> <line class="line line-7" x1="50" y1="5" x2="50" y2="10"></line> <line class="line line-8" x1="50" y1="5" x2="50" y2="10"></line> <line class="line line-9" x1="50" y1="5" x2="50" y2="10"></line> <line class="line line-10" x1="50" y1="5" x2="50" y2="10"></line> <line class="line line-11" x1="50" y1="5" x2="50" y2="10"></line> <line class="line line-12" x1="50" y1="5" x2="50" y2="10"></line> </g> <line class="line line-hour" x1="50" y1="25" x2="50" y2="50"></line> <line class="line line-minute" x1="50" y1="10" x2="50" y2="50"></line> <circle class="circle" cx="50" cy="50" r="3"></circle> <g class="line line-second"> <line x1="50" y1="10" x2="50" y2="60"></line> <circle cx="50" cy="50" r="1.5"></circle> </g> </svg>'
        )
      )
    );
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
}
