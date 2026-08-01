import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  GovernancePlainReferendumFinalityStore,
  assertGovernancePlainReferendumBallotBinding,
  assertGovernancePlainReferendumBallotDraft,
  assertGovernancePlainReferendumTrustedSender,
  fetchGovernancePlainReferendumContract,
  governancePlainReferendumCanonicalSha256,
  governancePlainReferendumFinalityMarkerPath,
  governancePlainReferendumFinalityObservationPath,
  governancePlainReferendumFinalityPath,
  loadGovernancePlainReferendumSource,
  parseGovernancePlainReferendumContract,
  parseGovernancePlainReferendumSource,
} from "../electron/governancePlainReferendum";
import { secureWriteBoundedFile } from "../electron/secureBoundedJson";

const CHAIN_ID = "fc56984b-2be7-431d-840e-21514d1883f0";
const GENESIS_HASH =
  "884b61c61f56dcddceee7aa3dc1deb89fb8552576d02b01a1b7af9ae7fd5ff7a";
const OPERATOR = "testuﾛ1NﾐヱﾇCﾍUovﾏﾊｺｸﾛJbｵVtﾍykRﾗﾊhﾄﾏKqTjUｺwﾒrym3GS93U";
const VOTER = "testuﾛ1PCtﾅHﾁsﾊｺﾐ7aqﾛｶ3ｷｲﾁfWﾚUMFﾅBﾁFﾗUﾁ4yｶB9ﾕUNBQ4BL";
const digest = (label: string) =>
  createHash("sha256").update(label, "utf8").digest("hex");
const PROPOSAL_ID = digest("validation-fee-policy-proposal");
const canonicalTemporaryDirectory = (prefix: string): string =>
  realpathSync.native(mkdtempSync(join(tmpdir(), prefix)));

const sourceFixture = () => ({
  schema: "sora.wallet.governance-referendum-source.v1",
  chainId: CHAIN_ID,
  networkPrefix: 369,
  genesisHash: GENESIS_HASH,
  descriptorUrl:
    "https://cbsi-core.soramitsu.io/governance/plain-referendum/current.json",
  artifactBaseUrl:
    "https://cbsi-core.soramitsu.io/governance/plain-referendum/artifacts",
});

const contractFixture = (options: { checkpoint?: string } = {}) => {
  const accounts = [OPERATOR, VOTER];
  const inputsSha256 = digest("reviewed-governance-inputs");
  const rosterHash = governancePlainReferendumCanonicalSha256({
    schema: "taira.governance-eligible-citizens.v1",
    chain_id: CHAIN_ID,
    genesis_hash: GENESIS_HASH,
    accounts,
  });
  const postParliamentRegistrationGate = {
    schema: "taira.governance-post-parliament-registration-gate.v1",
    chain_id: CHAIN_ID,
    genesis_hash: GENESIS_HASH,
    inputs_sha256: inputsSha256,
    proposal_id: PROPOSAL_ID,
    referendum_id: PROPOSAL_ID,
    referendum_window: { lower: "701", upper: "4300" },
    mode: "Plain",
    operator_account_id: OPERATOR,
    eligible_citizen_roster_sha256: rosterHash,
    gate_height: "625",
    gate_observation_sequence: "8",
    network_checkpoint_sha256: digest("gate-checkpoint"),
    parliament_snapshot_sha256: digest("parliament-snapshot"),
    approved_body_progress_sha256: digest("approved-body-progress"),
  };
  const snapshot = {
    schema: "taira.governance-eligible-citizen-snapshot.v1",
    chain_id: CHAIN_ID,
    genesis_hash: GENESIS_HASH,
    inputs_sha256: inputsSha256,
    proposal_id: PROPOSAL_ID,
    referendum_id: PROPOSAL_ID,
    referendum_window: { lower: "701", upper: "4300" },
    mode: "Plain",
    post_parliament_registration_gate: postParliamentRegistrationGate,
    eligible_citizen_roster_sha256: rosterHash,
    eligible_citizen_count: "2",
    eligible_citizens: [
      { account_id: OPERATOR, amount: "10000", bonded_height: "600" },
      { account_id: VOTER, amount: "10000", bonded_height: "650" },
    ],
    snapshot_finalized_height: "700",
    snapshot_observation_sequence: "9",
    network_checkpoint_sha256: options.checkpoint ?? digest("checkpoint"),
  };
  return {
    ...snapshot,
    schema: "sora.parliament.plain-referendum.v2",
    eligible_citizen_snapshot_sha256:
      governancePlainReferendumCanonicalSha256(snapshot),
    plain_electorate: {
      rules: {
        voting_asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
        bond_escrow_account: OPERATOR,
        slash_receiver_account: VOTER,
        ballot_amount: "150",
        ballot_duration_blocks: "3600",
        citizenship_amount: "10000",
        max_members: "256",
        conviction_step_blocks: "100",
        max_conviction: "6",
        min_turnout: "1",
        approval_threshold_numerator: "1",
        approval_threshold_denominator: "2",
        eligibility_rule: {
          rule: "proposal_operator_at_or_before_gate_others_after_gate",
          value: null,
        },
      },
      parliament_approval_gate_height: "625",
      sealed_at_height: "700",
      roster_root: digest("electorate-roster-root"),
      electorate_seal_hash: digest("electorate-seal"),
      members: snapshot.eligible_citizens.map((citizen) => ({ ...citizen })),
    },
    ballot_contract: {
      draft_route: `/v1/validation-fee/proposals/${PROPOSAL_ID}/plain-ballot/draft`,
      request_version: 1,
      amount: "150",
      duration_blocks: "3600",
      directions: ["AYE", "NAY", "ABSTAIN"],
      terms_derived_by_core: true,
      one_effective_ballot_per_account: true,
    },
  };
};

const descriptorFixture = (
  artifactBytes: Buffer,
  contract = contractFixture(),
) => ({
  schema: "sora.wallet.governance-referendum-handoff.v1",
  chain_id: CHAIN_ID,
  genesis_hash: GENESIS_HASH,
  inputs_sha256: contract.inputs_sha256,
  proposal_id: contract.proposal_id,
  referendum_id: contract.referendum_id,
  referendum_window: contract.referendum_window,
  artifact_sha256: createHash("sha256").update(artifactBytes).digest("hex"),
  artifact_size_bytes: String(artifactBytes.length),
  eligible_citizen_snapshot_sha256: contract.eligible_citizen_snapshot_sha256,
  snapshot_finalized_height: contract.snapshot_finalized_height,
  snapshot_observation_sequence: contract.snapshot_observation_sequence,
  network_checkpoint_sha256: contract.network_checkpoint_sha256,
});

const finalityObservation = (
  proposalLabel: string,
  snapshotFinalizedHeight: string,
  snapshotObservationSequence: string,
) => ({
  chainId: CHAIN_ID,
  genesisHash: GENESIS_HASH,
  proposalId: digest(proposalLabel),
  artifactSha256: digest(`${proposalLabel}-artifact`),
  contractFingerprint: digest(`${proposalLabel}-fingerprint`),
  snapshotFinalizedHeight,
  snapshotObservationSequence,
  networkCheckpointSha256: digest(`${proposalLabel}-checkpoint`),
});

const jsonResponse = (bytes: Buffer) =>
  new Response(bytes.toString("utf8"), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-length": String(bytes.length),
    },
  });

describe("hash-bound PLAIN referendum handoff", () => {
  it("accepts the exact v2 proposal, sealed electorate, and typed ballot route", () => {
    const loaded = parseGovernancePlainReferendumContract(contractFixture(), {
      expectedGenesisHash: GENESIS_HASH,
    });
    expect(loaded.contract.proposalId).toBe(PROPOSAL_ID);
    expect(loaded.contract.plainElectorate.members).toEqual(
      loaded.contract.eligibleCitizens,
    );
    expect(loaded.contract.ballot).toMatchObject({
      draftRoute: `/v1/validation-fee/proposals/${PROPOSAL_ID}/plain-ballot/draft`,
      requestVersion: 1,
      amount: "150",
      durationBlocks: "3600",
      termsDerivedByCore: true,
    });
  });

  it("rejects placeholders, unknowns, wrong identity, timing, proposal, or route", () => {
    const candidates: Array<[Record<string, unknown>, RegExp]> = [];
    candidates.push([
      { ...contractFixture(), dynamic_eligibility: true },
      /missing or unknown fields/u,
    ]);
    candidates.push([
      { ...contractFixture(), inputs_sha256: "PLACEHOLDER" },
      /non-placeholder/u,
    ]);
    const wrongProposal = contractFixture();
    wrongProposal.referendum_id = digest("other-proposal");
    candidates.push([wrongProposal, /IDs differ/u]);
    const wrongWindow = contractFixture();
    wrongWindow.referendum_window.upper = "4299";
    candidates.push([wrongWindow, /3,600 blocks/u]);
    const wrongRoute = contractFixture();
    wrongRoute.ballot_contract.draft_route = "/v1/gov/ballots/plain";
    candidates.push([wrongRoute, /proposal-bound typed PLAIN terms/u]);
    const invalidCustody = contractFixture();
    invalidCustody.plain_electorate.rules.slash_receiver_account =
      "alice@wonderland";
    candidates.push([invalidCustody, /native Taira account address/u]);
    const preGateCitizen = contractFixture();
    preGateCitizen.eligible_citizens[1].bonded_height = "625";
    candidates.push([preGateCitizen, /registration gate/u]);
    for (const [candidate, message] of candidates) {
      expect(() =>
        parseGovernancePlainReferendumContract(candidate, {
          expectedGenesisHash: GENESIS_HASH,
        }),
      ).toThrow(message);
    }
    expect(() =>
      parseGovernancePlainReferendumContract(contractFixture(), {
        expectedGenesisHash: digest("wrong-genesis"),
      }),
    ).toThrow(/different Taira genesis/u);
  });

  it("rejects electorate reorder, seal drift, and snapshot-hash divergence", () => {
    const reordered = contractFixture();
    reordered.eligible_citizens.reverse();
    expect(() =>
      parseGovernancePlainReferendumContract(reordered, {
        expectedGenesisHash: GENESIS_HASH,
      }),
    ).toThrow(/UTF-8 byte order/u);

    const changedSeal = contractFixture();
    changedSeal.plain_electorate.members[1].bonded_height = "651";
    expect(() =>
      parseGovernancePlainReferendumContract(changedSeal, {
        expectedGenesisHash: GENESIS_HASH,
      }),
    ).toThrow(/electorate seal differs/u);

    const forged = contractFixture();
    forged.eligible_citizen_snapshot_sha256 = digest("forged-snapshot");
    expect(() =>
      parseGovernancePlainReferendumContract(forged, {
        expectedGenesisHash: GENESIS_HASH,
      }),
    ).toThrow(/snapshot SHA-256 differs/u);
  });

  it("loads only the strict packaged source and rejects links or URL drift", () => {
    expect(parseGovernancePlainReferendumSource(sourceFixture())).toMatchObject(
      {
        chainId: CHAIN_ID,
        networkPrefix: 369,
        genesisHash: GENESIS_HASH,
      },
    );
    expect(() =>
      parseGovernancePlainReferendumSource({
        ...sourceFixture(),
        descriptorUrl: "https://other.invalid/current.json",
      }),
    ).toThrow(/content-addressed handoff/u);

    const root = canonicalTemporaryDirectory("governance-source-");
    const sourcePath = join(root, "source.json");
    const targetPath = join(root, "target.json");
    try {
      writeFileSync(sourcePath, JSON.stringify(sourceFixture()), "utf8");
      expect(loadGovernancePlainReferendumSource(sourcePath).chainId).toBe(
        CHAIN_ID,
      );
      rmSync(sourcePath);
      writeFileSync(targetPath, JSON.stringify(sourceFixture()), "utf8");
      symlinkSync(targetPath, sourcePath);
      expect(() => loadGovernancePlainReferendumSource(sourcePath)).toThrow(
        /regular package resource/u,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fetches a raw-SHA/size-bound artifact and binds observed endpoint identity", async () => {
    const root = canonicalTemporaryDirectory("governance-handoff-");
    try {
      const contract = contractFixture();
      const artifactBytes = Buffer.from(JSON.stringify(contract), "utf8");
      const descriptorBytes = Buffer.from(
        JSON.stringify(descriptorFixture(artifactBytes, contract)),
        "utf8",
      );
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse(descriptorBytes))
        .mockResolvedValueOnce(jsonResponse(artifactBytes));
      const loaded = await fetchGovernancePlainReferendumContract({
        source: parseGovernancePlainReferendumSource(sourceFixture()),
        observedIdentity: {
          chainId: CHAIN_ID,
          networkPrefix: 369,
          genesisHash: GENESIS_HASH,
        },
        finalityStore: new GovernancePlainReferendumFinalityStore(root),
        fetcher,
      });
      expect(loaded.artifactSha256).toBe(
        createHash("sha256").update(artifactBytes).digest("hex"),
      );
      expect(loaded.source.artifactUrl).toBe(
        `${sourceFixture().artifactBaseUrl}/${loaded.artifactSha256}.json`,
      );
      expect(fetcher).toHaveBeenCalledTimes(2);

      await expect(
        fetchGovernancePlainReferendumContract({
          source: parseGovernancePlainReferendumSource(sourceFixture()),
          observedIdentity: {
            chainId: CHAIN_ID,
            networkPrefix: 369,
            genesisHash: digest("wrong-genesis"),
          },
          finalityStore: new GovernancePlainReferendumFinalityStore(root),
          fetcher,
        }),
      ).rejects.toThrow(/differs from the packaged referendum source/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rotates monotonically while rejecting immutable drift, rollback, replay, and durable history loss", async () => {
    const root = canonicalTemporaryDirectory("governance-finality-");
    try {
      const contract = contractFixture();
      const artifactBytes = Buffer.from(JSON.stringify(contract), "utf8");
      const descriptor = descriptorFixture(artifactBytes, contract);
      const wrongDescriptorBytes = Buffer.from(
        JSON.stringify({ ...descriptor, artifact_sha256: digest("wrong") }),
        "utf8",
      );
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse(wrongDescriptorBytes))
        .mockResolvedValueOnce(jsonResponse(artifactBytes));
      await expect(
        fetchGovernancePlainReferendumContract({
          source: parseGovernancePlainReferendumSource(sourceFixture()),
          observedIdentity: {
            chainId: CHAIN_ID,
            networkPrefix: 369,
            genesisHash: GENESIS_HASH,
          },
          finalityStore: new GovernancePlainReferendumFinalityStore(root),
          fetcher,
        }),
      ).rejects.toThrow(/bytes differ/u);

      const store = new GovernancePlainReferendumFinalityStore(root);
      const base = finalityObservation("proposal-a", "700", "9");
      const successor = finalityObservation("proposal-b", "701", "10");
      store.verifyAndPromote(base);
      store.verifyAndPromote(base);
      store.verifyAndPromote(successor);
      new GovernancePlainReferendumFinalityStore(root).verifyAndPromote(
        successor,
      );

      expect(() =>
        store.verifyAndPromote({
          ...successor,
          artifactSha256: digest("equivocating-artifact"),
        }),
      ).toThrow(/equivocated/u);
      expect(() => store.verifyAndPromote(base)).toThrow(/superseded/u);
      expect(() =>
        store.verifyAndPromote(finalityObservation("proposal-c", "702", "10")),
      ).toThrow(/regressed/u);
      expect(() =>
        store.verifyAndPromote(finalityObservation("proposal-d", "701", "11")),
      ).toThrow(/regressed/u);

      const baseRecordPath = governancePlainReferendumFinalityObservationPath(
        root,
        base.proposalId,
      );
      const durableBase = JSON.parse(readFileSync(baseRecordPath, "utf8")) as {
        schema: string;
        observation: ReturnType<typeof finalityObservation>;
      };
      writeFileSync(
        baseRecordPath,
        JSON.stringify({
          ...durableBase,
          observation: {
            ...durableBase.observation,
            artifactSha256: digest("durable-base-equivocation"),
          },
        }),
        { encoding: "utf8", mode: 0o600 },
      );
      expect(() => store.verifyAndPromote(base)).toThrow(/equivocated/u);

      rmSync(
        governancePlainReferendumFinalityObservationPath(
          root,
          successor.proposalId,
        ),
      );
      expect(() => store.verifyAndPromote(successor)).toThrow(
        /immutable proposal record/u,
      );

      rmSync(governancePlainReferendumFinalityPath(root));
      expect(() => store.verifyAndPromote(base)).toThrow(
        /incomplete|disappeared/u,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects legacy/foreign state and retains immutable per-proposal records without a terminal history cap", () => {
    const legacyRoot = canonicalTemporaryDirectory(
      "governance-finality-legacy-",
    );
    const rotationRoot = canonicalTemporaryDirectory(
      "governance-finality-rotation-",
    );
    const identityRoot = canonicalTemporaryDirectory(
      "governance-finality-identity-",
    );
    try {
      const legacyStatePath = governancePlainReferendumFinalityPath(legacyRoot);
      const legacyMarkerPath =
        governancePlainReferendumFinalityMarkerPath(legacyRoot);
      secureWriteBoundedFile(
        legacyStatePath,
        Buffer.from(
          JSON.stringify({
            schema: "sora.wallet.governance-referendum-finality.v1",
            observation: finalityObservation("legacy", "1", "1"),
          }),
          "utf8",
        ),
        {
          label: "Legacy governance referendum finality state",
          maximumBytes: 4 * 1024 * 1024,
        },
      );
      secureWriteBoundedFile(
        legacyMarkerPath,
        Buffer.from(
          JSON.stringify({
            schema: "sora.wallet.governance-referendum-finality-marker.v1",
            state_schema: "sora.wallet.governance-referendum-finality.v1",
          }),
          "utf8",
        ),
        {
          label: "Legacy governance referendum finality marker",
          maximumBytes: 1024,
        },
      );
      expect(() =>
        new GovernancePlainReferendumFinalityStore(legacyRoot).verifyAndPromote(
          finalityObservation("new", "2", "2"),
        ),
      ).toThrow(
        /Governance referendum finality marker (?:is not canonical|contains missing or unknown fields)/u,
      );

      const identityStatePath =
        governancePlainReferendumFinalityPath(identityRoot);
      const identityObservation = finalityObservation("identity", "1", "1");
      const writeIdentityState = (
        observation: ReturnType<typeof finalityObservation>,
      ) => {
        const serializedObservation = JSON.stringify({
          schema: "sora.wallet.governance-referendum-finality-observation.v2",
          observation,
        });
        secureWriteBoundedFile(
          identityStatePath,
          Buffer.from(
            JSON.stringify({
              schema: "sora.wallet.governance-referendum-finality-head.v2",
              observation,
            }),
            "utf8",
          ),
          {
            label: "Identity governance referendum finality state",
            maximumBytes: 4 * 1024 * 1024,
          },
        );
        secureWriteBoundedFile(
          governancePlainReferendumFinalityObservationPath(
            identityRoot,
            observation.proposalId,
          ),
          Buffer.from(serializedObservation, "utf8"),
          {
            label: "Identity governance referendum finality observation",
            maximumBytes: 64 * 1024,
          },
        );
      };
      new GovernancePlainReferendumFinalityStore(identityRoot).verifyAndPromote(
        identityObservation,
      );
      writeIdentityState({ ...identityObservation, chainId: "wrong-chain" });
      expect(() =>
        new GovernancePlainReferendumFinalityStore(
          identityRoot,
        ).verifyAndPromote(finalityObservation("later", "2", "2")),
      ).toThrow(/head is not exact Taira/u);
      writeIdentityState({
        ...identityObservation,
        genesisHash: digest("wrong-genesis"),
      });
      expect(() =>
        new GovernancePlainReferendumFinalityStore(
          identityRoot,
        ).verifyAndPromote(finalityObservation("later", "2", "2")),
      ).toThrow(/head is not exact Taira/u);

      const rotationStore = new GovernancePlainReferendumFinalityStore(
        rotationRoot,
      );
      const first = finalityObservation("rotation-0", "1", "1");
      rotationStore.verifyAndPromote(first);
      for (let index = 1; index <= 128; index += 1) {
        rotationStore.verifyAndPromote(
          finalityObservation(
            `rotation-${index}`,
            String(index + 1),
            String(index + 1),
          ),
        );
      }
      const orphan = finalityObservation("rotation-orphan", "130", "130");
      secureWriteBoundedFile(
        governancePlainReferendumFinalityObservationPath(
          rotationRoot,
          orphan.proposalId,
        ),
        Buffer.from(
          JSON.stringify({
            schema: "sora.wallet.governance-referendum-finality-observation.v2",
            observation: orphan,
          }),
          "utf8",
        ),
        {
          label: "Orphan governance referendum finality observation",
          maximumBytes: 64 * 1024,
        },
      );
      new GovernancePlainReferendumFinalityStore(rotationRoot).verifyAndPromote(
        orphan,
      );
      expect(
        readFileSync(
          governancePlainReferendumFinalityObservationPath(
            rotationRoot,
            first.proposalId,
          ),
          "utf8",
        ),
      ).toContain(first.proposalId);
      expect(
        readFileSync(
          governancePlainReferendumFinalityPath(rotationRoot),
          "utf8",
        ),
      ).toContain(orphan.proposalId);
    } finally {
      rmSync(legacyRoot, { recursive: true, force: true });
      rmSync(rotationRoot, { recursive: true, force: true });
      rmSync(identityRoot, { recursive: true, force: true });
    }
  }, 30_000);

  it("allows only an eligible proposal-bound ballot and exact typed draft", () => {
    const loaded = parseGovernancePlainReferendumContract(contractFixture(), {
      expectedGenesisHash: GENESIS_HASH,
    });
    expect(() =>
      assertGovernancePlainReferendumBallotBinding(loaded, {
        chainId: CHAIN_ID,
        proposalId: `0x${PROPOSAL_ID}`,
        referendumId: PROPOSAL_ID,
        accountId: VOTER,
        hStart: "701",
        hEnd: "4300",
        mode: "Plain",
        amount: "150",
        durationBlocks: "3600",
        direction: "Aye",
        hasExistingLock: false,
      }),
    ).not.toThrow();
    expect(() =>
      assertGovernancePlainReferendumBallotBinding(loaded, {
        chainId: CHAIN_ID,
        proposalId: `0x${PROPOSAL_ID}`,
        referendumId: PROPOSAL_ID,
        accountId: VOTER,
        hStart: "701",
        hEnd: "4300",
        mode: "Plain",
        amount: "150",
        durationBlocks: "3600",
        direction: "Aye",
        hasExistingLock: true,
      }),
    ).toThrow(/already has an effective ballot/u);

    const draft = {
      version: 1,
      proposal_id: PROPOSAL_ID,
      referendum_id: PROPOSAL_ID,
      electorate_seal_hash: loaded.contract.plainElectorate.electorateSealHash,
      window: { lower: "701", upper: "4300" },
      current_height: "700",
      ballot_amount: "150",
      duration_blocks: "3600",
      owner: VOTER,
      direction: "AYE",
      ballot_instruction: {
        referendum_id: PROPOSAL_ID,
        owner: VOTER,
        amount: "150",
        duration_blocks: "3600",
        direction: 0,
      },
      tx_instructions: [
        {
          wire_id: "iroha_data_model::isi::governance::CastPlainBallot",
          payload_hex: "00",
        },
      ],
    };
    expect(() =>
      assertGovernancePlainReferendumBallotDraft(draft, loaded, {
        owner: VOTER,
        direction: "Aye",
      }),
    ).not.toThrow();
    expect(() =>
      assertGovernancePlainReferendumBallotDraft(
        { ...draft, electorate_seal_hash: digest("wrong-seal") },
        loaded,
        { owner: VOTER, direction: "Aye" },
      ),
    ).toThrow(/differs from the hash-bound proposal/u);
  });

  it("accepts only the trusted top-level renderer origin", () => {
    const frame = { url: "http://localhost:5173/#/parliament" };
    expect(() =>
      assertGovernancePlainReferendumTrustedSender({
        ownerMatchesMainWindow: true,
        ownerDestroyed: false,
        senderFrame: frame,
        mainFrame: frame,
        trustedRendererUrl: "http://localhost:5173/",
      }),
    ).not.toThrow();
    expect(() =>
      assertGovernancePlainReferendumTrustedSender({
        ownerMatchesMainWindow: true,
        ownerDestroyed: false,
        senderFrame: frame,
        mainFrame: { url: frame.url },
        trustedRendererUrl: "http://localhost:5173/",
      }),
    ).toThrow(/trusted top-level/u);
  });
});
