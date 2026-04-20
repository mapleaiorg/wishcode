/**
 * OpeniBank Educator — practice scenarios.
 *
 * Small, high-signal wallet-safety drills the user runs from the
 * Practice tab. Each scenario is authored as a ScenarioExercise so it
 * can be plugged into ScenarioPlayer. Every wrong option has an
 * outcome (safe | risky | catastrophic) so the learner sees the
 * consequence immediately.
 */

import type { Scenario } from '../types'

export const SCENARIOS: Scenario[] = [
  {
    id: 'scn-phishing-support',
    topic: 'fake-support',
    title: 'Fake wallet support DM',
    summary: 'A "support agent" DMs you after you tweeted about a stuck transaction.',
    reinforceLesson: 'w3-wallet-security.l3.lesson1',
    exercise: {
      kind: 'scenario',
      id: 'scn-phishing-support.q1',
      prompt: 'What is the safest response?',
      context:
        'You tweeted asking for help. Minutes later a verified-looking account DMs you: "Hi! I\'m from Wallet Support. To unstick your tx I\'ll need your 12-word recovery phrase so I can re-sync your wallet."',
      choices: [
        {
          id: 'a',
          label: 'Send the phrase — they are verified.',
          outcome: 'catastrophic',
          explain: 'There is no legitimate reason anyone needs your seed phrase. You would lose every asset in that wallet.',
        },
        {
          id: 'b',
          label: 'Ignore, block, and report the account.',
          outcome: 'safe',
          explain: 'Correct. Real support never asks for seed phrases. This is a textbook phishing attempt.',
        },
        {
          id: 'c',
          label: 'Ask them to prove they are real first, then send.',
          outcome: 'catastrophic',
          explain: 'Any "proof" they provide is fake. If you send the phrase for any reason, you are drained.',
        },
        {
          id: 'd',
          label: 'Send just the first 6 words to test.',
          outcome: 'catastrophic',
          explain: 'Partial phrases still reduce brute-force difficulty massively. Never share any part of the phrase.',
        },
      ],
      correctChoiceId: 'b',
      explain: 'Gold rule: seed phrase NEVER leaves the secure place you wrote it down.',
    },
  },

  {
    id: 'scn-approval-unlimited',
    topic: 'approval',
    title: 'Unlimited approval prompt',
    summary: 'A DEX asks to approve your USDC. Max vs. custom amount.',
    reinforceLesson: 'w3-wallet-security.l5.lesson1',
    exercise: {
      kind: 'scenario',
      id: 'scn-approval-unlimited.q1',
      prompt: 'You want to swap ~$100 of USDC. Which approval is safer?',
      context: 'The wallet shows an "Approve USDC" prompt with two suggestions: Max and Custom.',
      choices: [
        {
          id: 'a',
          label: 'Approve Max — avoids prompting again next time.',
          outcome: 'risky',
          explain: 'Unlimited approvals are the #1 drain vector for DeFi users.',
        },
        {
          id: 'b',
          label: 'Approve Custom, set to ~$100.',
          outcome: 'safe',
          explain: 'Scoped approvals mean that even if the router is exploited, only ~$100 is at risk.',
        },
        {
          id: 'c',
          label: 'Reject, then transfer USDC to the DEX contract address directly.',
          outcome: 'catastrophic',
          explain: 'Direct transfers to contracts are usually unrecoverable. DEXes require approvals + swaps, not raw transfers.',
        },
        {
          id: 'd',
          label: 'Approve Max once, then use revoke.cash later.',
          outcome: 'risky',
          explain: 'Between approving and revoking, an exploit can still drain you. Scope first, revoke still.',
        },
      ],
      correctChoiceId: 'b',
      explain: 'Approve only what you will actually spend. Revoke approvals you no longer need.',
    },
  },

  {
    id: 'scn-network-mismatch',
    topic: 'network-mismatch',
    title: 'Wrong-network transfer',
    summary: 'A friend sends you USDC on a different chain.',
    reinforceLesson: 'w2-wallet-basics.l3.lesson1',
    exercise: {
      kind: 'scenario',
      id: 'scn-network-mismatch.q1',
      prompt: 'What is the safe move?',
      context:
        'You gave a friend your Ethereum USDC address. They reply: "Sent $200 USDC — but on BNB Chain, is that okay?"',
      choices: [
        {
          id: 'a',
          label: 'Say yes — an address is an address.',
          outcome: 'risky',
          explain: 'Same-address EVM cross-chain receives usually work, but the USDC token contract is different on each chain. The "USDC" you receive on BNB is a different token.',
        },
        {
          id: 'b',
          label: 'Confirm the receive, then treat the BNB-USDC as a separate asset requiring a bridge to reach Ethereum.',
          outcome: 'safe',
          explain: 'Correct. You can access it because you own the private key on both chains, but bridging has its own fees and risks.',
        },
        {
          id: 'c',
          label: 'Ask them to send it again on Ethereum, then keep both.',
          outcome: 'risky',
          explain: 'That doubles their cost and doesn\'t solve the issue — the BNB-USDC is still there to manage.',
        },
        {
          id: 'd',
          label: 'Tell them the funds are gone forever.',
          outcome: 'risky',
          explain: 'Not necessarily — for EVM chains you usually control the same address. But non-EVM chains (Solana, Bitcoin) are a different story.',
        },
      ],
      correctChoiceId: 'b',
      explain: 'EVM addresses are the same across chains, but tokens are chain-specific contracts. Always confirm network.',
    },
  },

  {
    id: 'scn-seed-photo',
    topic: 'seed-phrase',
    title: 'Backing up a new seed phrase',
    summary: 'You just generated a wallet. What do you do with the 12 words?',
    reinforceLesson: 'w2-wallet-basics.l4.lesson1',
    exercise: {
      kind: 'scenario',
      id: 'scn-seed-photo.q1',
      prompt: 'Pick the safest backup.',
      context: 'Your new wallet shows 12 words and a button "I have written these down."',
      choices: [
        {
          id: 'a',
          label: 'Screenshot the words and save to iCloud Photos.',
          outcome: 'catastrophic',
          explain: 'Any cloud sync — photos, notes, drive — puts the phrase on a server. If that account is ever breached, you are drained.',
        },
        {
          id: 'b',
          label: 'Write the words on paper and store them somewhere only you can reach.',
          outcome: 'safe',
          explain: 'Offline, physical backup. For larger balances, engrave onto metal to survive fire/water.',
        },
        {
          id: 'c',
          label: 'Email them to yourself so you never lose them.',
          outcome: 'catastrophic',
          explain: 'Email is one breach away from total loss. Never commit a seed phrase to any networked channel.',
        },
        {
          id: 'd',
          label: 'Save in a password manager note.',
          outcome: 'risky',
          explain: 'Better than plaintext cloud, but a single credential compromise exposes everything. Paper/metal is the gold standard for seeds.',
        },
      ],
      correctChoiceId: 'b',
      explain: 'A seed phrase protects every asset in that wallet. Treat it like the key to a vault — offline, private, redundant.',
    },
  },

  {
    id: 'scn-fake-airdrop',
    topic: 'fake-airdrop',
    title: 'Unexpected "airdrop" NFT',
    summary: 'A random NFT appears in your wallet with a link.',
    reinforceLesson: 'w3-wallet-security.l3.lesson1',
    exercise: {
      kind: 'scenario',
      id: 'scn-fake-airdrop.q1',
      prompt: 'What should you do?',
      context:
        'Your wallet suddenly shows a shiny NFT you never bought. Its description links to a site promising a $500 token claim.',
      choices: [
        {
          id: 'a',
          label: 'Connect wallet, claim, sell for profit.',
          outcome: 'catastrophic',
          explain: 'Classic drainer. The "claim" is a malicious signature that sweeps your wallet.',
        },
        {
          id: 'b',
          label: 'Ignore the NFT. Hide it from view. Never click the link.',
          outcome: 'safe',
          explain: 'Correct. Unsolicited airdrops from unknown sources are almost always phishing bait.',
        },
        {
          id: 'c',
          label: 'Send the NFT to a burn address so it can\'t hurt you.',
          outcome: 'risky',
          explain: 'Sending the NFT requires signing, which is fine, but the risk was always clicking the link — not the NFT itself.',
        },
        {
          id: 'd',
          label: 'Forward to a friend for their opinion.',
          outcome: 'risky',
          explain: 'You are transferring the phishing vector to someone else. Teach them; don\'t forward.',
        },
      ],
      correctChoiceId: 'b',
      explain: 'If you did not expect it, do not interact with it. Drainers weaponize curiosity.',
    },
  },
]

export function getScenarioById(id: string) {
  return SCENARIOS.find((s) => s.id === id) ?? null
}
