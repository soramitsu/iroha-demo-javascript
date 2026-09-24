import { describe, expect, it, vi } from "vitest";

import { NetworkId } from "@iroha/iroha-js/canonical-request";
import {
  FirstReleaseVpnTransport,
  parseFirstReleaseVpnProfileWire,
} from "../electron/firstReleaseVpnTransport";

const TAIRA_NETWORK_ID = NetworkId.parse(
  "hash:77FB29D14745ADCCFDC14350E1A6FE6A10265798CC936A1DAFA7D2552AC3B9F7#EBDD",
);
const ACCOUNT_ID = "testuﾛ1PﾉｳﾇmEｴWｵebHﾑ6ﾔﾙｲヰiwuCWErJ7uｽoPGｱﾔnjﾑKﾋTCW2PV";
const auth = {
  accountId: ACCOUNT_ID,
  privateKey: Buffer.alloc(32, 1),
  networkId: TAIRA_NETWORK_ID,
  networkPrefix: 369,
};

const profileWire = () => ({
  available: true,
  relay_endpoint: "/dns/relay.example/udp/9443/quic",
  supported_exit_classes: ["standard", "low-latency", "high-security"],
  default_exit_class: "standard",
  lease_secs: 600,
  dns_push_interval_secs: 90,
  meter_family: "soranet.vpn.standard",
  route_pushes: ["0.0.0.0/0"],
  excluded_routes: ["127.0.0.0/8"],
  dns_servers: ["1.1.1.1"],
  tunnel_addresses: ["10.208.0.2/32"],
  mtu_bytes: 1280,
  display_billing_label: "standard · soranet.vpn.standard",
  operator_account_id: "operator@wonderland",
  lease_fee: "25",
  settlement_grace_secs: 120,
  flow_label_bits: 24,
  padding_budget_ms: 80,
  relay_id_hex: "33".repeat(32),
  relay_mldsa65_public_key_hex: "55".repeat(1_952),
  descriptor_commit_hex: "44".repeat(32),
  tls_server_name: "relay.example",
  relay_tls_spki_sha256_hex: "66".repeat(32),
  relay_certificate_sha256_hex: "77".repeat(32),
  directory_snapshot_digest_hex: "88".repeat(32),
});

const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("first-release VPN transport", () => {
  it("accepts only the exact snake-case profile wire schema", () => {
    expect(parseFirstReleaseVpnProfileWire(profileWire())).toEqual(
      expect.objectContaining({
        available: true,
        relayEndpoint: "/dns/relay.example/udp/9443/quic",
        leaseSecs: 600,
      }),
    );
    expect(() =>
      parseFirstReleaseVpnProfileWire({
        ...profileWire(),
        leaseSecs: 600,
      }),
    ).toThrow(/missing or unknown wire fields/u);
  });

  it("requires an origin-only HTTPS endpoint", () => {
    expect(() => new FirstReleaseVpnTransport("http://127.0.0.1:8080")).toThrow(
      /HTTPS/u,
    );
    expect(
      () => new FirstReleaseVpnTransport("https://torii.example/base"),
    ).toThrow(/origin-only/u);
    expect(
      () => new FirstReleaseVpnTransport("https://torii.example/"),
    ).toThrow(/origin-only/u);
  });

  it("parses a bounded duplicate-safe public profile response", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(profileWire()));
    const transport = new FirstReleaseVpnTransport(
      "https://torii.example",
      fetchImpl,
    );
    await expect(transport.getVpnProfile()).resolves.toEqual(
      expect.objectContaining({ available: true, leaseSecs: 600 }),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("https://torii.example/v1/vpn/profile"),
      expect.objectContaining({ method: "GET", redirect: "error" }),
    );

    fetchImpl.mockResolvedValueOnce(
      new Response('{"available":true,"available":false}', {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(transport.getVpnProfile()).rejects.toThrow(/duplicate/u);
  });

  it("signs the exact snake-case quote body and never follows redirects", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("moved", { status: 302 }));
    const transport = new FirstReleaseVpnTransport(
      "https://torii.example",
      fetchImpl,
    );
    await expect(
      transport.createVpnQuote(
        {
          exitClass: "standard",
          meteringPublicKeyHex: "99".repeat(32),
        },
        auth,
      ),
    ).rejects.toThrow(/HTTP 302/u);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://torii.example/v1/vpn/quotes");
    expect(init).toEqual(
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        body: JSON.stringify({
          exit_class: "standard",
          metering_public_key_hex: "99".repeat(32),
        }),
      }),
    );
    expect(new Headers(init?.headers).get("x-iroha-signature")).toMatch(
      /^[A-Za-z0-9+/]+={0,2}$/u,
    );
  });

  it("does not retry an authenticated GET carrying a one-shot signature", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("rate limited", {
        status: 429,
        headers: { "retry-after": "0" },
      }),
    );
    const transport = new FirstReleaseVpnTransport(
      "https://torii.example",
      fetchImpl,
    );
    await expect(
      transport.getVpnSession("55".repeat(16), auth),
    ).rejects.toThrow(/HTTP 429/u);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
