import { describe, expect, it } from "vitest";
import {
  assertProductionSolanaManifest,
  buildSolanaProductionRequirementsReportBody,
  buildSolanaRouteManifestIsiArtifact,
} from "../scripts/sccp-solana-deploy.mjs";

const hex32 = (byte) =>
  `0x${byte.length === 1 ? byte.repeat(64) : byte.repeat(32)}`;

const baseProductionManifest = () => ({
  route_id: "taira_sol_xor",
  routeId: "taira_sol_xor",
  asset_key: "xor",
  assetKey: "xor",
  counterparty_domain: 3,
  chain: "solana-testnet",
  chain_id_hex: "0x736f6c616e612d746573746e6574",
  counterparty_account_codec: 3,
  counterparty_account_codec_key: "solana_base58",
  verifier_target: "SolanaProgram",
  production_ready: true,
  productionReady: true,
  solana_token_mint: "8291HWJXDb4wHWULcA78A43Zk72pHvfa6xKhM9GLGnS4",
  solana_program_id: "J72TNLJweK8veYwbtHhtFdx4sk885Xx3QNZfL15zdHjD",
  sccp_solana_source_bridge_address:
    "H6VxqBzD7ckUiDw9dvL57YaBmNgEFJXRYoUT8W8CFzr2",
  solana_source_state_address: "HWaaX4WBs6iYiNQQbKUgRNR2pWBf1Ms81Q6aP58FzXQS",
  solana_verifier_program_id: "EhZuSakeo5UvHse5jqqpcRWs1emAMUKNBvqYSp3xuRuf",
  verifier_code_hash: hex32("1"),
  verifier_key_hash: hex32("2"),
  destination_binding_hash: hex32("3"),
  destination_binding_key: "sccp:0:3:sol:solana-program-v1:2",
  destination_proof_admission: {
    admission_mode: "governed-zk-verifier-v1",
    proof_system: "stark-fri-v1",
    entrypoint: "submit_sccp_message_proof",
    verifier_code_hash: hex32("1"),
    verifier_key_hash: hex32("2"),
    destination_binding_hash: hex32("3"),
    shape_only: false,
    accepts_unverified_proofs: false,
  },
  destination_browser_prover: {
    module_url: "/sccp-solana/taira-solana-xor-destination-prover.js",
    module_hash: hex32("4"),
    manifest_hash: hex32("5"),
  },
  source_browser_prover: {
    module_url: "/sccp-solana/taira-solana-xor-source-prover.js",
    module_hash: hex32("6"),
    manifest_hash: hex32("7"),
  },
  source_verifier_material: {
    source_domain: 3,
    target_domain: 0,
    source_trust_anchor_hash: hex32("8"),
    consensus_verifier_hash: hex32("9"),
    message_inclusion_verifier_hash: hex32("a"),
    finality_policy_hash: hex32("b"),
    source_state_verifier_hash: hex32("c"),
  },
  source_adapter_engine_deployment: {
    source_domain: 3,
    target_domain: 0,
    deployment_receipt_hash: hex32("d"),
  },
  post_deploy_live_evidence: {
    full_toml_ready: true,
    source_bridge_config_hash: hex32("e"),
    route_canary_evidence_hash: hex32("f"),
    offline_full_toml_sha256: hex32("a1"),
    source_event_transaction_signature:
      "4P3VXACDS99p6Yx7Xd6q2fQ8PHe8YdwJRdPyMA7aQRWMe8XbrtoE6hrgXfzn9T7VA1vm5a2MgmXjHD3FTAFDujhq",
    route_canary_transaction_signature:
      "4jVUe2ouFKLYLjreoQAz5KxK4Gaxm6M9ydma2Frv2LSAMmztTShjQZ4kH7CDVYmo8phCrWkEkCqrxfYT39D8yCbT",
  },
});

describe("Solana SCCP route manifest publication guard", () => {
  it("builds a TAIRA UpsertSccpRouteManifest ISI artifact for a production Solana manifest", () => {
    const manifest = baseProductionManifest();
    const artifact = buildSolanaRouteManifestIsiArtifact({ manifest });

    expect(artifact.schema).toBe("iroha-sccp-route-manifest-isi/v1");
    expect(artifact.requiredPermission).toBe("CanManageSccpRouteManifests");
    expect(artifact.routeKey).toEqual({
      routeId: "taira_sol_xor",
      assetKey: "xor",
      counterpartyDomain: 3,
      chainIdHex: "0x736f6c616e612d746573746e6574",
    });
    expect(artifact.instruction.UpsertSccpRouteManifest.manifest.route_id).toBe(
      "taira_sol_xor",
    );
  });

  it("rejects fail-closed or placeholder Solana manifests before TAIRA publication", () => {
    const manifest = {
      ...baseProductionManifest(),
      production_ready: false,
      productionReady: false,
    };

    expect(() => assertProductionSolanaManifest(manifest)).toThrow(
      /not production-ready/u,
    );
  });

  it("rejects copied TRON manifest field names on Solana route manifests", () => {
    const manifest = {
      ...baseProductionManifest(),
      sccp_tron_source_bridge_address:
        "H6VxqBzD7ckUiDw9dvL57YaBmNgEFJXRYoUT8W8CFzr2",
    };

    expect(() => buildSolanaRouteManifestIsiArtifact({ manifest })).toThrow(
      /TRON field/u,
    );
  });

  it("reports the missing governed Solana proof material before publication", () => {
    const manifest = {
      ...baseProductionManifest(),
      production_ready: false,
      productionReady: false,
      disabledReason: "Solana proof material is not published.",
      source_verifier_material: {
        source_domain: 3,
        target_domain: 0,
        placeholderMaterial: true,
      },
      sourceVerifierMaterial: {
        sourceDomain: 3,
        targetDomain: 0,
        placeholderMaterial: true,
      },
      source_adapter_engine_deployment: {
        source_domain: 3,
        target_domain: 0,
        placeholderMaterial: true,
      },
      sourceAdapterEngineDeployment: {
        sourceDomain: 3,
        targetDomain: 0,
        placeholderMaterial: true,
      },
      destination_proof_admission: {
        admission_mode: "envelope-recorder-v1",
        proof_system: "none",
        entrypoint: "submit_sccp_message_proof",
        verifier_code_hash: hex32("1"),
        verifier_key_hash: hex32("2"),
        destination_binding_hash: hex32("3"),
        shape_only: true,
        accepts_unverified_proofs: true,
      },
    };
    delete manifest.post_deploy_live_evidence;

    const report = buildSolanaProductionRequirementsReportBody({
      manifest,
      manifestPath:
        "output/sccp-solana-deploy/taira-solana-xor-route.manifest.json",
      publicConfig: {
        verifierProgramId: manifest.solana_verifier_program_id,
      },
      verifierEvidence: {
        programDataAddress: "2wen6hXkK13qnjfActBxfUxiGw1ASnUMrtqoNPMva7A7",
        programDataSlot: 419725105,
      },
      verifierLiveEvidence: {
        verifier_code_hash: manifest.verifier_code_hash,
      },
      checkedAt: "2026-07-04T00:00:00.000Z",
    });

    expect(report.readyToBuildIsi).toBe(false);
    expect(report.blockers.map((blocker) => blocker.id)).toEqual(
      expect.arrayContaining([
        "production-ready-flag",
        "disabled-reason",
        "destination-proof-admission",
        "source-verifier-material",
        "source-adapter-engine-deployment",
        "post-deploy-live-evidence-hashes",
        "post-deploy-live-evidence-signatures",
        "post-deploy-full-toml",
      ]),
    );
    expect(
      report.requirements.destinationProofAdmission.some(
        (entry) => entry.status === "invalid",
      ),
    ).toBe(true);
    expect(
      report.requirements.sourceVerifierMaterial.every(
        (entry) => entry.status === "missing",
      ),
    ).toBe(true);
    expect(report.commands.sourceEvidenceToml).toContain(
      "--tower-replay-verifier-hash",
    );
    expect(report.commands.liveEvidenceToml).toContain(
      manifest.verifier_code_hash,
    );
  });
});
