// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/utils/Strings.sol";
import "@openzeppelin/contracts-v4/utils/Base64.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverNFTDescriptor.sol";
import "../../interfaces/INXMMaster.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IERC20Detailed.sol";
import "../../libraries/DateTime.sol";
import "./CoverNFT.sol";

contract CoverNFTDescriptor {
  using Strings for uint;
  using DateTime for uint;

  INXMMaster immutable public master;

  constructor(INXMMaster _master) {
    master = _master;
  }

  function getAssetSymbol(uint assetId) public view returns (string memory assetSymbol) {
    if (assetId == 0) { return "ETH"; }
    IPool pool = IPool(master.getLatestAddress("P1"));
    Asset memory asset = pool.getAsset(assetId);
    assetSymbol = IERC20Detailed(asset.assetAddress).symbol();
  }

  function tokenURI(CoverTokenURIParams calldata params) public view returns (string memory) {

    string memory image = Base64.encode(bytes(generateSVGImage(params)));

    return string(
      abi.encodePacked(
        "data:application/json;base64,",
        Base64.encode(
          bytes(
            abi.encodePacked(
              '{"name":"', params.name, '",',
              '"description":"', generateDescription(params), '",',
              '"image": "',
              'data:image/svg+xml;base64,',
              image,
              '"}'
            )
          )
        )
      )
    );
  }

  function generateDescription(CoverTokenURIParams calldata params) public view returns (string memory) {
    ICover cover = ICover(master.getLatestAddress("CO"));

    if (cover.coverDataCount() < params.tokenId) {
      return "This NFT does not exist";
    }

    // Get cover data
    CoverData memory coverData = cover.coverData(params.tokenId);
    string memory productName = cover.productNames(coverData.productId);
    CoverSegment memory lastSegment = cover.coverSegmentWithRemainingAmount(params.tokenId, cover.coverSegmentsCount(params.tokenId) - 1);

    // Calculate expiry date and format it
    uint expiryTimestamp = lastSegment.start + lastSegment.period;
    (uint year, uint month, uint day) = expiryTimestamp.timestampToDate();
    string memory expiry = string(
    abi.encodePacked(
        month.getMonthString(), " ", addZeroPrefix(day), " ", year.toString()
      )
    );

    // Check if cover has already expired
    string memory expiryMessage;
    if (expiryTimestamp <= block.timestamp) {
      expiryMessage = "This cover NFT has already expired";
    }

    // Get token symbol (returns 'ETH' for ether)
    string memory assetSymbol = getAssetSymbol(coverData.coverAsset);

    // Encode final description
    string memory description = string(
      abi.encodePacked(
        "This NFT represents a cover purchase made for: ", productName,
        " \\nAmount Covered: ", uint(lastSegment.amount).toString(), " ", assetSymbol,
        " \\nExpiry Date: ", expiry,
        " \\n", expiryMessage
      )
    );

    return description;
  }

  // If value is single digit, add a zero prefix
  function addZeroPrefix(uint256 value) public pure returns (string memory) {
    if (value < 10) {
      return string(abi.encodePacked("0", value.toString()));
    }
    return value.toString();
  }

  function generateSVGImage(CoverTokenURIParams calldata params) public pure returns (bytes memory) {
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

}
