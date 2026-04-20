/**
 * OpeniBank Educator — MVP curriculum (Phase 1).
 *
 * Authored content for Worlds 1–3 per the design doc §24. Every lesson is
 * short (hook + 2–4 explain paragraphs + 1–2 exercises + safety takeaway)
 * so a motivated user can finish one in 2–4 minutes.
 *
 * All copy is deliberately non-advisory. Safety takeaways are the
 * authoritative learning artifacts; they are NEVER rewritten by the AI
 * tutor.
 */

import type { Badge, World } from '../types'

// ────────────────────────────────────────────────────────────────────
// WORLD 1 — DIGITAL MONEY BASICS
// ────────────────────────────────────────────────────────────────────

const W1: World = {
  id: 'w1-digital-money',
  index: 1,
  title: 'Digital Money Basics',
  tagline: 'Build the mental model for digital ownership.',
  glyph: '🪙',
  accent: '#f0b429',
  levels: [
    {
      id: 'w1-digital-money.l1',
      index: 1,
      title: 'Money and digital ownership',
      summary: 'Why crypto is different from the dollars in your bank app.',
      lessons: [
        {
          id: 'w1-digital-money.l1.lesson1',
          title: 'Bank balance vs. on-chain balance',
          hook: 'Your banking app shows a number. A crypto wallet also shows a number. What is the difference?',
          explain: [
            'A bank balance is a promise from the bank to pay you. The bank keeps the actual record.',
            'An on-chain balance is an entry in a public ledger that anyone can verify, and that only the key holder can move.',
            'That single shift — from promise to cryptographic control — is what makes self-custody possible.',
          ],
          exercises: [
            {
              kind: 'mcq',
              id: 'w1l1q1',
              prompt: 'What makes an on-chain balance fundamentally different from a bank balance?',
              choices: [
                { id: 'a', label: 'It updates faster than a bank' },
                { id: 'b', label: 'A public ledger records it and only the key holder can move it', correct: true },
                { id: 'c', label: 'It is insured by the government' },
                { id: 'd', label: 'It is backed by gold' },
              ],
              explain: 'The decisive difference is cryptographic control, not speed or backing.',
            },
          ],
          safetyTakeaway: 'If you do not control the keys, you do not really hold the asset.',
          reviewTags: ['custody', 'ledger'],
          xp: 10,
        },
        {
          id: 'w1-digital-money.l1.lesson2',
          title: 'What “decentralized” actually means',
          hook: 'Decentralized is the most used — and most misused — word in crypto.',
          explain: [
            'Decentralization means no single party can unilaterally change the rules or freeze your assets.',
            'It is a spectrum, not a binary. Some networks are more decentralized than others.',
            'More decentralization usually means more resilience, but also more responsibility on the user.',
          ],
          exercises: [
            {
              kind: 'tf',
              id: 'w1l1q2',
              prompt: 'A network is either 100% decentralized or not decentralized at all.',
              answer: false,
              explain: 'Decentralization is a spectrum — you judge it by governance, node distribution, and who can pause or roll back.',
            },
          ],
          safetyTakeaway: 'Measure decentralization by who can change the rules, not by marketing claims.',
          reviewTags: ['decentralization'],
          xp: 10,
        },
      ],
    },
    {
      id: 'w1-digital-money.l2',
      index: 2,
      title: 'What is blockchain?',
      summary: 'A shared ledger that everyone checks and no one owns.',
      lessons: [
        {
          id: 'w1-digital-money.l2.lesson1',
          title: 'Blocks, chains, and the point of both',
          hook: 'Why do people call it a “block chain” and not a “database”?',
          explain: [
            'A blockchain groups transactions into blocks, then links each block to the previous one using a cryptographic hash.',
            'Because each link contains a fingerprint of everything before it, changing old history would require rewriting every block after it.',
            'That makes tampering expensive and detectable, which is why the structure matters even when a central party could run it faster.',
          ],
          exercises: [
            {
              kind: 'mcq',
              id: 'w1l2q1',
              prompt: 'What makes a chain of blocks tamper-evident?',
              choices: [
                { id: 'a', label: 'Each block embeds the previous block\u2019s hash', correct: true },
                { id: 'b', label: 'Blocks are stored in encrypted form' },
                { id: 'c', label: 'Only admins can write blocks' },
                { id: 'd', label: 'Blocks have sequence numbers' },
              ],
            },
          ],
          safetyTakeaway: 'The chain part of blockchain is about history that cannot be silently edited.',
          reviewTags: ['blockchain', 'hashing'],
          xp: 10,
        },
      ],
    },
    {
      id: 'w1-digital-money.l3',
      index: 3,
      title: 'Public / private key concept',
      summary: 'One key you share. One you protect with your life.',
      lessons: [
        {
          id: 'w1-digital-money.l3.lesson1',
          title: 'The two keys in every wallet',
          hook: 'Imagine a mailbox: anyone can drop mail in. Only one person has the key to open it.',
          explain: [
            'Your public key (and its shorter form, the address) is the mailbox slot. You can share it freely — it is how others send you funds.',
            'Your private key is the mailbox key. Whoever has it can withdraw everything, so you never share it.',
            'A seed phrase is just a human-readable backup of the private key.',
          ],
          exercises: [
            {
              kind: 'mcq',
              id: 'w1l3q1',
              prompt: 'What is it safe to share?',
              choices: [
                { id: 'a', label: 'Your public address', correct: true },
                { id: 'b', label: 'Your private key' },
                { id: 'c', label: 'Your seed phrase' },
                { id: 'd', label: 'All three' },
              ],
              explain: 'Public addresses are designed to be shared. Private keys and seed phrases are not.',
            },
          ],
          safetyTakeaway: 'Share the public address. Never share the private key or seed phrase.',
          reviewTags: ['keys', 'seed'],
          xp: 12,
        },
      ],
    },
    {
      id: 'w1-digital-money.l4',
      index: 4,
      title: 'What is a crypto wallet?',
      summary: 'A key manager with a pretty UI.',
      lessons: [
        {
          id: 'w1-digital-money.l4.lesson1',
          title: 'A wallet does not hold coins',
          hook: 'A crypto wallet does not store coins the same way a physical wallet stores cash.',
          explain: [
            'Coins live on the blockchain. A wallet app stores the keys that let you move them.',
            'If you delete the app but still have the seed phrase, you can restore access in any compatible wallet.',
            'If you keep the app but lose the seed phrase, you cannot recover the funds — even the app author cannot.',
          ],
          exercises: [
            {
              kind: 'order',
              id: 'w1l4q1',
              prompt: 'Order the steps of getting back into a wallet after losing a phone.',
              steps: [
                'Install a compatible wallet app on the new phone',
                'Enter the seed phrase during setup',
                'Wait for the wallet to derive the addresses',
                'Verify one address matches your records',
              ],
              explain: 'The seed phrase is the master key to recovery — the app is disposable.',
            },
          ],
          safetyTakeaway: 'Control comes from keys, not from the app icon.',
          reviewTags: ['wallet-model', 'recovery'],
          xp: 12,
        },
      ],
    },
    {
      id: 'w1-digital-money.l5',
      index: 5,
      title: 'Networks and tokens',
      summary: 'One address can live on many networks. Not every token is the same as it looks.',
      lessons: [
        {
          id: 'w1-digital-money.l5.lesson1',
          title: 'Same address, different network',
          hook: 'Your Ethereum address also works on many other EVM chains — but the funds on each are separate.',
          explain: [
            'EVM chains (Ethereum, Arbitrum, Optimism, Base, Polygon, BSC) share an address format but each keeps its own ledger.',
            'Sending USDC on Polygon to someone who only watches Ethereum means the funds are still on-chain, just invisible to them until they look at the Polygon ledger.',
            'Bitcoin and Solana use different address formats entirely.',
          ],
          exercises: [
            {
              kind: 'tf',
              id: 'w1l5q1',
              prompt: 'Sending USDC on Polygon to an Ethereum-only viewer means the funds are lost.',
              answer: false,
              explain: 'They are on the Polygon ledger. Switching the viewer to Polygon shows the balance.',
            },
          ],
          safetyTakeaway: 'Always confirm the network before sending — not just the address.',
          reviewTags: ['networks', 'evm'],
          xp: 15,
        },
      ],
    },
  ],
}

// ────────────────────────────────────────────────────────────────────
// WORLD 2 — WALLET BASICS
// ────────────────────────────────────────────────────────────────────

const W2: World = {
  id: 'w2-wallet-basics',
  index: 2,
  title: 'Wallet Basics',
  tagline: 'How wallets work in plain language.',
  glyph: '👛',
  accent: '#45c65a',
  levels: [
    {
      id: 'w2-wallet-basics.l1',
      index: 1,
      title: 'Wallet types',
      summary: 'Custodial, self-custodial, hot, cold.',
      lessons: [
        {
          id: 'w2-wallet-basics.l1.lesson1',
          title: 'Custodial vs. self-custodial',
          hook: 'When you buy crypto on a centralized exchange, is the exchange a wallet?',
          explain: [
            'A custodial wallet is held by a third party who controls the keys. You have a balance; they move the coins.',
            'A self-custodial wallet puts the keys on your device. You move the coins; no one else can.',
            'Both are useful. The trade-off is convenience vs. sovereignty.',
          ],
          exercises: [
            {
              kind: 'mcq',
              id: 'w2l1q1',
              prompt: 'What distinguishes a self-custodial wallet?',
              choices: [
                { id: 'a', label: 'It has a mobile app' },
                { id: 'b', label: 'The user holds the keys', correct: true },
                { id: 'c', label: 'It is free' },
                { id: 'd', label: 'It is only for Bitcoin' },
              ],
            },
          ],
          safetyTakeaway: 'Self-custody means the keys never leave your device.',
          reviewTags: ['custodial', 'self-custody'],
          xp: 10,
        },
        {
          id: 'w2-wallet-basics.l1.lesson2',
          title: 'Hot vs. cold',
          hook: 'The word “cold wallet” gets thrown around a lot. What does it actually mean?',
          explain: [
            'Hot = online. The signing key lives on a device connected to the internet (phone, laptop).',
            'Cold = offline. The signing key lives on a device with no network — usually a hardware wallet or an air-gapped machine.',
            'Cold wallets trade convenience for a much smaller attack surface.',
          ],
          exercises: [
            {
              kind: 'tf',
              id: 'w2l1q2',
              prompt: 'A phone wallet with a strong password is a cold wallet.',
              answer: false,
              explain: 'Cold means offline. A phone connects to the internet even when the screen is off.',
            },
          ],
          safetyTakeaway: 'Use hot wallets for daily spending, cold wallets for long-term holdings.',
          reviewTags: ['hot-cold', 'compartmentalization'],
          xp: 10,
        },
      ],
    },
    {
      id: 'w2-wallet-basics.l2',
      index: 2,
      title: 'Addresses and accounts',
      summary: 'How one seed phrase can generate many addresses.',
      lessons: [
        {
          id: 'w2-wallet-basics.l2.lesson1',
          title: 'Derivation paths in plain English',
          hook: 'You restored your wallet and now you see multiple addresses. Where did they come from?',
          explain: [
            'A seed phrase is a master secret. Wallets derive child keys from it using a recipe called a derivation path.',
            'Different apps sometimes use different paths by default, which is why the same seed can show different balances in different wallets.',
            'Matching the path is how you recover the exact same accounts everywhere.',
          ],
          exercises: [
            {
              kind: 'mcq',
              id: 'w2l2q1',
              prompt: 'You import a seed into a new wallet and the balance is zero. What is the most likely issue?',
              choices: [
                { id: 'a', label: 'The seed is wrong' },
                { id: 'b', label: 'The wallet uses a different derivation path', correct: true },
                { id: 'c', label: 'The coins were stolen' },
                { id: 'd', label: 'The network is down' },
              ],
              explain: 'Before panicking, check the derivation path setting.',
            },
          ],
          safetyTakeaway: 'If balances look wrong after import, check the derivation path before assuming loss.',
          reviewTags: ['derivation', 'recovery'],
          xp: 12,
        },
      ],
    },
    {
      id: 'w2-wallet-basics.l3',
      index: 3,
      title: 'Sending and receiving',
      summary: 'The basic transaction mechanics.',
      lessons: [
        {
          id: 'w2-wallet-basics.l3.lesson1',
          title: 'The anatomy of a send',
          hook: 'Hit send. A few seconds later the receiver sees the funds. What actually happened?',
          explain: [
            'You construct a transaction: from, to, amount, and a fee.',
            'You sign it with your private key, which proves you control the source address.',
            'You broadcast the signed transaction to the network. Miners/validators include it in a block and the state updates.',
          ],
          exercises: [
            {
              kind: 'order',
              id: 'w2l3q1',
              prompt: 'Order the steps of a typical send.',
              steps: [
                'Wallet constructs the transaction (from, to, amount, fee)',
                'User reviews and approves the details',
                'Wallet signs the transaction with the private key',
                'Wallet broadcasts the signed transaction',
                'The network confirms it in a block',
              ],
            },
          ],
          safetyTakeaway: 'Signing is the only step where your key is used. Review carefully before that click.',
          reviewTags: ['send-flow', 'signing'],
          xp: 12,
        },
      ],
    },
    {
      id: 'w2-wallet-basics.l4',
      index: 4,
      title: 'Seed phrase basics',
      summary: 'Why 12–24 random words are the master key.',
      lessons: [
        {
          id: 'w2-wallet-basics.l4.lesson1',
          title: 'What a seed phrase really is',
          hook: 'A row of 12 ordinary words is actually the most dangerous thing in the wallet.',
          explain: [
            'A seed phrase encodes a large random number using a fixed word list (BIP-39).',
            'From that number the wallet derives every private key for every account.',
            'Anyone who types those words into any compatible wallet gets full control.',
          ],
          exercises: [
            {
              kind: 'mcq',
              id: 'w2l4q1',
              prompt: 'Which of these is the SAFEST way to back up a seed phrase?',
              choices: [
                { id: 'a', label: 'Save it in a note-taking app synced to the cloud' },
                { id: 'b', label: 'Email it to yourself' },
                { id: 'c', label: 'Write it on paper and store it offline', correct: true },
                { id: 'd', label: 'Take a photo with your phone' },
              ],
              explain: 'Any cloud / photo / email backup turns the phrase into a hot secret. Paper (or metal) kept offline is safest.',
            },
          ],
          safetyTakeaway: 'Never type your seed phrase into anything that is online.',
          reviewTags: ['seed', 'backup'],
          xp: 15,
        },
      ],
    },
    {
      id: 'w2-wallet-basics.l5',
      index: 5,
      title: 'Wallet setup basics',
      summary: 'What actually happens when you create a wallet.',
      lessons: [
        {
          id: 'w2-wallet-basics.l5.lesson1',
          title: 'A good first-time setup',
          hook: 'You are about to create a new wallet. What are the three things that actually matter?',
          explain: [
            'One: write the seed phrase on paper as it appears — never screenshot, never paste.',
            'Two: set a strong passphrase for the app. This protects against casual theft of the device.',
            'Three: do a tiny test send before trusting the wallet with a meaningful amount.',
          ],
          exercises: [
            {
              kind: 'tf',
              id: 'w2l5q1',
              prompt: 'Doing a test send with a tiny amount before the real one is paranoid and wasteful.',
              answer: false,
              explain: 'It is standard operational hygiene. The fee is tiny compared to a miss-addressed bulk transfer.',
            },
          ],
          safetyTakeaway: 'Paper seed · strong passphrase · test-send first. Always.',
          reviewTags: ['setup', 'hygiene'],
          xp: 15,
        },
      ],
    },
  ],
}

// ────────────────────────────────────────────────────────────────────
// WORLD 3 — WALLET SECURITY
// ────────────────────────────────────────────────────────────────────

const W3: World = {
  id: 'w3-wallet-security',
  index: 3,
  title: 'Wallet Security',
  tagline: 'Make safety second nature.',
  glyph: '🛡️',
  accent: '#ff5d6c',
  levels: [
    {
      id: 'w3-wallet-security.l1',
      index: 1,
      title: 'The golden rules',
      summary: 'The non-negotiables.',
      lessons: [
        {
          id: 'w3-wallet-security.l1.lesson1',
          title: 'Three rules that prevent 90% of losses',
          hook: 'Most wallet losses are not exotic hacks. They are the same three mistakes, over and over.',
          explain: [
            'One: never share your seed phrase — no support agent, no airdrop, no giveaway needs it.',
            'Two: always verify the network and the address before signing.',
            'Three: treat approval signatures as if they were transfers, because they can be.',
          ],
          exercises: [
            {
              kind: 'mcq',
              id: 'w3l1q1',
              prompt: 'Which request from “support” is legitimate?',
              choices: [
                { id: 'a', label: 'Enter your seed phrase to verify ownership' },
                { id: 'b', label: 'Sign a special transaction to unlock your wallet' },
                { id: 'c', label: 'Install a browser extension to re-sync your wallet' },
                { id: 'd', label: 'None of the above', correct: true },
              ],
              explain: 'Real support never asks for seeds, keys, or arbitrary signatures.',
            },
          ],
          safetyTakeaway: 'Anyone asking for your seed phrase is attempting to steal your wallet.',
          reviewTags: ['golden-rules', 'phishing'],
          xp: 20,
        },
      ],
    },
    {
      id: 'w3-wallet-security.l2',
      index: 2,
      title: 'Seed phrase safety',
      summary: 'Where the phrase lives is where your wallet lives.',
      lessons: [
        {
          id: 'w3-wallet-security.l2.lesson1',
          title: 'Safe vs. unsafe seed storage',
          hook: 'You found a clever place to save your seed phrase. Is it actually clever?',
          explain: [
            'Good storage is offline, durable, and only accessible to you.',
            'Paper is fine for modest amounts; metal (stamped or engraved) is resistant to fire and water.',
            'Any storage that touches the internet — screenshots, notes apps, cloud drives, email drafts — is a hot secret, even if passworded.',
          ],
          exercises: [
            {
              kind: 'scenario',
              id: 'w3l2q1',
              prompt: 'Which backup plan is safest?',
              context: 'You need to back up a 12-word seed for the first time.',
              choices: [
                {
                  id: 'a',
                  label: 'Encrypted note in a password manager',
                  outcome: 'risky',
                  explain: 'Convenient, but any breach of the password manager compromises the seed. Better than plaintext, worse than paper/metal.',
                },
                {
                  id: 'b',
                  label: 'Paper in a safe at home',
                  outcome: 'safe',
                  explain: 'Classic, offline, and private. Works well for modest holdings.',
                },
                {
                  id: 'c',
                  label: 'Photo stored in the default phone camera roll',
                  outcome: 'catastrophic',
                  explain: 'Camera rolls sync to cloud by default. One account compromise = total loss.',
                },
                {
                  id: 'd',
                  label: 'Shared with a trusted relative by email',
                  outcome: 'catastrophic',
                  explain: 'Email is archived forever, often on servers you do not control.',
                },
              ],
              correctChoiceId: 'b',
            },
          ],
          safetyTakeaway: 'Offline, durable, and only you know where it is.',
          reviewTags: ['seed', 'backup'],
          xp: 20,
        },
      ],
    },
    {
      id: 'w3-wallet-security.l3',
      index: 3,
      title: 'Scam recognition',
      summary: 'Spot the pattern before the pattern costs you.',
      lessons: [
        {
          id: 'w3-wallet-security.l3.lesson1',
          title: 'Common scam shapes',
          hook: 'Most scams copy a very short list of templates. Learning the templates disarms 95% of them.',
          explain: [
            'Impersonation: a DM or email claims to be from support / dev team / a famous figure, asking for a signature or seed.',
            'Fake airdrop: an unknown token shows up, linking to a site that requests wallet approval to “claim”.',
            'Urgency: time-pressure tactics ("your wallet will be frozen in 15 minutes") designed to skip your verification habits.',
          ],
          exercises: [
            {
              kind: 'mcq',
              id: 'w3l3q1',
              prompt: 'A DM says you won an NFT and links to a site that asks you to "verify ownership" by signing. What is the right move?',
              choices: [
                { id: 'a', label: 'Sign quickly before the offer expires' },
                { id: 'b', label: 'Open the site in incognito and sign with a small wallet' },
                { id: 'c', label: 'Treat it as a scam and do not connect the wallet', correct: true },
                { id: 'd', label: 'Contact the sender for more info' },
              ],
              explain: 'Unsolicited "verify by signing" is the most common wallet-drain pattern.',
            },
          ],
          safetyTakeaway: 'Unsolicited + urgent + sign = scam. Walk away.',
          reviewTags: ['scam', 'phishing', 'airdrop'],
          xp: 25,
        },
      ],
    },
    {
      id: 'w3-wallet-security.l4',
      index: 4,
      title: 'Transaction verification',
      summary: 'The signing moment is where safety lives.',
      lessons: [
        {
          id: 'w3-wallet-security.l4.lesson1',
          title: 'Reading a send confirmation',
          hook: 'When the confirmation pops up, what are the four fields that actually matter?',
          explain: [
            'Chain: are you on the network you intend to be on?',
            'Recipient: does the full address (not just the first 4 characters) match what you expect?',
            'Amount: is the decimal correct? (This is where most human errors live.)',
            'Fee: is it within reason? An absurd fee can indicate a malicious RPC or a stuck nonce.',
          ],
          exercises: [
            {
              kind: 'order',
              id: 'w3l4q1',
              prompt: 'Put verification steps in the right order.',
              steps: [
                'Confirm the chain is the one you expect',
                'Verify the FULL recipient address against your source',
                'Check the amount and decimal placement',
                'Sanity-check the fee',
                'Sign',
              ],
            },
          ],
          safetyTakeaway: 'Every signature: chain, address, amount, fee. In that order.',
          reviewTags: ['verification', 'signing'],
          xp: 20,
        },
      ],
    },
    {
      id: 'w3-wallet-security.l5',
      index: 5,
      title: 'Approval safety',
      summary: 'The most misunderstood wallet action.',
      lessons: [
        {
          id: 'w3-wallet-security.l5.lesson1',
          title: 'Why approvals are different from transfers',
          hook: 'You clicked “Approve” on a DEX. What did you just allow?',
          explain: [
            'An approval lets a smart contract move a specific token on your behalf, up to a limit.',
            'Many wallets default to "unlimited" approval for convenience — convenient for you, and convenient for any later exploit of that contract.',
            'A minimal approval is scoped to the exact amount you are about to spend, and can be revoked afterwards.',
          ],
          exercises: [
            {
              kind: 'scenario',
              id: 'w3l5q1',
              prompt: 'A DEX asks you to approve USDC. It offers "Max" or "Custom". What is the safer default?',
              context: 'You want to swap $100 of USDC.',
              choices: [
                { id: 'a', label: 'Max — it is faster and avoids fees later', outcome: 'risky', explain: 'Max = unlimited. If the router is ever exploited, the attacker can drain your USDC.' },
                { id: 'b', label: 'Custom, set to ~$100', outcome: 'safe', explain: 'Scoped approvals minimize blast radius.' },
                { id: 'c', label: 'Cancel and transfer the USDC to the DEX directly', outcome: 'catastrophic', explain: 'That is not how DEXes work — the funds would be lost.' },
                { id: 'd', label: 'Approve and then immediately revoke to test', outcome: 'risky', explain: 'Two fees and you still had unlimited approval in between.' },
              ],
              correctChoiceId: 'b',
            },
          ],
          safetyTakeaway: 'Approve only what you will spend. Revoke approvals you no longer need.',
          reviewTags: ['approval', 'defi-safety'],
          xp: 25,
        },
      ],
    },
  ],
}

// ────────────────────────────────────────────────────────────────────
// WORLD 4 — TRANSACTIONS AND NETWORKS  (Phase 2)
// ────────────────────────────────────────────────────────────────────

const W4: World = {
  id: 'w4-transactions',
  index: 4,
  title: 'Transactions & Networks',
  tagline: 'How transactions actually move, and how to not lose them.',
  glyph: '⛽',
  accent: '#6c7dff',
  levels: [
    {
      id: 'w4-transactions.l1',
      index: 1,
      title: 'How transactions move',
      summary: 'From signature to final confirmation.',
      lessons: [
        {
          id: 'w4-transactions.l1.lesson1',
          title: 'Signature, mempool, block, finality',
          hook: 'You hit "Send". For a few seconds nothing appears to happen. Where is your money?',
          explain: [
            'A signed transaction is broadcast to the network and sits in the mempool — a waiting room of unconfirmed intents.',
            'Validators pick transactions from the mempool, include them in a block, and confirm them. Only after a number of confirmations is the transaction considered final.',
            'Pending and confirmed are not the same state. A pending transaction can still be dropped, replaced, or fail.',
          ],
          exercises: [
            {
              kind: 'order',
              id: 'w4l1q1',
              prompt: 'Put the transaction lifecycle in order.',
              steps: ['Signed in wallet', 'Broadcast to mempool', 'Included in a block', 'Confirmed / final'],
              explain: 'Every transaction passes through all four stages. Treat it as "done" only at confirmation.',
            },
          ],
          safetyTakeaway: 'A pending transaction is not a completed transaction. Wait for confirmations.',
          reviewTags: ['transactions', 'mempool'],
          xp: 15,
        },
      ],
    },
    {
      id: 'w4-transactions.l2',
      index: 2,
      title: 'Gas and fees',
      summary: 'Paying for the network you use.',
      lessons: [
        {
          id: 'w4-transactions.l2.lesson1',
          title: 'Why fees spike — and what "stuck" really means',
          hook: 'Your swap shows a $40 gas fee. Yesterday it was $2. Nothing about you changed.',
          explain: [
            'Gas price reflects how busy the network is right now. It has nothing to do with how much you are sending.',
            'Setting the gas price too low can leave a transaction sitting in the mempool for hours — or forever.',
            'Most wallets expose slow / normal / fast tiers. "Slow" is fine when you are not in a hurry; "fast" is for when minutes matter.',
          ],
          exercises: [
            {
              kind: 'mcq',
              id: 'w4l2q1',
              prompt: 'A pending swap has been stuck for 20 minutes. What is usually the best safe next step?',
              choices: [
                { id: 'a', label: 'Send the same swap again from a new tab', correct: false },
                { id: 'b', label: 'Use the wallet\'s "speed up" or "cancel" on the same nonce', correct: true },
                { id: 'c', label: 'Transfer the funds to a different address', correct: false },
                { id: 'd', label: 'Restart your computer', correct: false },
              ],
              explain: 'Speed-up / cancel re-broadcasts the same nonce with higher fee — the network accepts the new one and drops the old. Submitting again from a fresh tab risks double-spending intent.',
            },
          ],
          safetyTakeaway: 'If a transaction is stuck, speed it up or cancel on the same nonce. Do not resubmit blindly.',
          reviewTags: ['gas', 'stuck-tx'],
          xp: 20,
        },
      ],
    },
    {
      id: 'w4-transactions.l3',
      index: 3,
      title: 'Network mismatch',
      summary: 'The most common way people lose funds.',
      lessons: [
        {
          id: 'w4-transactions.l3.lesson1',
          title: 'USDC on Ethereum ≠ USDC on Polygon',
          hook: 'Your friend sent you "USDC" from Polygon. You are expecting it in your MetaMask on Ethereum.',
          explain: [
            'The same token ticker can exist on many different networks. Each is a different smart contract on a different chain.',
            'Sending across networks without a bridge does not "find its way" — the funds land on the wrong chain and require a bridge or contract call to retrieve.',
            'Always confirm network, contract address, and token decimals — not just the ticker.',
          ],
          exercises: [
            {
              kind: 'scenario',
              id: 'w4l3q1',
              prompt: 'You are about to receive USDC. Before sharing your address, what do you confirm?',
              context: 'You use the same wallet software on Ethereum, Arbitrum, and Polygon.',
              choices: [
                { id: 'a', label: 'Nothing — USDC is USDC', outcome: 'catastrophic', explain: 'Wrong-chain sends are the #1 cause of permanent loss for new users.' },
                { id: 'b', label: 'Confirm which network the sender is using, and that your wallet is on the same one', outcome: 'safe', explain: 'This is the standard pre-send check.' },
                { id: 'c', label: 'Send a tiny test from the sender first', outcome: 'safe', explain: 'Defensive and cheap — also valid.' },
                { id: 'd', label: 'Ask for a screenshot of their balance', outcome: 'risky', explain: 'Doesn\'t answer the network question, and encourages sharing irrelevant info.' },
              ],
              correctChoiceId: 'b',
            },
          ],
          safetyTakeaway: 'Before every receive, confirm the network. Same ticker on two chains is not the same token.',
          reviewTags: ['network-mismatch', 'transactions'],
          xp: 25,
        },
      ],
    },
  ],
}

// ────────────────────────────────────────────────────────────────────
// WORLD 5 — TOKEN LITERACY  (Phase 2)
// ────────────────────────────────────────────────────────────────────

const W5: World = {
  id: 'w5-token-literacy',
  index: 5,
  title: 'Token Literacy',
  tagline: 'Read tokens without being sold to.',
  glyph: '🎫',
  accent: '#5fb49c',
  levels: [
    {
      id: 'w5-token-literacy.l1',
      index: 1,
      title: 'Native coin vs. token',
      summary: 'Not every asset in your wallet is the same kind of thing.',
      lessons: [
        {
          id: 'w5-token-literacy.l1.lesson1',
          title: 'ETH is not an ERC-20',
          hook: 'Your wallet shows ETH and USDC. Are they the same kind of thing under the hood?',
          explain: [
            'The native coin of a network (ETH, BNB, SOL) is produced by the protocol itself and used to pay fees.',
            'Tokens (USDC, LINK, UNI) live in smart contracts deployed on the network. They are entries in a contract\'s accounting ledger.',
            'Native coin issues and token issues are independent: you can have plenty of USDC and zero ETH — and still not be able to pay gas.',
          ],
          exercises: [
            {
              kind: 'tf',
              id: 'w5l1q1',
              prompt: 'You can always send a token as long as you have enough of that token.',
              answer: false,
              explain: 'You also need the network\'s native coin to pay gas.',
            },
          ],
          safetyTakeaway: 'Keep a small buffer of native coin on every chain you use, or you cannot move anything.',
          reviewTags: ['native-vs-token', 'gas'],
          xp: 15,
        },
      ],
    },
    {
      id: 'w5-token-literacy.l2',
      index: 2,
      title: 'Stablecoins',
      summary: 'Stability depends entirely on who is backing what.',
      lessons: [
        {
          id: 'w5-token-literacy.l2.lesson1',
          title: 'What "stable" actually rests on',
          hook: 'A "stablecoin" that drops from $1.00 to $0.84 overnight is not a bug — it is the structure.',
          explain: [
            'Fiat-backed stablecoins promise 1:1 redemption with reserves held by an issuer. Their risk is issuer solvency and redemption access.',
            'Crypto-collateralized stablecoins are over-collateralized by volatile assets and can de-peg when markets move fast.',
            'Algorithmic stablecoins rely on market behavior to hold the peg — they have a documented history of catastrophic failure.',
          ],
          exercises: [
            {
              kind: 'mcq',
              id: 'w5l2q1',
              prompt: 'Which question matters most when deciding to hold a stablecoin?',
              choices: [
                { id: 'a', label: 'What is its logo?', correct: false },
                { id: 'b', label: 'What is backing it, and can that backing actually be redeemed?', correct: true },
                { id: 'c', label: 'Is it listed on a major exchange?', correct: false },
                { id: 'd', label: 'What does its community think?', correct: false },
              ],
              explain: 'Reserves, redemption mechanism, and the history of the issuer are the actual variables.',
            },
          ],
          safetyTakeaway: 'A stablecoin is only as stable as what backs it. Read the backing, not the marketing.',
          reviewTags: ['stablecoins', 'asset-risk'],
          xp: 20,
        },
      ],
    },
    {
      id: 'w5-token-literacy.l3',
      index: 3,
      title: 'Fake tokens and impersonation',
      summary: 'Anyone can deploy a contract named "USDC".',
      lessons: [
        {
          id: 'w5-token-literacy.l3.lesson1',
          title: 'Contract address > ticker',
          hook: 'Your wallet shows a token called "USDC". Is it real?',
          explain: [
            'Token names and tickers are not unique. Anyone can deploy a contract and name it anything.',
            'The only durable identifier for a token is its contract address on a specific network.',
            'Airdropped "free tokens" that appear unsolicited are often bait to lure you to malicious swap sites.',
          ],
          exercises: [
            {
              kind: 'scenario',
              id: 'w5l3q1',
              prompt: 'A new token appeared in your wallet overnight. It has a familiar name and a 6-figure "value".',
              context: 'You did not buy or bridge it.',
              choices: [
                { id: 'a', label: 'Try to swap it immediately while the price is high', outcome: 'catastrophic', explain: 'The swap site is usually the trap — it asks for a signature that drains real tokens.' },
                { id: 'b', label: 'Ignore it. Do not interact. Mark as spam.', outcome: 'safe', explain: 'Unsolicited airdrops are free to ignore.' },
                { id: 'c', label: 'Send it to a friend', outcome: 'risky', explain: 'Passes the risk along without solving anything.' },
                { id: 'd', label: 'Approve unlimited spending to consolidate', outcome: 'catastrophic', explain: 'Any approval to an unknown contract is high-risk.' },
              ],
              correctChoiceId: 'b',
            },
          ],
          safetyTakeaway: 'If you did not buy it or expect it, do not touch it. Verify by contract address, never by ticker.',
          reviewTags: ['fake-tokens', 'airdrop-trap'],
          xp: 25,
        },
      ],
    },
  ],
}

// ────────────────────────────────────────────────────────────────────
// WORLD 6 — RISK CONTROL BASICS  (Phase 2)
// ────────────────────────────────────────────────────────────────────

const W6: World = {
  id: 'w6-risk-control',
  index: 6,
  title: 'Risk Control Basics',
  tagline: 'Operational and human hygiene — no allocation advice.',
  glyph: '🧭',
  accent: '#e67c4a',
  levels: [
    {
      id: 'w6-risk-control.l1',
      index: 1,
      title: 'Irreversibility',
      summary: 'Crypto mistakes do not have a customer service line.',
      lessons: [
        {
          id: 'w6-risk-control.l1.lesson1',
          title: 'The "no-undo" rule',
          hook: 'You send ETH to the wrong address. What support ticket do you file?',
          explain: [
            'On-chain transactions are final. There is no dispute line, no chargeback, no reversal.',
            'The compensating control is process: verify address and network, start with small amounts, and use address book entries over paste-every-time.',
            'This is different from any web2 experience you are used to. Slow down at the moment of signing — that is the only window.',
          ],
          exercises: [
            {
              kind: 'tf',
              id: 'w6l1q1',
              prompt: 'If you send to the wrong address, you can call the network to reverse it.',
              answer: false,
              explain: 'The protocol has no reversal mechanism. A sent transaction is sent.',
            },
          ],
          safetyTakeaway: 'Treat "Sign" as the last decision point. There is no undo once broadcast.',
          reviewTags: ['irreversibility', 'operational-risk'],
          xp: 15,
        },
      ],
    },
    {
      id: 'w6-risk-control.l2',
      index: 2,
      title: 'Wallet compartments',
      summary: 'Not all eggs in one key.',
      lessons: [
        {
          id: 'w6-risk-control.l2.lesson1',
          title: 'Hot, warm, cold — and why',
          hook: 'A single wallet holding everything is a single point of failure.',
          explain: [
            'A "hot" wallet (day-to-day, online, for small amounts) is convenient but exposed.',
            'A "cold" wallet (hardware, offline most of the time) is for the amounts you cannot afford to lose.',
            'Separating wallets by purpose limits the blast radius of any one mistake or exploit.',
          ],
          exercises: [
            {
              kind: 'mcq',
              id: 'w6l2q1',
              prompt: 'You plan to experiment with a new DEX. Which wallet do you use?',
              choices: [
                { id: 'a', label: 'Your main wallet with life savings', correct: false },
                { id: 'b', label: 'A small dedicated "hot" wallet funded only with what you are willing to risk', correct: true },
                { id: 'c', label: 'A brand new wallet with no transaction history', correct: false },
                { id: 'd', label: 'A friend\'s wallet', correct: false },
              ],
              explain: 'Dedicated hot wallet caps potential loss at a known amount.',
            },
          ],
          safetyTakeaway: 'Use wallets like accounts — separate by purpose, and limit exposure per wallet.',
          reviewTags: ['compartmentalization', 'operational-risk'],
          xp: 20,
        },
      ],
    },
    {
      id: 'w6-risk-control.l3',
      index: 3,
      title: 'Human bias',
      summary: 'FOMO and urgency are engineered against you.',
      lessons: [
        {
          id: 'w6-risk-control.l3.lesson1',
          title: 'Urgency is the adversary\'s best tool',
          hook: '"Offer ends in 3 minutes!" is a red flag, not a feature.',
          explain: [
            'Legitimate financial actions almost never require a decision in seconds. Urgency is a social-engineering pattern.',
            'When you feel rushed, the correct move is to step away for a defined cool-off period and re-read.',
            'Writing your rules down when you are calm means you have them when you are not.',
          ],
          exercises: [
            {
              kind: 'scenario',
              id: 'w6l3q1',
              prompt: 'A group chat insists you sign "right now" or miss a mint.',
              context: 'The link is unfamiliar. Several people are pressuring you in DMs.',
              choices: [
                { id: 'a', label: 'Sign quickly before it sells out', outcome: 'catastrophic', explain: 'Combined pressure + unfamiliar link is a textbook phishing pattern.' },
                { id: 'b', label: 'Close the tab, open the project\'s own site separately, check official socials', outcome: 'safe', explain: 'Your safety rules should work at 2am.' },
                { id: 'c', label: 'Ask the group to explain the contract', outcome: 'risky', explain: 'Attackers will gladly explain anything. Explanations are not verification.' },
                { id: 'd', label: 'Sign with a small wallet first to "test"', outcome: 'risky', explain: 'A malicious signature from a small wallet is still a malicious signature.' },
              ],
              correctChoiceId: 'b',
            },
          ],
          safetyTakeaway: 'When pressured to act in seconds, the correct answer is almost always "no, not right now".',
          reviewTags: ['human-bias', 'phishing'],
          xp: 25,
        },
      ],
    },
  ],
}

// ────────────────────────────────────────────────────────────────────
// WORLD 7 — DEFI SAFETY BASICS  (Phase 3)
// ────────────────────────────────────────────────────────────────────

const W7: World = {
  id: 'w7-defi-safety',
  index: 7,
  title: 'DeFi Safety Basics',
  tagline: 'Use DeFi without becoming a cautionary tale.',
  glyph: '🏦',
  accent: '#9b6bff',
  levels: [
    {
      id: 'w7-defi-safety.l1',
      index: 1,
      title: 'What a DEX actually is',
      summary: 'You are trading against a contract, not an order book.',
      lessons: [
        {
          id: 'w7-defi-safety.l1.lesson1',
          title: 'AMMs in plain language',
          hook: 'A DEX has no order book. So what is on the other side of your trade?',
          explain: [
            'Automated market makers (AMMs) hold pools of two tokens and price trades by a formula, not by matching buyers and sellers.',
            'The bigger your trade relative to the pool, the worse your price — this is called price impact.',
            'Slippage tolerance is how much worse-than-quoted price you are willing to accept. Too high and you become MEV bait; too low and your trade fails.',
          ],
          exercises: [
            {
              kind: 'mcq',
              id: 'w7l1q1',
              prompt: 'You are about to swap a large amount into a thin pool. Which setting matters most?',
              choices: [
                { id: 'a', label: 'Logo color', correct: false },
                { id: 'b', label: 'Slippage tolerance and price impact', correct: true },
                { id: 'c', label: 'Account level', correct: false },
                { id: 'd', label: 'Referral code', correct: false },
              ],
              explain: 'Price impact tells you what the trade will actually cost; slippage is your acceptable error band.',
            },
          ],
          safetyTakeaway: 'On a DEX, check price impact and slippage together. Either alone is not enough.',
          reviewTags: ['dex', 'slippage'],
          xp: 20,
        },
      ],
    },
    {
      id: 'w7-defi-safety.l2',
      index: 2,
      title: 'Smart contract risk',
      summary: 'Code is law — and code has bugs.',
      lessons: [
        {
          id: 'w7-defi-safety.l2.lesson1',
          title: 'Audits, TVL, and why neither saves you',
          hook: '"Audited by a top firm" — what does that actually promise?',
          explain: [
            'An audit is a point-in-time review by a specific team. It reduces risk; it does not eliminate it.',
            'TVL (total value locked) shows popularity, not safety. The biggest protocols have still been exploited.',
            'Time in production, diversity of audits, bug bounty activity, and the team\'s track record matter more than any single badge.',
          ],
          exercises: [
            {
              kind: 'tf',
              id: 'w7l2q1',
              prompt: 'An audited protocol cannot be exploited.',
              answer: false,
              explain: 'History is full of audited protocols that lost hundreds of millions. Audits narrow risk but never prove absence of bugs.',
            },
          ],
          safetyTakeaway: '"Audited" is a data point, not a guarantee. Size positions to what you can afford to lose.',
          reviewTags: ['smart-contract-risk', 'defi-safety'],
          xp: 25,
        },
      ],
    },
    {
      id: 'w7-defi-safety.l3',
      index: 3,
      title: 'DeFi red flags',
      summary: 'The shape of a rug.',
      lessons: [
        {
          id: 'w7-defi-safety.l3.lesson1',
          title: 'Pattern recognition for traps',
          hook: 'Every rug has a family resemblance.',
          explain: [
            'Hallmark red flags: anonymous team with no accountability, promised returns that beat every legitimate market, permissioned functions that let the deployer drain or pause at will, and urgency-driven marketing.',
            'Tools like token explorers and contract readers expose things like "can the owner mint unlimited tokens?" or "is there a hidden pause switch?"',
            'If you cannot answer "how could the deployer steal everything?", you have not done due diligence yet.',
          ],
          exercises: [
            {
              kind: 'scenario',
              id: 'w7l3q1',
              prompt: 'A friend shares a token promising 200% APR with "no risk".',
              context: 'The project launched three days ago. The team is anonymous. The marketing is urgent.',
              choices: [
                { id: 'a', label: 'Commit a large position before it fills', outcome: 'catastrophic', explain: 'All textbook rug-pull markers present.' },
                { id: 'b', label: 'Walk away and study from a distance', outcome: 'safe', explain: 'Nothing legitimate requires speed at this volume.' },
                { id: 'c', label: 'Ask the Discord mods for a guarantee', outcome: 'risky', explain: 'Mods on a new project are not a safety signal.' },
                { id: 'd', label: 'Put in "just a little" without reading the contract', outcome: 'risky', explain: 'Any amount signed into a malicious contract can cascade via approvals.' },
              ],
              correctChoiceId: 'b',
            },
          ],
          safetyTakeaway: 'Anonymous team + unrealistic yield + urgency = do not engage. Walk away.',
          reviewTags: ['defi-red-flags', 'rug-pull'],
          xp: 30,
        },
      ],
    },
  ],
}

// ────────────────────────────────────────────────────────────────────
// WORLD 8 — ADVANCED WALLET OPERATIONS  (Phase 3)
// ────────────────────────────────────────────────────────────────────

const W8: World = {
  id: 'w8-advanced-ops',
  index: 8,
  title: 'Advanced Wallet Operations',
  tagline: 'Hardware, multisig, and a personal security policy.',
  glyph: '🛡️',
  accent: '#3aa3a3',
  levels: [
    {
      id: 'w8-advanced-ops.l1',
      index: 1,
      title: 'Hardware wallets',
      summary: 'Where signing happens matters more than where keys are "stored".',
      lessons: [
        {
          id: 'w8-advanced-ops.l1.lesson1',
          title: 'Signing in isolation',
          hook: 'A hardware wallet is not a fancy USB drive. What does it actually do differently?',
          explain: [
            'A hardware wallet signs transactions on its own chip, so your private key never leaves the device.',
            'Even with a fully compromised computer, a correctly used hardware wallet requires your physical confirmation for every signature.',
            'The weak link is what you confirm on the device screen — always read the destination, amount, and asset on the hardware screen, not the computer screen.',
          ],
          exercises: [
            {
              kind: 'mcq',
              id: 'w8l1q1',
              prompt: 'Which screen do you trust when signing?',
              choices: [
                { id: 'a', label: 'Browser popup', correct: false },
                { id: 'b', label: 'The hardware wallet\'s own display', correct: true },
                { id: 'c', label: 'Whatever the dApp says', correct: false },
                { id: 'd', label: 'A screenshot from Telegram', correct: false },
              ],
              explain: 'Malware can change the browser display. It cannot change the hardware screen.',
            },
          ],
          safetyTakeaway: 'Only trust what you can read on the hardware wallet\'s own display.',
          reviewTags: ['hardware-wallet', 'signing-hygiene'],
          xp: 25,
        },
      ],
    },
    {
      id: 'w8-advanced-ops.l2',
      index: 2,
      title: 'Recovery drills',
      summary: 'A recovery you have not practiced is a recovery you do not have.',
      lessons: [
        {
          id: 'w8-advanced-ops.l2.lesson1',
          title: 'Restore before you need to',
          hook: 'The worst time to discover a bad backup is the moment you need it.',
          explain: [
            'Writing a seed phrase down is step one. Actually restoring a throwaway wallet from that backup, on different hardware, is the test that proves it.',
            'Practicing recovery while calm catches transcription errors, legibility issues, and gaps in your instructions to future you.',
            'Keep the test wallet empty — never restore the real seed on a networked test device.',
          ],
          exercises: [
            {
              kind: 'tf',
              id: 'w8l2q1',
              prompt: 'Once you have written down your seed phrase, you have a working backup.',
              answer: false,
              explain: 'Until you have successfully restored from it, you only have an untested backup.',
            },
          ],
          safetyTakeaway: 'Practice recovery while nothing is wrong. An unpracticed backup is a hope, not a plan.',
          reviewTags: ['recovery', 'seed-phrase'],
          xp: 25,
        },
      ],
    },
    {
      id: 'w8-advanced-ops.l3',
      index: 3,
      title: 'Personal security policy',
      summary: 'Write it down before you need it.',
      lessons: [
        {
          id: 'w8-advanced-ops.l3.lesson1',
          title: 'Your decisions, written in calm',
          hook: 'A personal security policy is a page of rules you wrote for yourself on a calm day.',
          explain: [
            'Typical entries: which wallet holds how much, what is signed only on hardware, who your next-of-kin process is, and what your "never sign" list looks like.',
            'You follow it when you are tired, rushed, or tempted. It is your pre-committed defense against future-you in a worse mood.',
            'Review and revise every few months — it is a living document, not a vow.',
          ],
          exercises: [
            {
              kind: 'order',
              id: 'w8l3q1',
              prompt: 'A sensible policy drafting order.',
              steps: [
                'List what you hold and where',
                'Decide which wallets sign which actions',
                'Write "never sign" rules',
                'Write recovery and inheritance plan',
              ],
              explain: 'Inventory first, then rules that depend on it.',
            },
          ],
          safetyTakeaway: 'A written policy beats in-the-moment judgment every time. Write one, review it, keep it alive.',
          reviewTags: ['security-policy', 'operational-risk'],
          xp: 30,
        },
      ],
    },
  ],
}

// ────────────────────────────────────────────────────────────────────
// WORLD 9 — OPENIBANK WALLET MASTERY  (Phase 3)
// ────────────────────────────────────────────────────────────────────

const W9: World = {
  id: 'w9-openibank-mastery',
  index: 9,
  title: 'OpeniBank Wallet Mastery',
  tagline: 'Use the iBank desktop safely and well.',
  glyph: '🏛️',
  accent: '#f0b429',
  levels: [
    {
      id: 'w9-openibank-mastery.l1',
      index: 1,
      title: 'iBank navigation',
      summary: 'Where things live and why.',
      lessons: [
        {
          id: 'w9-openibank-mastery.l1.lesson1',
          title: 'The safe-by-default tour',
          hook: 'Where is your balance, your history, and your alert controls?',
          explain: [
            'The sidebar groups features by intent: Chat and Educator for learning, Wallet for self-custody, Portfolio for overview, Settings for the policy you set on yourself.',
            'Every destructive action (send, approve, network switch) surfaces a confirmation layer with a plain-English summary, not just raw hex.',
            'The Educator is always one click away — if anything in the wallet is unfamiliar, open the matching micro-lesson.',
          ],
          exercises: [
            {
              kind: 'tf',
              id: 'w9l1q1',
              prompt: 'Destructive actions in iBank can be triggered with a single click and no review.',
              answer: false,
              explain: 'Every destructive action surfaces a review step. Read it.',
            },
          ],
          safetyTakeaway: 'Slow down at every iBank review step — they exist exactly to protect your future self.',
          reviewTags: ['openibank', 'ux-flow'],
          xp: 15,
        },
      ],
    },
    {
      id: 'w9-openibank-mastery.l2',
      index: 2,
      title: 'Alerts and monitoring',
      summary: 'Know when something changes before it hurts.',
      lessons: [
        {
          id: 'w9-openibank-mastery.l2.lesson1',
          title: 'Alerts that are worth enabling',
          hook: 'What should actually notify you?',
          explain: [
            'Useful defaults: large outgoing transfers, new token approvals, network changes, and failed transactions.',
            'Skip noise-generating alerts (every incoming token) — they train you to dismiss notifications reflexively, which is exactly what you do not want during a real incident.',
            'Treat alerts as the condition to re-open your security policy, not to act immediately.',
          ],
          exercises: [
            {
              kind: 'mcq',
              id: 'w9l2q1',
              prompt: 'Which alert is most worth keeping on?',
              choices: [
                { id: 'a', label: 'Every incoming token, including dust', correct: false },
                { id: 'b', label: 'New approvals from any connected dApp', correct: true },
                { id: 'c', label: 'Daily price of your holdings', correct: false },
                { id: 'd', label: 'Newsletter digest', correct: false },
              ],
              explain: 'Approvals are the highest-leverage action against your wallet — the one worth knowing about immediately.',
            },
          ],
          safetyTakeaway: 'Enable alerts that are rare and high-signal. Disable everything that trains you to ignore notifications.',
          reviewTags: ['alerts', 'openibank'],
          xp: 20,
        },
      ],
    },
    {
      id: 'w9-openibank-mastery.l3',
      index: 3,
      title: 'Exports and record hygiene',
      summary: 'Good records are a compliance and a recovery tool.',
      lessons: [
        {
          id: 'w9-openibank-mastery.l3.lesson1',
          title: 'What to export, what to keep, what to shred',
          hook: 'Your wallet history is going to matter at tax time — or if something goes wrong.',
          explain: [
            'Export transaction history regularly in a format you control (CSV). Do not rely on any service remaining available.',
            'Keep addresses, dates, amounts, fees, and counterparties. Do not keep screenshots of seed phrases, passphrases, or live keys — ever.',
            'Encrypt stored exports. Know where the exports are. Include them in your security policy.',
          ],
          exercises: [
            {
              kind: 'scenario',
              id: 'w9l3q1',
              prompt: 'You want to keep a personal ledger of your on-chain activity.',
              context: 'You use iBank daily across two chains.',
              choices: [
                { id: 'a', label: 'Save screenshots including your seed phrase for backup', outcome: 'catastrophic', explain: 'Never screenshot a seed phrase — it bypasses every isolation you have.' },
                { id: 'b', label: 'Export CSVs periodically, encrypted, into a location you control', outcome: 'safe', explain: 'Portable, reviewable, independent of any one service.' },
                { id: 'c', label: 'Only trust the third-party explorer\'s retention', outcome: 'risky', explain: 'Services come and go. Explorer history can reshape or disappear.' },
                { id: 'd', label: 'Email your seed phrase to yourself "just in case"', outcome: 'catastrophic', explain: 'Email is the worst possible place for a seed phrase.' },
              ],
              correctChoiceId: 'b',
            },
          ],
          safetyTakeaway: 'Keep encrypted CSV exports under your control. Never store a seed phrase on anything networked.',
          reviewTags: ['record-hygiene', 'openibank'],
          xp: 30,
        },
      ],
    },
  ],
}

export const WORLDS: World[] = [W1, W2, W3, W4, W5, W6, W7, W8, W9]

export function getLessonById(id: string) {
  for (const world of WORLDS) {
    for (const level of world.levels) {
      const lesson = level.lessons.find((l) => l.id === id)
      if (lesson) return { world, level, lesson }
    }
  }
  return null
}

export function getLevelById(id: string) {
  for (const world of WORLDS) {
    for (const level of world.levels) {
      if (level.id === id) return { world, level }
    }
  }
  return null
}

export function allLessons() {
  return WORLDS.flatMap((w) => w.levels.flatMap((lv) => lv.lessons.map((l) => ({ world: w, level: lv, lesson: l }))))
}

// ── Badges ─────────────────────────────────────────────────────────────

export const BADGES: Badge[] = [
  {
    id: 'wallet-builder',
    label: 'Wallet Builder',
    glyph: '🧱',
    description: 'Completed all of World 1 — Digital Money Basics.',
    earned: (p) => W1.levels.flatMap((l) => l.lessons).every((l) => p.lessons[l.id]?.firstCompletedAt),
  },
  {
    id: 'seed-phrase-guardian',
    label: 'Seed Phrase Guardian',
    glyph: '🔐',
    description: 'Completed Seed phrase safety in World 3.',
    earned: (p) => !!p.lessons['w3-wallet-security.l2.lesson1']?.firstCompletedAt,
  },
  {
    id: 'scam-spotter',
    label: 'Scam Spotter',
    glyph: '🕵️',
    description: 'Cleared the Scam recognition lesson with no retries.',
    earned: (p) => {
      const lp = p.lessons['w3-wallet-security.l3.lesson1']
      return !!lp?.firstCompletedAt && lp.missedExerciseIds.length === 0
    },
  },
  {
    id: 'safe-signer',
    label: 'Safe Signer',
    glyph: '✒️',
    description: 'Completed Transaction verification and Approval safety.',
    earned: (p) =>
      !!p.lessons['w3-wallet-security.l4.lesson1']?.firstCompletedAt &&
      !!p.lessons['w3-wallet-security.l5.lesson1']?.firstCompletedAt,
  },
  {
    id: 'gas-explorer',
    label: 'Gas Explorer',
    glyph: '⛽',
    description: 'Completed the Transactions & Networks world.',
    earned: (p) => W4.levels.flatMap((l) => l.lessons).every((l) => p.lessons[l.id]?.firstCompletedAt),
  },
  {
    id: 'defi-cautious-explorer',
    label: 'DeFi Cautious Explorer',
    glyph: '🏦',
    description: 'Cleared every DeFi Safety lesson — you know what a rug looks like.',
    earned: (p) => W7.levels.flatMap((l) => l.lessons).every((l) => p.lessons[l.id]?.firstCompletedAt),
  },
  {
    id: 'ibank-wallet-ready',
    label: 'iBank Wallet Ready',
    glyph: '🎓',
    description: 'Finished every world — you are ready to use the iBank wallet end-to-end.',
    earned: (p) => WORLDS.flatMap((w) => w.levels.flatMap((l) => l.lessons)).every((l) => p.lessons[l.id]?.firstCompletedAt),
  },
]
