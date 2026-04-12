# Let's Build a Web of Trust for Hive Onboarding

## Opening — Hive's Social Proof Advantage

- Hive already has something most chains don't: real social proof baked into onboarding
- Hive's differentiator vs other networks is this organic social layer — let's make it a formal, on-chain signal
- Key point: this isn't about fixing a broken system or catching bad actors. It's about **capitalizing on what already works** and scaling it up
- Introduce the examples below as evidence — "look at what's already happening across the ecosystem"

### CheckInWithXYZ — Selfies, Geolocation, Real-World Relationships

- [@agathanos](https://hive.blog/hive-173115/@agathanos/checkin-efd251em) — tattoo artist in Sao Paulo, onboarded by @blessskateshop. Met through a real-world tattoo event. Selfie + geolocation proving physical presence.

![agathanos intro selfie](https://images.hive.blog/DQmYdXw4C1CAkEujpKWFVVjAaSxEoqCJhx3x8mvr7sUK8dx/image-1773529546847.jpg)

- [@zerorulez](https://hive.blog/hive-173115/@zerorulez/checkin-tizb1yp5) — onboarded by @blessskateshop. Post describes skateboarding together on a Sunday. Geolocation puts both in the same spot.

![zerorulez intro selfie](https://images.hive.blog/DQmerj4CDjsti5RUpjmQzkE6Tu9WWad9fKbvcbBvczqpH31/image-1771779802821.jpg)

- [@josiefoster](https://hive.blog/hive-132463/@josiefoster/checkin-6y6dit29) — onboarded by @ninaeatshere (Hive Hub Guatemala). Met while working at Del Lago, Lake Atitlan.

![josiefoster intro selfie](https://images.hive.blog/DQmaVrGg5SUFLGUKxTQnBqH6arSTePKuZdRGCiqZR6iMWpk/image-1766347656089.jpg)

- Point to make: CheckIn bakes social proof into the onboarding flow itself — selfie, location, named onboarder, all on-chain

### OCD Onboarding Program — Institutional Welcome Layer

- [@food.passion.fun](https://hive.blog/hive-174578/@food.passion.fun/my-introduction-soujanya) — onboarded by @bighungrypanda. OCD team member @lovesniper officially welcomed. 172 upvotes.

![food.passion.fun intro](https://files.peakd.com/file/peakd-hive/food.passion.fun/23x155ULB39UMHR7rCzFUhC5Sc9a3SMPkmCjDmJRujt6NFNcWVm71B6v9JnGE8iXiXCmY.jpg)

- [@itsmiessyonpeakd](https://hive.blog/hive-174578/@itsmiessyonpeakd/oh-hej-there) — onboarded by @purepinay. OCD team member @macchiata welcomed. $19.68 payout.

![itsmiessyonpeakd intro](https://files.peakd.com/file/peakd-hive/itsmiessyonpeakd/23vsJF4Dck3DdQUPfCLiJdNA2NwrdGAKnrtwXqhvmihuxjuYo11najYK6fVuSmQJyjmyN.jpg)

- Point to make: OCD adds an institutional layer — team members verify and welcome, community rallies around the intro post

### Regional Communities — Peer-to-Peer Chain Onboarding

- [@ijelady](https://hive.blog/hive-174578/@ijelady/this-is-my-introduction-post-on-hive-blog) — onboarded by @fokusnow (Nigeria). **Photo of onboarder and onboardee together.** She then went on to onboard 20+ people herself — trust propagation in action.

![ijelady and fokusnow together](https://images.hive.blog/DQmf6bD8i4XwLYhMQDGD9ihbhVX3pmiZXX9nX8rFPxJrVou/IMG_20221102_172225.jpg)

- [@rovii](https://hive.blog/introduceyourself/@rovii/hello-hive-im-here-enpt) — onboarded by @michupa (HiveBR). Childhood best friend. Photo from 2015 showing their history. 662 votes, $74.23 payout.

![rovii intro](https://files.peakd.com/file/peakd-hive/rovii/23xL2zt2MNFcaLpjj4VMSqgeWiwBKyMPdeQ7EjjLBZLGFXd6boacLi8xZKekcVrkvgZAa.png)

- [@peacious](https://hive.blog/hive-174578/@peacious/my-introduction-to-hive) — onboarded by @merit.ahama (Nigeria/Dreemport). 275 votes, active community engagement.

![peacious intro](https://files.peakd.com/file/peakd-hive/peacious/23wX9nX84A9rPwXmYzEuQhoC3ZdwT3XHDiCx4Ki6jEgVjf4tqAdKBx99PwGH8V1gLUjjn.jpg)

- Point to make: the strongest onboarding happens through real relationships in regional communities — and it chains (onboardees become onboarders)

### The Takeaway

- This social proof already exists across multiple projects, regions, and formats
- But it's informal, scattered, and not composable — you can't query it, weight it, or build on top of it
- What if we could take all of this and make it into a **formal, on-chain signal** that the whole ecosystem can use?

## The Proposal — A Community Trust Layer for Onboarders

- Proposing a simple web of trust through [HiveInvite.com](https://hiveinvite.com)
- Core mechanic: any Hive stakeholder can publicly declare trust in an onboarder, recorded on-chain via `custom_json`
- No committees, no applications, no gatekeepers — just community vouching
- This takes the social proof that already exists informally and makes it **transparent, measurable, and composable**
- Framing: this is a proposal to the community, inviting participation and buy-in — not announcing a finished thing

<!-- TODO: Screenshot of the trust UI on hiveinvite.com -->

## How It Works

- `custom_json` with ID `swarm_trust`
  - **Declare trust**: `{"trust": "onboarder_account"}`
  - **Revoke trust**: `{"revoke": "onboarder_account"}`
- Trust propagates through degrees:
  - Direct = full weight
  - 2nd degree = half
  - 3rd degree = quarter
  - This lets the network scale without everyone evaluating every onboarder
- Weight is proportional to Hive Power — skin in the game, not popularity
- Revocation is immediate if someone turns out to be a bad actor

<!-- TODO: Diagram showing trust propagation through degrees -->

## Try It Now — Call to Action

- Link: **[hiveinvite.com/trust/](https://hiveinvite.com/trust/)**
- What you can do:
  - Declare trust in onboarders you know
  - See who you currently trust
  - Explore the downstream trust tree
- Takes ~30 seconds with Hive Keychain

<!-- TODO: Screenshot or GIF of the trust declaration flow -->

## Why This Matters — What It Powers

- This trust layer is the foundation for an upcoming onboarding incentive system on HiveInvite.com
- Tease without over-promising: community trust signals will directly influence how onboarding support is allocated
- The more robust the trust graph at launch, the better the system works from day one
- Frame it as: let's formalize the social proof Hive already has, so it can do more work

## Who Should Participate?

- Hive stakeholders who care about network growth
- Think about:
  - Onboarders who bring in real humans that stick around
  - Community leaders running onboarding programs (meetups, regional groups, educational initiatives)
  - Projects and tools that facilitate onboarding
- You don't need to trust everyone — a few well-placed declarations from engaged stakeholders create a meaningful graph

## Closing — CTA Recap

- Steps:
  1. Go to [hiveinvite.com/trust/](https://hiveinvite.com/trust/)
  2. Think about which onboarders you trust
  3. Declare that trust on-chain
- Invite feedback in comments — this is a proposal, not a decree; community input shapes it

---

*Questions, feedback, or ideas? Drop a comment below.*
